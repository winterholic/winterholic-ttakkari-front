import { useState } from "react";
import { Button, IconButton } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { PUSH_MESSAGE } from "./pushState";
import { usePush } from "./usePush";

/** 사이드바·드로어 하단의 알림 버튼과 설정 다이얼로그. 스위치는 즉시 반영한다(docs/06 §5). */
export function PushSettings() {
  const [open, setOpen] = useState(false);
  const { state, busy, error, enable, disable, test } = usePush();
  const toggleable = state === "off" || state === "on";

  return (
    <>
      <IconButton size="sm" aria-label="알림 설정" aria-pressed={state === "on"} onClick={() => setOpen(true)}>
        <Icon name="important" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm" title="알림" id="push-settings">
        <div className="tk-choices">
          <label className="tk-switch tk-switch--row">
            <input
              type="checkbox"
              role="switch"
              checked={state === "on"}
              disabled={!toggleable || busy}
              onChange={() => void (state === "on" ? disable() : enable())}
            />
            작업 끝나면 알림
          </label>
          <p className="tk-fieldset__help" data-testid="push-message">
            {PUSH_MESSAGE[state]}
          </p>
          {error && (
            <p className="tk-status tk-status--danger" role="alert">
              {error}
            </p>
          )}
          <Button
            disabled={state !== "on" || busy}
            onClick={() =>
              void test().then((ok) =>
                toast(ok ? { message: "테스트 알림을 보냈습니다.", tone: "success" } : { message: "알림을 보내지 못했습니다.", tone: "danger" }),
              )
            }
          >
            테스트 알림
          </Button>
        </div>
      </Dialog>
    </>
  );
}
