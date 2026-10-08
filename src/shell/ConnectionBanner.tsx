import { Icon } from "../ui/Icon";
import { useShell } from "./ShellContext";

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 앱 전체 상태 하나만, 헤더 바로 아래 전폭 띠(docs/06 §23, docs/10 §4). 내 기기 오프라인이 Mac Studio 끊김보다 먼저다. */
export function ConnectionBanner() {
  const { connection: c } = useShell();
  if (!c.online) {
    return (
      <p className="tk-banner tk-banner--neutral" role="status">
        <Icon name="wifi-off" />
        <span className="tk-banner__text">
          <strong>오프라인</strong> · 받아 둔 결과물만 열려요. 연결되면 다시 시도할 수 있어요.
        </span>
      </p>
    );
  }
  if (c.mac === "offline") {
    return (
      <p className="tk-banner tk-banner--danger" role="status">
        <Icon name="hard-drive" />
        <span className="tk-banner__text">
          <strong>Mac Studio 연결 끊김</strong> · 응답이 없어요{c.lastOkAt ? `(마지막 응답 ${hhmm(c.lastOkAt)})` : ""}.
        </span>
      </p>
    );
  }
  return null;
}
