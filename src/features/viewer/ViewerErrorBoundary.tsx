import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Icon } from "../../ui/Icon";

interface Props {
  children: ReactNode;
  onClose: () => void;
  /** 바뀌면(다른 결과물을 열면) 오류 상태를 버린다. */
  resetKey?: string | null;
  /** 뷰어 전체를 감쌀 때. 툴바까지 사라졌으니 닫기 버튼이 있는 툴바를 대신 그린다. */
  withToolbar?: boolean;
}
interface State {
  error: Error | null;
  key?: string | null;
}

/** 렌더러가 던져도 화면이 하얗게 멈추지 않고 닫기·다시 시도가 남게 한다. */
export class ViewerErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("뷰어 렌더링 실패", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const body = (
      <div className="tk-empty tk-empty--boxed" role="alert" data-viewer-error="">
        <Icon name="warning" />
        <p className="tk-empty__title">이 결과물을 화면에 그리지 못했어요</p>
        <p>원본 다운로드는 그대로 쓸 수 있어요. <code>{error.message.slice(0, 200)}</code></p>
        <div className="tk-button-group">
          <button className="tk-button" type="button" onClick={() => this.setState({ error: null })}><Icon name="retry" />다시 시도</button>
          <button className="tk-button tk-button--primary" type="button" onClick={this.props.onClose}>닫기</button>
        </div>
      </div>
    );
    if (!this.props.withToolbar) return <div className="tk-viewer-error">{body}</div>;
    return (
      <section className="tk-viewer" aria-label="결과물 미리보기 오류">
        <div className="tk-viewer__toolbar">
          <button className="tk-icon-button" type="button" aria-label="목록으로" onClick={this.props.onClose}><Icon name="back" /></button>
        </div>
        <div className="tk-viewer__body tk-viewer-error">{body}</div>
      </section>
    );
  }
}
