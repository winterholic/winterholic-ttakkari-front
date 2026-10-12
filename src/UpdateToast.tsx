import { useSyncExternalStore } from "react";
import { applyUpdate, isUpdateReady, subscribeUpdate } from "./pwaUpdate";
import { Icon } from "./ui/Icon";
import "./recovery.css";

/** 새 버전이 준비됐는데 입력 중이라 자동으로 다시 읽지 못할 때 남는 안내. 누르면 바로 적용한다. */
export function UpdateToast() {
  const ready = useSyncExternalStore(subscribeUpdate, isUpdateReady, () => false);
  if (!ready) return null;
  return (
    <div className="tk-toast-region tk-update-region">
      <div className="tk-toast" role="status" data-update-banner="">
        <Icon name="retry" />
        <span className="tk-toast__text">새 버전이 준비됐어요. 적용하면 화면을 다시 읽어요.</span>
        <button className="tk-toast__action" type="button" onClick={applyUpdate}>지금 적용</button>
      </div>
    </div>
  );
}
