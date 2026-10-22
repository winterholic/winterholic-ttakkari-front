import { useId } from "react";
import type { Choice, DurationState, Strictness } from "./duration";
import { MAX_SECONDS, PRESETS, YOUTUBE_SHORTS_CAP, formatSeconds, parseCustom, toRequest } from "./duration";

const STRICT_OPTIONS: Array<{ id: Strictness; label: string; hint: string }> = [
  {
    id: "soft",
    label: "가깝게 맞추기",
    hint: "희망 시간이에요. 정확한 길이를 보장하지 않고, 내용을 깎거나 채우지 않는 범위에서 가깝게 맞춰요.",
  },
  { id: "exact", label: "정확히", hint: "정확한 길이로 요청해요. 내용과 맞지 않으면 억지로 맞추지 않고 대안을 보여드려요." },
  { id: "cap", label: "넘지 않게(상한)", hint: "이 길이를 넘지 않게 해요. 플랫폼 규정이나 요청서 같은 근거가 필요해요." },
];

export interface DurationPickerProps {
  value: DurationState;
  onChange: (next: DurationState) => void;
  /** 이 화면이 만들 수 있는 최대 길이(초). 기본 900초(15분). */
  max?: number;
  /** 화면이 만들 수 없는 길이를 고르면 안내할 문장 */
  maxHint?: string;
  idPrefix?: string;
  /** 희망 길이(soft)만 받는 화면. 정확한 길이와 상한은 숨기고 안내만 남긴다. */
  softOnly?: boolean;
}

export function DurationPicker({ value, onChange, max = MAX_SECONDS, maxHint, idPrefix, softOnly }: DurationPickerProps) {
  const autoId = useId();
  const id = idPrefix ?? autoId;
  const customError = value.choice === "custom" ? parseCustom(value.custom, max).error : null;
  const strictHint = STRICT_OPTIONS.find((o) => o.id === value.strictness)?.hint ?? "";
  const resolved = toRequest(value, "0000-00-00", max);
  const set = (patch: Partial<DurationState>) => onChange({ ...value, ...patch });
  const choose = (choice: Choice) => set({ choice });
  const chips: Array<{ choice: Choice; label: string; disabled: boolean }> = [
    { choice: "auto", label: "자동", disabled: false },
    ...PRESETS.map((s) => ({ choice: String(s) as Choice, label: formatSeconds(s), disabled: s > max })),
    { choice: "custom", label: "직접 입력", disabled: false },
  ];
  return (
    <fieldset className="creative-duration">
      <legend>목표 길이</legend>
      <div className="creative-duration__chips" role="radiogroup" aria-label="목표 길이">
        {chips.map((chip) => (
          <button
            key={chip.choice}
            type="button"
            role="radio"
            aria-checked={value.choice === chip.choice}
            aria-disabled={chip.disabled || undefined}
            className="creative-chip"
            title={chip.disabled ? (maxHint ?? `이 화면에서는 ${formatSeconds(max)}까지 만들 수 있어요.`) : undefined}
            onClick={() => !chip.disabled && choose(chip.choice)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {value.choice === "auto" ? (
        <p className="creative-hint">AI가 내용에 필요한 길이를 정해요. 계획을 만든 뒤 예상 길이와 이유를 보여드려요.</p>
      ) : (
        <>
          {value.choice === "custom" && (
            <label className="creative-field" htmlFor={`${id}-custom`}>
              직접 입력 (초, 1~{MAX_SECONDS})
              <input
                id={`${id}-custom`}
                className="tk-input"
                inputMode="decimal"
                value={value.custom}
                onChange={(e) => set({ custom: e.target.value })}
                aria-invalid={customError ? true : undefined}
                aria-describedby={customError ? `${id}-custom-error` : undefined}
                placeholder="예: 45"
              />
              {customError && value.custom.trim() !== "" && (
                <span id={`${id}-custom-error`} className="tk-error" role="alert">
                  {customError}
                </span>
              )}
              {!customError && <span className="creative-hint">{formatSeconds(parseCustom(value.custom, max).seconds ?? 0)}</span>}
            </label>
          )}
          {softOnly ? (
            <p className="creative-hint">
              이 화면은 희망 길이로만 만들어요. 정확한 길이나 플랫폼 상한은 제작 계획에서 지정할 수 있어요.
            </p>
          ) : (
          <div className="creative-duration__strict" role="radiogroup" aria-label="맞춤 방식">
            {STRICT_OPTIONS.map((o) => (
              <label key={o.id} className="creative-radio">
                <input
                  type="radio"
                  name={`${id}-strict`}
                  checked={value.strictness === o.id}
                  onChange={() => set({ strictness: o.id })}
                />
                {o.label}
              </label>
            ))}
          </div>
          )}
          {!softOnly && <p className="creative-hint">{strictHint}</p>}
          {!softOnly && value.strictness === "cap" && (
            <div className="creative-duration__cap">
              <label className="creative-radio">
                <input
                  type="radio"
                  name={`${id}-cap`}
                  checked={value.capKind === "youtube_shorts"}
                  onChange={() => set({ capKind: "youtube_shorts" })}
                />
                YouTube Shorts 상한 {formatSeconds(YOUTUBE_SHORTS_CAP)} (YouTube 도움말 기준, 2026-10-22 확인)
              </label>
              <label className="creative-radio">
                <input
                  type="radio"
                  name={`${id}-cap`}
                  checked={value.capKind === "custom"}
                  onChange={() => set({ capKind: "custom" })}
                />
                직접 지정한 상한
              </label>
              {value.capKind === "custom" && (
                <label className="creative-field" htmlFor={`${id}-cap-source`}>
                  상한 근거
                  <input
                    id={`${id}-cap-source`}
                    className="tk-input"
                    value={value.capSource}
                    maxLength={300}
                    onChange={(e) => set({ capSource: e.target.value })}
                    placeholder="예: 클라이언트 요청서, 방송 규정"
                  />
                </label>
              )}
            </div>
          )}
        </>
      )}
      {resolved.error && value.choice !== "custom" && (
        <p className="tk-error" role="alert">
          {resolved.error}
        </p>
      )}
    </fieldset>
  );
}
