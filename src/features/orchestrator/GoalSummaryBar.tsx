import { useId, useState } from "react";
import { Icon, type IconName } from "../../ui/Icon";
import type { GoalPhase, GoalRequirement, GoalSummary } from "../../api/types";
import { clockLabel } from "../chat/runView";

type Tone = "info" | "success" | "warning" | "danger" | "neutral";
export interface GoalPhaseView {
  label: string;
  tone: Tone;
  icon: IconName;
  /** 진행 중 배지만 .tk-badge[data-state] 의 실행 색을 쓴다 */
  state?: "running" | "waiting";
}

const PHASES: readonly GoalPhase[] = ["running", "waiting", "paused", "blocked", "complete"];

const BLOCKER_LABEL: Record<string, string> = {
  no_progress: "진전이 없어요",
  permanent_failure: "되풀이해도 안 되는 오류예요",
  transient_exhausted: "일시 오류 재시도를 다 썼어요",
  usage_limit_exhausted: "사용량 한도 대기 상한을 넘었어요",
};

const ITEM_LABEL: Record<GoalRequirement["status"], string> = { done: "완료", review: "확인 필요", pending: "남음" };

/**
 * 화면 분기는 phase 만 본다. Run 이 끝났다는 사실은 완료가 아니다.
 * 완료 근거가 완료 단어뿐이면(user_action=review) 완료가 아니라 '확인 필요'로 보인다.
 * 모르는 phase(새 백엔드)는 null 이라 아무것도 그리지 않는다.
 */
export function goalPhaseView(g: Pick<GoalSummary, "phase" | "user_action" | "user_intervention_needed">): GoalPhaseView | null {
  if (!PHASES.includes(g.phase)) return null;
  if (g.user_action === "review" || (g.phase === "complete" && g.user_intervention_needed)) {
    return { label: "확인 필요", tone: "warning", icon: "eye" };
  }
  switch (g.phase) {
    case "running":
      return { label: "진행 중", tone: "info", icon: "clock", state: "running" };
    case "waiting":
      return { label: "대기 중", tone: "info", icon: "clock", state: "waiting" };
    case "paused":
      return { label: "멈춤", tone: "neutral", icon: "ban" };
    case "blocked":
      return { label: "막힘", tone: "danger", icon: "shield-alert" };
    case "complete":
      return { label: "완료", tone: "success", icon: "circle-check" };
  }
}

function interventionHint(g: GoalSummary): string {
  if (g.user_action === "review") return "완료 근거를 확인해 주세요";
  if (g.user_action === "intervene") return "막힘을 풀어 주세요";
  if (g.user_action === "resume") return "다시 지시하면 이어가요";
  return g.user_intervention_needed ? "내 확인이 필요해요" : "내 조치는 필요 없어요";
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
              <Icon name={it.status === "done" ? "circle-check" : it.status === "review" ? "eye" : "clock"} />
              <span className="goal-summary__item-text">
                {it.text}
                {it.status === "review" && <span className="goal-summary__tag"> · {ITEM_LABEL.review}</span>}
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
  const wait = summary.phase === "waiting" ? waitText(summary) : null;
  const blocker = summary.phase === "blocked" && summary.blocker_kind ? (BLOCKER_LABEL[summary.blocker_kind] ?? summary.blocker_kind) : null;
  const intervene = summary.user_intervention_needed;
  const detail = [
    tasks.length > 0 ? `실행 중 ${tasks.join(", ")}` : null,
    summary.next_action ? `다음 ${summary.next_action}` : null,
    summary.stop_reason ? `중단 사유 ${summary.stop_reason}` : null,
    blocker,
  ].filter((x): x is string => !!x);
  const detailLine = detail.join(" · ");

  return (
    <section className="goal-summary" data-phase={summary.phase} data-tone={view.tone} aria-label="목표 진행 상태">
      <button className="goal-summary__head" type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
        <span className="goal-summary__line">
          <span className={`tk-badge${view.tone !== "neutral" && !view.state ? ` tk-badge--${view.tone}` : ""}`} data-state={view.state}>
            {view.state === "running" ? <span className="tk-dot tk-dot--live" aria-hidden /> : <Icon name={view.icon} />}
            {view.label}
          </span>
          <span className="goal-summary__counts">완료 {doneCount} · 남음 {leftCount}</span>
          <span className="goal-summary__hint" data-needed={intervene ? "" : undefined}>
            {intervene && <Icon name="hand" />}
            {wait ?? interventionHint(summary)}
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
            {wait && (<><dt>대기</dt><dd>{wait}</dd></>)}
            {summary.stop_reason && (<><dt>중단 사유</dt><dd>{summary.stop_reason}</dd></>)}
            {blocker && (<><dt>막힌 이유</dt><dd>{blocker}</dd></>)}
            <dt>내 조치</dt><dd>{interventionHint(summary)}</dd>
            {summary.additional_request_count > 0 && (<><dt>추가 요청</dt><dd>{summary.additional_request_count}개를 합쳐야 해요</dd></>)}
          </dl>
          <Items title="완료" items={completed} />
          <Items title="남음" items={pending} />
        </div>
      )}
    </section>
  );
}
