import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { useShell } from "./ShellContext";

/** 각 화면(.tk-screen) 맨 위 헤더. 마크업은 디자인 시스템 examples/chat.html 의 .tk-header 그대로. */
export function PageHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  const { openDrawer } = useShell();
  return (
    <header className="tk-header">
      <div className="tk-header__inner">
        <button className="tk-icon-button tk-header__menu" type="button" aria-label="메뉴 열기" onClick={openDrawer}>
          <Icon name="menu" />
        </button>
        <div className="tk-header__title">
          <h1>{title}</h1>
          {meta && <p className="tk-header__meta">{meta}</p>}
        </div>
        {actions && <div className="tk-header__actions">{actions}</div>}
      </div>
    </header>
  );
}
