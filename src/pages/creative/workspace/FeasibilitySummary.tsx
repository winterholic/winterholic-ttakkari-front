import type { IntentSpecV2 } from "../../../api/creativeV2";
import { Badge } from "../../../ui/Badge";
import { Icon } from "../../../ui/Icon";
import { FEASIBILITY_META, planOnlyAnswers } from "./feasibility";
import { isConfirmed, labelOf } from "./intentModel";
import type { Labels } from "./intentModel";
import { FeasibilityBadge } from "./FeasibilityBadge";

/**
 * "이 의도로 계획 만들기" 전에, 확정한 조건 중 실제 제작으로 이어지지 않는 것을 미리 알린다.
 * 의도가 확정됐다는 사실과 제작할 수 있다는 사실은 다르다.
 */
export function FeasibilitySummary({ intent, labels, loading, failed }: { intent: IntentSpecV2; labels: Labels; loading: boolean; failed: boolean }) {
  const confirmed = intent.conditions.filter((c) => isConfirmed(c.origin));
  const flagged = confirmed.map((c) => ({ c, f: labels.feasibility.get(c.id) })).filter((x) => x.f && x.f.kind !== "supported");
  const recorded = planOnlyAnswers(intent.answers, labels.catalogIds).map((id) => labels.fields.get(id)?.label ?? id);
  const unsupported = intent.unsupported;
  if (loading && !labels.feasibilityKnown) return <p className="cw-hint" role="status">제작 가능 여부를 확인하는 중…</p>;
  if (failed) return <p className="cw-hint" role="note"><Icon name="info" />제작 가능 여부를 불러오지 못했어요. 선택한 조건이 모두 제작된다는 뜻은 아니에요. 계획을 만든 뒤 제작 방식 판정에서 확인해 주세요.</p>;
  if (flagged.length === 0 && recorded.length === 0 && unsupported.length === 0) return null;
  return (
    <div className="tk-callout tk-callout--warning cw-feasibility" role="note" aria-label="제작 가능 여부 안내">
      <Icon className="tk-callout__icon" name="warning" />
      <div className="tk-callout__body">
        <strong className="tk-callout__title">선택한 조건 중 그대로 제작되지 않는 것이 있어요</strong>
        <ul>
          {flagged.map(({ c, f }) => (
            <li key={c.id}><strong>{labelOf(labels, c.id)}</strong><FeasibilityBadge result={f} /><span className="cw-hint">{FEASIBILITY_META[f!.kind].hint}{f!.notes.length ? ` ${f!.notes.join(" ")}` : ""}</span></li>
          ))}
          {unsupported.map((u) => <li key={u.id}><strong>{u.subject}</strong><Badge tone="danger">미지원</Badge><span className="cw-hint">{u.message}</span></li>)}
          {recorded.length > 0 && <li><strong>{recorded.join(", ")}</strong><Badge tone="warning">계획에만 기록</Badge><span className="cw-hint">답변은 의도에 저장되지만 제작에는 쓰이지 않아요.</span></li>}
        </ul>
      </div>
    </div>
  );
}
