import { Badge } from "../../../ui/Badge";
import { FEASIBILITY_META } from "./feasibility";
import type { FeasibilityResult } from "./feasibility";

/** 제작 가능은 기본 상태라 배지를 달지 않는다. 계획만 반영·미검증·미지원일 때만 이유와 함께 보여 준다. */
export function FeasibilityBadge({ result }: { result: FeasibilityResult | undefined }) {
  if (!result || result.kind === "supported") return null;
  const meta = FEASIBILITY_META[result.kind];
  return <span className="cw-feas" data-feasibility={result.kind} title={[meta.hint, ...result.notes].join(" ")}><Badge tone={meta.tone}>{meta.label}</Badge></span>;
}
