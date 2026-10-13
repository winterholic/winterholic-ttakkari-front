import { Component } from "react";
import type { ReactNode } from "react";
import { Icon } from "../../ui/Icon";

interface State {
  error: Error | null;
  key: number;
}

/**
 * 판에서 난 오류는 판만 대신 보여 준다. 입력창·대화 패널·사이드바는 그대로 쓸 수 있어야 한다.
 * "다시 그리기"는 판을 처음 상태로 새로 만든다(이동·확대 상태도 초기화).
 */
export class CanvasBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  render() {
    if (this.state.error)
      return (
        <div className="tk-empty tcanvas__crash" role="alert">
          <Icon name="warning" />
          <p className="tk-empty__title">판을 그리다 멈췄어요</p>
          <p className="tk-body-sm tk-text-tertiary">{this.state.error.message}</p>
          <button className="tk-button tk-button--sm" type="button" onClick={() => this.setState((s) => ({ error: null, key: s.key + 1 }))}>
            <Icon name="retry" />
            다시 그리기
          </button>
        </div>
      );
    return <div key={this.state.key} className="tcanvas__boundary">{this.props.children}</div>;
  }
}
