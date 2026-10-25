import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isKbUnsupported, kbDocumentsV3, kbDocumentV3, kbJobs } from "../../api/kb";
import type { KbDocumentDetailV3, KbDocumentRowV3, KbPassageV3 } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { EvidenceDialog, EvidencePanel } from "./Evidence";
import { hasClientFilter, matchDocument } from "./kbState";
import type { KbFilters } from "./kbState";
import { KIND_LABEL, failure, formatChars, formatTime, shortHash } from "./labels";
import { crumbs, domainLabel, jobStatusLabel, jobTone, kindLabel, timecode } from "./labelsV3";
import { JobCard } from "./PipelineStatusDrawer";

export function DocumentFilter({ value, onSubmit }: { value: string; onSubmit: (q: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setText(value); }
  return <form className="kb-search" role="search" onSubmit={(e) => { e.preventDefault(); onSubmit(text.trim()); }}>
    <Icon name="search" />
    <input className="tk-input" type="search" aria-label="문서 제목 필터" placeholder="문서 제목·키로 거르기" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
  </form>;
}

function DocRow({ doc, selected, select }: { doc: KbDocumentRowV3; selected: boolean; select: (id: string) => void }) {
  const rev = doc.current_revision;
  return <li>
    <button type="button" className="kb-row" aria-pressed={selected} onClick={() => select(doc.id)}>
      <span className="kb-row__main"><span className="kb-row__title">{doc.title}</span><span aria-hidden="true" className="kb-row__arrow">›</span></span>
      <span className="kb-badges">
        {doc.pipeline_status && <Badge tone={jobTone(doc.pipeline_status)}>{jobStatusLabel(doc.pipeline_status)}</Badge>}
        {rev && <Badge tone="info">{`버전 ${rev.rev_no}`}</Badge>}
        {rev?.source && <Badge>{KIND_LABEL[rev.source.kind] ?? rev.source.kind}</Badge>}
        {doc.domain && <Badge>{domainLabel(doc.domain)}</Badge>}
        {doc.lang && <Badge mono>{doc.lang}</Badge>}
      </span>
      {rev && <span className="kb-row__meta">
        <span>패시지 {rev.passage_count.toLocaleString("ko-KR")}개</span>
        {doc.entity_count !== undefined && <span>개념 {doc.entity_count}</span>}
        {doc.assertion_count !== undefined && <span>주장 {doc.assertion_count}</span>}
        <span>{formatChars(rev.char_count)}</span><span>{formatTime(doc.updated_at)}</span>
      </span>}
    </button>
  </li>;
}

export function DocumentList({ q, filters, selected, select }: { q: string; filters: KbFilters; selected: string; select: (id: string) => void }) {
  const query = useInfiniteQuery({
    queryKey: ["kb-documents", "list", q, filters.domain, filters.status],
    queryFn: ({ pageParam }) => kbDocumentsV3({ q, domain: filters.domain || undefined, pipeline_status: filters.status || undefined, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.limit : undefined),
  });
  if (query.isPending) return <p className="kb-note" role="status">문서를 불러오는 중</p>;
  if (query.isError && !query.data) {
    return <div className="kb-error"><p className="tk-error" role="alert">{failure(query.error)}</p><Button variant="ghost" onClick={() => void query.refetch()}>다시 시도</Button></div>;
  }
  const loaded = query.data.pages.flatMap((p) => p.items);
  const docs = loaded.filter((d) => matchDocument(d, filters));
  const total = query.data.pages[0]?.total ?? 0;
  const narrowed = Boolean(q || filters.domain || filters.status || hasClientFilter(filters));
  if (docs.length === 0) {
    return <div className="kb-empty">
      <p>{narrowed ? "조건에 맞는 문서가 없어요." : "아직 등록된 문서가 없어요."}</p>
      {!narrowed && <p className="kb-note">위의 자료 추가로 파일·주소·글을 넣으면 여기에 쌓여요.</p>}
      {loaded.length > 0 && hasClientFilter(filters) && query.hasNextPage && <p className="kb-note">불러온 {loaded.length}건 안에서만 걸렀어요. 더 불러오면 나올 수 있어요.</p>}
      {query.hasNextPage && <Button size="sm" variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>문서 더 보기</Button>}
    </div>;
  }
  return <div className="kb-results">
    <p className="kb-note" role="status">{hasClientFilter(filters) ? `불러온 ${loaded.length.toLocaleString("ko-KR")}건 중 ${docs.length.toLocaleString("ko-KR")}건` : `${total.toLocaleString("ko-KR")}건 중 ${docs.length.toLocaleString("ko-KR")}건`}</p>
    <ul className="kb-list" aria-label="문서 목록">{docs.map((d) => <DocRow key={d.id} doc={d} selected={d.id === selected} select={select} />)}</ul>
    {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>문서 더 보기</Button>}
    {query.isError && query.data && <p className="tk-error" role="alert">{failure(query.error)}</p>}
  </div>;
}

function Locator({ p }: { p: { page_no?: number | null; slide_no?: number | null; time_start_ms?: number | null } }) {
  return <>
    {p.page_no != null && <Badge mono>{`p.${p.page_no}`}</Badge>}
    {p.slide_no != null && <Badge mono>{`Slide ${p.slide_no}`}</Badge>}
    {p.time_start_ms != null && <Badge mono>{timecode(p.time_start_ms)}</Badge>}
  </>;
}

function PassageItem({ passage }: { passage: KbPassageV3 }) {
  const [open, setOpen] = useState(false);
  const id = `kb-passage-${passage.id}`;
  const path = crumbs(passage.section_path ?? passage.heading);
  return <li className="kb-passage" id={`kb3-p-${passage.ord}`}>
    <div className="kb-passage__head">
      <span className="kb-passage__ord">#{passage.ord + 1}</span>
      <Locator p={passage} />
      {passage.chunk_kind && passage.chunk_kind !== "text" && <Badge mono>{passage.chunk_kind === "table" ? "표" : passage.chunk_kind === "code" ? "코드" : passage.chunk_kind}</Badge>}
      <span className="kb-note">문자 {passage.char_start.toLocaleString("ko-KR")}–{passage.char_end.toLocaleString("ko-KR")} · {shortHash(passage.sha256)}…</span>
    </div>
    {path.length > 0 && <nav className="kb3-crumbs" aria-label="문서 안 위치"><ol>{path.map((c, i) => <li key={`${c}-${i}`}>{c}</li>)}</ol></nav>}
    <p className="kb-passage__body">{passage.body}</p>
    <Button size="sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>{open ? "원문 위치 닫기" : "원문 위치 보기"}</Button>
    {open && <div id={id}><EvidencePanel passageId={passage.id} /></div>}
  </li>;
}

export type DocSection = "overview" | "knowledge" | "passages" | "history";
const SECTIONS: { id: DocSection; label: string }[] = [
  { id: "overview", label: "개요·처리" }, { id: "knowledge", label: "개념·주장" }, { id: "passages", label: "패시지" }, { id: "history", label: "버전·이력" },
];
export const docSectionOf = (raw: string | null): DocSection => SECTIONS.find((s) => s.id === raw)?.id ?? "overview";

function Overview({ doc, selected }: { doc: KbDocumentDetailV3; selected: KbDocumentDetailV3["revisions"][number] }) {
  // 문서 상세에 pipeline 이 없으면 작업 목록에서 이 문서의 작업을 찾는다. 이 서버가 jobs 를 모르면 처리 카드는 없다.
  const jobs = useQuery({ queryKey: ["kb-jobs", "doc", doc.id], queryFn: () => kbJobs({ document_id: doc.id, limit: 1 }), enabled: doc.pipeline === undefined });
  const job = doc.pipeline ?? jobs.data?.items[0] ?? null;
  const src = selected.source;
  const url = src?.locator && /^https?:\/\//.test(src.locator) ? src.locator : null;
  return <div className="kb-results">
    <dl className="kb-facts">
      <div className="kb-facts__row"><dt>등록</dt><dd>{formatTime(selected.created_at)}</dd></div>
      <div className="kb-facts__row"><dt>크기</dt><dd>{formatChars(selected.char_count)} · 패시지 {selected.passage_count.toLocaleString("ko-KR")}개</dd></div>
      {doc.domain && <div className="kb-facts__row"><dt>주제</dt><dd>{domainLabel(doc.domain)}</dd></div>}
      {src && <>
        <div className="kb-facts__row"><dt>원본</dt><dd>{KIND_LABEL[src.kind] ?? src.kind} · {url ? <a href={url} target="_blank" rel="noreferrer noopener">{url}</a> : (src.locator ?? src.source_key)}</dd></div>
        <div className="kb-facts__row"><dt>원본 SHA-256</dt><dd className="kb-hash" title={src.sha256}>{shortHash(src.sha256)}…</dd></div>
      </>}
      <div className="kb-facts__row"><dt>본문 SHA-256</dt><dd className="kb-hash" title={selected.text_sha256}>{shortHash(selected.text_sha256)}…</dd></div>
      <div className="kb-facts__row"><dt>분할 규칙</dt><dd>{selected.parser_version}</dd></div>
    </dl>
    <section aria-label="요약">
      <h3 className="kb3-sub">요약</h3>
      {doc.summary ? <p className="kb3-summary">{doc.summary}</p> : <p className="kb-note">{doc.summary === undefined ? "이 서버는 문서 요약을 아직 주지 않아요." : "요약이 아직 없어요."}</p>}
    </section>
    <section aria-label="자동 처리">
      <h3 className="kb3-sub">자동 처리</h3>
      {job ? <ul className="kb3-joblist"><JobCard job={job} title="처리 단계" /></ul>
        : jobs.isPending && doc.pipeline === undefined ? <p className="kb-note" role="status">처리 상태를 읽는 중</p>
          : jobs.isError ? <p className={isKbUnsupported(jobs.error) ? "kb-note" : "tk-error"} role={isKbUnsupported(jobs.error) ? "status" : "alert"}>{failure(jobs.error)}</p>
            : <p className="kb-note">이 문서의 처리 기록이 없어요. v3 이전에 올린 문서일 수 있어요.</p>}
    </section>
  </div>;
}

function Knowledge({ doc, onEntity, onConflicts, openEvidence }: { doc: KbDocumentDetailV3; onEntity: (id: string) => void; onConflicts: () => void; openEvidence: (passageId: string) => void }) {
  return <div className="kb-results">
    <section aria-label="개념">
      <h3 className="kb3-sub">개념</h3>
      {doc.entities === undefined ? <p className="kb-note">이 서버는 문서의 개념 목록을 아직 주지 않아요.</p>
        : doc.entities.length === 0 ? <p className="kb-note">추출된 개념이 없어요.</p>
          : <ul className="kb3-chiplist" aria-label="문서에서 추출된 개념">{doc.entities.map((e) => <li key={e.id}>
            <button type="button" className="kb-chip" onClick={() => onEntity(e.id)}>{e.name} <span className="kb-note">{kindLabel(e.entity_kind)}</span></button></li>)}</ul>}
    </section>
    <section aria-label="주장">
      <h3 className="kb3-sub">주장과 근거</h3>
      {doc.assertions === undefined ? <p className="kb-note">이 서버는 문서의 주장 목록을 아직 주지 않아요.</p>
        : doc.assertions.length === 0 ? <p className="kb-note">추출된 주장이 없어요.</p>
          : <ul className="kb3-claims" aria-label="추출된 주장">{doc.assertions.map((a) => <li key={a.id}>
            <p>{a.text}</p>
            <div className="kb-badges">
              {a.is_canonical && <Badge tone="success">정본</Badge>}
              {a.status === "disputed" && <Badge tone="warning">다툼</Badge>}
              {a.status === "superseded" && <Badge>이전 주장</Badge>}
            </div>
            {a.evidence?.[0] && <Button size="sm" variant="ghost" onClick={() => openEvidence(a.evidence![0].passage_id)}>근거 원문 보기</Button>}
          </li>)}</ul>}
    </section>
    <section aria-label="충돌">
      <h3 className="kb3-sub">중복·충돌</h3>
      {doc.conflicts === undefined ? <p className="kb-note">이 서버는 문서별 충돌을 아직 주지 않아요.</p>
        : doc.conflicts.length === 0 ? <p className="kb-note">열린 충돌이 없어요.</p>
          : <div className="kb-results"><p className="kb-callout">{`이 문서와 관련된 충돌이 ${doc.conflicts.length}건 있어요.`}</p><Button size="sm" onClick={onConflicts}>충돌 비교하러 가기</Button></div>}
    </section>
  </div>;
}

export function DocumentDetail({ id, revisionId, section, setSection, selectRevision, back, openEvidenceOwner, onEntity, onConflicts }: {
  id: string; revisionId: string; section: DocSection; setSection: (s: DocSection) => void; selectRevision: (revisionId: string | null) => void; back: () => void;
  openEvidenceOwner: (documentId: string, revisionId: string) => void; onEntity: (id: string) => void; onConflicts: () => void;
}) {
  const [evidence, setEvidence] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["kb-document", id, revisionId],
    queryFn: ({ pageParam }) => kbDocumentV3(id, { revision_id: revisionId || undefined, passage_offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.passages.offset + last.passages.items.length < last.passages.total ? last.passages.offset + last.passages.limit : undefined),
  });
  if (query.isPending) return <section className="kb-detail"><p className="kb-note" role="status">문서를 여는 중</p></section>;
  if (query.isError && !query.data) {
    return <section className="kb-detail">
      <Button variant="ghost" onClick={back}>목록으로</Button>
      <p className="tk-error" role="alert">{failure(query.error)}</p>
      <Button variant="ghost" onClick={() => void query.refetch()}>다시 시도</Button>
    </section>;
  }
  const doc = query.data.pages[0];
  const selected = doc.revisions.find((r) => r.id === doc.selected_revision_id) ?? doc.revisions[0];
  const passages = query.data.pages.flatMap((p) => p.passages.items);
  const toc = [...new Set(passages.map((p) => crumbs(p.section_path ?? p.heading).join(" > ")).filter(Boolean))];
  return <section className="kb-detail" aria-label="문서 상세">
    <div className="kb-detail__head">
      <Button variant="ghost" size="sm" className="kb-back" onClick={back}>‹ 목록으로</Button>
      <h2 tabIndex={-1}>{doc.title}</h2>
      <p className="kb-hash">{doc.doc_key}</p>
    </div>
    <div className="kb-revisions" role="group" aria-label="보기">
      {SECTIONS.map((s) => <button key={s.id} type="button" className="kb-chip" aria-pressed={section === s.id} onClick={() => setSection(s.id)}>{s.label}</button>)}
    </div>
    {!selected.current && <p className="kb-callout">이전 버전이에요. 검색에는 현재 버전만 나와요.</p>}
    {section === "overview" && <Overview doc={doc} selected={selected} />}
    {section === "knowledge" && <Knowledge doc={doc} onEntity={onEntity} onConflicts={onConflicts} openEvidence={setEvidence} />}
    {section === "passages" && <>
      {toc.length > 1 && <details className="kb-disclosure"><summary>목차 {toc.length}개 절</summary>
        <ul className="kb3-toc" aria-label="목차">{toc.map((t) => <li key={t}>{t}</li>)}</ul></details>}
      {passages.length === 0
        ? <div className="kb-empty"><p>이 버전에는 패시지가 없어요.</p></div>
        : <ol className="kb-passages" aria-label="패시지">{passages.map((p) => <PassageItem key={p.id} passage={p} />)}</ol>}
      {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>패시지 더 보기</Button>}
    </>}
    {section === "history" && <ol className="kb3-history" aria-label="버전 이력">
      {doc.revisions.map((r) => <li key={r.id} data-current={r.current}>
        <div className="kb-badges"><Badge tone={r.current ? "success" : undefined}>{`버전 ${r.rev_no}${r.current ? " · 현재" : ""}`}</Badge><Badge mono>{r.parser_version}</Badge></div>
        <p className="kb-note">{formatTime(r.created_at)} · {formatChars(r.char_count)} · 패시지 {r.passage_count}개{r.supersedes_id ? " · 이전 버전을 대체" : ""}</p>
        <Button size="sm" variant={r.id === selected.id ? undefined : "ghost"} aria-pressed={r.id === selected.id} onClick={() => selectRevision(r.current ? null : r.id)}>{r.id === selected.id ? "보는 중" : "이 버전 보기"}</Button>
      </li>)}
    </ol>}
    {query.isError && query.data && <p className="tk-error" role="alert">{failure(query.error)}</p>}
    <EvidenceDialog passageId={evidence} onClose={() => setEvidence(null)} openDocument={openEvidenceOwner} />
  </section>;
}
