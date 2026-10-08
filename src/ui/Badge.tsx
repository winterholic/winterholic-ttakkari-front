import type { ReactNode } from "react";

export type RunState = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";
type Tone = "info" | "success" | "warning" | "danger";

export function Badge({ tone, mono, children }: { tone?: Tone; mono?: boolean; children: ReactNode }) {
  const cls = ["tk-badge", tone && `tk-badge--${tone}`, mono && "tk-badge--mono"].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>;
}

/** 새 결과물 개수처럼 숫자만 있는 배지. 스크린 리더용 문장은 label 로 준다. */
export function CountBadge({ count, label, neutral }: { count: number; label: string; neutral?: boolean }) {
  return (
    <span className={neutral ? "tk-badge tk-badge--count tk-badge--neutral" : "tk-badge tk-badge--count"} aria-label={label}>
      {count}
    </span>
  );
}

/** 작업 6상태 배지(docs/08 §1). running 만 live 점이 붙는다. */
export function RunBadge({ state, children }: { state: RunState; children: ReactNode }) {
  return (
    <span className="tk-badge" data-state={state}>
      {state === "running" && <span className="tk-dot tk-dot--live" aria-hidden="true" />}
      {children}
    </span>
  );
}
