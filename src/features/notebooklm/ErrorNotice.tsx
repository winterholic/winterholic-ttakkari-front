import { useMemo, useState } from "react";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/Icon";
import { describeError, formatRemaining } from "./labels";
import type { ErrorKind } from "./labels";
import { useCountdown } from "./queries";

const VISUAL: Record<ErrorKind, { icon: IconName; tone: "warning" | "caution" | "note" }> = {
  network: { icon: "wifi-off", tone: "caution" },
  cooldown: { icon: "clock", tone: "warning" },
  too_soon: { icon: "clock", tone: "note" },
  auth: { icon: "key", tone: "warning" },
  blocked: { icon: "shield-alert", tone: "caution" },
  disabled: { icon: "ban", tone: "note" },
  unknown_outcome: { icon: "warning", tone: "warning" },
  too_large: { icon: "warning", tone: "warning" },
  upstream: { icon: "caution", tone: "caution" },
  integration: { icon: "caution", tone: "warning" },
  other: { icon: "caution", tone: "caution" },
};

/** 429 쿨다운·재인증·보안 신호·네트워크·결과 불명을 각각 다른 문장과 아이콘으로 낸다. */
export function ErrorNotice({ error, onRetry, retryLabel = "다시 시도" }: { error: unknown; onRetry?: () => void; retryLabel?: string }) {
  const d = useMemo(() => describeError(error), [error]);
  const v = VISUAL[d.kind];
  // 끝나는 시각은 처음 그릴 때 한 번만 정한다. 렌더마다 새로 잡으면 남은 시간이 줄지 않는다.
  const [until] = useState(() => (d.retryAfter ? new Date(Date.now() + d.retryAfter * 1000).toISOString() : null));
  const left = useCountdown(until);
  // 쿨다운 중에는 다시 시도를 막는다. 눌러도 백엔드가 Google 에 보내지 않고 429 만 돌려준다.
  const waiting = (d.kind === "cooldown" || d.kind === "too_soon") && left !== null && left > 0;
  return (
    <aside className={`tk-callout tk-callout--${v.tone} nlm-notice`} role="alert" data-kind={d.kind}>
      <Icon name={v.icon} className="tk-callout__icon" />
      <div className="tk-callout__body">
        <strong className="tk-callout__title">{d.title}</strong>
        {d.detail && <p>{d.detail}</p>}
        {d.cause && <p className="tk-mono">원인: {d.cause}</p>}
        {waiting && <p>남은 시간 <strong>{formatRemaining(left)}</strong></p>}
        {onRetry && <Button size="sm" variant="ghost" disabled={waiting} onClick={onRetry}>{retryLabel}</Button>}
      </div>
    </aside>
  );
}
