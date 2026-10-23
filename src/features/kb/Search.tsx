import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { kbSearch } from "../../api/client";
import type { KbSearchHit } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { EvidencePanel } from "./Evidence";
import { KIND_LABEL, failure, splitHighlights } from "./labels";

export function SearchBox({ value, onSubmit }: { value: string; onSubmit: (q: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // 주소가 바뀌어(뒤로 가기 등) 값이 달라졌을 때만 입력칸을 맞춘다. 입력 중에는 건드리지 않는다.
  if (value !== seen) { setSeen(value); setText(value); }
  return <form className="kb-search" role="search" onSubmit={(e) => { e.preventDefault(); onSubmit(text.trim()); }}>
    <Icon name="search" />
    <input className="tk-input" type="search" aria-label="지식 도서관 검색" placeholder="질문이나 키워드 (예: 격리 수준, WAL 체크포인트)" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
    <Button variant="primary" type="submit">검색</Button>
  </form>;
}

function Hit({ hit, openDocument }: { hit: KbSearchHit; openDocument: (documentId: string, revisionId: string) => void }) {
  const [open, setOpen] = useState(false);
  const parts = splitHighlights(hit.snippet, hit.highlights);
  const evidenceId = `kb-ev-${hit.passage_id}`;
  return <li className="kb-hit">
    <div className="kb-hit__head">
      <h3 className="kb-hit__title">{hit.document.title}</h3>
      <div className="kb-badges">
        <Badge tone={hit.revision.current ? "success" : "warning"}>{hit.revision.current ? "현재 버전" : `이전 버전 ${hit.revision.rev_no}`}</Badge>
        {hit.source && <Badge>{KIND_LABEL[hit.source.kind] ?? hit.source.kind}</Badge>}
        {hit.document.lang && <Badge mono>{hit.document.lang}</Badge>}
      </div>
    </div>
    <p className="kb-hit__snippet">{parts.map((p, i) => (p.hit ? <mark key={i} className="kb-mark">{p.text}</mark> : <span key={i}>{p.text}</span>))}</p>
    {hit.source && <p className="kb-hit__source">{hit.source.locator ?? hit.source.source_key}</p>}
    <div className="kb-actions">
      <Button size="sm" aria-expanded={open} aria-controls={evidenceId} onClick={() => setOpen((v) => !v)}>{open ? "원문 위치 닫기" : "원문 위치 보기"}</Button>
      <Button size="sm" variant="ghost" onClick={() => openDocument(hit.document.id, hit.revision.id)}>문서 열기</Button>
    </div>
    {open && <div id={evidenceId}><EvidencePanel passageId={hit.passage_id} /></div>}
  </li>;
}

export function SearchResults({ q, openDocument }: { q: string; openDocument: (documentId: string, revisionId: string) => void }) {
  const query = useInfiniteQuery({
    queryKey: ["kb-search", q],
    queryFn: ({ pageParam }) => kbSearch({ q, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.has_more ? last.offset + last.limit : undefined),
    enabled: q.length > 0,
  });
  if (!q) return <p className="kb-placeholder">찾고 싶은 내용을 입력하면 등록된 문서의 패시지에서 근거 문단을 찾아 줘요. 결과마다 원문 위치와 해시를 확인할 수 있어요.</p>;
  if (query.isPending) return <p className="kb-note" role="status">검색하는 중</p>;
  if (query.isError && !query.data) {
    return <div className="kb-error"><p className="tk-error" role="alert">{failure(query.error)}</p><Button variant="ghost" onClick={() => void query.refetch()}>다시 시도</Button></div>;
  }
  const hits = query.data.pages.flatMap((p) => p.items);
  if (hits.length === 0) {
    return <div className="kb-empty"><p>“{q}”와 맞는 패시지가 없어요.</p><p className="kb-note">다른 표현으로 검색하거나, 등록 탭에서 자료를 먼저 넣어 주세요. 한 글자나 흔한 말만으로는 검색하지 않아요.</p></div>;
  }
  return <div className="kb-results">
    <ul className="kb-hits" aria-label="검색 결과">{hits.map((h) => <Hit key={h.passage_id} hit={h} openDocument={openDocument} />)}</ul>
    {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>결과 더 보기</Button>}
    {query.isError && query.data && <p className="tk-error" role="alert">{failure(query.error)}</p>}
    <p className="kb-note">단어 일치 순서로 보여 줘요. 의미 검색이나 재순위는 아직 쓰지 않고, 근거는 원문 인용이라 해석은 검증되지 않았어요.</p>
  </div>;
}
