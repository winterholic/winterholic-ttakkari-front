import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { ConnectionBanner } from "./ConnectionBanner";
import { useShell } from "./ShellContext";

/**
 * 각 화면(.tk-screen) 맨 위 헤더. 마크업은 디자인 시스템 examples/chat.html 의 .tk-header 그대로.
 * 앱 전체 상태 띠(오프라인·Mac Studio 끊김)는 헤더 바로 아래에 붙는다(docs/06 §23).
 */
export function PageHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  const { openDrawer } = useShell();
  return (
    <>
      <header className="tk-header">
        <div className="tk-header__inner">
          <button className="tk-icon-button tk-header__menu" type="button" aria-label="세션 목록 열기" onClick={openDrawer}>
            <Icon name="menu" />
          </button>
          <div className="tk-header__title">
            <h1>{title}</h1>
            {meta && <p className="tk-header__meta">{meta}</p>}
          </div>
          {actions && <div className="tk-header__actions">{actions}</div>}
        </div>
      </header>
      <ConnectionBanner />
    </>
  );
}
