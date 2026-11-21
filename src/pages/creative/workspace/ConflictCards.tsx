import type { IntentConflictV2 } from "../../../api/creativeV2";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { CONFLICT_KIND_LABEL, ORIGIN_META, conflictMessage } from "./intentModel";

/** 충돌은 조용히 버리지 않는다. 후보를 모두 보여 주고, 막는 충돌은 하나를 골라야 진행된다. */
export function ConflictCards({ conflicts, disabled, onResolve }: { conflicts: IntentConflictV2[]; disabled: boolean; onResolve: (conflict: IntentConflictV2, choice: string) => void }) {
  if (conflicts.length === 0) return null;
  const mustPick = (c: IntentConflictV2) => c.status === "open" && c.blocking;
  return (
    <div className="cw-conflicts" aria-label="충돌">
      {conflicts.map((c) => {
        const canKeepBoth = !["duration", "aspect", "single_primary"].includes(c.kind);
        const tone = mustPick(c) ? "caution" : c.status === "open" ? "warning" : "tip";
        return (
          <div key={c.id} className={`tk-callout tk-callout--${tone} cw-conflict`} role="group" aria-label={`${CONFLICT_KIND_LABEL[c.kind] ?? "충돌"}`} data-status={c.status} data-blocking={mustPick(c) || undefined}>
            <Icon className="tk-callout__icon" name={c.status === "resolved" ? "circle-check" : "warning"} />
            <div className="tk-callout__body">
              <strong className="tk-callout__title">
                {CONFLICT_KIND_LABEL[c.kind] ?? "충돌"} · {c.status === "resolved" ? "해결함" : mustPick(c) ? "하나를 골라야 해요" : "확인해 주세요"}
              </strong>
              <p>{conflictMessage(c)}</p>
              <ul className="cw-conflict__candidates">
                {c.candidates.map((cand) => {
                  const chosen = c.resolution?.choice === cand.value;
                  const quote = cand.evidence[0]?.quote;
                  return (
                    <li key={cand.value} data-chosen={chosen || undefined}>
                      <div className="cw-conflict__cand">
                        <strong>{cand.label || cand.value}</strong>
                        <Badge tone={cand.origin === "user_confirmed" ? "success" : "info"}>{cand.origin === "user_confirmed" ? "직접 고른 값" : ORIGIN_META[cand.origin].label}</Badge>
                        {quote && <span className="cw-conflict__quote">문장: “{quote}”</span>}
                      </div>
                      <Button size="sm" variant={chosen ? undefined : "primary"} disabled={disabled || chosen} aria-pressed={chosen} aria-label={`${cand.label || cand.value} 선택`} onClick={() => onResolve(c, cand.value)}>{chosen ? "선택함" : "이 값으로"}</Button>
                    </li>
                  );
                })}
              </ul>
              {canKeepBoth && c.status === "open" && (
                <Button size="sm" disabled={disabled} onClick={() => onResolve(c, "keep_both")}>둘 다 유지 (혼합)</Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
