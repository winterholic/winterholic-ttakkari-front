import { createContext, useContext } from "react";

/** Mac Studio 와 내 기기의 연결 상태(docs/10 §4). 셸이 계산해 페이지 헤더에 내려준다. */
export interface ConnectionState {
  /** navigator.onLine. false 면 내 기기가 오프라인. */
  online: boolean;
  /** /api/health 30초 폴링 결과. 첫 응답 전에는 checking. */
  mac: "checking" | "online" | "offline";
  /** 마지막으로 health 가 성공한 시각(ms). 없으면 null. */
  lastOkAt: number | null;
}

/** 셸(사이드바·드로어)과 페이지 사이의 계약. 페이지 헤더의 메뉴 버튼이 모바일 드로어를 연다. */
export interface ShellApi {
  openDrawer: () => void;
  connection: ConnectionState;
}

export const DEFAULT_CONNECTION: ConnectionState = { online: true, mac: "checking", lastOkAt: null };

export const ShellContext = createContext<ShellApi>({ openDrawer: () => {}, connection: DEFAULT_CONNECTION });

export function useShell(): ShellApi {
  return useContext(ShellContext);
}
