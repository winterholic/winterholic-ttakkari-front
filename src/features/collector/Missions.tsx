import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  cancelCollectionMission,
  collectionMission,
  collectionMissions,
  createCollectionMission,
  extendCollectionMission,
  pauseCollectionMission,
  previewCollectionPlan,
  rerunCollectionMission,
  resumeCollectionMission,
  scheduleCollectionMission,
  unholdCollectionMissionItem,
} from "../../api/collectionMissions";
import type { CollectionMission, CollectionPlan } from "../../api/collectionMissions";
import { Button } from "../../ui/Button";
import { COLLECT_REASON, failure } from "../kb/labels";

const STATUS: Record<string, string> = {
  queued: "준비 중",
  running: "수집 중",
  paused: "일시 중지됨",
  discovery_pending: "출처 탐색 대기",
  waiting_sources: "출처 확인 필요",
  succeeded: "수집 종료",
  partial: "일부 수집",
  cancelled: "중지됨",
  failed: "복구 필요",
};
const COUNTS = [["discovered", "발견한 출처"], ["acquired", "확보한 자료"], ["accepted", "품질 통과"], ["imported", "도서관 적재"], ["held", "보류"], ["duplicate", "중복"], ["failed", "실패"], ["blocked", "접근 제한"]];
const TRIAGE_STATUS: Record<string, string> = { auto_accepted: "자동 수락", review_needed: "추가 확인 필요", auto_held: "자동 보류" };
const AXIS_LABEL: Record<string, string> = {
  relevance_lexical: "임무 관련성 (규칙)", topic_relevance_semantic: "임무 관련성 (의미 모델)",
  information_value: "정보 가치", explanation_quality: "설명 깊이", content_rules: "정보 구성·설명 신호 (규칙)",
  low_quality_likelihood: "저품질 징후", novelty: "새로움·중복 신호 (규칙)",
};
const AXIS_STATE: Record<string, string> = {
  measured: "측정됨", evaluated: "평가됨", unmeasured: "미측정", unavailable: "사용할 수 없음",
  disabled: "사용 중지", not_applicable: "대상 아님", not_run: "실행 전", pending: "대기 중",
  not_needed: "평가 불필요", failed: "실패", skipped: "건너뜀", budget_denied: "예산으로 보류",
  budgetdenied: "예산으로 보류", budget_skipped: "예산으로 건너뜀",
};
const VALIDATION_STATE: Record<string, string> = { validated: "평가 성능 검증됨", unvalidated: "평가 성능 미검증", partial: "일부 축만 평가 성능 검증됨", unavailable: "검증 이력 없음" };
const TRIAGE_REASON: Record<string, string> = {
  "triage:accepted": "기본 판정 기준을 통과함", "triage:high_relevance": "임무와 관련성이 높음",
  "triage:low_quality": "저품질 가능성 신호가 있음", "triage:irrelevant_to_goal": "임무와 관련성이 낮음",
  review_needed: "추가 확인이 필요함", exact_duplicate: "같은 본문이 이미 있음",
};

function axisValue(value: number | null | undefined, scale?: string): string {
  if (value == null || !Number.isFinite(value)) return "수치 없음";
  const n = value.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
  if (scale === "similarity") return `유사도 ${n}`;
  if (scale === "ordinal") return `순서형 점수 ${n} / 4`;
  if (scale === "raw_logit") return `원점수 ${n} · 확률값 아님`;
  if (scale === "rule") return `규칙 신호 ${n}`;
  return scale ? `${n} · ${scale}` : n;
}

function deliveryLabel(item: CollectionMission["results"][number]): string {
  if (item.delivery === "imported") return "도서관에 적재됨";
  if (item.delivery === "exported") return "원문 보관 · 도서관 미적재";
  if (item.delivery === "pending") return "도서관 적재 대기";
  if (item.status === "held") return "보류됨 · 복구할 수 있습니다.";
  if (item.status === "accepted") return "수락됨 · 도서관 적재 확인 전";
  return "처리 중";
}

function unholdFailure(error: unknown): string {
  if (error instanceof Error && "status" in error) {
    const status = Number((error as Error & { status?: number }).status);
    if (status === 401) return "로그인이 만료되어 복구하지 못했습니다. 다시 로그인해 주세요.";
    if (status === 403) return failure(error);
    if (status === 404) return "문서를 찾을 수 없거나 현재 임무에서 접근할 수 없습니다.";
    if (status === 422) {
      const code = (error as Error).message;
      if (code === "item_not_importable") return "원문 보관 정보가 부족해 도서관에 적재할 수 없습니다.";
      return failure(error);
    }
    return "보류 복구 요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  }
  return failure(error);
}

function engineLabel(engine: string): string {
  if (engine === "ready") return "준비됨";
  if (engine === "busy") return "로컬 모델 사용 중 · 대기";
  if (engine === "unavailable" || engine === "enabled_without_registered_engine") return "사용할 수 없음";
  if (engine === "enabled") return "사용 가능";
  return "확인 필요";
}

function preciseQueue(mission: CollectionMission): { waiting: number; unresolved: number } {
  const precise = mission.triage?.precise_eval;
  const waiting = mission.counts.precise_waiting ?? (precise?.pending ?? 0) + (precise?.processing ?? 0);
  const unresolved = mission.counts.precise_unresolved ?? precise?.unresolved ?? 0;
  return { waiting, unresolved };
}

function preciseSummary(mission: CollectionMission): string {
  const { waiting, unresolved } = preciseQueue(mission);
  const parts = [`대기 ${waiting.toLocaleString("ko-KR")}건`];
  if (unresolved > 0) parts.push(`결과 확인 불가 ${unresolved.toLocaleString("ko-KR")}건`);
  return parts.join(" · ");
}

function PreciseNotice({ mission }: { mission: CollectionMission }) {
  const { waiting, unresolved } = preciseQueue(mission);
  return <>
    {waiting > 0 && <p className="kb-note" role="status" aria-label="정밀평가 대기">정밀평가 대기 {waiting.toLocaleString("ko-KR")}건 · 결과에 따라 도서관 적재가 늘 수 있음</p>}
    {unresolved > 0 && <p className="kb-note" role="status" aria-label="정밀평가 확인 불가">정밀평가 결과 확인 불가 {unresolved.toLocaleString("ko-KR")}건 · 운영자 확인 필요</p>}
  </>;
}

function QualityDetails({ triage, missionTriage }: { triage: NonNullable<CollectionMission["results"][number]["triage"]>; missionTriage: CollectionMission["triage"] }) {
  const axes = Object.entries(triage.axes ?? {});
  const stage2Status = triage.stage2?.status;
  const preciseState = triage.precise_eval?.state;
  const engine = missionTriage?.precise_eval?.engine;
  return <details className="mission-quality">
    <summary>품질 축과 평가 상태</summary>
    {axes.length > 0 ? <dl className="mission-quality__axes">{axes.map(([name, axis]) => <div key={name}>
      <dt>{AXIS_LABEL[name] ?? "기타 품질 신호"}</dt>
      <dd><span>{axis.status && <>{AXIS_STATE[axis.status] ?? "상태 확인 필요"} · </>}{axisValue(axis.value, axis.scale)}
        {axis.validation && <> · {VALIDATION_STATE[axis.validation] ?? "검증 이력 확인 필요"}</>}</span>
        {axis.evidence?.length ? <ul>{axis.evidence.map((evidence, index) => <li key={`${index}-${evidence}`}>{evidence}</li>)}</ul> : null}
      </dd>
    </div>)}</dl> : <p className="kb-note">세부 품질 축을 제공하지 않은 결과입니다.</p>}
    <p className="kb-note">축의 검증 표시는 평가 성능 이력입니다. 문서의 사실 여부를 검증했다는 뜻은 아닙니다.</p>
    {stage2Status && <p className="kb-note">의미 모델 평가: {AXIS_STATE[stage2Status] ?? "상태 확인 필요"}</p>}
    {preciseState && <p className="kb-note">정밀 평가: {AXIS_STATE[preciseState] ?? "상태 확인 필요"}</p>}
    {engine && <p className="kb-note">정밀 평가 엔진: {engineLabel(engine)}</p>}
  </details>;
}

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
  const queryClient = useQueryClient();
  const [extendOpen, setExtendOpen] = useState(false);
  const [addPages, setAddPages] = useState(50);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleMinutes, setScheduleMinutes] = useState<number | null>(
    mission.plan.schedule?.interval_minutes ?? null
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["collection-mission", mission.id] });
    await queryClient.invalidateQueries({ queryKey: ["collection-missions"] });
  };

  const pauseMut = useMutation({
    mutationFn: () => pauseCollectionMission(mission.id),
    onSuccess: invalidate,
  });
  const resumeMut = useMutation({
    mutationFn: () => resumeCollectionMission(mission.id),
    onSuccess: invalidate,
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelCollectionMission(mission.id),
    onSuccess: invalidate,
  });
  const extendMut = useMutation({
    mutationFn: () => extendCollectionMission(mission.id, addPages),
    onSuccess: async () => {
      setExtendOpen(false);
      await invalidate();
    },
  });
  const rerunMut = useMutation({
    mutationFn: () => rerunCollectionMission(mission.id),
    onSuccess: invalidate,
  });
  const scheduleMut = useMutation({
    mutationFn: () => scheduleCollectionMission(mission.id, scheduleMinutes),
    onSuccess: async () => {
      setScheduleOpen(false);
      await invalidate();
    },
  });
  const unholdMut = useMutation({
    mutationFn: (itemId: string) => unholdCollectionMissionItem(mission.id, itemId),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const isPending =
    pauseMut.isPending ||
    resumeMut.isPending ||
    cancelMut.isPending ||
    extendMut.isPending ||
    rerunMut.isPending ||
    scheduleMut.isPending;

  const currentSchedule = mission.plan.schedule?.interval_minutes;
  const scheduleInvalid =
    scheduleMinutes !== null &&
    (!Number.isInteger(scheduleMinutes) || scheduleMinutes < 15 || scheduleMinutes > 43_200);
  const scheduleText = currentSchedule
    ? currentSchedule >= 1440
      ? `${Math.round(currentSchedule / 1440)}일마다`
      : currentSchedule >= 60
      ? `${Math.round(currentSchedule / 60)}시간마다`
      : `${currentSchedule}분마다`
    : "수동";

  return <article className="mission-detail" aria-label="선택한 수집 임무">
    <div className="mission-heading">
      <h2>{mission.title}</h2>
      <span role="status" className="mission-status-badge">{STATUS[mission.status] ?? mission.status}</span>
    </div>
    <p className="kb-note" aria-label="회차 정보">
      마지막 갱신 회차: {mission.run_seq ?? 1}회차
      {mission.runs && mission.runs.length > 0 && mission.runs[0].run_seq === (mission.run_seq ?? 1) && (
        <> (수집 {mission.runs[0].collected ?? 0}건 · 적재 {mission.runs[0].imported ?? 0}건)</>
      )}
    </p>

    <div className="mission-controls" aria-label="임무 제어">
      {mission.status === "running" && (
        <Button
          type="button"
          disabled={isPending}
          busy={pauseMut.isPending}
          onClick={() => pauseMut.mutate()}
        >
          일시정지
        </Button>
      )}
      {mission.status === "paused" && (
        <Button
          type="button"
          variant="primary"
          disabled={isPending}
          busy={resumeMut.isPending}
          onClick={() => resumeMut.mutate()}
        >
          수집 재개
        </Button>
      )}
      {(mission.status === "running" || mission.status === "paused" || mission.status === "queued") && (
        <Button
          type="button"
          disabled={isPending}
          busy={cancelMut.isPending}
          onClick={() => cancelMut.mutate()}
        >
          수집 취소
        </Button>
      )}
      {(mission.status === "succeeded" || mission.status === "partial") && (
        <>
          <Button
            type="button"
            variant="primary"
            disabled={isPending}
            onClick={() => setExtendOpen(prev => !prev)}
          >
            더 수집하기
          </Button>
          <Button
            type="button"
            disabled={isPending}
            busy={rerunMut.isPending}
            onClick={() => rerunMut.mutate()}
          >
            다시 실행
          </Button>
        </>
      )}
      {(mission.status === "cancelled" || mission.status === "failed") && (
        <Button
          type="button"
          variant="primary"
          disabled={isPending}
          busy={rerunMut.isPending}
          onClick={() => rerunMut.mutate()}
        >
          다시 실행
        </Button>
      )}
      <Button
        type="button"
        disabled={isPending}
        onClick={() => setScheduleOpen(prev => !prev)}
      >
        주기 설정 ({scheduleText})
      </Button>
    </div>

    {extendOpen && (
      <form
        className="mission-extend-form"
        onSubmit={e => {
          e.preventDefault();
          if (addPages > 0) extendMut.mutate();
        }}
      >
        <label htmlFor="mission-add-pages">추가 수집할 쪽수:</label>
        <input
          id="mission-add-pages"
          className="tk-input"
          type="number"
          min={1}
          max={100000}
          value={addPages}
          onChange={e => setAddPages(Number(e.target.value))}
        />
        <Button type="submit" variant="primary" busy={extendMut.isPending}>
          추가 수집 시작
        </Button>
        <Button type="button" onClick={() => setExtendOpen(false)}>
          닫기
        </Button>
        <p className="kb-note" style={{ width: "100%" }}>
          이전에 보존된 탐색 목록(frontier)에서 이어서 수집을 진행합니다.
        </p>
      </form>
    )}

    {scheduleOpen && (
      <div className="mission-schedule-panel" aria-label="수집 주기 설정">
        <h4>수집 주기 갱신</h4>
        <div className="mission-schedule-options">
          {[
            { label: "수동만", value: null },
            { label: "1시간마다", value: 60 },
            { label: "6시간마다", value: 360 },
            { label: "1일마다", value: 1440 },
            { label: "1주일마다", value: 10080 },
          ].map(opt => (
            <label key={String(opt.value)}>
              <input
                type="radio"
                name="schedule-opt"
                checked={scheduleMinutes === opt.value}
                onChange={() => setScheduleMinutes(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="custom-interval" className="kb-note">
            직접 입력 (분):
          </label>
          <input
            id="custom-interval"
            className="tk-input"
            type="number"
            min={15}
            max={43200}
            value={scheduleMinutes ?? ""}
            placeholder="직접 입력"
            style={{ width: "12ch" }}
            onChange={e => setScheduleMinutes(e.target.value ? Number(e.target.value) : null)}
          />
          <Button
            type="button"
            variant="primary"
            disabled={scheduleInvalid}
            busy={scheduleMut.isPending}
            onClick={() => scheduleMut.mutate()}
          >
            주기 저장
          </Button>
          <Button type="button" onClick={() => setScheduleOpen(false)}>
            닫기
          </Button>
        </div>
      </div>
    )}

    {(pauseMut.isError ||
      resumeMut.error ||
      cancelMut.error ||
      extendMut.error ||
      rerunMut.error ||
      scheduleMut.error) && (
      <p role="alert" className="tk-error mission-control-error">
        {failure(
          pauseMut.error ||
            resumeMut.error ||
            cancelMut.error ||
            extendMut.error ||
            rerunMut.error ||
            scheduleMut.error
        )}
      </p>
    )}

    <PreciseNotice mission={mission} />
    <ul className="collect-funnel" aria-label="실제 수집 성과">{COUNTS.map(([key, label]) => <li key={key} data-key={key}><strong>{(mission.counts[key] ?? 0).toLocaleString("ko-KR")}</strong><span>{label}</span></li>)}</ul>
    {mission.gaps.length > 0 && <section className="mission-gaps" aria-label="남은 범위"><h3>아직 확보하지 못한 자료</h3><ul>{mission.gaps.map((gap, index) => <li key={`${gap.reason}-${index}`}><p>{gap.message}</p>{gap.url && <a href={gap.url} target="_blank" rel="noreferrer">{gap.url}</a>}</li>)}</ul></section>}
    <details><summary>계획과 조사 범위</summary><Plan plan={mission.plan} /></details>
    <section className="mission-results" aria-label="수집 결과"><h3>확보한 지식과 출처</h3>
      {mission.triage && <p className="kb-note" aria-label="품질 판정 집계">
        판정 집계: 수락 {(mission.triage.accepted ?? 0).toLocaleString("ko-KR")}건 · 추가 확인 {(mission.triage.review_needed ?? 0).toLocaleString("ko-KR")}건 · 보류 {(mission.triage.held ?? 0).toLocaleString("ko-KR")}건 · 정밀평가 {preciseSummary(mission)} · 판정 기준 {mission.triage.policy?.verified === true ? "검증 이력 있음" : "미검증"}
      </p>}
      {mission.results.length === 0 ? <p className="kb-note">자료를 확보하면 출처와 판정 이유가 여기에 표시됩니다.</p> : mission.results.map(item => <article className="collect-card" key={item.id}>
        <h4>{item.title}</h4><a className="kb-note" href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
        <p className="kb-note">{deliveryLabel(item)} · {item.reasons.map(reason => reason === "l0_pass" ? "기본 품질 검사 통과" : COLLECT_REASON[reason] ?? "세부 확인 필요").join(" · ")}</p>
        {item.triage ? <>
          <p className="kb-note">판정: {TRIAGE_STATUS[item.triage.status ?? ""] ?? "판정 상태 확인 필요"} · 판정 기준: {item.triage.verified === true ? "검증 이력 있음" : "미검증"}
            {item.triage.reasons?.length ? <> · {item.triage.reasons.map(reason => TRIAGE_REASON[reason] ?? "추가 확인 필요").join(" · ")}</> : null}
            {item.triage.mode === "shadow" ? " · 관찰 모드" : ""}
          </p>
          <QualityDetails triage={item.triage} missionTriage={mission.triage} />
        </> : <p className="kb-note">기존 결과에는 품질 판정 정보가 없습니다.</p>}
        {item.status === "held" && <div className="mission-unhold">
          <Button type="button" variant="primary" disabled={unholdMut.isPending} busy={unholdMut.isPending && unholdMut.variables === item.id} onClick={() => unholdMut.mutate(item.id)}>보류 복구</Button>
          {unholdMut.isPending && unholdMut.variables === item.id && <p role="status" className="kb-note">보류 복구를 요청하는 중입니다.</p>}
          {unholdMut.isError && unholdMut.variables === item.id && <p role="alert" className="tk-error">{unholdFailure(unholdMut.error)}</p>}
        </div>}
        {unholdMut.isSuccess && unholdMut.variables === item.id && <p role="status" className="kb-note">{unholdMut.data.message !== "item_not_held"
          ? "복구 요청이 처리됐습니다. 도서관 적재 완료 여부는 가져오기 확인 후 갱신됩니다."
          : "이미 보류 상태가 아니어서 바꾸지 않았습니다. 최신 상태를 다시 읽었습니다."}</p>}
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
