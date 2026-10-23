import { useKbScope } from "./scope";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { kbDocument, kbDocuments } from "../../api/client";
import type { KbDocumentRow, KbPassage } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { EvidencePanel } from "./Evidence";
import { KIND_LABEL, failure, formatChars, formatTime, shortHash } from "./labels";

export function DocumentFilter({ value, onSubmit }: { value: string; onSubmit: (q: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); setText(value); }
  return <form className="kb-search" role="search" onSubmit={(e) => { e.preventDefault(); onSubmit(text.trim()); }}>
    <Icon name="search" />
    <input className="tk-input" type="search" aria-label="문서 제목 필터" placeholder="문서 제목·키로 거르기" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
  </form>;
}

function DocRow({ doc, selected, select }: { doc: KbDocumentRow; selected: boolean; select: (id: string) => void }) {
  const rev = doc.current_revision;
  return <li>
    <button type="button" className="kb-row" aria-pressed={selected} onClick={() => select(doc.id)}>
      <span className="kb-row__main"><span className="kb-row__title">{doc.title}</span><span aria-hidden="true" className="kb-row__arrow">›</span></span>
      <span className="kb-badges">
        {rev && <Badge tone="info">{`버전 ${rev.rev_no}`}</Badge>}
        {rev?.source && <Badge>{KIND_LABEL[rev.source.kind] ?? rev.source.kind}</Badge>}
        {doc.lang && <Badge mono>{doc.lang}</Badge>}
      </span>
      {rev && <span className="kb-row__meta"><span>패시지 {rev.passage_count.toLocaleString("ko-KR")}개</span><span>{formatChars(rev.char_count)}</span><span>{formatTime(doc.updated_at)}</span></span>}
    </button>
  </li>;
}

export function DocumentList({ q, selected, select }: { q: string; selected: string; select: (id: string) => void }) {
  const scope = useKbScope();
  const query = useInfiniteQuery({
    queryKey: ["kb-documents", scope, q],
    queryFn: ({ pageParam }) => kbDocuments({ q, offset: pageParam, ...(scope === "work" ? { scope } : {}) }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.limit : undefined),
  });
  if (query.isPending) return <p className="kb-note" role="status">문서를 불러오는 중</p>;
  if (query.isError && !query.data) {
    return <div className="kb-error"><p className="tk-error" role="alert">{failure(query.error)}</p><Button variant="ghost" onClick={() => void query.refetch()}>다시 시도</Button></div>;
  }
  const docs = query.data.pages.flatMap((p) => p.items);
  const total = query.data.pages[0]?.total ?? 0;
  if (docs.length === 0) {
    return <div className="kb-empty"><p>{q ? `“${q}”와 맞는 문서가 없어요.` : "아직 등록된 문서가 없어요."}</p>{!q && <p className="kb-note">등록 탭에서 텍스트나 .txt·.md 파일을 넣으면 여기에 쌓여요.</p>}</div>;
  }
  return <div className="kb-results">
    <p className="kb-note" role="status">{total.toLocaleString("ko-KR")}건 중 {docs.length.toLocaleString("ko-KR")}건</p>
    <ul className="kb-list" aria-label="문서 목록">{docs.map((d) => <DocRow key={d.id} doc={d} selected={d.id === selected} select={select} />)}</ul>
    {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>문서 더 보기</Button>}
    {query.isError && query.data && <p className="tk-error" role="alert">{failure(query.error)}</p>}
  </div>;
}

function PassageItem({ passage }: { passage: KbPassage }) {
  const [open, setOpen] = useState(false);
  const id = `kb-passage-${passage.id}`;
  return <li className="kb-passage">
    <div className="kb-passage__head"><span className="kb-passage__ord">#{passage.ord + 1}</span><span className="kb-note">문자 {passage.char_start.toLocaleString("ko-KR")}–{passage.char_end.toLocaleString("ko-KR")} · {shortHash(passage.sha256)}…</span></div>
    {passage.heading && <p className="kb-passage__heading">{passage.heading}</p>}
    <p className="kb-passage__body">{passage.body}</p>
    <Button size="sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>{open ? "원문 위치 닫기" : "원문 위치 보기"}</Button>
    {open && <div id={id}><EvidencePanel passageId={passage.id} /></div>}
  </li>;
}

export function DocumentDetail({ id, revisionId, selectRevision, back }: {
  id: string; revisionId: string; selectRevision: (revisionId: string | null) => void; back: () => void;
}) {
  const scope = useKbScope();
  const query = useInfiniteQuery({
    queryKey: ["kb-document", scope, id, revisionId],
    queryFn: ({ pageParam }) => kbDocument(id, { revision_id: revisionId || undefined, passage_offset: pageParam, ...(scope === "work" ? { scope } : {}) }),
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
  return <section className="kb-detail" aria-label="문서 상세">
    <div className="kb-detail__head">
      <Button variant="ghost" size="sm" className="kb-back" onClick={back}>‹ 목록으로</Button>
      <h2 tabIndex={-1}>{doc.title}</h2>
      <p className="kb-hash">{doc.doc_key}</p>
    </div>
    <div className="kb-revisions" role="group" aria-label="버전">
      {doc.revisions.map((r) => <button key={r.id} type="button" className="kb-chip" aria-pressed={r.id === selected.id} onClick={() => selectRevision(r.current ? null : r.id)}>
        버전 {r.rev_no}{r.current ? " · 현재" : ""}
      </button>)}
    </div>
    <dl className="kb-facts">
      <div className="kb-facts__row"><dt>등록</dt><dd>{formatTime(selected.created_at)}</dd></div>
      <div className="kb-facts__row"><dt>크기</dt><dd>{formatChars(selected.char_count)} · 패시지 {selected.passage_count.toLocaleString("ko-KR")}개</dd></div>
      {selected.source && <>
        <div className="kb-facts__row"><dt>출처</dt><dd>{KIND_LABEL[selected.source.kind] ?? selected.source.kind} · {selected.source.locator ?? selected.source.source_key}</dd></div>
        <div className="kb-facts__row"><dt>원본 SHA-256</dt><dd className="kb-hash" title={selected.source.sha256}>{shortHash(selected.source.sha256)}…</dd></div>
      </>}
      <div className="kb-facts__row"><dt>본문 SHA-256</dt><dd className="kb-hash" title={selected.text_sha256}>{shortHash(selected.text_sha256)}…</dd></div>
      <div className="kb-facts__row"><dt>분할 규칙</dt><dd>{selected.parser_version}</dd></div>
    </dl>
    {!selected.current && <p className="kb-callout">이전 버전이에요. 검색에는 현재 버전만 나와요.</p>}
    {passages.length === 0
      ? <div className="kb-empty"><p>이 버전에는 패시지가 없어요.</p></div>
      : <ol className="kb-passages" aria-label="패시지">{passages.map((p) => <PassageItem key={p.id} passage={p} />)}</ol>}
    {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>패시지 더 보기</Button>}
    {query.isError && query.data && <p className="tk-error" role="alert">{failure(query.error)}</p>}
  </section>;
}
