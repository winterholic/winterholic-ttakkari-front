import { useState } from "react";
import type { IntentConditionV2, IntentSpecV2 } from "../../../api/creativeV2";
import { Button, IconButton } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { ORIGIN_META, STARTER_DIMENSIONS, conditionsOf, isConfirmed, labelOf } from "./intentModel";
import type { Labels } from "./intentModel";
import { FeasibilityBadge } from "./FeasibilityBadge";

export interface ConditionActions {
  select: (id: string, dimension: string) => void;
  confirm: (ids: string[]) => void;
  remove: (id: string) => void;
  setStrength: (condition: IntentConditionV2, strength: "required" | "preferred") => void;
  replace: (oldId: string, newId: string, dimension: string) => void;
}

/** 선택된 조건 하나. 출처가 확정(실선·채움)과 미확정(점선)으로 눈에 띄게 다르다. */
function ConditionChip({ condition, labels, actions }: { condition: IntentConditionV2; labels: Labels; actions: ConditionActions }) {
  const meta = ORIGIN_META[condition.origin];
  const confirmed = isConfirmed(condition.origin);
  const label = labelOf(labels, condition.id);
  const quote = condition.evidence[0]?.quote;
  return (
    <span className="tk-chip tk-chip--context cw-cond" data-origin={condition.origin} title={quote ? `${meta.hint}. 문장: “${quote}”` : meta.hint}>
      <Icon name={confirmed ? "circle-check" : condition.origin === "ai_inferred" ? "sparkles" : "pen-tool"} />
      <span>{label}</span>
      <span className="cw-cond__origin">{meta.label}</span>
      <FeasibilityBadge result={labels.feasibility.get(condition.id)} />
      {confirmed
        ? <button type="button" className="cw-cond__action" aria-pressed={condition.strength === "required"} aria-label={`${label} 필수 조건`} onClick={() => actions.setStrength(condition, condition.strength === "required" ? "preferred" : "required")}>{condition.strength === "required" ? "필수" : "선호"}</button>
        : <button type="button" className="cw-cond__action" aria-label={`${label} 확정`} onClick={() => actions.confirm([condition.id])}>확정</button>}
      <IconButton size="xs" aria-label={`${label} 빼기`} onClick={() => actions.remove(condition.id)}><Icon name="x" /></IconButton>
    </span>
  );
}

function DimensionRow({ dimension, label, hint, intent, labels, actions, openByDefault }: {
  dimension: string; label: string; hint: string; intent: IntentSpecV2 | undefined; labels: Labels; actions: ConditionActions; openByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!!openByDefault);
  const selected = conditionsOf(intent, dimension);
  const entries = labels.entriesByDimension.get(dimension) ?? [];
  const byId = new Map(selected.map((c) => [c.id, c]));
  return (
    <div className="cw-dim" data-dimension={dimension}>
      <div className="cw-dim__head">
        <strong>{label}</strong>
        <span className="cw-dim__hint">{hint}</span>
        <Button size="xs" aria-expanded={open} aria-label={`${label} ${open ? "목록 닫기" : "고르기"}`} onClick={() => setOpen((v) => !v)}>{open ? "닫기" : selected.length ? "더 고르기" : "고르기"}</Button>
      </div>
      {selected.length > 0
        ? <div className="cw-dim__selected">{selected.map((c) => <ConditionChip key={c.id} condition={c} labels={labels} actions={actions} />)}</div>
        : <p className="cw-dim__empty">고르지 않으면 AI가 내용에 맞게 제안해요.</p>}
      {open && (
        <div className="tk-chips tk-chips--wrap cw-dim__options" role="group" aria-label={`${label} 선택지`}>
          {entries.map((e) => {
            const current = byId.get(e.id);
            const pressed = !!current && isConfirmed(current.origin);
            return (
              <button key={e.id} type="button" className="tk-chip" aria-pressed={pressed} data-origin={current?.origin}
                onClick={() => (pressed ? actions.remove(e.id) : actions.select(e.id, dimension))}>
                <span>{e.name}</span>
                <FeasibilityBadge result={labels.feasibility.get(e.id)} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 구조화 조건 선택. 시작 축 4개만 보이고 나머지 차원은 전문 설정에서 연다. 복수 선택이 가능하다. */
export function ConditionPicker({ intent, labels, actions }: { intent: IntentSpecV2 | undefined; labels: Labels; actions: ConditionActions }) {
  const unconfirmed = (intent?.conditions ?? []).filter((c) => !isConfirmed(c.origin));
  return (
    <div className="cw-picker">
      {STARTER_DIMENSIONS.map((d) => (
        <DimensionRow key={d.key} dimension={d.key} label={d.label} hint={d.hint} intent={intent} labels={labels} actions={actions} />
      ))}
      <div className="cw-legend" aria-label="출처 표시 안내">
        <span data-origin="user_confirmed"><Icon name="circle-check" />확정: 내가 정한 값</span>
        <span data-origin="user_free_text"><Icon name="pen-tool" />문장에서 읽음</span>
        <span data-origin="ai_inferred"><Icon name="sparkles" />AI 추론</span>
      </div>
      {unconfirmed.length > 0 && (
        <div className="cw-bulk" role="status">
          <span>확정하지 않은 값 {unconfirmed.length}개는 계획에 쓰이지 않아요.</span>
          <Button variant="primary" size="sm" onClick={() => actions.confirm(unconfirmed.map((c) => c.id))}>{`읽은 값 ${unconfirmed.length}개 모두 확정`}</Button>
        </div>
      )}
    </div>
  );
}

/** 전문 설정에서 쓰는 나머지 차원(C04~C12 등) 선택. */
export function ExtraDimensionPicker({ intent, labels, actions }: { intent: IntentSpecV2 | undefined; labels: Labels; actions: ConditionActions }) {
  const starters = new Set(STARTER_DIMENSIONS.map((d) => d.key));
  const rest = [...labels.dimensions.entries()].filter(([key]) => !starters.has(key) && key !== "C11");
  return (
    <div className="cw-picker">
      {rest.map(([key, name]) => (
        <DimensionRow key={key} dimension={key} label={name} hint="" intent={intent} labels={labels} actions={actions} />
      ))}
    </div>
  );
}
