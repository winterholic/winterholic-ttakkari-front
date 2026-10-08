import { Link, useLocation } from "react-router";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/Icon";

interface Area {
  /** 경로 첫 마디. 활성 판단 기준이다. */
  root: string;
  to: string;
  icon: IconName;
  label: string;
  /** 탭바는 칸이 좁아 줄인 이름을 쓴다. */
  short?: string;
}

/** 영역 넷(docs/19 §5). 작업 공간만 기억해 둔 세션이 있으면 그 세션으로 간다. */
export function areas(sessionId?: string): Area[] {
  return [
    { root: "chat", to: "/chat", icon: "chat", label: "채팅" },
    { root: "workspace", to: sessionId ? `/workspace/${sessionId}` : "/workspace", icon: "workspace", label: "작업 공간" },
    { root: "library", to: "/library", icon: "library", label: "보관함" },
    { root: "files", to: "/files", icon: "folder-search", label: "파일 찾기", short: "파일" },
  ];
}

export function AreaLinks({ sessionId, variant }: { sessionId?: string; variant: "nav" | "tabbar" }) {
  const here = useLocation().pathname.split("/")[1];
  const cls = variant === "nav" ? "tk-nav__link" : "tk-tabbar__item";
  return (
    <>
      {areas(sessionId).map((a) => (
        <Link key={a.root} className={cls} to={a.to} aria-current={a.root === here ? "page" : undefined}>
          <Icon name={a.icon} />
          {variant === "tabbar" ? (a.short ?? a.label) : a.label}
        </Link>
      ))}
    </>
  );
}
