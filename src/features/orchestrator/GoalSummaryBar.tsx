import { useId, useState } from "react";
import { Icon, type IconName } from "../../ui/Icon";
import type { GoalPhase, GoalRequirement, GoalSummary } from "../../api/types";
import { clockLabel } from "../chat/runView";

type Tone = "info" | "success" | "warning" | "danger" | "neutral";
/** 화면에 구분해 보이는 상태. 8가지 핵심(running·external·usage·auto·partial·paused·review·complete) + 막힘·이어갈 작업 없음·원인 모르는 대기 */
export type GoalViewKind =
  | "running" | "external" | "usage" | "auto" | "waiting" | "partial"
  | "paused" | "blocked" | "review" | "complete" | "no_owner";
export interface GoalPhaseView {
  kind: GoalViewKind;
  label: string;
  tone: Tone;
  icon: IconName;
  /** 진행 중 배지만 .tk-badge[data-state] 의 실행 색을 쓴다 */
  state?: "running" | "waiting";
}

const PHASES: readonly GoalPhase[] = ["running", "waiting", "paused", "blocked", "complete"];

const STATUSES: readonly GoalSummary["status"][] = ["active", "blocked", "paused", "complete"];

const BLOCKER_LABEL: Record<string, string> = {
  no_progress: "진전이 없어요",
  permanent_failure: "되풀이해도 안 되는 오류예요",
  transient_exhausted: "일시 오류 재시도를 다 썼어요",
  usage_limit_exhausted: "사용량 한도 대기 상한을 넘었어요",
};

const ITEM_LABEL: Record<GoalRequirement["status"], string> = { done: "완료", review: "확인 필요", pending: "남음", waiting: "기다리는 중", blocked: "막힘" };
const ITEM_TAGGED: readonly GoalRequirement["status"][] = ["review", "waiting", "blocked"];

type PhaseViewInput = Pick<GoalSummary, "phase" | "user_action" | "user_intervention_needed"> &
  Partial<Pick<GoalSummary, "status" | "wait_type" | "has_owner" | "has_partial_failure" | "pending_count" | "pending">>;

/**
 * 화면 분기는 status 와 phase 를 함께 본다. Run 이 끝났다는 사실은 완료가 아니다.
 * - 완료는 status=complete 일 때만. 완료 근거가 완료 단어뿐이거나(user_action=review) 남은 요구가 있으면 '확인 필요'.
 * - status=active 인데 has_owner=false 면 이어갈 책임자가 없으니 '진행 중'이 아니다. has_owner 가 없으면(구버전) 모른다고 보고 기존대로 본다.
 * - 대기 종류는 phase=waiting 일 때만 쓴다. wait_type 이 null 이면 새 백엔드가 '이유 없는 자동 재개 예정'으로 본 것이고,
 *   필드가 아예 없으면(구버전) 이유를 몰라 그냥 '대기 중'이다.
 * 모르는 status·phase(새 백엔드)는 null 이라 아무것도 그리지 않는다.
 */
export function goalPhaseView(g: PhaseViewInput): GoalPhaseView | null {
  if (!PHASES.includes(g.phase)) return null;
  // status 가 없는 입력은 구버전 응답 모양이라 phase 로 대신한다.
  const status = g.status ?? (g.phase === "waiting" || g.phase === "running" ? "active" : g.phase);
  if (!STATUSES.includes(status)) return null;
  const remaining = g.pending_count ?? g.pending?.length ?? 0;
  if (g.user_action === "review" || (status === "complete" && (g.user_intervention_needed || remaining > 0))) {
    return { kind: "review", label: "확인 필요", tone: "warning", icon: "eye" };
  }
  switch (status) {
    case "paused":
      return { kind: "paused", label: "멈춤", tone: "neutral", icon: "ban" };
    case "blocked":
      return { kind: "blocked", label: "막힘", tone: "danger", icon: "shield-alert" };
    case "complete":
      return { kind: "complete", label: "완료", tone: "success", icon: "circle-check" };
  }
  if (g.has_owner === false) return { kind: "no_owner", label: "이어갈 작업 없음", tone: "warning", icon: "warning" };
  if (g.phase === "waiting") {
    if (g.wait_type === "usage_limit") return { kind: "usage", label: "한도 대기", tone: "info", icon: "clock", state: "waiting" };
    if (g.wait_type === "external_dependency") return { kind: "external", label: "결과 대기", tone: "info", icon: "clock", state: "waiting" };
    if (g.wait_type === null) return { kind: "auto", label: "자동 재개 예정", tone: "info", icon: "clock", state: "waiting" };
    return { kind: "waiting", label: "대기 중", tone: "info", icon: "clock", state: "waiting" };
  }
  if (g.has_partial_failure) return { kind: "partial", label: "일부 막힘", tone: "warning", icon: "warning" };
  return { kind: "running", label: "진행 중", tone: "info", icon: "clock", state: "running" };
}

function interventionHint(g: GoalSummary): string {
  if (g.user_action === "review") return "완료 근거를 확인해 주세요";
  if (g.user_action === "intervene") return "막힘을 풀어 주세요";
  if (g.user_action === "resume") return "다시 지시하면 이어가요";
  return g.user_intervention_needed ? "내 확인이 필요해요" : "내 조치는 필요 없어요";
}

/** 상태별로 지금 무슨 일이 일어나는지 한 줄. 시각이 있는 대기는 waitText 가 먼저다. */
const KIND_NOTE: Partial<Record<GoalViewKind, string>> = {
  usage: "한도가 풀리면 자동으로 이어가요",
  external: "기다리던 결과가 오면 자동으로 이어가요",
  auto: "곧 자동으로 이어가요",
  partial: "막힌 요구가 있어요. 나머지는 계속해요",
  no_owner: "진행 중인 작업이 없어요. 다시 지시해 주세요",
};

/** 기다리는 의존성 이름. 사용자가 읽는 문장만 짧게 자르고 내부 필드(reason·owner·source)는 쓰지 않는다 */
function dependencyTargets(g: GoalSummary): string | null {
  const deps = Array.isArray(g.waiting_dependencies) ? g.waiting_dependencies : [];
  const names = deps.map((d) => (typeof d?.target === "string" ? d.target.trim() : "")).filter(Boolean).map((t) => (t.length > 40 ? `${t.slice(0, 40)}…` : t));
  if (names.length === 0) return null;
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}개` : names.join(", ");
}

function waitText(g: GoalSummary): string | null {
  if (!g.waiting_until || Number.isNaN(new Date(g.waiting_until).getTime())) return null;
  return `${clockLabel(g.waiting_until)}에 자동으로 이어가요`;
}

function Items({ title, items }: { title: string; items: GoalRequirement[] }) {
  return (
    <div className="goal-summary__group">
      <h3 className="goal-summary__group-title">{title} {items.length}</h3>
      {items.length === 0 ? (
        <p className="goal-summary__empty">없어요</p>
      ) : (
        <ul className="goal-summary__items">
          {items.map((it) => (
            <li key={it.id} className="goal-summary__item" data-status={it.status}>
              <Icon name={it.status === "done" ? "circle-check" : it.status === "review" ? "eye" : it.status === "blocked" ? "warning" : "clock"} />
              <span className="goal-summary__item-text">
                {it.text}
                {ITEM_TAGGED.includes(it.status) && <span className="goal-summary__tag"> · {ITEM_LABEL[it.status]}</span>}
                {it.evidence && <span className="goal-summary__evidence">{it.evidence}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 기획 세션 헤더 아래의 목표 진행 한 줄. 기록을 읽지 않고도 끝났는지·남았는지·내가 움직여야 하는지를 본다.
 * goal_summary 가 null 이거나 필드가 없으면(구버전 백엔드, 계약 없음) 아무것도 그리지 않는다.
 */
export function GoalSummaryBar({ summary }: { summary: GoalSummary | null | undefined }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (!summary || typeof summary !== "object") return null;
  const view = goalPhaseView(summary);
  if (!view) return null;

  const completed = summary.completed ?? [];
  const pending = summary.pending ?? [];
  const doneCount = summary.completed_count ?? completed.length;
  const leftCount = summary.pending_count ?? pending.length;
  const tasks = summary.running_tasks ?? [];
  const wait = summary.phase === "waiting" && view.state === "waiting" ? waitText(summary) : null;
  const blocker = view.kind === "blocked" && summary.blocker_kind ? (BLOCKER_LABEL[summary.blocker_kind] ?? "막혀 있어요") : null;
  const intervene = summary.user_intervention_needed || view.kind === "no_owner";
  const action = view.kind === "no_owner" ? "다시 지시해 주세요" : interventionHint(summary);
  const note = KIND_NOTE[view.kind] ?? null;
  const waitingFor = view.kind === "external" ? dependencyTargets(summary) : null;
  const blockedCount = pending.filter((r) => r.status === "blocked").length;
  // 대기·확인 필요가 앞에 나온 상태에서도 일부 요구의 장애는 놓치지 않게 덧붙인다
  const partialNote = summary.status === "active" && summary.has_partial_failure && view.kind !== "partial" && view.kind !== "no_owner"
    ? (blockedCount > 0 ? `막힌 요구 ${blockedCount}개` : "일부 요구가 막혔어요") : null;
  const detail = [
    tasks.length > 0 ? `실행 중 ${tasks.join(", ")}` : null,
    waitingFor ? `기다리는 것 ${waitingFor}` : null,
    view.kind === "partial" && blockedCount > 0 ? `막힌 요구 ${blockedCount}개` : null,
    partialNote,
    summary.next_action ? `다음 ${summary.next_action}` : null,
    summary.stop_reason ? `중단 사유 ${summary.stop_reason}` : null,
    blocker,
  ].filter((x): x is string => !!x);
  const detailLine = detail.join(" · ");

  return (
    <section className="goal-summary" data-phase={summary.phase} data-kind={view.kind} data-tone={view.tone} aria-label="목표 진행 상태">
      <button className="goal-summary__head" type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
        <span className="goal-summary__line">
          <span className={`tk-badge${view.tone !== "neutral" && !view.state ? ` tk-badge--${view.tone}` : ""}`} data-state={view.state}>
            {view.state === "running" ? <span className="tk-dot tk-dot--live" aria-hidden /> : <Icon name={view.icon} />}
            {view.label}
          </span>
          <span className="goal-summary__counts">완료 {doneCount} · 남음 {leftCount}</span>
          <span className="goal-summary__hint" data-needed={intervene ? "" : undefined}>
            {intervene && <Icon name="hand" />}
            {wait ?? note ?? action}
          </span>
          <Icon name={open ? "chevron-up" : "chevron-down"} />
        </span>
        {!open && detailLine && <span className="goal-summary__detail" title={detailLine}>{detailLine}</span>}
      </button>
      {open && (
        <div className="goal-summary__body" id={bodyId}>
          {summary.goal && <p className="goal-summary__goal">{summary.goal}</p>}
          <dl className="goal-summary__facts">
            {tasks.length > 0 && (<><dt>실행 중</dt><dd>{tasks.join(", ")}</dd></>)}
            {summary.next_action && (<><dt>다음 할 일</dt><dd>{summary.next_action}</dd></>)}
            {waitingFor && (<><dt>기다리는 것</dt><dd>{waitingFor}</dd></>)}
            {(wait ?? note) && view.state === "waiting" && (<><dt>대기</dt><dd>{wait ?? note}</dd></>)}
            {partialNote && (<><dt>일부 장애</dt><dd>{partialNote}</dd></>)}
            {summary.stop_reason && (<><dt>중단 사유</dt><dd>{summary.stop_reason}</dd></>)}
            {blocker && (<><dt>막힌 이유</dt><dd>{blocker}</dd></>)}
            <dt>내 조치</dt><dd>{action}</dd>
            {summary.additional_request_count > 0 && (<><dt>추가 요청</dt><dd>{summary.additional_request_count}개를 합쳐야 해요</dd></>)}
          </dl>
          <Items title="완료" items={completed} />
          <Items title="남음" items={pending} />
        </div>
      )}
    </section>
  );
}
