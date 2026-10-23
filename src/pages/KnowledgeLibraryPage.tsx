import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { kbSummary } from "../api/client";
import { DocumentDetail, DocumentFilter, DocumentList } from "../features/kb/Documents";
import { failure } from "../features/kb/labels";
import { Register } from "../features/kb/Register";
import { SearchBox, SearchResults } from "../features/kb/Search";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import "../features/kb/kb.css";

type View = "search" | "docs" | "add";
const VIEWS: { id: View; label: string }[] = [
  { id: "search", label: "검색" },
  { id: "docs", label: "문서" },
  { id: "add", label: "등록" },
];

/**
 * 지식 도서관(ADR 0063). 공식 문서·표준 같은 세계 지식을 원문 그대로 보관하고 문단(패시지) 단위로 찾는다.
 * 개인 맥락 도서관(/context-library)과 테이블·검색 풀이 다르므로 서로의 결과가 섞이지 않는다. 상태는 모두 URL 에 둔다.
 */
export function KnowledgeLibraryPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ["kb-summary"], queryFn: kbSummary });
  const view: View = VIEWS.find((v) => v.id === params.get("view"))?.id ?? "search";
  const q = params.get("q") || "";
  const dq = params.get("dq") || "";
  const doc = params.get("doc") || "";
  const rev = params.get("rev") || "";

  const update = useCallback((values: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(values)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    });
  }, [setParams]);
  const openDocument = (documentId: string, revisionId?: string) =>
    update({ view: "docs", doc: documentId, rev: revisionId || null });

  const counts = summary.data?.counts;
  const meta = counts ? `문서 ${counts.documents.toLocaleString("ko-KR")} · 패시지 ${counts.passages.toLocaleString("ko-KR")}` : "공식 문서·표준을 원문 근거와 함께";

  return <div className="tk-screen">
    <PageHeader title="지식 도서관" meta={meta} actions={
      <button type="button" className="tk-icon-button" aria-label="다시 읽기" onClick={() => void queryClient.invalidateQueries({ predicate: (qy) => String(qy.queryKey[0]).startsWith("kb-") })}><Icon name="retry" /></button>
    } />
    <div className="tk-screen__body"><div className="tk-container tk-container--lg kb-page" data-selected={Boolean(view === "docs" && doc)}>
      <nav className="kb-tabs" aria-label="보기 방식">
        {VIEWS.map((v) => <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => update({ view: v.id === "search" ? null : v.id })}>{v.label}</button>)}
      </nav>
      {summary.isError && <div className="kb-error"><p className="tk-error" role="alert">{failure(summary.error)}</p><Button variant="ghost" onClick={() => void summary.refetch()}>다시 시도</Button></div>}
      {view === "search" && <>
        <SearchBox value={q} onSubmit={(next) => update({ q: next || null })} />
        <SearchResults q={q} openDocument={openDocument} />
      </>}
      {view === "docs" && <>
        <div className="kb-top" data-selected={Boolean(doc)}><DocumentFilter value={dq} onSubmit={(next) => update({ dq: next || null, doc: null, rev: null })} /></div>
        <div className="kb-browser" data-selected={Boolean(doc)}>
          <div className="kb-browser__list"><DocumentList q={dq} selected={doc} select={(id) => update({ doc: id, rev: null })} /></div>
          {doc
            ? <DocumentDetail key={doc} id={doc} revisionId={rev} selectRevision={(r) => update({ rev: r })} back={() => update({ doc: null, rev: null })} />
            : <div className="kb-placeholder"><p>문서를 고르면 버전, 패시지, 원문 위치가 여기에 보여요.</p></div>}
        </div>
      </>}
      {view === "add" && <Register openDocument={(id) => openDocument(id)} />}
    </div></div>
  </div>;
}
