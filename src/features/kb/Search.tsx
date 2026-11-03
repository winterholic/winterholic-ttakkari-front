import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { kbSearchV3 } from "../../api/kb";
import type { KbMatchPath, KbSearchHitV3 } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { CanonicalCard } from "./CanonicalCard";
import { EvidenceDialog } from "./Evidence";
import { hasClientFilter, matchHit } from "./kbState";
import type { KbFilters } from "./kbState";
import { KIND_LABEL, failure, splitHighlights } from "./labels";
import { crumbs, timecode } from "./labelsV3";

export type SearchMode = "hybrid" | "lexical" | "vector";
export const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: "hybrid", label: "통합 (단어+의미+개념 관계)" }, { value: "lexical", label: "단어만" }, { value: "vector", label: "의미만" },
];
export const modeOf = (raw: string | null): SearchMode => (raw === "lexical" || raw === "vector" ? raw : "hybrid");

const MATCH_LABEL: Record<KbMatchPath, string> = { lexical: "단어", vector: "의미", canonical: "정본 근거", hop1: "1-hop 확장" };

export function SearchBox({ value, onSubmit, mode, onMode }: { value: string; onSubmit: (q: string) => void; mode: SearchMode; onMode: (m: SearchMode) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // 주소가 바뀌어(뒤로 가기 등) 값이 달라졌을 때만 입력칸을 맞춘다. 입력 중에는 건드리지 않는다.
  if (value !== seen) { setSeen(value); setText(value); }
  return <div className="kb3-searchrow">
    <form className="kb-search" role="search" onSubmit={(e) => { e.preventDefault(); onSubmit(text.trim()); }}>
      <Icon name="search" />
      <input className="tk-input" type="search" aria-label="지식 도서관 검색" placeholder="질문이나 키워드 (예: 디플로이먼트가 관리하는 레플리카셋의 역할)" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
      <Button variant="primary" type="submit">검색</Button>
    </form>
    <div className="kb3-mode"><span id="kb3-mode-l" className="kb-note">검색 방식</span>
      <Select id="kb3-mode" labelledBy="kb3-mode-l" size="sm" value={mode} options={SEARCH_MODES} onChange={onMode} /></div>
  </div>;
}

function Locator({ hit }: { hit: KbSearchHitV3 }) {
  return <>
    {hit.page_no != null && <Badge mono>{`p.${hit.page_no}`}</Badge>}
    {hit.slide_no != null && <Badge mono>{`Slide ${hit.slide_no}`}</Badge>}
    {hit.time_start_ms != null && <Badge mono>{timecode(hit.time_start_ms)}</Badge>}
  </>;
}

function Hit({ hit, onEvidence, openDocument, onConflicts }: {
  hit: KbSearchHitV3; onEvidence: (passageId: string) => void;
  openDocument: (documentId: string, revisionId: string) => void; onConflicts: () => void;
}) {
  const parts = splitHighlights(hit.snippet, hit.highlights ?? []);
  const path = crumbs(hit.section_path ?? hit.heading);
  const assertions = hit.assertions ?? [];
  return <li className="kb-hit">
    <div className="kb-hit__head">
      <h3 className="kb-hit__title">{hit.document.title}</h3>
      <div className="kb-badges">
        <Badge tone={hit.revision.current ? "success" : "warning"}>{hit.revision.current ? "현재 버전" : `이전 버전 ${hit.revision.rev_no}`}</Badge>
        {hit.source && <Badge>{KIND_LABEL[hit.source.kind] ?? hit.source.kind}</Badge>}
        {hit.document.lang && <Badge mono>{hit.document.lang}</Badge>}
        <Locator hit={hit} />
        {(hit.has_conflict || hit.conflict_warning) && <button type="button" className="kb3-conflict-badge" onClick={onConflicts}>충돌 있음</button>}
      </div>
    </div>
    {path.length > 0 && <nav className="kb3-crumbs" aria-label="문서 안 위치"><ol>{path.map((c, i) => <li key={`${c}-${i}`}>{c}</li>)}</ol></nav>}
    <p className="kb-hit__snippet">{parts.map((p, i) => (p.hit ? <mark key={i} className="kb-mark">{p.text}</mark> : <span key={i}>{p.text}</span>))}</p>
    {assertions.length > 0 && <ul className="kb3-facts" aria-label="이 패시지의 주장">
      {assertions.slice(0, 3).map((a) => <li key={a.id}>{a.text}{a.status && a.status !== "active" ? <> <Badge tone="warning">{a.status === "disputed" ? "다툼" : a.status === "superseded" ? "이전 주장" : a.status}</Badge></> : null}</li>)}
    </ul>}
    {(hit.canonical_facts ?? []).length > 0 && <ul className="kb3-facts" aria-label="정본 핵심 사실">
      {(hit.canonical_facts ?? []).slice(0, 3).map((f, i) => <li key={`${f.entity_id}-${f.predicate}-${i}`}><strong>{f.entity}</strong> {f.predicate}: {f.value}</li>)}
    </ul>}
    {hit.match_paths && hit.match_paths.length > 0 && <div className="kb-badges" aria-label="찾은 경로">
      {hit.match_paths.map((m) => <Badge key={m} mono>{MATCH_LABEL[m] ?? m}</Badge>)}
    </div>}
    {hit.source && <p className="kb-hit__source">{hit.source.locator ?? hit.source.source_key}</p>}
    <div className="kb-actions">
      <Button size="sm" onClick={() => onEvidence(hit.passage_id)}>근거 원문 보기</Button>
      <Button size="sm" variant="ghost" onClick={() => openDocument(hit.document.id, hit.revision.id)}>문서 열기</Button>
    </div>
  </li>;
}

export function SearchResults({ q, mode, filters, openDocument, onConcept, onGraph, onConflicts }: {
  q: string; mode: SearchMode; filters: KbFilters;
  openDocument: (documentId: string, revisionId: string) => void;
  onConcept: (id: string, name: string) => void; onGraph: (id: string) => void; onConflicts: (entityId?: string) => void;
}) {
  const [evidence, setEvidence] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["kb-search", q, mode, filters.domain, filters.concept],
    queryFn: ({ pageParam }) => kbSearchV3({ q, mode, domain: filters.domain || undefined, entity_id: filters.concept || undefined, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => ((last.has_more ?? last.items.length >= (last.limit || 20)) ? (last.offset ?? 0) + (last.limit || 20) : undefined),
    enabled: q.length > 0,
  });
  if (!q) return null;
  if (query.isPending) return <p className="kb-note" role="status">검색하는 중</p>;
  if (query.isError && !query.data) {
    return <div className="kb-error"><p className="tk-error" role="alert">{failure(query.error)}</p><Button variant="ghost" onClick={() => void query.refetch()}>다시 시도</Button></div>;
  }
  const first = query.data.pages[0];
  const all = [...new Map(query.data.pages.flatMap((p) => p.items).map((h) => [h.passage_id, h])).values()];
  const hits = all.filter((h) => matchHit(h, filters));
  const entities = first.matched_entities ?? [];
  const coverage = first.coverage;
  const clientFiltered = hasClientFilter(filters);
  return <div className="kb3-results">
    {coverage === "none" && <p className="kb-callout" role="status">도서관에서 이 질문에 맞는 근거를 찾지 못했어요. 자료를 추가하거나 다른 표현으로 물어보세요.</p>}
    {coverage === "weak" && <p className="kb-callout" role="status">근거가 약해요. 관련 문단이 적거나 질문과 느슨하게만 이어져요. 원문을 직접 확인해 주세요.</p>}
    {entities.length > 0 && <section className="kb3-canons" aria-label="매칭된 개념">
      {entities.map((e) => <CanonicalCard key={e.id} entity={e} onConcept={onConcept} onGraph={onGraph} onConflicts={onConflicts} />)}
    </section>}
    {hits.length === 0
      ? <div className="kb-empty"><p>{all.length > 0 ? "불러온 결과 중 필터에 맞는 것이 없어요." : `“${q}”와 맞는 패시지가 없어요.`}</p><p className="kb-note">{all.length > 0 ? "필터를 지우거나 결과를 더 불러와 보세요." : "다른 표현으로 검색하거나 자료를 추가해 주세요. 한 글자나 흔한 말만으로는 검색하지 않아요."}</p></div>
      : <ul className="kb-hits" aria-label="검색 결과">{hits.map((h) => <Hit key={h.passage_id} hit={h} onEvidence={setEvidence} openDocument={openDocument} onConflicts={() => onConflicts()} />)}</ul>}
    {clientFiltered && all.length > 0 && <p className="kb-note" role="status">불러온 {all.length}건 중 {hits.length}건</p>}
    {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>결과 더 보기</Button>}
    {query.isError && query.data && <p className="tk-error" role="alert">{failure(query.error)}</p>}
    <p className="kb-note">검색 순위는 내용이 사실이라는 판정이 아니에요. 근거 원문과 해시를 확인해 주세요.</p>
    <EvidenceDialog passageId={evidence} onClose={() => setEvidence(null)} openDocument={openDocument} />
  </div>;
}
