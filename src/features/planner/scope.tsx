import type { PlannerScope } from "../../api/client";
import { Badge } from "../../ui/Badge";
import { Icon } from "../../ui/Icon";

/** 필드가 없는 옛 응답은 개인으로 읽는다. */
export const scopeOf = (x: { scope?: PlannerScope }): PlannerScope => x.scope ?? "personal";
export const isWork = (x: { scope?: PlannerScope }) => scopeOf(x) === "work";

/** 회사 항목에만 붙는다. 개인은 표시가 없는 것이 기본이다. */
export function ScopeBadge({ scope }: { scope?: PlannerScope }) {
  if (scope !== "work") return null;
  return (
    <Badge tone="warning">
      <Icon name="briefcase" />
      <span>회사</span>
    </Badge>
  );
}
