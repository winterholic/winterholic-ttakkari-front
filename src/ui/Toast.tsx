import { dismissToast, useToasts } from "./toastStore";
import type { ToastTone } from "./toastStore";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

const TONE_ICON: Partial<Record<ToastTone, IconName>> = { success: "check", danger: "circle-x", warning: "warning" };

/** role=status 영역은 항상 DOM 에 있어야 새 토스트가 스크린 리더에 읽힌다. 셸 루트(.tk-app) 안에 한 번 둔다. */
export function ToastRegion() {
  const toasts = useToasts();
  return (
    <div className="tk-toast-region" role="status" aria-live="polite">
      {toasts.map((t) => {
        const icon = TONE_ICON[t.tone];
        return (
          <div key={t.id} className={t.tone === "neutral" ? "tk-toast" : `tk-toast tk-toast--${t.tone}`} data-leaving={t.leaving ? "" : undefined}>
            {icon && <Icon name={icon} />}
            <span className="tk-toast__text">{t.message}</span>
            {t.action && (
              <button
                className="tk-toast__action"
                type="button"
                onClick={() => {
                  t.action?.onClick?.();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
