import { useQuery } from "@tanstack/react-query";
import { collectionMissionTrace, type MissionTrace as Trace } from "../../api/collectionMissions";
import { failure } from "../kb/labels";

const STATE: Record<string, string> = {
  met: "충족", partial: "일부 확보", active: "출처 확보", pending: "대기", empty: "검색 결과 없음", blocked: "막힘", unmet: "미충족",
};
const ONTOLOGY_STAGE: Record<string, string> = {
  parsing: "파싱", chunking: "청킹", extracting: "개념·주장 추출", linking: "엔터티 연결", indexing: "색인", canonicalizing: "정본 통합",
};
const ITEM_STATUS: Record<string, string> = { held: "보류", failed: "실패", blocked: "접근 제한" };
const count = (value: number) => value.toLocaleString("ko-KR");
const time = (iso: string | null) => iso ? new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(iso)) : "";

function Goal({ trace }: { trace: Trace }) {
  const lines = trace.goal.trim().split("\n");
  const long = trace.goal.length > 400 || lines.length > 6;
  return <section className="trace-card" aria-label="요청한 내용">
    <h3>요청한 내용</h3>
    {long
      ? <details><summary>{lines.slice(0, 3).join(" ").replace(/[#*]/g, "").slice(0, 160)}… <span className="kb-note">전체 {count(trace.goal.length)}자 보기</span></summary><pre className="trace-goal">{trace.goal}</pre></details>
      : <pre className="trace-goal">{trace.goal}</pre>}
  </section>;
}

function Stages({ trace }: { trace: Trace }) {
  return <ol className="trace-stages" aria-label="처리 단계">
    {trace.stages.map(stage => <li key={stage.key} data-stage={stage.key}><span>{stage.label}</span><strong>{count(stage.count)}</strong><small>{stage.detail}</small></li>)}
  </ol>;
}

function Failures({ trace }: { trace: Trace }) {
  const failed = trace.events.filter(event => event.failed);
  if (trace.jobs.failed === 0) return null;
  return <section className="trace-card trace-card--alert" role="alert" aria-label="실패한 작업">
    <h3>실패한 작업 {trace.jobs.failed}건</h3>
    <ul>{failed.slice(0, 6).map((event, index) => <li key={index}><span>{event.message}</span>{event.where && <small>{event.where}</small>}</li>)}</ul>
  </section>;
}

function Requirements({ trace }: { trace: Trace }) {
  const targets = trace.requirements.filter(r => r.group === "target");
  const topics = trace.requirements.filter(r => r.group === "topic");
  const kinds = [...new Set(targets.map(r => r.kind || "기타"))];
  const met = trace.requirements.filter(r => r.status === "met").length;
  return <section className="trace-card" aria-label="요구한 대상과 분야">
    <h3>요구한 것을 얼마나 채웠나 <small>{met}/{trace.requirements.length}</small></h3>
    {kinds.map(kind => <div key={kind} className="trace-group"><h4>{kind}</h4>
      <ul className="trace-chips">{targets.filter(r => (r.kind || "기타") === kind).map(r => <li key={r.key} data-status={r.status} title={`${STATE[r.status] ?? r.status} · 자료 ${r.documents}건 · 출처 ${r.sources}곳`}>{r.label}<span>{r.documents}</span></li>)}</ul></div>)}
    {topics.length > 0 && <div className="trace-group"><h4>분야</h4>
      <ul className="trace-chips">{topics.map(r => <li key={r.key} data-status={r.status} title={`${STATE[r.status] ?? r.status} · 자료 ${r.documents}건`}>{r.label}<span>{r.documents}</span></li>)}</ul></div>}
  </section>;
}

function Rules({ trace }: { trace: Trace }) {
  return <section className="trace-card" aria-label="지시한 절차 준수">
    <h3>지시한 절차를 지키고 있나</h3>
    <ul className="trace-rules">{trace.rules.map(rule => <li key={rule.key} data-status={rule.status}><strong>{STATE[rule.status] ?? rule.status}</strong><span>{rule.label}</span><small>{rule.detail}</small></li>)}</ul>
    <div className="trace-onto" aria-label="온톨로지 처리 단계"><h4>지식 도서관 처리 단계 ({count(trace.ontology.documents)}건 대상)</h4>
      <ul>{trace.ontology.stages.map(s => <li key={s.stage}><span>{ONTOLOGY_STAGE[s.stage] ?? s.stage}</span><small>{Object.keys(s.states).length ? Object.entries(s.states).map(([k, v]) => `${k} ${v}`).join(" · ") : "아직 없음"}</small></li>)}</ul></div>
  </section>;
}

function Timeline({ trace }: { trace: Trace }) {
  return <details className="trace-card" aria-label="진행 기록"><summary>진행 기록 {count(trace.events.length)}건</summary>
    <ul className="trace-events">{trace.events.map((event, index) => <li key={index} data-stage={event.stage} data-failed={event.failed ? "true" : undefined}>
      <time>{time(event.at)}</time><span>{event.message}</span>{event.subject && <small>{event.subject}</small>}</li>)}</ul>
  </details>;
}

function Discarded({ trace }: { trace: Trace }) {
  if (trace.discarded.length === 0) return null;
  return <details className="trace-card" aria-label="버려지거나 보류된 자료"><summary>버려지거나 보류된 자료 {count(trace.discarded.length)}건</summary>
    <ul className="trace-events">{trace.discarded.map(item => <li key={item.item_id}>
      <strong>{ITEM_STATUS[item.status] ?? item.status}</strong>
      <span>{item.title || item.url}</span>
      <small>{item.reasons.join(", ") || (item.http_status ? `HTTP ${item.http_status}` : "사유 없음")} · {item.grade}</small>
      <a className="kb-note" href={item.url} target="_blank" rel="noreferrer">{item.url}</a></li>)}</ul>
  </details>;
}

export function MissionTrace({ missionId }: { missionId: string }) {
  const query = useQuery({ queryKey: ["collection-mission-trace", missionId], queryFn: () => collectionMissionTrace(missionId), refetchInterval: 5000 });
  if (query.isPending) return <p role="status">진행 상황을 불러오는 중</p>;
  if (query.isError) return <p role="alert" className="tk-error">{failure(query.error)}</p>;
  const trace = query.data;
  return <div className="mission-trace">
    <Goal trace={trace} />
    <Stages trace={trace} />
    <Failures trace={trace} />
    <Requirements trace={trace} />
    <Rules trace={trace} />
    <Timeline trace={trace} />
    <Discarded trace={trace} />
  </div>;
}
