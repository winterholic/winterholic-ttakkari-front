import type { IconName } from "../ui/Icon";

export interface Feature {
  /** 경로 첫 마디. 지금 어느 기능에 있는지 판단하는 기준이다. */
  root: string;
  to: string;
  icon: IconName;
  label: string;
  /** 부가 기능 모달에서 이름 아래 한 줄. 무엇을 하는 곳인지 이름만으로는 모를 때를 위해 둔다. */
  description: string;
  /** 모바일 하단 탭에 바로 둔다. 칸이 다섯뿐이라(채팅·셋·더보기) 새 기능은 기본으로 더보기에 들어간다. */
  mobileTab?: boolean;
  /** 하단 탭 칸이 좁을 때 쓰는 짧은 이름. */
  tabLabel?: string;
}

/**
 * 채팅이 아닌 기능 전부. 데스크톱은 사이드바 "부가 기능" 모달, 모바일은 하단 탭(mobileTab)과 더보기 화면이 이 목록 하나를 쓴다.
 * 새 기능은 라우트를 만들고 여기에 항목 하나만 넣으면 양쪽에 같이 나타난다. 순서도 이 순서다.
 */
export const FEATURES: readonly Feature[] = [
  // 회사 업무: 여기서 만든 대화는 회사 계정만 쓴다(설정 > 계정 > 회사 계정).
  { root: "work", to: "/work", icon: "briefcase", label: "회사 업무", tabLabel: "회사", description: "회사 계정만 쓰는 대화", mobileTab: true },
  // 작업 공간은 마지막 세션이 아니라 개요로 보낸다. 맥락 없이 특정 세션이 뜨면 무슨 화면인지 알 수 없었다.
  { root: "workspace", to: "/workspace", icon: "workspace", label: "작업 공간", description: "세션별 결과물을 보며 이어서 지시" },
  { root: "library", to: "/library", icon: "library", label: "보관함", description: "모든 결과물을 날짜별로" },
  { root: "files", to: "/files", icon: "folder-search", label: "파일", description: "Mac Studio 파일 찾기·폰에서 보내기" },
  { root: "memos", to: "/memos", icon: "memo", label: "메모", description: "카테고리·태그로 정리하는 메모", mobileTab: true },
  { root: "calendar", to: "/calendar", icon: "calendar", label: "캘린더", description: "일정과 한국 공휴일", mobileTab: true },
  { root: "resources", to: "/resources", icon: "server", label: "서버 리소스", description: "Mac Studio CPU·메모리·저장공간 현황" },
];

/** 지금 경로가 어느 부가 기능 안인가. 채팅·설정처럼 목록에 없는 화면이면 undefined. */
export function featureAt(pathname: string): Feature | undefined {
  const root = pathname.split("/")[1];
  return FEATURES.find((f) => f.root === root);
}

/** 모바일 더보기 화면에 모을 기능: 하단 탭에 자리가 없는 것 전부. */
export const moreFeatures = (): Feature[] => FEATURES.filter((f) => !f.mobileTab);
