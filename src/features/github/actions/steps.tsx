import type { GhStep } from "../../../api/githubTypes";
import { Badge } from "../../../ui/Badge";
import { RunResultBadge } from "../parts";

const FAILED = new Set(["failure", "timed_out", "cancelled", "action_required"]);

/** 실패한 step 을 먼저, 나머지는 원래 번호 순. 원인을 찾으러 온 사람이 맨 위에서 본다. */
export function orderSteps(steps: GhStep[]): GhStep[] {
  const failed = steps.filter((s) => s.conclusion !== null && FAILED.has(s.conclusion));
  const rest = steps.filter((s) => !(s.conclusion !== null && FAILED.has(s.conclusion)));
  return [...failed, ...rest];
}

export function StepList({ steps, firstFailed }: { steps: GhStep[]; firstFailed?: number | null }) {
  if (steps.length === 0) return <p className="gh-note">step 정보가 없어요.</p>;
  return (
    <ul className="gh-steps" aria-label="step 결과">
      {orderSteps(steps).map((s) => (
        <li key={s.number} className="gh-step">
          <span className="gh-step__no" data-stress-skip>{s.number}</span>
          <span className="gh-step__name">{s.name}</span>
          {firstFailed === s.number && <Badge tone="danger">처음 실패</Badge>}
          {s.status === "completed" || s.conclusion ? <RunResultBadge status={s.status} conclusion={s.conclusion} /> : <Badge>{s.status ?? "대기"}</Badge>}
        </li>
      ))}
    </ul>
  );
}
