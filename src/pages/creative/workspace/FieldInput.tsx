import { useState } from "react";
import type { IntentFacetField } from "../../../api/creativeV2";
import { Button } from "../../../ui/Button";

/** 설정 하나의 입력. 단일·복수 선택은 칩, 숫자·글은 입력 칸이다. 답은 바로 서버에 보낸다. */
export function FieldInput({ field, values, recommended, disabled, onAnswer, labelOf }: {
  field: IntentFacetField;
  values: string[];
  recommended?: string | null;
  disabled?: boolean;
  onAnswer: (values: string[]) => void;
  labelOf: (value: string) => string;
}) {
  const [draft, setDraft] = useState(values.join(""));
  if (field.kind === "number" || field.kind === "text") {
    return (
      <form className="cw-field-free" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) onAnswer([draft.trim()]); }}>
        <input className="tk-input" aria-label={field.label} inputMode={field.kind === "number" ? "numeric" : undefined} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={disabled} />
        <Button type="submit" size="sm" disabled={disabled || !draft.trim()}>적용</Button>
      </form>
    );
  }
  const multi = field.kind === "multi";
  return (
    <div className="tk-chips tk-chips--wrap" role="group" aria-label={field.label}>
      {field.options.map((o) => {
        const pressed = values.includes(o.id);
        return (
          <button key={o.id} type="button" className="tk-chip" aria-pressed={pressed} data-recommended={recommended === o.id || undefined} disabled={disabled}
            onClick={() => {
              if (!multi) return onAnswer([o.id]);
              const next = pressed ? values.filter((v) => v !== o.id) : [...values, o.id];
              if (next.length) onAnswer(next);
            }}>
            <span>{labelOf(o.id)}</span>
          </button>
        );
      })}
    </div>
  );
}
