import { Link, useLocation } from "react-router";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/Icon";

interface Area {
  /** 경로 첫 마디. 활성 판단 기준이다. */
  root: string;
  to: string;
  icon: IconName;
  label: string;
}

/** 영역 넷(docs/19 §5). 작업 공간만 기억해 둔 세션이 있으면 그 세션으로 간다. 데스크톱 사이드바가 쓴다. */
export function areas(sessionId?: string): Area[] {
  return [
    // 새 세션 버튼을 따로 두지 않는다. 채팅 탭이 곧 새 세션 화면이다(⌘⇧O 도 같다).
    { root: "chat", to: "/chat", icon: "chat", label: "채팅" },
    // 회사 업무: 여기서 만든 대화는 회사 계정만 쓴다(설정 > 계정 > 회사 계정).
    { root: "work", to: "/work", icon: "briefcase", label: "회사 업무" },
    { root: "workspace", to: sessionId ? `/workspace/${sessionId}` : "/workspace", icon: "workspace", label: "작업 공간" },
    { root: "library", to: "/library", icon: "library", label: "보관함" },
    { root: "files", to: "/files", icon: "folder-search", label: "파일" },
  ];
}

const MORE_ROOTS = ["workspace", "library", "files"];

/** 하단 탭에 자리가 없어 모바일에서는 더보기 화면(/more)으로 가는 영역. */
export function moreAreas(sessionId?: string): Area[] {
  return areas(sessionId).filter((a) => MORE_ROOTS.includes(a.root));
}

/**
 * 메모·캘린더. 데스크톱 사이드바의 영역 링크 아래에 둔다. 모바일은 하단 탭에 있다.
 * 영역(채팅·작업 공간…)과 달리 "생활 도구"라 한 묶음으로 나눈다.
 */
const TOOLS: Area[] = [
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

export function AreaLinks({ sessionId }: { sessionId?: string }) {
  const here = useLocation().pathname.split("/")[1];
  return (
    <>
      {areas(sessionId).map((a) => (
        <Link key={a.root} className="tk-nav__link" to={a.to} aria-current={a.root === here ? "page" : undefined}>
          <Icon name={a.icon} />
          {a.label}
        </Link>
      ))}
    </>
  );
}

/** 모바일 하단 탭 다섯. 칸이 좁아 회사 업무는 "회사"로 줄인다. */
const TABS: Area[] = [
  { root: "chat", to: "/chat", icon: "chat", label: "채팅" },
  { root: "work", to: "/work", icon: "briefcase", label: "회사" },
  ...TOOLS,
  { root: "more", to: "/more", icon: "more", label: "더보기" },
];

export function TabbarLinks() {
  const here = useLocation().pathname.split("/")[1];
  // 더보기로 옮긴 화면에 있을 때도 더보기 탭이 켜져 있어야 지금 어디인지 보인다.
  const active = MORE_ROOTS.includes(here) ? "more" : here;
  return (
    <>
      {TABS.map((t) => (
        <Link key={t.root} className="tk-tabbar__item" to={t.to} aria-current={t.root === active ? "page" : undefined}>
          <Icon name={t.icon} />
          {t.label}
        </Link>
      ))}
    </>
  );
}
