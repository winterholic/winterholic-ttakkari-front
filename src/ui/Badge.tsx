import type { ReactNode } from "react";

/** 글자(문자열)는 <span> 으로 감싼다. 감싼 글자만 배지 폭 안에서 말줄임이 된다(docs/22 A5). 아이콘·점 같은 요소는 그대로 둔다. */
const label = (children: ReactNode) => (typeof children === "string" || typeof children === "number" ? <span>{children}</span> : children);

export type RunState = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";
type Tone = "info" | "success" | "warning" | "danger";

export function Badge({ tone, mono, children }: { tone?: Tone; mono?: boolean; children: ReactNode }) {
  const cls = ["tk-badge", tone && `tk-badge--${tone}`, mono && "tk-badge--mono"].filter(Boolean).join(" ");
  return <span className={cls}>{label(children)}</span>;
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
      {label(children)}
    </span>
  );
}
