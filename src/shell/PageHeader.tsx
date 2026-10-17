import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { ConnectionBanner } from "./ConnectionBanner";
import { useShell } from "./ShellContext";

/**
 * 각 화면(.tk-screen) 맨 위 헤더. 마크업은 디자인 시스템 examples/chat.html 의 .tk-header 그대로.
 * 앱 전체 상태 띠(오프라인·Mac Studio 끊김)는 헤더 바로 아래에 붙는다(docs/06 §23).
 * 제목·메타는 한 줄 말줄임이라 잘렸을 때 전체를 볼 방법(title)을 붙인다(docs/22 A7).
 */
export function PageHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  const { openDrawer } = useShell();
  const metaRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = metaRef.current;
    if (el) el.title = el.textContent ?? "";
  });
  return (
    <>
      <header className="tk-header">
        <div className="tk-header__inner">
          <button className="tk-icon-button tk-header__menu" type="button" aria-label="메뉴 열기" aria-haspopup="dialog" aria-controls="nav-drawer" onClick={openDrawer}>
            <Icon name="menu" />
          </button>
          <div className="tk-header__title">
            <h1 title={title}>{title}</h1>
            {meta && <p className="tk-header__meta" ref={metaRef}>{meta}</p>}
          </div>
          {actions && <div className="tk-header__actions">{actions}</div>}
        </div>
      </header>
      <ConnectionBanner />
    </>
  );
}
