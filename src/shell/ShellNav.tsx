import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { FEATURES, featureAt } from "./features";

/** 개인·회사는 필터가 아니라 각각의 대화 홈이다. 메뉴에서 목적지를 고른다. */
export function ConversationLinks() {
  const { pathname } = useLocation();
  return (
    <div className="app-conversation-spaces" role="group" aria-label="대화 공간">
      <p className="app-nav__label">대화 공간</p>
      {([
        { to: "/chat", label: "개인 대화", icon: "chat" },
        { to: "/work", label: "회사 대화", icon: "briefcase" },
      ] as const).map(({ to, label, icon }) => (
        <Link key={to} className="tk-nav__link" to={to}
          aria-current={pathname === to ? "page" : pathname.startsWith(`${to}/`) ? "location" : undefined}>
          <Icon name={icon} />
          {label}
        </Link>
      ))}
    </div>
  );
}

/**
 * 데스크톱 사이드바: 개인·회사 대화, 작업, 부가 기능. 관리 화면을 제외한 기능을 FEATURES에 모은다.
 * 부가 기능 안의 화면에 있으면 "부가 기능"을 켜고, 그 아래 줄에 지금 기능을 보여 준다.
 */
export function SidebarLinks() {
  const { pathname } = useLocation();
  const here = pathname.split("/")[1];
  const current = featureAt(pathname);
  const [open, setOpen] = useState(false);
  return (
    <div className="tk-nav">
      <ConversationLinks />
      <Link className="tk-nav__link" to="/tasks" aria-current={here === "tasks" ? "page" : undefined}>
        <Icon name="tasks" />
        작업
      </Link>
      {here === "tasks" && pathname !== "/tasks/failed" && (
        <Link className="tk-nav__link app-nav__sub" to="/tasks/failed">
          <Icon name="circle-x" />
          실패한 작업
        </Link>
      )}
      <button
        type="button"
        className="tk-nav__link app-nav__features"
        aria-haspopup="dialog"
        data-active={current ? "" : undefined}
        onClick={() => setOpen(true)}
      >
        <Icon name="more" />
        부가 기능
        <Icon name="chevron-right" className="app-nav__chevron" />
      </button>
      {current && (
        <Link className="tk-nav__link app-nav__sub" to={current.to} aria-current="page">
          <Icon name={current.icon} />
          {current.label}
        </Link>
      )}
      <FeaturesDialog open={open} onClose={() => setOpen(false)} currentRoot={current?.root} />
    </div>
  );
}

/** 부가 기능 고르기. 기능이 늘어도 사이드바 길이는 그대로이고, 이름 아래 설명으로 무엇을 하는 곳인지 보인다. */
function FeaturesDialog({ open, onClose, currentRoot }: { open: boolean; onClose: () => void; currentRoot?: string }) {
  return (
    <Dialog open={open} onClose={onClose} title="부가 기능" id="features-dialog">
      <nav className="feature-grid" aria-label="부가 기능 목록">
        {FEATURES.map((f) => (
          <Link
            key={f.root}
            className="feature-grid__item"
            to={f.to}
            aria-current={f.root === currentRoot ? "page" : undefined}
            onClick={onClose}
          >
            <Icon name={f.icon} />
            <span className="feature-grid__text">
              <span className="feature-grid__label">{f.label}</span>
              <span className="feature-grid__desc">{f.description}</span>
            </span>
          </Link>
        ))}
      </nav>
    </Dialog>
  );
}

/** 모바일 하단 탭 다섯: 채팅, 작업, 하단 탭에 둔 기능(FEATURES 의 mobileTab), 더보기. */
const TABS = [
  { root: "chat", to: "/chat", icon: "chat" as const, label: "채팅" },
  { root: "tasks", to: "/tasks", icon: "tasks" as const, label: "작업" },
  ...FEATURES.filter((f) => f.mobileTab).map((f) => ({ root: f.root, to: f.to, icon: f.icon, label: f.tabLabel ?? f.label })),
  { root: "more", to: "/more", icon: "more" as const, label: "더보기" },
];

export function TabbarLinks() {
  const { pathname } = useLocation();
  const here = pathname.split("/")[1];
  // 더보기로 옮긴 화면에 있을 때도 더보기 탭이 켜져 있어야 지금 어디인지 보인다.
  const feature = featureAt(pathname);
  const active = feature && !feature.mobileTab ? "more" : here === "work" ? "chat" : here;
  return (
    <>
      {TABS.map((t) => (
        <Link key={t.root} className="tk-tabbar__item" to={t.root === "chat" && here === "work" ? "/work" : t.to} aria-current={t.root === active ? "page" : undefined}>
          <Icon name={t.icon} />
          {t.label}
        </Link>
      ))}
    </>
  );
}
