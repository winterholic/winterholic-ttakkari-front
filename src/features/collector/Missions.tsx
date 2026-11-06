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
  supplementCollectionMission,
  unholdCollectionMissionItem,
} from "../../api/collectionMissions";
import type { CollectionMission, CollectionPlan } from "../../api/collectionMissions";
import { MissionTrace, type SupplementControl } from "./MissionTrace";
import { Button } from "../../ui/Button";
import { COLLECT_REASON, formatTime } from "../kb/labels";
import { CoverageTopics, GapDetail, ResearchPanel } from "./ResearchPanel";
import { explainCollectionError, filterAndSortMissions, missionNeeds, type MissionListStatus } from "./missionProjects";
import { CollectionErrorNotice } from "./CollectionErrorNotice";
import { preciseEvalSummary } from "./preciseEvalSummary";

// A continuation adds this much room from the preserved frontier. The owner never types a page count.
const MORE_PAGES = 1000;

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
    if (status === 403) return "권한 또는 출처 정책으로 복구할 수 없습니다. 제한을 우회하지 말고 허용된 자료를 선택해 주세요.";
    if (status === 404) return "문서를 찾을 수 없거나 현재 임무에서 접근할 수 없습니다.";
    if (status === 422) {
      const code = (error as Error).message;
      if (code === "item_not_importable") return "원문 보관 정보가 부족해 도서관에 적재할 수 없습니다.";
      const guide = explainCollectionError(error);
      return `${guide.what} ${guide.next}`;
    }
    const guide = explainCollectionError(error);
    return `${guide.what} ${guide.next}`;
  }
  const guide = explainCollectionError(error);
  return `${guide.what} ${guide.next}`;
}

function engineLabel(engine: string): string {
  if (engine === "ready") return "준비됨";
  if (engine === "busy") return "사용 상태 확인 중";
  if (engine === "unavailable") return "엔진 사용 불가";
  if (engine === "enabled_without_registered_engine") return "등록된 엔진 확인 안 됨";
  if (engine === "enabled") return "사용 가능";
  return "확인 필요";
}

function preciseQueue(mission: CollectionMission): { pending?: number; processing?: number; unresolved?: number; waitingTotal?: number } {
  const precise = mission.triage?.precise_eval;
  return {
    pending: precise?.pending,
    processing: precise?.processing,
    unresolved: precise?.unresolved ?? mission.counts.precise_unresolved,
    waitingTotal: precise?.pending == null ? mission.counts.precise_waiting : undefined,
  };
}

const preciseCount = (value: number | undefined) => value == null ? "미확인" : `${value.toLocaleString("ko-KR")}건`;

function preciseSummary(mission: CollectionMission): string {
  return preciseEvalSummary(mission.counts, mission.triage?.precise_eval);
}

function PreciseNotice({ mission }: { mission: CollectionMission }) {
  const { pending, processing, unresolved, waitingTotal } = preciseQueue(mission);
  const hasPreciseCounts = mission.counts.precise_waiting != null || mission.counts.precise_unresolved != null || mission.triage?.precise_eval != null;
  return <>
    {hasPreciseCounts && <p className="kb-note" aria-label="정밀평가 집계">정밀평가 집계: {preciseSummary(mission)}. 사용자 검토 대기와 별도입니다.</p>}
    {pending != null && <p className="kb-note" role="status" aria-label="정밀평가 대기">정밀평가 대기 {preciseCount(pending)} · 결과에 따라 도서관 적재가 달라질 수 있음</p>}
    {waitingTotal != null && <p className="kb-note" role="status" aria-label="정밀평가 대기·처리 합계">정밀평가 대기·처리 합계 {preciseCount(waitingTotal)} · 개별 대기 수는 미확인</p>}
    {processing != null && <p className="kb-note" role="status" aria-label="정밀평가 처리 중">정밀평가 처리 중 {preciseCount(processing)}</p>}
    {unresolved != null && <p className="kb-note" role="status" aria-label="정밀평가 확인 불가">정밀평가 결과 확인 불가 {preciseCount(unresolved)} · 운영자 확인 필요</p>}
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

function Plan({ plan, coverage = plan.coverage }: { plan: CollectionPlan; coverage?: CollectionPlan["coverage"] }) {
  return <section className="mission-plan" aria-label="수집 계획">
    <h3>계획 미리 보기</h3>
    <p><strong>조사 목적</strong> · {plan.title}</p>
    <p><strong>전략</strong> · {plan.mode}</p>
    <ol>{plan.steps.map(step => <li key={step}>{step}</li>)}</ol>
    {plan.sources.length > 0 && <details><summary>예정 출처와 접근 근거 {plan.sources.length}곳</summary><ul className="mission-plan__sources">{plan.sources.map(source => <li key={`${source.url}-${source.adapter}`}><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a><span>{source.adapter} · {source.provenance}</span></li>)}</ul></details>}
    {plan.queries.length > 0 && <details><summary>검색 전략 {plan.queries.length}개</summary><ul>{plan.queries.map(query => <li key={query}>{query}</li>)}</ul></details>}
    <p className="kb-note">검색 {plan.budget.searches}회 · {Math.round(plan.budget.seconds / 60)}분 예산</p>
    <p className="kb-note">종료 기준: {plan.stop_conditions.join(" · ")}</p>
    {plan.papers?.some(paper => paper.license || paper.rights_note) && <details><summary>논문별 권리·접근 메모</summary><ul>{plan.papers.filter(paper => paper.license || paper.rights_note).map(paper => <li key={paper.identifier}>{paper.title ?? paper.identifier}: {paper.license?.permission ?? paper.license?.error ?? paper.rights_note ?? "권리 정보 없음"}</li>)}</ul></details>}
    <details className="mission-plan__rights"><summary>권리·접근 확인 범위</summary><p>출처별 접근 근거는 API가 제공한 출처 설명을 표시합니다. 일반 URL의 사용 허가를 나타내는 별도 필드는 미리보기 API에 없습니다. 논문별 라이선스·전문 접근 메모가 있을 때만 해당 항목에 표시합니다. 권리가 확인되지 않은 접근은 우회하지 않습니다.</p></details>
    {coverage.length > 0 && <p className="kb-note">누락 가능성은 아래 분야의 현재 상태와 종료 기준에서 확인하세요. API 미리보기에는 별도 누락 가능성 점수 필드가 없습니다.</p>}
    {coverage.length > 0 && <CoverageTopics coverage={coverage} />}
  </section>;
}

function MissionProblems({ mission }: { mission: CollectionMission }) {
  const failedJobs = mission.jobs.filter(job => job.error);
  if (!mission.gaps.length && !failedJobs.length) return <p className="kb-note">보고된 문제 없음 · 다음 행동: 진행 상태를 확인하세요.</p>;
  return <section className="mission-problems" aria-label="문제와 해결 행동">
    <h3>문제와 해결 행동</h3>
    {mission.gaps.length > 0 && <ul>{mission.gaps.map((gap, index) => <li key={`${gap.reason}-${index}`}><p><strong>{gap.message}</strong></p><GapDetail gap={gap} /><p className="kb-note">다음 행동: 부족한 항목의 보충 가능 여부를 확인하고, 접근이 제한된 출처는 허용된 대체 출처로 바꾸세요.</p>{gap.url && <a href={gap.url} target="_blank" rel="noreferrer">문제가 난 출처 보기</a>}</li>)}</ul>}
    {failedJobs.map(job => <CollectionErrorNotice key={job.job_id} error={{ code: job.error?.code, detail: job.error?.detail }} />)}
  </section>;
}

function MissionQualitySummary({ mission }: { mission: CollectionMission }) {
  const triage = mission.triage;
  return <section className="mission-quality-summary" aria-label="품질 검토 요약">
    <div><h3>품질 판정</h3><p>{triage?.policy?.verified === true ? "판정 기준 성능 검증 이력 있음" : triage ? "판정 기준 성능 검증 이력 없음" : "판정 성능 검증 이력 미제공"} · 문서별 판정은 자료·품질 탭에서 확인</p></div>
    {triage ? <ul><li><strong>{(triage.accepted ?? 0).toLocaleString("ko-KR")}</strong><span>수락</span></li><li><strong>{(triage.review_needed ?? 0).toLocaleString("ko-KR")}</strong><span>추가 확인</span></li><li><strong>{(triage.held ?? 0).toLocaleString("ko-KR")}</strong><span>보류</span></li></ul>
      : <p className="kb-note">이 미션은 품질 판정 집계를 제공하지 않습니다.</p>}
    <p className="kb-note">판정 기준의 검증 이력은 문서의 사실 여부를 검증했다는 뜻이 아닙니다.</p>
  </section>;
}

const TABS: [string, string][] = [["overview", "요약·진행"], ["targets", "확보 분야"], ["docs", "자료·품질"], ["log", "수집 과정"], ["prompt", "조사 지시문·계획"]];

const STATUS_EXPLANATION: Record<string, string> = {
  queued: "요청을 접수해 수집을 시작하기 전입니다.", running: "출처를 찾거나 자료를 가져오고 있습니다.", paused: "현재 멈춰 있습니다. 재개하거나 취소할 수 있습니다.",
  discovery_pending: "수집할 출처를 탐색할 차례를 기다리고 있습니다.", waiting_sources: "진행에 필요한 출처 확인을 기다리고 있습니다.", succeeded: "이번 계획의 수집이 종료됐습니다. 목표량 달성이 사실 검증을 뜻하지는 않습니다.",
  partial: "일부 요구만 목표량에 도달했습니다. 부족한 항목을 확인하고 보충할 수 있습니다.", cancelled: "수집이 중지됐습니다. 필요하면 다시 실행할 수 있습니다.", failed: "수집이 멈췄습니다. 실패 원인을 확인한 뒤 이어서 실행할 수 있습니다.",
};

function Result({ mission, tab, onTab }: { mission: CollectionMission; tab: string; onTab: (tab: string) => void }) {
  const queryClient = useQueryClient();
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
    mutationFn: () => extendCollectionMission(mission.id, MORE_PAGES),
    onSuccess: invalidate,
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
  const supplementMut = useMutation({
    mutationFn: (keys: string[]) => supplementCollectionMission(mission.id, keys),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["collection-mission-trace", mission.id] });
      await invalidate();
    },
  });
  const supplement: SupplementControl = {
    enabled: ["succeeded", "partial", "failed"].includes(mission.status),
    pending: supplementMut.isPending ? supplementMut.variables ?? [] : null,
    run: keys => supplementMut.mutate(keys),
    error: supplementMut.isError ? supplementMut.error : null,
  };
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
      <div><h2>{mission.title}</h2><p>{STATUS_EXPLANATION[mission.status] ?? "현재 상태를 확인하고 아래 진행 내용을 살펴보세요."}</p></div>
      <span role="status" className="mission-status-badge" data-status={mission.status}>{STATUS[mission.status] ?? "상태 확인 필요"}</span>
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
            busy={extendMut.isPending}
            onClick={() => extendMut.mutate()}
          >
            이어서 더 수집
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
        <div className="mission-controls">
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
      <CollectionErrorNotice error={pauseMut.error || resumeMut.error || cancelMut.error || extendMut.error || rerunMut.error || scheduleMut.error} />
    )}

    <nav className="mission-tabs" aria-label="임무 보기">{TABS.map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => onTab(id)}>{label}</button>)}</nav>
    {tab === "overview" && <><MissionTrace missionId={mission.id} part="overview" supplement={supplement} /><MissionQualitySummary mission={mission} /><MissionProblems mission={mission} /><ResearchPanel mission={mission} />
    {mission.knowledge_processing.semantic !== "verified" && <p className="kb-note">원문 적재와 의미·관계 처리는 별도로 진행됩니다.</p>}
    </>}
    {tab === "targets" && <MissionTrace missionId={mission.id} part="targets" supplement={supplement} />}
    {tab === "docs" && <>
    <MissionTrace missionId={mission.id} part="docs" />
    <PreciseNotice mission={mission} />
    <details className="mission-results-detail"><summary>품질 판정 상세 (최근 {mission.results.length}건)</summary>
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
    </section></details>
    </>}
    {tab === "log" && <MissionTrace missionId={mission.id} part="log" />}
    {tab === "prompt" && <><MissionTrace missionId={mission.id} part="prompt" />
    <details><summary>계획과 조사 범위</summary><Plan plan={mission.plan} coverage={mission.research?.coverage ?? mission.plan.coverage} /></details>
    </>}
  </article>;
}

export function Missions() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MissionListStatus>("all");
  const selected = params.get("mission");
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["collection-missions"], queryFn: collectionMissions, refetchInterval: 10000 });
  const detail = useQuery({ queryKey: ["collection-mission", selected], queryFn: () => collectionMission(selected!), enabled: !!selected, refetchInterval: 5000 });
  const input = () => ({ goal: goal.trim(), context });
  const tab = TABS.some(([id]) => id === params.get("tab")) ? params.get("tab")! : "overview";
  const go = (values: Record<string, string | null>) => setParams(previous => {
    const next = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    return next;
  });
  const select = (id: string) => go({ mission: id, new: null, tab: null });
  const view = selected ? "detail" : params.has("new") || (list.isSuccess && list.data.items.length === 0) ? "new" : "history";
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
    <nav className="mission-nav" aria-label="수집 프로젝트 메뉴">
      <button type="button" aria-pressed={view !== "new"} onClick={() => go({ mission: null, new: null, tab: null })}>수집 프로젝트</button>
      <button type="button" aria-pressed={view === "new"} onClick={() => go({ mission: null, new: "1", tab: null })}>새 연구 계획</button>
    </nav>
    {view === "new" && <>
    <form className="mission-composer" onSubmit={event => { event.preventDefault(); if (goal.trim()) create.mutate(); }}>
      <h2>새 연구 계획</h2>
      <label htmlFor="collection-goal">무엇을 수집하고 싶으세요?</label>
      <p className="kb-note" id="collection-help">지시문을 통째로 붙여 넣으면 됩니다. 대상 이름, 분야, 지켜야 할 규칙을 읽어 알아서 수집합니다. 쪽수는 정하지 않아도 됩니다.</p>
      <textarea id="collection-goal" className="tk-textarea" rows={9} maxLength={20000} required value={goal} aria-describedby="collection-help" placeholder="하네스 엔지니어링의 이론, 논문과 오픈소스 사례를 폭넓게 수집해줘." onChange={event => { setGoal(event.target.value); changed(); }} />
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
      <div className="mission-submit"><Button type="button" disabled={!goal.trim() || create.isPending} busy={preview.isPending} onClick={() => preview.mutate()}>계획 미리 보기</Button><Button type="submit" variant="primary" disabled={!goal.trim()} busy={create.isPending}>수집 시작</Button></div>
      {preview.isError && <CollectionErrorNotice error={preview.error} />}
      {create.isError && <CollectionErrorNotice error={create.error} />}
      {preview.data && <Plan plan={preview.data} />}
    </form>
    </>}
    {view === "history" && <section className="mission-history" aria-label="수집 프로젝트 목록"><div className="mission-history__heading"><div><h2>수집 프로젝트</h2><p className="kb-note">각 미션을 별도 프로젝트로 표시합니다. 같은 제목이어도 서버가 명시적으로 연결하지 않으면 합치지 않습니다.</p></div><Button type="button" variant="primary" onClick={() => go({ mission: null, new: "1", tab: null })}>새 연구 계획</Button></div>
      {list.isPending && <p role="status">임무를 불러오는 중</p>}
      {list.isError && <div className="kb-error"><CollectionErrorNotice error={list.error} /><Button onClick={() => void list.refetch()}>다시 불러오기</Button></div>}
      {list.data && <>
        <div className="mission-list-tools">
          <label htmlFor="mission-search">프로젝트 검색</label><input id="mission-search" className="tk-input" type="search" value={search} placeholder="이름, 지시문, 조사 분야" onChange={event => setSearch(event.target.value)} />
          <label htmlFor="mission-status">상태</label><select id="mission-status" className="tk-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value as MissionListStatus)}><option value="all">모든 상태</option><option value="active">진행 중·대기</option><option value="attention">확인 필요</option><option value="finished">종료</option></select>
          <span className="kb-note" role="status">{filterAndSortMissions(list.data.items, { query: search, status: statusFilter }).length}개 · 최근 활동순</span>
        </div>
        {list.data.items.length === 0 ? <div className="mission-list-empty"><h3>아직 수집 프로젝트가 없습니다</h3><p>긴 지시문을 붙여 넣고 계획을 미리 본 뒤 첫 수집을 시작하세요.</p><Button type="button" variant="primary" onClick={() => go({ mission: null, new: "1", tab: null })}>연구 계획 작성</Button></div>
          : filterAndSortMissions(list.data.items, { query: search, status: statusFilter }).length === 0
          ? <div className="mission-list-empty"><p>검색·상태 조건에 맞는 프로젝트가 없습니다.</p><Button type="button" onClick={() => { setSearch(""); setStatusFilter("all"); }}>조건 초기화</Button></div>
          : <div className="mission-table-wrap"><table className="mission-table"><thead><tr><th scope="col">프로젝트 / 세부 주제</th><th scope="col">상태</th><th scope="col">마지막 활동</th><th scope="col">도서관 누적 적재</th><th scope="col">마지막 결과</th><th scope="col">문제 · 다음 행동</th></tr></thead>
            <tbody>{filterAndSortMissions(list.data.items, { query: search, status: statusFilter }).map(mission => {
              const needs = missionNeeds(mission);
              const topics = mission.plan.coverage.map(entry => entry.topic).filter(Boolean).slice(0, 3);
              const detail = topics.length ? topics.join(" · ") : mission.goal.split(/\n|[.!?]/, 1)[0];
              return <tr key={mission.id}>
                <th scope="row" data-label="프로젝트 / 세부 주제"><button className="mission-table__open" type="button" onClick={() => select(mission.id)} aria-label={`상세 보기: ${mission.title}`}><strong>{mission.title}</strong><span>{detail || "세부 주제 미지정"}</span></button></th>
                <td data-label="상태"><span className="mission-status-badge" data-status={mission.status}>{STATUS[mission.status] ?? "상태 확인 필요"}</span></td>
                <td data-label="마지막 활동">{formatTime(needs.lastActivity)}</td>
                <td data-label="도서관 누적 적재"><strong>{needs.imported.toLocaleString("ko-KR")}</strong>건 <small>미션 전체</small></td>
                <td data-label="마지막 결과">{needs.latestResult}</td>
                <td data-label="문제 · 다음 행동"><span>{needs.issue || "현재 보고된 문제 없음"}</span><strong>{needs.nextAction}</strong></td>
              </tr>;
            })}</tbody></table></div>}
        <p className="kb-note mission-list-scope">목록의 도서관 적재는 `counts.imported` 미션 누계입니다. 마지막 회차 수치와 섞지 않습니다.</p>
      </>}
    </section>}
    {view === "detail" && <div className="mission-selected">
      <button type="button" className="mission-back" onClick={() => go({ mission: null, tab: null })}>← 수집 내역</button>
      {detail.isPending && <p role="status">임무 결과를 불러오는 중</p>}{detail.isError && <div className="kb-error"><CollectionErrorNotice error={detail.error} /><Button onClick={() => void detail.refetch()}>결과 다시 읽기</Button></div>}{detail.data && <Result mission={detail.data} tab={tab} onTab={id => go({ tab: id })} />}
    </div>}
  </div>;
}
