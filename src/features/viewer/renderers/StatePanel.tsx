import type { ReactNode } from "react";
import { Icon, KIND_GLYPH } from "../../../ui/Icon";
import type { IconName } from "../../../ui/Icon";

export type PanelState = "pending" | "converting" | "failed" | "unsupported" | "blocked" | "offline" | "error";

/** docs/09 §4 미리보기 상태 패널. 어떤 상태에도 원본 다운로드 또는 왜 못 받는지가 있다. */
export function StatePanel({
  state, kind, title, children, actions, icon, spinner,
}: { state: PanelState; kind: string; title: string; children?: ReactNode; actions?: ReactNode; icon?: IconName; spinner?: boolean }) {
  const g = KIND_GLYPH[kind] ?? KIND_GLYPH.other;
  return (
    <div className="tk-viewer__state" data-state={state} role="status">
      <span className="tk-glyph" data-type={g.type}><Icon name={icon ?? g.icon} /></span>
      <p className="tk-viewer__state-title">{title}</p>
      {children}
      {spinner && <span className="tk-spinner" aria-hidden />}
      {actions && <div className="tk-button-group">{actions}</div>}
    </div>
  );
}

export function LoadingBody({ label }: { label: string }) {
  return (
    <div className="tk-viewer__state" data-state="converting" role="status" aria-busy="true">
      <span className="tk-spinner" aria-hidden />
      <p>{label}</p>
    </div>
  );
}

/** 오프라인·서버 오류를 구분해 다시 시도 행동을 준다. */
export function ErrorBody({ message, code, offline, onRetry, onDownload }: { message: string; code?: string; offline?: boolean; onRetry?: () => void; onDownload?: ReactNode }) {
  return (
    <StatePanel
      state={offline ? "offline" : "error"}
      kind="other"
      icon={offline ? "wifi-off" : "warning"}
      title={offline ? "오프라인이라 열 수 없어요" : "결과물을 불러오지 못했어요"}
      actions={<>{onRetry && <button className="tk-button" type="button" onClick={onRetry}><Icon name="retry" />다시 시도</button>}{onDownload}</>}
    >
      <p>{offline ? "연결이 돌아오면 다시 시도해 주세요. 받아 둔 사본은 없어요." : message}{code && <> <code>{code}</code></>}</p>
    </StatePanel>
  );
}
