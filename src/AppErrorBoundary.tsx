import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { applyUpdate, isStaleChunkError } from "./pwaUpdate";
import { Icon } from "./ui/Icon";
import "./recovery.css";
import { Art } from "./ui/Art";

interface State {
  error: Error | null;
}

/**
 * 앱 맨 바깥 안전망. 이게 없으면 렌더 예외 하나에 React 가 루트를 통째로 비워 빈 화면만 남고,
 * 홈 화면 앱(standalone)에는 새로고침 버튼도 없어 앱을 강제로 닫는 수밖에 없었다.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("앱 렌더링 실패", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isStaleChunkError(error);
    return (
      <main className="tk-app-crash">
        <div className="tk-empty tk-empty--boxed" role="alert" data-app-error="">
          <Art name={stale ? "state-update-available" : "state-error"} />
          <p className="tk-empty__title">{stale ? "새 버전으로 바뀌어 다시 읽어야 해요" : "화면을 그리다 멈췄어요"}</p>
          <p>{stale ? "앱이 업데이트되는 사이에 이 화면을 열었어요." : "다시 읽으면 대부분 돌아와요."} <code>{error.message.slice(0, 200)}</code></p>
          <div className="tk-button-group">
            <button className="tk-button tk-button--primary" type="button" onClick={applyUpdate}><Icon name="retry" />다시 읽기</button>
            <a className="tk-button" href="/chat">채팅으로</a>
          </div>
        </div>
      </main>
    );
  }
}
