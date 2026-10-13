import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { useAuth } from "../auth";
import { PushSettingsDialog } from "../features/push/PushSettings";
import { UsageDialog } from "../features/accounts/UsageDialog";
import { IconButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";
import { useTheme } from "../ui/useTheme";
import { ToastRegion } from "../ui/Toast";
import "./shell.css";
import { ShellContext } from "./ShellContext";
import type { ShellApi } from "./ShellContext";
import { ActiveTasks } from "./ActiveTasks";
import { SidebarLinks, TabbarLinks } from "./ShellNav";
import { useShortcuts } from "./useShortcuts";
import { useConnection } from "./useConnection";
import { useKeyboardOpen } from "./useKeyboardOpen";
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
  const navigate = useNavigate();
  const { isDark, toggle } = useTheme();
  const [pushOpen, setPushOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const out = async () => {
    await logout();
    qc.clear();
  };
  return (
    <div className="app-shell-footer">
      <Menu
        label="사용자 메뉴"
        align="start"
        up
        className="app-user-menu"
        triggerClassName="app-user-menu__trigger"
        items={[
          { label: "사용량", icon: "gauge", onSelect: () => setUsageOpen(true) },
          { label: "서버 리소스", icon: "server", onSelect: () => navigate("/resources") },
          { label: "비서 관리", icon: "tip", onSelect: () => navigate("/assistant") },
          { label: "계정 관리", icon: "key", onSelect: () => navigate("/settings#accounts") },
          { label: "설정", icon: "settings", onSelect: () => navigate("/settings") },
          { label: "알림", icon: "important", onSelect: () => setPushOpen(true) },
          { label: "다크 모드", icon: "moon", checked: isDark, onSelect: toggle },
          { label: "로그아웃", icon: "logout", onSelect: () => void out(), separatorBefore: true },
        ]}
      >
        <span className="tk-avatar tk-avatar--sm" aria-hidden>W</span>
        <span className="app-user-menu__body">
          <span className="app-user-menu__name">winterholic</span>
          <Presence c={connection} />
        </span>
        <Icon name="chevron-up" />
      </Menu>
      {pushOpen && <PushSettingsDialog open onClose={() => setPushOpen(false)} />}
      {usageOpen && <UsageDialog open onClose={() => setUsageOpen(false)} />}
    </div>
  );
}

export function AppShell() {
  const { state } = useAuth();
  const { sessionId } = useParams();
  const location = useLocation();
  const isHome = location.pathname === "/chat" || location.pathname === "/work";
  const connection = useConnection(state === "in");
  useShortcuts();
  useKeyboardOpen();
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
          </div>
          <nav className="tk-sidebar" aria-label="영역과 진행 중인 일">
            <SidebarLinks />
            {/* 캔버스 홈은 판 자체가 트리라 사이드바 트리를 숨긴다 */}
            {!isHome && <ActiveTasks currentId={sessionId} />}
          </nav>
          <SidebarFooter connection={connection} />
        </aside>

        <main className="tk-app__main" id="main" tabIndex={-1}>
          <Outlet />
        </main>

        <nav className="tk-tabbar" aria-label="영역">
          <TabbarLinks />
        </nav>

        <Dialog kind="drawer" id="nav-drawer" label="진행 중인 일" open={drawerOpen} onClose={() => setDrawerKey(null)}>
          <div className="tk-drawer__header">
            <Link className="tk-header__brand" to="/chat">
              {BRAND}
            </Link>
            <IconButton aria-label="닫기" onClick={() => setDrawerKey(null)}>
              <Icon name="x" />
            </IconButton>
          </div>
          <div className="tk-drawer__body">
            <nav className="tk-sidebar" aria-label="진행 중인 일">
              <ActiveTasks currentId={sessionId} />
            </nav>
          </div>
          <SidebarFooter connection={connection} />
        </Dialog>
        <ToastRegion />
      </div>
    </ShellContext.Provider>
  );
}
