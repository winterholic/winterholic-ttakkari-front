import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { isKbUnsupported, kbDocumentsV3, kbGraph } from "../../api/kb";
import type { KbCountsV3, KbGraphNode } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { hasClientFilter, matchDocument } from "./kbState";
import type { KbFilters } from "./kbState";
import { KIND_LABEL, failure, formatTime } from "./labels";
import { domainLabel, jobStatusLabel, jobTone, kindColor, kindLabel } from "./labelsV3";

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
 * 검색어가 없을 때의 메인. 검색창만 덩그러니 두지 않고 최근 자료, 자동 분류, 주요 개념과 관계, 처리 현황을 보여 줘서
 * "무엇이 들어 있고 어디까지 처리됐는지"에서 탐색을 시작하게 한다.
 */
export function ExploreHome({ filters, counts, openDocument, openJobs, onConcept, onGraph, onDomain }: {
  filters: KbFilters; counts: KbCountsV3 | undefined;
  openDocument: (documentId: string, revisionId?: string) => void; openJobs: () => void;
  onConcept: (id: string, name: string) => void; onGraph: () => void; onDomain: (domain: string) => void;
}) {
  const docs = useQuery({ queryKey: ["kb-documents", "home", filters.domain], queryFn: () => kbDocumentsV3({ domain: filters.domain || undefined, limit: 30 }) });
  const graph = useQuery({ queryKey: ["kb-graph", "hubs", filters.domain], queryFn: () => kbGraph({ domain: filters.domain || undefined, limit: 12 }) });
  const loaded = docs.data?.items ?? [];
  const recent = loaded.filter((d) => matchDocument(d, filters)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);
  const domainCounts = new Map<string, number>();
  for (const d of loaded) if (d.domain) domainCounts.set(d.domain, (domainCounts.get(d.domain) ?? 0) + 1);
  const hubs = graph.data?.nodes ?? [];
  const byId = new Map(hubs.map((n) => [n.id, n]));
  const kinds = new Map<string, KbGraphNode[]>();
  for (const n of hubs) kinds.set(n.entity_kind, [...(kinds.get(n.entity_kind) ?? []), n]);
  const relations = (graph.data?.edges ?? []).filter((e) => byId.has(e.source) && byId.has(e.target)).slice(0, 8);
  const running = counts?.pipeline_running;
  const failed = counts?.pipeline_failed;

  return <div className="kb3-home">
    <section className="kb3-panel kb3-panel--status" aria-label="처리 현황">
      <h2 className="kb3-panel__title">처리 현황</h2>
      {running === undefined && failed === undefined
        ? <p className="kb-note">이 서버는 처리 현황 숫자를 아직 주지 않아요. 자세한 작업은 처리 현황에서 볼 수 있어요.</p>
        : <p className="kb3-status-line">
          <Badge tone={running ? "info" : undefined}>{`진행 중 ${running ?? 0}건`}</Badge>
          <Badge tone={failed ? "danger" : undefined}>{`실패 ${failed ?? 0}건`}</Badge>
        </p>}
      <Button size="sm" onClick={openJobs}>처리 현황 열기</Button>
    </section>

    <Panel title="최근 자료" state={docs} note={docs.data && docs.data.total > loaded.length ? `서버가 정렬을 지원하지 않아, 불러온 ${loaded.length}건 중 최근순이에요.` : undefined}>
      {recent.length === 0
        ? <div className="kb-empty"><p>{loaded.length > 0 && hasClientFilter(filters) ? "필터에 맞는 최근 자료가 없어요." : "아직 자료가 없어요."}</p><p className="kb-note">위의 자료 추가로 파일·주소·글을 넣어 보세요.</p></div>
        : <ul className="kb3-recent" aria-label="최근 자료">{recent.map((d) => <li key={d.id}>
          <button type="button" className="kb-row" onClick={() => openDocument(d.id, d.current_revision?.id)}>
            <span className="kb-row__main"><span className="kb-row__title">{d.title}</span><span aria-hidden="true" className="kb-row__arrow">›</span></span>
            <span className="kb-badges">
              {d.pipeline_status && <Badge tone={jobTone(d.pipeline_status)}>{jobStatusLabel(d.pipeline_status)}</Badge>}
              {d.domain && <Badge>{domainLabel(d.domain)}</Badge>}
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

    <Panel title="주제별 분류" state={docs} note={domainCounts.size > 0 ? `불러온 ${loaded.length}건 기준이에요.` : undefined}>
      {domainCounts.size === 0
        ? <p className="kb-note">서버가 문서별 주제를 아직 주지 않았거나 분류된 문서가 없어요.</p>
        : <ul className="kb3-chiplist" aria-label="주제별 문서 수">{[...domainCounts].sort((a, b) => b[1] - a[1]).map(([d, n]) => <li key={d}>
          <button type="button" className="kb-chip" aria-pressed={filters.domain === d} onClick={() => onDomain(filters.domain === d ? "" : d)}>{domainLabel(d)} {n}</button>
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
          <Button size="sm" onClick={onGraph}>개념 그래프에서 펼쳐 보기</Button>
        </>}
    </Panel>
  </div>;
}
