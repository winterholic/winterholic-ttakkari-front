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
    // 새 세션 버튼을 따로 두지 않는다. 채팅 탭이 곧 새 세션 화면이다(⌘⇧O 도 같다).
    { root: "chat", to: "/chat", icon: "chat", label: "채팅" },
    // 회사 업무: 여기서 만든 대화는 회사 계정만 쓴다(설정 > 계정 > 회사 계정).
    { root: "work", to: "/work", icon: "briefcase", label: "회사 업무", short: "회사" },
    { root: "workspace", to: sessionId ? `/workspace/${sessionId}` : "/workspace", icon: "workspace", label: "작업 공간" },
    { root: "library", to: "/library", icon: "library", label: "보관함" },
    { root: "files", to: "/files", icon: "folder-search", label: "파일", short: "파일" },
  ];
}

/**
 * 메모·캘린더. 하단 탭이 이미 다섯이라 탭에는 넣지 않고, 사이드바(데스크톱)와 드로어(모바일)의 영역 링크 아래에 둔다.
 * 영역(채팅·작업 공간…)과 달리 "생활 도구"라 한 묶음으로 나눈다.
 */
const TOOLS: { root: string; to: string; icon: IconName; label: string }[] = [
  { root: "memos", to: "/memos", icon: "memo", label: "메모" },
  { root: "calendar", to: "/calendar", icon: "calendar", label: "캘린더" },
];

export function ToolLinks() {
  const here = useLocation().pathname.split("/")[1];
  return (
    <div className="tk-nav" role="group" aria-label="메모와 캘린더">
      {TOOLS.map((t) => (
        <Link key={t.root} className="tk-nav__link" to={t.to} aria-current={t.root === here ? "page" : undefined}>
          <Icon name={t.icon} />
          {t.label}
        </Link>
      ))}
    </div>
  );
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
