import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { DragEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { isKbV3Summary, kbSummaryV3 } from "../api/kb";
import { ConflictsQualityTab } from "../features/kb/ConflictsQualityTab";
import { DocumentDetail, DocumentFilter, DocumentList, docSectionOf } from "../features/kb/Documents";
import { ExploreHome } from "../features/kb/ExploreHome";
import { FilterBar } from "../features/kb/Filters";
import { IngestModal } from "../features/kb/IngestModal";
import { VIEWS, filtersOf, viewOf } from "../features/kb/kbState";
import type { KbView } from "../features/kb/kbState";
import { failure } from "../features/kb/labels";
import { OntologyGraphTab } from "../features/kb/OntologyGraphTab";
import { PipelineStatusDrawer } from "../features/kb/PipelineStatusDrawer";
import { SearchBox, SearchResults, modeOf } from "../features/kb/Search";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import "../features/kb/kb.css";
import "../features/kb/kb3.css";

const n = (v: number) => v.toLocaleString("ko-KR");

/** 좁은 머리글에 들어가도록 버튼 글자는 줄이고, 자세한 내역은 접근성 이름으로 준다. */
function pipelineLabel(c: { running: number; failed: number; held: number; degraded: number } | undefined): string {
  if (!c) return "처리 현황 열기";
  return `처리 현황 열기: 진행 ${c.running}건, 실패 ${c.failed}건, 보류 ${c.held}건, 부분 완료 ${c.degraded}건`;
}

/**
 * 지식 도서관. 자료를 넣으면(상단 추가) 자동으로 처리되고, 그 결과를 탐색·그래프·문서·충돌 네 탭에서 본다.
 * 개인/회사 범위 선택은 없다. 서버가 v3 계약을 지키면 summary 에 v3 숫자가 오고, 아니면 개인 범위만 보일 수 있다고 밝힌다.
 * 개인 맥락 도서관(/context-library)과 테이블·검색 풀이 다르다. 화면 상태는 모두 URL 에 둔다(예전 view=search·add·collect 주소 호환).
 */
export function KnowledgeLibraryPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const summary = useQuery({
    queryKey: ["kb-summary"], queryFn: () => kbSummaryV3(),
    refetchInterval: (q) => ((q.state.data?.counts.pipeline_running ?? 0) > 0 ? 3000 : false),
  });
  const [jobsOpen, setJobsOpen] = useState(false);
  const [ingest, setIngest] = useState<{ open: boolean; nonce: number; files: File[] }>({ open: false, nonce: 0, files: [] });
  const [dragging, setDragging] = useState(false);

  const update = useCallback((values: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("scope"); // 예전 개인/회사 주소는 읽기만 하고 버린다.
      for (const [k, v] of Object.entries(values)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    });
  }, [setParams]);

  const rawView = viewOf(params.get("view"));
  if (rawView === "legacy-collect") return <Navigate to={params.get("scope") === "work" ? "/collect?scope=work" : "/collect"} replace />;
  const view: KbView = rawView;
  const filters = filtersOf(params);
  const q = params.get("q") || "";
  const dq = params.get("dq") || "";
  const doc = params.get("doc") || "";
  const rev = params.get("rev") || "";
  const ent = params.get("ent") || "";
  const mode = modeOf(params.get("mode"));
  const counts = summary.data?.counts;
  const pipe = summary.data?.pipeline;
  const v3info = summary.data?.v3;
  const retrieval = summary.data?.retrieval;
  const v3 = isKbV3Summary(summary.data);
  const candidates = params.get("cand") === "1";
  const convStatus = params.get("cs") === "all" ? "all" : "open";

  const openDocument = (documentId: string, revisionId?: string) => update({ view: "docs", doc: documentId, rev: revisionId || null, ds: null });
  const toGraph = (id: string | null) => update({ view: "graph", ent: id, doc: null, rev: null });
  const toConflicts = (entityId?: string, cs?: string) => update({ view: "conflicts", ent: entityId || null, cs: cs === "all" ? "all" : null, doc: null, rev: null });
  const setConcept = (id: string, name: string) => update({ concept: id, cn: name, q: q || name, view: null });
  const goTab = (v: KbView) => update({ view: v === "explore" ? null : v, ent: null, cs: null, doc: null, rev: null, ds: null });
  const openIngest = (files: File[] = []) => setIngest((s) => ({ open: true, nonce: s.nonce + 1, files }));

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const onDrop = (e: DragEvent) => {
    setDragging(false);
    if (!hasFiles(e)) return; // 글자·링크를 끌어다 놓는 동작은 브라우저에 맡긴다.
    e.preventDefault();
    if (e.dataTransfer.files.length) openIngest(Array.from(e.dataTransfer.files));
  };

  // 부분 완료(degraded)는 AI 심층 추출만 빠진 정상 완료다. L2 가 꺼진 서버에서는 모든 문서가 그렇게 끝나므로 "주의"로 세지 않는다.
  const attention = pipe?.held ?? 0;
  const meta = counts ? `문서 ${n(counts.documents)} · 패시지 ${n(counts.passages)}` : "공식 문서·표준을 원문 근거와 함께";
  const running = counts?.pipeline_running ?? 0;
  const failed = counts?.pipeline_failed ?? 0;
  const metrics = counts ? ([
    ["문서", counts.documents], ["개념", counts.entities], ["주장", counts.assertions], ["관계", counts.relations], ["후보 관계", v3info?.relations_candidate], ["열린 충돌", counts.open_conflicts],
  ] as [string, number | undefined][]).filter((m): m is [string, number] => m[1] !== undefined) : [];

  return <>
    <div className="tk-screen">
      <PageHeader title="지식 도서관" meta={meta} actions={
        <div className="kb3-header-actions">
          {/* 좁은 머리글에서 제목이 잘리지 않도록 좁은 화면에서는 "자료"와 "처리" 를 줄인다. 접근성 이름은 그대로다. */}
          <Button variant="primary" size="sm" aria-label="자료 추가" onClick={() => openIngest()}>+ <span className="kb3-wide-only">자료 </span>추가</Button>
          <button type="button" className="tk-button tk-button--sm kb3-pipeline" data-state={failed > 0 ? "failed" : attention > 0 ? "attention" : running > 0 ? "running" : "idle"}
            aria-label={pipelineLabel(counts?.pipeline_running === undefined && counts?.pipeline_failed === undefined ? undefined : { running, failed, held: pipe?.held ?? 0, degraded: pipe?.degraded ?? 0 })}
            onClick={() => setJobsOpen(true)}>
            <span>{counts?.pipeline_running === undefined && counts?.pipeline_failed === undefined ? "처리 현황" : <><span className="kb3-wide-only">처리 </span>{[running > 0 && `진행 ${running}`, failed > 0 && `실패 ${failed}`, attention > 0 && `보류 ${attention}`].filter(Boolean).join(" · ") || "대기 없음"}</>}</span>
          </button>
          <button type="button" className="tk-icon-button" aria-label="다시 읽기" onClick={() => void queryClient.invalidateQueries({ predicate: (qy) => String(qy.queryKey[0]).startsWith("kb-") })}><Icon name="retry" /></button>
        </div>
      } />
      <div className="tk-screen__body"
        onDragEnter={(e) => { if (hasFiles(e)) setDragging(true); }}
        onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={onDrop}>
        <div className="tk-container tk-container--lg kb-page" data-selected={Boolean(view === "docs" && doc)} data-dragging={dragging}>
          {dragging && <p className="kb3-dropnote" role="status">놓으면 자료 추가 창이 열려요</p>}
          {summary.isError && <div className="kb-error"><p className="tk-error" role="alert">{failure(summary.error)}</p><Button variant="ghost" onClick={() => void summary.refetch()}>다시 시도</Button></div>}
          {summary.data && !v3 && <p className="kb-callout" role="status">
            이 서버는 아직 지식 도서관 v3 API 를 제공하지 않아요. 지금 보이는 목록은 개인 범위만일 수 있어서 회사 범위 자료가 빠졌을 수 있어요. 개념·충돌·처리 현황은 v3 가 연결되면 채워져요.
          </p>}
          {metrics.length > 0 && <ul className="kb3-metrics" aria-label="도서관 현황">{metrics.map(([label, value]) => <li key={label}><span className="kb-note">{label}</span><strong>{n(value)}</strong></li>)}</ul>}
          <nav className="kb-tabs" aria-label="보기 방식">
            {VIEWS.map((v) => <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => goTab(v.id)}>{v.label}</button>)}
          </nav>

          {view === "explore" && <>
            <SearchBox value={q} mode={mode} onSubmit={(next) => update({ q: next || null })} onMode={(m) => update({ mode: m === "hybrid" ? null : m })} />
            <FilterBar filters={filters} update={update} />
            {mode !== "lexical" && retrieval && retrieval.enabled === false && q &&
              <p className="kb-note" role="status">이 서버는 의미 검색이 꺼져 있어요. 단어와 개념 관계로만 찾고{mode === "vector" ? ", 의미만 검색은 쓸 수 없어요." : "요."}</p>}
            {mode !== "lexical" && retrieval && retrieval.enabled !== false && retrieval.total > retrieval.indexed && q &&
              <p className="kb-note" role="status">의미 검색 준비: {n(retrieval.indexed)} / {n(retrieval.total)}개 패시지{retrieval.last_error ? " · 일부 자료를 처리하지 못했어요. 단어 검색은 계속 이용할 수 있어요." : ""}</p>}
            {q
              ? <SearchResults q={q} mode={mode} filters={filters} openDocument={openDocument} onConcept={(id, name) => update({ concept: id, cn: name })} onGraph={toGraph} onConflicts={toConflicts} />
              : <ExploreHome filters={filters} summary={summary.data} openDocument={openDocument} openJobs={() => setJobsOpen(true)} onConcept={setConcept} onGraph={() => toGraph(null)} onDomain={(d) => update({ domain: d || null })} />}
          </>}

          {view === "graph" && <OntologyGraphTab filters={filters} selectedId={ent || null} onSelect={(id) => update({ ent: id })} openDocument={openDocument} onConflicts={(id) => toConflicts(id)}
            candidates={candidates} onCandidates={(on) => update({ cand: on ? "1" : null })} />}

          {view === "docs" && <>
            <div className="kb-top" data-selected={Boolean(doc)}>
              <div className="kb3-docbar"><DocumentFilter value={dq} onSubmit={(next) => update({ dq: next || null, doc: null, rev: null })} />
                <Link className="tk-button tk-button--sm" to="/collect">외부 자동 수집기 관리 →</Link></div>
              <FilterBar filters={filters} update={update} withStatus resetKeys={["doc", "rev"]} />
            </div>
            <div className="kb-browser" data-selected={Boolean(doc)}>
              <div className="kb-browser__list"><DocumentList q={dq} filters={filters} selected={doc} select={(id) => update({ doc: id, rev: null, ds: null })} /></div>
              {doc
                ? <DocumentDetail key={doc} id={doc} revisionId={rev} section={docSectionOf(params.get("ds"))} setSection={(s) => update({ ds: s === "overview" ? null : s })}
                  selectRevision={(r) => update({ rev: r })} back={() => update({ doc: null, rev: null, ds: null })} openEvidenceOwner={openDocument} onEntity={toGraph} onConflicts={(status) => toConflicts(undefined, status)} />
                : <div className="kb-placeholder"><p>문서를 고르면 요약, 처리 단계, 개념·주장, 버전 이력, 원문 위치가 여기에 보여요.</p></div>}
            </div>
          </>}

          {view === "conflicts" && <ConflictsQualityTab summary={summary.data} entityId={ent} status={convStatus} setStatus={(s) => update({ cs: s === "all" ? "all" : null })} clearEntity={() => update({ ent: null })} openDocument={openDocument} />}
        </div>
      </div>
    </div>
    <IngestModal key={ingest.nonce} open={ingest.open} onClose={() => setIngest((s) => ({ ...s, open: false }))} initialFiles={ingest.files}
      openDocument={openDocument} openJobs={() => setJobsOpen(true)} />
    <PipelineStatusDrawer open={jobsOpen} onClose={() => setJobsOpen(false)} openDocument={openDocument} />
  </>;
}
