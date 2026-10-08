import { createContext, useContext } from "react";

/** 셸(사이드바·드로어)과 페이지 사이의 계약. 페이지 헤더의 메뉴 버튼이 모바일 드로어를 연다. */
export interface ShellApi {
  openDrawer: () => void;
}

export const ShellContext = createContext<ShellApi>({ openDrawer: () => {} });

export function useShell(): ShellApi {
  return useContext(ShellContext);
}
