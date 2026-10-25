import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { collectionMission, collectionMissions, createCollectionMission, previewCollectionPlan } from "../../api/collectionMissions";
import type { CollectionMission, CollectionPlan } from "../../api/collectionMissions";
import { Button } from "../../ui/Button";
import { COLLECT_REASON, failure } from "../kb/labels";

const STATUS: Record<string, string> = { queued: "준비 중", running: "수집 중", discovery_pending: "출처 탐색 대기", waiting_sources: "출처 확인 필요", succeeded: "수집 종료", partial: "일부 수집", cancelled: "중지됨", failed: "복구 필요" };
const COUNTS = [["discovered", "발견한 출처"], ["acquired", "확보한 자료"], ["accepted", "품질 통과"], ["imported", "도서관 적재"], ["held", "보류"], ["duplicate", "중복"], ["failed", "실패"], ["blocked", "접근 제한"]];

function Plan({ plan }: { plan: CollectionPlan }) {
  return <section className="mission-plan" aria-label="수집 계획">
    <h3>이렇게 수집합니다</h3>
    <ol>{plan.steps.map(step => <li key={step}>{step}</li>)}</ol>
    <p className="kb-note">최대 {plan.budget.pages.toLocaleString("ko-KR")}쪽 · 검색 {plan.budget.searches}회 · {Math.round(plan.budget.seconds / 60)}분 예산</p>
    <p className="kb-note">종료 기준: {plan.stop_conditions.join(" · ")}</p>
    {plan.coverage.length > 0 && <ul className="mission-topics" aria-label="조사 범위">{plan.coverage.map(area => <li key={area.topic}>{area.topic}<span>{area.state === "unexplored" ? "미조사" : area.state}</span></li>)}</ul>}
  </section>;
}

function Result({ mission }: { mission: CollectionMission }) {
  return <article className="mission-detail" aria-label="선택한 수집 임무">
    <div className="mission-heading"><h2>{mission.title}</h2><span role="status">{STATUS[mission.status] ?? mission.status}</span></div>
    <ul className="collect-funnel" aria-label="실제 수집 성과">{COUNTS.map(([key, label]) => <li key={key} data-key={key}><strong>{(mission.counts[key] ?? 0).toLocaleString("ko-KR")}</strong><span>{label}</span></li>)}</ul>
    {mission.gaps.length > 0 && <section className="mission-gaps" aria-label="남은 범위"><h3>아직 확보하지 못한 자료</h3><ul>{mission.gaps.map((gap, index) => <li key={`${gap.reason}-${index}`}><p>{gap.message}</p>{gap.url && <a href={gap.url} target="_blank" rel="noreferrer">{gap.url}</a>}</li>)}</ul></section>}
    <details><summary>계획과 조사 범위</summary><Plan plan={mission.plan} /></details>
    <section className="mission-results" aria-label="수집 결과"><h3>확보한 지식과 출처</h3>
      {mission.results.length === 0 ? <p className="kb-note">자료를 확보하면 출처와 판정 이유가 여기에 표시됩니다.</p> : mission.results.map(item => <article className="collect-card" key={item.id}>
        <h4>{item.title}</h4><a className="kb-note" href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
        <p className="kb-note">{item.delivery === "imported" ? "도서관에 적재됨" : item.delivery === "exported" ? "원문 보관 · 도서관 미적재" : item.status === "held" ? "보류됨" : "처리 중"} · {item.reasons.map(reason => reason === "l0_pass" ? "기본 품질 검사 통과" : COLLECT_REASON[reason] ?? "세부 확인 필요").join(" · ")}</p>
        {item.document_id && <Link to={`/knowledge-library?view=docs&doc=${encodeURIComponent(item.document_id)}${item.revision_id ? `&rev=${encodeURIComponent(item.revision_id)}` : ""}`}>도서관에서 보기</Link>}
      </article>)}
    </section>
    {mission.knowledge_processing.semantic !== "verified" && <p className="kb-note">원문 적재와 의미·관계 처리는 별도로 진행됩니다.</p>}
  </article>;
}

export function Missions() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("mission");
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [maxPages, setMaxPages] = useState(200);
  const [fileError, setFileError] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["collection-missions"], queryFn: collectionMissions, refetchInterval: 10000 });
  const detail = useQuery({ queryKey: ["collection-mission", selected], queryFn: () => collectionMission(selected!), enabled: !!selected, refetchInterval: 5000 });
  const input = () => ({ goal: goal.trim(), context, max_pages: maxPages });
  const select = (id: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set("mission", id); return next; });
  const create = useMutation({ mutationFn: () => {
    requestKey.current ??= crypto.randomUUID();
    return createCollectionMission({ ...input(), request_key: requestKey.current });
  }, onSuccess: async mission => {
    queryClient.setQueryData(["collection-mission", mission.id], mission);
    select(mission.id);
    requestKey.current = null;
    await queryClient.invalidateQueries({ queryKey: ["collection-missions"] });
  } });
  const preview = useMutation({ mutationFn: () => previewCollectionPlan(input()) });
  function changed() { requestKey.current = null; preview.reset(); create.reset(); }
  return <div className="missions">
    <form className="mission-composer" onSubmit={event => { event.preventDefault(); if (goal.trim()) create.mutate(); }}>
      <label htmlFor="collection-goal">무엇을 수집하고 싶으세요?</label>
      <p className="kb-note" id="collection-help">목적을 적거나 주소를 붙여 넣으세요. 조사 내용과 참고 자료도 한 임무로 함께 다룹니다.</p>
      <textarea id="collection-goal" className="tk-textarea" rows={4} maxLength={20000} required value={goal} aria-describedby="collection-help" placeholder="하네스 엔지니어링의 이론, 논문과 오픈소스 사례를 폭넓게 수집해줘." onChange={event => { setGoal(event.target.value); changed(); }} />
      <details className="mission-references"><summary>참고 자료 추가</summary>
        <label htmlFor="collection-context">조사 내용과 참고 주소</label>
        <textarea id="collection-context" className="tk-textarea" rows={6} maxLength={500000} value={context} placeholder="미리 조사한 내용, 여러 URL, GitHub 저장소와 논문 주소를 함께 넣으세요." onChange={event => { setContext(event.target.value); changed(); }} />
        <label className="mission-file">텍스트 파일 추가<input type="file" accept=".txt,.md,.json,.csv,text/plain,text/markdown" onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 1024 * 1024) { setFileError("텍스트 파일은 1MB까지 추가할 수 있습니다."); return; }
          try {
            const text = await file.text();
            setContext(previous => `${previous}\n\n[첨부: ${file.name}]\n${text}`.trim());
            setFileError(null); changed();
          } catch { setFileError("파일을 읽지 못했습니다. 내용을 직접 붙여 넣어 주세요."); }
        }} /></label>
        {fileError && <p role="alert" className="tk-error">{fileError}</p>}
      </details>
      <details><summary>수집 범위 조정</summary><label className="mission-budget">최대 수집 쪽수<input className="tk-input" type="number" min={1} max={100000} value={maxPages} onChange={event => { setMaxPages(Number(event.target.value)); changed(); }} /></label><p className="kb-note">접근 정책과 실제 가용 예산 안에서 나누어 수집합니다.</p></details>
      <div className="mission-submit"><Button type="button" disabled={!goal.trim() || create.isPending} busy={preview.isPending} onClick={() => preview.mutate()}>계획 미리 보기</Button><Button type="submit" variant="primary" disabled={!goal.trim()} busy={create.isPending}>수집 시작</Button></div>
      {preview.isError && <p role="alert" className="tk-error">{failure(preview.error)}</p>}
      {create.isError && <p role="alert" className="tk-error">{failure(create.error)}</p>}
      {preview.data && <Plan plan={preview.data} />}
    </form>
    <div className="mission-workspace">
      <section className="mission-history" aria-label="내 수집 임무"><h2>수집 임무</h2>
        {list.isPending && <p role="status">임무를 불러오는 중</p>}
        {list.isError && <div className="kb-error"><p role="alert">{failure(list.error)}</p><Button onClick={() => void list.refetch()}>다시 불러오기</Button></div>}
        {list.data?.items.length === 0 && <div className="kb-empty"><p>아직 수집 임무가 없습니다.</p><p>위에 수집 목적을 적어 첫 임무를 시작하세요.</p></div>}
        {list.data?.items.map(mission => <button className="mission-history__item" type="button" key={mission.id} aria-pressed={selected === mission.id} onClick={() => select(mission.id)}><strong>{mission.title}</strong><span>{STATUS[mission.status] ?? mission.status} · 도서관 {mission.counts.imported ?? 0}건</span></button>)}
      </section>
      {selected && <div className="mission-selected">{detail.isPending && <p role="status">임무 결과를 불러오는 중</p>}{detail.isError && <div className="kb-error"><p role="alert">{failure(detail.error)}</p><Button onClick={() => void detail.refetch()}>결과 다시 읽기</Button></div>}{detail.data && <Result mission={detail.data} />}</div>}
    </div>
  </div>;
}
