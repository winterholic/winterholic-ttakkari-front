import { useQueries, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { isKbUnsupported, kbDocumentsV3, kbGraph, kbJobs } from "../../api/kb";
import type { KbGraphNode, KbSummaryV3 } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { DomainBadge } from "./Documents";
import { hasClientFilter, matchDocument } from "./kbState";
import type { KbFilters } from "./kbState";
import { KIND_LABEL, failure, formatTime } from "./labels";
import { DOMAINS, STAGE_LABEL, codeText, domainLabel, jobStatusLabel, jobTone, kindColor, kindLabel } from "./labelsV3";

/** 섹션마다 따로 읽고 따로 실패한다. 한 곳이 안 읽혀도 나머지는 쓸 수 있어야 한다. */
function Panel({ title, note, state, children }: {
  title: string; note?: string;
  state: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  children: ReactNode;
}) {
  return <section className="kb3-panel" aria-label={title}>
    <h2 className="kb3-panel__title">{title}</h2>
    {note && <p className="kb-note">{note}</p>}
    {state.isPending && <p className="kb-note" role="status">읽는 중</p>}
    {state.isError && <div className="kb-error">
      <p className={isKbUnsupported(state.error) ? "kb-note" : "tk-error"} role={isKbUnsupported(state.error) ? "status" : "alert"}>{failure(state.error)}</p>
      {!isKbUnsupported(state.error) && <Button size="sm" variant="ghost" onClick={() => void state.refetch()}>다시 시도</Button>}
    </div>}
    {!state.isPending && !state.isError && children}
  </section>;
}

/**
 * 검색어가 없을 때의 메인. 검색창만 덩그러니 두지 않고 처리 현황과 처리 오류, 최근 자료, 주제별 분류, 주요 개념과 관계를 보여 줘서
 * "무엇이 들어 있고 어디까지 처리됐는지"에서 탐색을 시작하게 한다.
 */
export function ExploreHome({ filters, summary, openDocument, openJobs, onConcept, onGraph, onDomain }: {
  filters: KbFilters; summary: KbSummaryV3 | undefined;
  openDocument: (documentId: string, revisionId?: string) => void; openJobs: () => void;
  onConcept: (id: string, name: string) => void; onGraph: () => void; onDomain: (domain: string) => void;
}) {
  const clientFilter = hasClientFilter(filters);
  // 서버가 최신 갱신순으로 주므로 앞쪽만 쓴다. 유형·출처·기간 필터는 서버에 없어서 켜져 있을 때만 더 넓게 읽고 거른다.
  const docs = useQuery({
    queryKey: ["kb-documents", "home", filters.domain, clientFilter],
    queryFn: () => kbDocumentsV3({ domain: filters.domain || undefined, limit: clientFilter ? 50 : 6 }),
  });
  const graph = useQuery({ queryKey: ["kb-graph", "hubs", filters.domain], queryFn: () => kbGraph({ domain: filters.domain || undefined, limit: 12 }) });
  // 실패와 보류만 올린다. 부분 완료(AI 심층 추출만 빠진 완료)는 L2 가 꺼진 서버에서 모든 문서의 정상 결과라 오류 목록에 섞으면 묻힌다.
  const problemQueries = useQueries({ queries: ["failed", "held"].map((status) => ({ queryKey: ["kb-jobs", "home", status], queryFn: () => kbJobs({ status, limit: 5 }) })) });
  const problemItems = problemQueries.flatMap((q) => q.data?.items ?? []).slice(0, 5);
  const problemTotal = problemQueries.reduce((sum, q) => sum + (q.data?.total ?? 0), 0);
  const attention = {
    isPending: problemQueries.some((q) => q.isPending), isError: problemQueries.every((q) => q.isError), error: problemQueries.find((q) => q.error)?.error,
    refetch: () => problemQueries.forEach((q) => void q.refetch()),
  };
  // 주제별 문서 수는 서버가 필터 결과의 total 로 센 값이다(불러온 목록 기준이 아니다).
  const domainTotals = useQueries({
    queries: DOMAINS.map((d) => ({ queryKey: ["kb-documents", "domain-total", d.value], queryFn: () => kbDocumentsV3({ domain: d.value, limit: 1 }) })),
  });
  const loaded = docs.data?.items ?? [];
  const recent = loaded.filter((d) => matchDocument(d, filters)).slice(0, 6);
  const domainCounts = DOMAINS.map((d, i) => ({ value: d.value, total: domainTotals[i].data?.total ?? 0 })).filter((d) => d.total > 0);
  const domainState = {
    isPending: domainTotals.some((q) => q.isPending), isError: domainTotals.every((q) => q.isError), error: domainTotals.find((q) => q.error)?.error,
    refetch: () => domainTotals.forEach((q) => void q.refetch()),
  };
  const hubs = graph.data?.nodes ?? [];
  const byId = new Map(hubs.map((n) => [n.id, n]));
  const kinds = new Map<string, KbGraphNode[]>();
  for (const n of hubs) kinds.set(n.entity_kind, [...(kinds.get(n.entity_kind) ?? []), n]);
  const relations = (graph.data?.edges ?? []).filter((e) => byId.has(e.source) && byId.has(e.target)).slice(0, 8);
  const pipe = summary?.pipeline;
  const running = summary?.counts.pipeline_running;
  const failed = summary?.counts.pipeline_failed;

  return <div className="kb3-home">
    <section className="kb3-panel kb3-panel--status" aria-label="처리 현황">
      <h2 className="kb3-panel__title">처리 현황</h2>
      {running === undefined && failed === undefined
        ? <p className="kb-note">이 서버는 처리 현황 숫자를 아직 주지 않아요. 자세한 작업은 처리 현황에서 볼 수 있어요.</p>
        : <p className="kb3-status-line">
          <Badge tone={running ? "info" : undefined}>{`진행 중 ${running ?? 0}건`}</Badge>
          <Badge tone={failed ? "danger" : undefined}>{`실패 ${failed ?? 0}건`}</Badge>
          {pipe && <Badge tone={pipe.held ? "warning" : undefined}>{`보류 ${pipe.held}건`}</Badge>}
          {pipe && <Badge>{`부분 완료 ${pipe.degraded}건`}</Badge>}
        </p>}
      {pipe && pipe.degraded > 0 && <p className="kb-note">부분 완료는 AI 심층 추출만 빠지고 규칙·사전 기반 개념까지는 처리된 문서예요. 검색은 그대로 쓸 수 있어요.</p>}
      <Button size="sm" onClick={openJobs}>처리 현황 열기</Button>
    </section>

    <Panel title="처리 오류와 보류" state={attention} note="실패하거나 보류된 작업이에요. 원인을 보고 다시 시도할 수 있어요.">
      {problemItems.length === 0
        ? <p className="kb-note">실패하거나 보류된 작업이 없어요.</p>
        : <>
          <ul className="kb3-attention-list" aria-label="실패·보류 작업">{problemItems.map((j) => <li key={j.id}>
            <div className="kb-badges"><Badge tone={jobTone(j.status)}>{jobStatusLabel(j.status)}</Badge><Badge>{STAGE_LABEL[j.current_stage]}</Badge></div>
            <button type="button" className="kb3-linkbtn" onClick={() => openDocument(j.document_id, j.revision_id)}>{j.document_title ?? `문서 ${j.document_id.slice(0, 8)}`}</button>
            <span className="kb-note">{codeText(j.hold_reason) ?? j.error_detail ?? "사유가 기록되지 않았어요."}</span>
          </li>)}</ul>
          {problemTotal > problemItems.length && <p className="kb-note">{`${problemTotal.toLocaleString("ko-KR")}건 중 ${problemItems.length}건만 보여요.`}</p>}
          <Button size="sm" onClick={openJobs}>모두 보고 재시도하기</Button>
        </>}
    </Panel>

    <Panel title="최근 자료" state={docs}>
      {recent.length === 0
        ? <div className="kb-empty"><p>{loaded.length > 0 && clientFilter ? "필터에 맞는 최근 자료가 없어요." : "아직 자료가 없어요."}</p><p className="kb-note">위의 자료 추가로 파일·주소·글을 넣어 보세요.</p></div>
        : <ul className="kb3-recent" aria-label="최근 자료">{recent.map((d) => <li key={d.id}>
          <button type="button" className="kb-row" onClick={() => openDocument(d.id, d.current_revision?.id)}>
            <span className="kb-row__main"><span className="kb-row__title">{d.title}</span><span aria-hidden="true" className="kb-row__arrow">›</span></span>
            <span className="kb-badges">
              {d.pipeline_status ? <Badge tone={jobTone(d.pipeline_status)}>{jobStatusLabel(d.pipeline_status)}</Badge> : <Badge>처리 기록 없음</Badge>}
              {d.domain && <DomainBadge domain={d.domain} source={d.domain_source} />}
              {d.current_revision?.source && <Badge>{KIND_LABEL[d.current_revision.source.kind] ?? d.current_revision.source.kind}</Badge>}
            </span>
            <span className="kb-row__meta">
              <span>{formatTime(d.updated_at)}</span>
              {d.entity_count !== undefined && <span>개념 {d.entity_count}</span>}
              {d.assertion_count !== undefined && <span>주장 {d.assertion_count}</span>}
            </span>
          </button>
        </li>)}</ul>}
    </Panel>

    <Panel title="주제별 분류" state={domainState} note="사용자가 고른 주제와 추출된 개념으로 자동 분류한 주제를 함께 센 값이에요.">
      {domainCounts.length === 0
        ? <p className="kb-note">분류된 문서가 아직 없어요.</p>
        : <ul className="kb3-chiplist" aria-label="주제별 문서 수">{domainCounts.map((d) => <li key={d.value}>
          <button type="button" className="kb-chip" aria-pressed={filters.domain === d.value} onClick={() => onDomain(filters.domain === d.value ? "" : d.value)}>{domainLabel(d.value)} {d.total.toLocaleString("ko-KR")}</button>
        </li>)}</ul>}
    </Panel>

    <Panel title="주요 개념과 관계" state={graph} note={graph.data ? `전체 개념 ${graph.data.total_entities.toLocaleString("ko-KR")}개 중 중요도 상위 ${hubs.length}개` : undefined}>
      {hubs.length === 0
        ? <div className="kb-empty"><p>아직 추출된 개념이 없어요.</p><p className="kb-note">자료 처리가 끝나면 자주 나오고 많이 연결된 개념이 여기에 모여요.</p></div>
        : <>
          {[...kinds].map(([kind, nodes]) => <div key={kind} className="kb3-kind">
            <p className="kb-note"><span className="kb3-dot" style={{ background: kindColor(kind) }} aria-hidden="true" />{kindLabel(kind)}</p>
            <ul className="kb3-chiplist" aria-label={`${kindLabel(kind)} 개념`}>{nodes.map((n) => <li key={n.id}>
              <button type="button" className="kb-chip" onClick={() => onConcept(n.id, n.name)}>
                {n.name} <span className="kb-note">문서 {n.document_count}</span>{n.has_open_conflict ? <Badge tone="warning">충돌</Badge> : null}
              </button></li>)}</ul>
          </div>)}
          {relations.length > 0 && <ul className="kb3-relations" aria-label="주요 관계">{relations.map((e) => <li key={e.id ?? `${e.source}|${e.predicate}|${e.target}`}>
            <span>{byId.get(e.source)?.name}</span><span className="kb3-chip__pred">{e.predicate} →</span><span>{byId.get(e.target)?.name}</span>
          </li>)}</ul>}
          {relations.length === 0 && <p className="kb-note">상위 개념 사이에 확정된 관계가 아직 없어요.</p>}
          <Button size="sm" onClick={onGraph}>개념 그래프에서 펼쳐 보기</Button>
        </>}
    </Panel>
  </div>;
}
