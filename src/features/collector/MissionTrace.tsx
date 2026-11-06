import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { collectionMissionTrace, type MissionTrace as Trace } from "../../api/collectionMissions";
import { Button } from "../../ui/Button";
import { CollectionErrorNotice } from "./CollectionErrorNotice";
import { requirementFulfillment } from "./missionProjects";

const STATE: Record<string, string> = {
  met: "충족", partial: "일부 확보", active: "출처 확보", pending: "대기", empty: "검색 결과 없음", blocked: "접근 제한", unmet: "미충족",
};
const REQUIREMENT_STATE: Record<string, string> = { ...STATE, met: "목표량 도달" };
const ONTOLOGY_STAGE: Record<string, string> = {
  parsing: "파싱", chunking: "청킹", extracting: "개념·주장 추출", linking: "엔터티 연결", indexing: "색인", canonicalizing: "정본 통합",
};
// 상태마다 "그래서 지금 어떤 상태인가"를 사람 말로 한 줄 덧붙인다. 칩 색만으로는 의미를 알 수 없다.
const STATE_HINT: Record<string, (documents: number, need: number) => string> = {
  met: (_documents, need) => need > 0 ? "계획에서 정한 목표량에 도달했습니다. 사실 검증이나 지식의 충분성을 뜻하지 않습니다" : "목표량 정보를 확인할 수 없습니다. 사실 검증이나 지식의 충분성을 뜻하지 않습니다",
  partial: (documents, need) => need > 0 ? `일부만 모았습니다 (${documents}/${need})` : `일부 자료를 모았습니다 (${documents}건, 목표량 미지정)`,
  active: () => "출처는 찾았지만 읽어 온 자료가 아직 적습니다",
  empty: () => "검색해도 쓸 만한 결과가 나오지 않았습니다",
  blocked: () => "접근이 막혀 가져오지 못했습니다",
  pending: () => "아직 시작 전입니다",
};
const PAGE = 50;
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

export interface SupplementControl {
  enabled: boolean;
  /** 지금 요청 중인 키. 빈 배열은 "부족한 것 전부"를 요청 중이라는 뜻이다. */
  pending: string[] | null;
  run: (keys: string[]) => void;
  error: unknown | null;
}

const isWeak = (r: Trace["requirements"][number]) => r.status !== "met";
const weakFirst = (a: Trace["requirements"][number], b: Trace["requirements"][number]) => Number(!isWeak(a)) - Number(!isWeak(b));

function SupplementAll({ trace, supplement }: { trace: Trace; supplement?: SupplementControl }) {
  const weak = trace.requirements.filter(isWeak);
  if (!supplement || weak.length === 0) return null;
  return <div className="trace-supplement">
    <Button type="button" variant="primary" disabled={!supplement.enabled || supplement.pending !== null} busy={supplement.pending?.length === 0} onClick={() => supplement.run([])}>부족한 {weak.length}개 보충 수집</Button>
    <p className="kb-note">{supplement.enabled ? "부족한 대상·분야만 새 검색어와 공식 출처로 다시 찾습니다. 이미 모은 자료는 그대로 두고, 바뀌지 않은 페이지는 다시 받지 않습니다." : "수집이 끝난 뒤에 보충할 수 있습니다."}</p>
    {supplement.error != null && <CollectionErrorNotice error={supplement.error} />}
  </div>;
}

function Stages({ trace }: { trace: Trace }) {
  return <ol className="trace-stages" aria-label="처리 단계">
    {trace.stages.map(stage => <li key={stage.key} data-stage={stage.key}><span>{stage.label}</span><strong>{count(stage.count)}</strong><small>{stage.detail}</small></li>)}
    <li className="trace-stages__note">단계별 건수는 단계마다 집계 단위와 누적 범위가 다를 수 있습니다. 서로 다른 모수이므로 전환율로 비교하지 않습니다.</li>
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

function FeaturedDocuments({ trace }: { trace: Trace }) {
  return <section className="trace-card" aria-label="대표 적재 자료">
    <h3>도서관에 실제 적재된 자료 <small>{count(trace.documents.length)}건</small></h3>
    {trace.documents.length > 0
      ? <ul className="trace-docs">{trace.documents.slice(0, 3).map(doc => <DocLink key={doc.document_id} doc={doc} />)}</ul>
      : <p className="kb-note">도서관 적재 확인 자료가 아직 없습니다.</p>}
    {trace.documents.length > 3 && <p className="kb-note">대표 자료 3건을 표시합니다. 전체 {count(trace.documents.length)}건은 자료·품질 탭에서 검색할 수 있습니다.</p>}
  </section>;
}

function Weak({ trace, supplement }: { trace: Trace; supplement?: SupplementControl }) {
  const weak = trace.requirements.filter(isWeak);
  if (weak.length === 0) return <section className="trace-card" aria-label="부족한 항목"><h3>부족한 항목</h3><p className="kb-note">모든 항목이 계획한 목표량에 도달한 것으로 표시됩니다. 사실 검증이나 지식의 충분성을 뜻하지 않습니다.</p></section>;
  return <section className="trace-card" aria-label="부족한 항목">
    <h3>부족한 항목 <small>{weak.length}개</small></h3>
    <ul className="trace-weak">{weak.slice(0, 8).map(r => <li key={r.key}><span><strong>{r.label}</strong><small>{STATE_HINT[r.status]?.(r.documents, r.need) ?? STATE[r.status]}</small></span>
      {supplement && <Button type="button" disabled={!supplement.enabled || supplement.pending !== null} busy={supplement.pending?.includes(r.key)} onClick={() => supplement.run([r.key])}>보충</Button>}</li>)}</ul>
    {weak.length > 8 && <p className="kb-note">나머지 {weak.length - 8}개는 "대상별" 탭에서 볼 수 있습니다.</p>}
    <SupplementAll trace={trace} supplement={supplement} />
  </section>;
}

function DocLink({ doc }: { doc: Trace["documents"][number] }) {
  return <li><span>{doc.title}</span><small>{doc.host} · {doc.grade}</small>
    <span className="trace-doc__links"><a className="kb-note" href={doc.url} target="_blank" rel="noreferrer">원문</a>
      <Link to={`/knowledge-library?view=docs&doc=${encodeURIComponent(doc.document_id)}`}>도서관에서 보기</Link></span></li>;
}

function Targets({ trace, supplement }: { trace: Trace; supplement?: SupplementControl }) {
  const targets = trace.requirements.filter(r => r.group === "target");
  const topics = trace.requirements.filter(r => r.group === "topic");
  const kinds = [...new Set(targets.map(r => r.kind || "기타"))];
  const met = trace.requirements.filter(r => r.status === "met").length;
  const percent = requirementFulfillment(trace.goal, trace.requirements);
  const canShowRatio = percent !== null;
  const row = (r: Trace["requirements"][number]) => {
    const docs = trace.documents.filter(d => d.target === r.key);
    const validNeed = canShowRatio && Number.isFinite(r.need) && r.need > 0;
    const fill = validNeed ? Math.min(100, Math.round((r.documents / r.need) * 100)) : 0;
    return <li key={r.key} className="trace-row" data-status={r.status}>
      <details>
        <summary><span className="trace-row__name">{r.label}</span><em data-status={r.status}>{REQUIREMENT_STATE[r.status] ?? "상태 확인 필요"}</em>
          {validNeed && <span className="trace-row__bar" aria-hidden="true"><i style={{ width: `${fill}%` }} /></span>}<span className="trace-row__n">{validNeed ? `${r.documents}/${r.need}` : `${count(r.documents)}건`}</span></summary>
        <p className="kb-note">{STATE_HINT[r.status]?.(r.documents, r.need) ?? ""} · 찾은 출처 {r.sources}곳</p>
        {r.group === "target"
          ? docs.length > 0 ? <ul className="trace-docs">{docs.slice(0, 30).map(d => <DocLink key={d.document_id} doc={d} />)}</ul> : <p className="kb-note">도서관에 저장된 자료가 아직 없습니다.</p>
          : <p className="kb-note">분야는 여러 대상의 자료에서 계산됩니다. 자료는 "자료" 탭에서 검색하세요.</p>}
        {docs.length > 30 && <p className="kb-note">{docs.length - 30}건 더 있습니다. "자료" 탭에서 대상으로 걸러 볼 수 있습니다.</p>}
      </details>
      {isWeak(r) && supplement && <Button type="button" disabled={!supplement.enabled || supplement.pending !== null} busy={supplement.pending?.includes(r.key)} onClick={() => supplement.run([r.key])}>보충</Button>}
    </li>;
  };
  return <section className="trace-card" aria-label="요구한 대상과 분야">
    <h3>요구한 것을 얼마나 채웠나 <small>{met}/{trace.requirements.length}개 항목이 목표량 충족</small></h3>
    {canShowRatio && <div className="trace-summary__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? 0} aria-label="목표량을 충족한 요구 항목 비율"><span style={{ width: `${percent ?? 0}%` }} /></div>}
    {!canShowRatio && <p className="kb-note">조사 목적 또는 목표량이 없어 규칙 충족 비율은 계산하지 않았습니다.</p>}
    <SupplementAll trace={trace} supplement={supplement} />
    {kinds.map(kind => <div key={kind} className="trace-group"><h4>{kind}</h4>
      <ul className="trace-rows">{targets.filter(r => (r.kind || "기타") === kind).sort(weakFirst).map(row)}</ul></div>)}
    {topics.length > 0 && <div className="trace-group"><h4>분야</h4><ul className="trace-rows">{[...topics].sort(weakFirst).map(row)}</ul></div>}
  </section>;
}

function Documents({ trace }: { trace: Trace }) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [grade, setGrade] = useState("");
  const [shown, setShown] = useState(PAGE);
  const labelOf = new Map(trace.requirements.map(r => [r.key, r.label]));
  const owners = [...new Set(trace.documents.map(d => d.target).filter((v): v is string => !!v))];
  const needle = text.trim().toLowerCase();
  const found = trace.documents.filter(d => (!target || (target === "-" ? !d.target : d.target === target)) && (!grade || d.grade === grade)
    && (!needle || d.title.toLowerCase().includes(needle) || d.url.toLowerCase().includes(needle)));
  const reset = () => setShown(PAGE);
  return <section className="trace-card" aria-label="도서관에 저장된 자료">
    <h3>도서관에 저장된 자료 <small>{count(trace.documents.length)}건</small></h3>
    <div className="trace-filters">
      <input className="tk-input" type="search" aria-label="자료 검색" placeholder="제목이나 주소로 검색" value={text} onChange={e => { setText(e.target.value); reset(); }} />
      <select className="tk-input" aria-label="대상" value={target} onChange={e => { setTarget(e.target.value); reset(); }}>
        <option value="">모든 대상</option>{owners.map(key => <option key={key} value={key}>{labelOf.get(key) ?? key}</option>)}<option value="-">그 밖의 출처</option></select>
      <select className="tk-input" aria-label="출처 등급" value={grade} onChange={e => { setGrade(e.target.value); reset(); }}>
        <option value="">모든 등급</option>{Object.keys(trace.grades).map(label => <option key={label} value={label}>{label} ({trace.grades[label]})</option>)}</select>
    </div>
    {found.length === 0 ? <p className="kb-note">조건에 맞는 자료가 없습니다.</p>
      : <ul className="trace-docs">{found.slice(0, shown).map(d => <DocLink key={d.document_id} doc={d} />)}</ul>}
    {found.length > shown && <Button type="button" onClick={() => setShown(shown + PAGE)}>더 보기 ({count(found.length - shown)}건 남음)</Button>}
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

const LOG_FILTER: [string, string][] = [["all", "전체"], ["failed", "실패"], ["discover", "검색"], ["acquire", "획득"], ["judge", "판별"]];

function Timeline({ trace }: { trace: Trace }) {
  const [filter, setFilter] = useState("all");
  const events = trace.events.filter(event => filter === "all" || (filter === "failed" ? event.failed : event.stage === filter));
  return <section className="trace-card" aria-label="진행 기록"><h3>진행 기록 <small>{count(events.length)}건</small></h3>
    <div className="trace-filter-chips" role="group" aria-label="기록 거르기">{LOG_FILTER.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
    {events.length === 0 ? <p className="kb-note">해당하는 기록이 없습니다.</p> : <ul className="trace-events">{events.map((event, index) => <li key={index} data-stage={event.stage} data-failed={event.failed ? "true" : undefined}>
      <time>{time(event.at)}</time><span>{event.message}</span>{event.subject && <small>{event.subject}</small>}</li>)}</ul>}
  </section>;
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

function Summary({ trace }: { trace: Trace }) {
  const total = trace.requirements.length;
  const met = trace.requirements.filter(r => r.status === "met").length;
  const loaded = trace.documents.length;
  const acquired = trace.stages.find(stage => stage.key === "acquire")?.count ?? 0;
  const percent = requirementFulfillment(trace.goal, trace.requirements);
  const canShowRatio = percent !== null;
  return <section className="trace-summary" aria-label="진행 요약">
    {canShowRatio && <div className="trace-summary__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? 0} aria-label="목표량을 충족한 요구 항목 비율"><span style={{ width: `${percent ?? 0}%` }} /></div>}
    <p><strong>{met}/{total}</strong>개 요구 항목 상태가 목표량 도달{!canShowRatio && " (조사 목적·목표량 조건이 없어 비율 미계산)"} · 확보 단계 집계 <strong>{count(acquired)}</strong> · 도서관 적재 확인 자료 <strong>{count(loaded)}</strong>{trace.jobs.failed > 0 && <> · 실패 작업 <strong>{trace.jobs.failed}</strong></>}{trace.jobs.queued + trace.jobs.running > 0 && <> · 대기·진행 작업 {trace.jobs.queued + trace.jobs.running}</>}</p>
    <p className="kb-note">확보 단계의 집계 단위는 위 단계 설명을 따릅니다. 적재 수는 도서관 문서 목록의 미션 누계입니다. 서로 다른 모수로 전환율을 계산하지 않습니다.</p>
  </section>;
}

export type TracePart = "overview" | "targets" | "docs" | "log" | "prompt";

export function MissionTrace({ missionId, part, supplement }: { missionId: string; part: TracePart; supplement?: SupplementControl }) {
  const query = useQuery({ queryKey: ["collection-mission-trace", missionId], queryFn: () => collectionMissionTrace(missionId), refetchInterval: 5000 });
  if (query.isPending) return <p role="status">진행 상황을 불러오는 중</p>;
  if (query.isError) return <CollectionErrorNotice error={query.error} />;
  const trace = query.data;
  return <div className="mission-trace">
    {part === "overview" && <><Goal trace={trace} /><Summary trace={trace} /><Weak trace={trace} supplement={supplement} /><FeaturedDocuments trace={trace} /><Failures trace={trace} /><Stages trace={trace} /><Rules trace={trace} /></>}
    {part === "targets" && <Targets trace={trace} supplement={supplement} />}
    {part === "log" && <Timeline trace={trace} />}
    {part === "docs" && <><Documents trace={trace} /><Discarded trace={trace} /></>}
    {part === "prompt" && <Goal trace={trace} />}
  </div>;
}
