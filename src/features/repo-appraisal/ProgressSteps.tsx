import type { AppraisalDetail } from "../../api/repoAppraisalTypes";
import { STAGE_LABEL } from "./format";

const STEPS = ["collect", "score", "llm", "done"] as const;
const STEP_LABEL: Record<(typeof STEPS)[number], string> = { ...STAGE_LABEL, done: "완료" };

/** 평가 진행 단계. 지금 단계에만 `aria-current="step"` 을 둔다. */
export function ProgressSteps({ appraisal }: { appraisal: AppraisalDetail }) {
  const order = appraisal.status === "queued" ? -1 : appraisal.status === "done" ? 4 : STEPS.indexOf(appraisal.stage ?? "collect");
  return (
    <ol className="ra-steps" aria-label="평가 진행 단계">
      {STEPS.map((s, i) => {
        const state = i < order || appraisal.status === "done" ? "done" : i === order ? "current" : "todo";
        return (
          <li key={s} className="ra-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="ra-step__dot" aria-hidden>{state === "done" ? "●" : `${i + 1}`}</span>
            <span className="ra-step__label">{STEP_LABEL[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}
