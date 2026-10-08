import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useParams } from "react-router";
import { useAuth } from "../auth";
import { IconButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { ThemeToggle } from "../ui/ThemeToggle";
import { ToastRegion } from "../ui/Toast";
import "./shell.css";
import { ShellContext } from "./ShellContext";
import type { ShellApi } from "./ShellContext";
import { SessionList } from "./SessionList";
import { AreaLinks } from "./ShellNav";
import { useConnection } from "./useConnection";
import type { ConnectionState } from "./ShellContext";

const BRAND = (
  <>
    <img src="/brand/logo-mark.svg" alt="" />
    <span>Ttakkari</span>
  </>
);

/** Mac Studio 연결 알약. 단어와 점이 같이 간다(docs/06 §23). */
function Presence({ c }: { c: ConnectionState }) {
  const [dot, text] = !c.online
    ? ["tk-dot--offline", "오프라인"]
    : c.mac === "online"
      ? ["tk-dot--online", "Mac Studio 연결됨"]
      : c.mac === "offline"
        ? ["tk-dot--offline", "Mac Studio 연결 끊김"]
        : ["tk-dot--connecting", "Mac Studio 확인 중"];
  return (
    <p className="tk-presence tk-presence--plain" role="status">
      <span className={`tk-dot ${dot}`} aria-hidden="true" />
      {text}
    </p>
  );
}

function SidebarFooter({ connection }: { connection: ConnectionState }) {
  const { logout } = useAuth();
  const qc = useQueryClient();
  const out = async () => {
    await logout();
    qc.clear();
  };
  return (
    <div className="app-shell-footer">
      <Presence c={connection} />
      <div className="app-shell-footer__actions">
        <ThemeToggle size="sm" />
        <IconButton size="sm" aria-label="로그아웃" onClick={() => void out()}>
          <Icon name="logout" />
        </IconButton>
      </div>
    </div>
  );
}

export function AppShell() {
  const { state } = useAuth();
  const { sessionId } = useParams();
  const location = useLocation();
  const connection = useConnection(state === "in");
  // 작업 공간 링크가 마지막으로 본 세션으로 가도록, 세션이 있는 화면에서 id 를 기억한다.
  const [lastSession, setLastSession] = useState<string | undefined>(sessionId);
  if (sessionId && sessionId !== lastSession) setLastSession(sessionId);
  const currentSession = sessionId ?? lastSession;

  // 드로어는 연 시점의 location.key 를 기억한다. 라우트가 바뀌면 key 가 달라져 저절로 닫힌다.
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const drawerOpen = drawerKey === location.key;
  const openDrawer = useCallback(() => setDrawerKey(location.key), [location.key]);

  const api = useMemo<ShellApi>(() => ({ openDrawer, connection }), [openDrawer, connection]);

  if (state === "out") return <Navigate to="/login" replace />;
  if (state === "loading") {
    return (
      <div className="tk-app">
        <main className="tk-app__main" id="main" tabIndex={-1} aria-busy="true">
          <p className="tk-status tk-status--agent" role="status">
            <span className="tk-spinner tk-spinner--sm" aria-hidden="true" />
            불러오는 중
          </p>
        </main>
      </div>
    );
  }

  return (
    <ShellContext.Provider value={api}>
      <a className="tk-skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <div className="tk-app">
        <aside className="tk-app__sidebar" aria-label="탐색">
          <div className="tk-app__brand">
            <Link className="tk-header__brand" to="/chat">
              {BRAND}
            </Link>
            <Link className="tk-icon-button tk-icon-button--sm" to="/chat" aria-label="새 세션">
              <Icon name="new-chat" />
            </Link>
          </div>
          <nav className="tk-sidebar" aria-label="영역과 세션">
            <div className="tk-nav">
              <AreaLinks sessionId={currentSession} variant="nav" />
            </div>
            <SessionList currentId={sessionId} />
          </nav>
          <SidebarFooter connection={connection} />
        </aside>

        <main className="tk-app__main" id="main" tabIndex={-1}>
          <Outlet />
        </main>

        <nav className="tk-tabbar" aria-label="영역">
          <AreaLinks sessionId={currentSession} variant="tabbar" />
        </nav>

        <Dialog kind="drawer" id="nav-drawer" label="세션 목록" open={drawerOpen} onClose={() => setDrawerKey(null)}>
          <div className="tk-drawer__header">
            <Link className="tk-header__brand" to="/chat">
              {BRAND}
            </Link>
            <IconButton aria-label="닫기" onClick={() => setDrawerKey(null)}>
              <Icon name="x" />
            </IconButton>
          </div>
          <div className="tk-drawer__body">
            <nav className="tk-sidebar" aria-label="세션">
              <Link className="tk-button tk-button--block" to="/chat">
                <Icon name="new-chat" />
                새 세션
              </Link>
              <SessionList currentId={sessionId} />
            </nav>
          </div>
          <SidebarFooter connection={connection} />
        </Dialog>
        <ToastRegion />
      </div>
    </ShellContext.Provider>
  );
}
