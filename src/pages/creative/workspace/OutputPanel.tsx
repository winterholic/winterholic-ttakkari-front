import { useState } from "react";
import type { IntentLength, IntentSpecV2 } from "../../../api/creativeV2";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { ASPECT_LABEL, ORIGIN_META, durationLabel, isConfirmed } from "./intentModel";

type Mode = "auto" | "target" | "strict";
const MODES: Array<{ id: Mode; label: string; help: string }> = [
  { id: "auto", label: "자동", help: "내용의 양에 맞춰 AI가 길이를 정해요." },
  { id: "target", label: "희망", help: "원하는 길이에 가깝게 맞추고, 차이가 나면 알려요." },
  { id: "strict", label: "엄격", help: "정확히 맞추고, 못 맞추면 숨기지 않고 알려요." },
];
const ASPECTS = ["16:9", "9:16", "1:1"] as const;

const LENGTH_STATUS: Record<IntentLength["status"], { text: string; tone?: "info" | "success" | "warning" | "danger" }> = {
  auto: { text: "자동 결정", tone: "info" },
  target_met: { text: "희망에 맞음", tone: "success" },
  deviated: { text: "희망과 차이", tone: "warning" },
  strict_met: { text: "지정 길이 충족", tone: "success" },
  conflict: { text: "길이 맞추기 어려움", tone: "danger" },
  needs_content: { text: "내용을 정한 뒤 판정" },
  blocked_by_conflict: { text: "충돌 해결 뒤 판정", tone: "warning" },
};

/** 길이 정책(자동·희망·엄격)과 화면 비율을 한 곳에서 정한다. 30/60/120/240 같은 고정 템플릿은 없다. */
export function OutputPanel({ intent, length, disabled, onDuration, onAspect }: {
  intent: IntentSpecV2;
  length: IntentLength;
  disabled: boolean;
  onDuration: (mode: Mode, seconds: number | null) => void;
  onAspect: (aspect: (typeof ASPECTS)[number]) => void;
}) {
  const policy = intent.duration;
  const [mode, setMode] = useState<Mode>(policy?.mode ?? "auto");
  const [seconds, setSeconds] = useState(policy?.seconds != null ? String(policy.seconds) : "");
  const parsed = Number(seconds);
  const secondsValid = seconds.trim() !== "" && Number.isFinite(parsed) && parsed >= 1 && parsed <= 900;
  const canApply = mode === "auto" || secondsValid;
  const status = LENGTH_STATUS[length.status];
  const origin = policy && policy.mode !== "auto" ? policy.origin : null;
  const aspect = intent.aspect;
  return (
    <section className="tk-card cw-output" aria-labelledby="cw-output-title">
      <h3 id="cw-output-title">길이와 화면 비율</h3>
      <div className="cw-output__row">
        <div className="tk-field">
          <span id="cw-duration-mode">길이 정책</span>
          <div className="tk-segmented" role="radiogroup" aria-labelledby="cw-duration-mode">
            {MODES.map((m) => (
              <label key={m.id}><input type="radio" name="cw-duration-mode" checked={mode === m.id} disabled={disabled} onChange={() => setMode(m.id)} /><span>{m.label}</span></label>
            ))}
          </div>
          <p className="cw-hint">{MODES.find((m) => m.id === mode)?.help}</p>
        </div>
        {mode !== "auto" && (
          <label className="tk-field cw-output__seconds">원하는 길이(초)
            <input className="tk-input" inputMode="numeric" value={seconds} disabled={disabled} aria-invalid={seconds !== "" && !secondsValid ? true : undefined}
              onChange={(e) => setSeconds(e.target.value)} placeholder="예: 150" />
            <span className="cw-hint">1초부터 900초(15분)까지. {secondsValid ? `약 ${Math.floor(parsed / 60)}분 ${Math.round(parsed % 60)}초` : ""}</span>
          </label>
        )}
        <Button variant="primary" size="sm" disabled={disabled || !canApply} onClick={() => onDuration(mode, mode === "auto" ? null : parsed)}>길이 적용</Button>
      </div>
      <p className="cw-output__now">
        {intent.duration === null
          ? <><strong>길이</strong> 충돌을 해결하면 정해져요.</>
          : <><strong>지금 길이</strong> {durationLabel(policy)}{" "}</>}
        {origin && (isConfirmed(origin)
          ? <Badge tone="success">확정</Badge>
          : <><Badge tone="info">{ORIGIN_META[origin].label}</Badge>{" "}
              <Button size="xs" disabled={disabled} aria-label="읽은 길이 확정" onClick={() => onDuration(policy!.mode, policy!.seconds)}>확정</Button></>)}
        {" "}<Badge tone={status.tone}>{status.text}</Badge>
      </p>
      {length.status === "conflict" && length.alternatives.length > 0 && (
        <ul className="cw-output__alts" aria-label="길이 조정안">
          {length.alternatives.map((a, i) => <li key={i}><strong>{String(a.label ?? "")}</strong> {String(a.detail ?? "")}</li>)}
        </ul>
      )}
      <div className="tk-field">
        <span id="cw-aspect-label">화면 비율</span>
        <div className="tk-segmented" role="radiogroup" aria-labelledby="cw-aspect-label">
          {ASPECTS.map((a) => (
            <label key={a}><input type="radio" name="cw-aspect" checked={aspect?.value === a} disabled={disabled} onChange={() => onAspect(a)} /><span>{ASPECT_LABEL[a]}</span></label>
          ))}
        </div>
        <p className="cw-hint">
          {aspect === null
            ? (intent.conflicts.some((c) => c.id === "conflict.aspect" && c.status === "open") ? "비율 충돌을 해결하면 정해져요." : "고르지 않으면 AI가 내용에 맞게 제안해요.")
            : isConfirmed(aspect.origin)
              ? "확정"
              : <>{ORIGIN_META[aspect.origin].label}: {" "}<Button size="xs" disabled={disabled} aria-label="읽은 비율 확정" onClick={() => onAspect(aspect.value)}>확정</Button></>}
        </p>
      </div>
    </section>
  );
}
