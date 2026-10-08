import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { apiUrl } from "../api/client";
import { DEFAULT_CONNECTION } from "./ShellContext";
import type { ConnectionState } from "./ShellContext";

const HEALTH_POLL_MS = 30_000;
const HEALTH_TIMEOUT_MS = 8_000;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

async function fetchHealth(): Promise<true> {
  // /api/health 는 인증이 필요 없다. 클라이언트의 Bearer·401 재시도 경로를 타지 않는다.
  const res = await fetch(apiUrl("/api/health"), { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`health ${res.status}`);
  return true;
}

/** 내 기기(navigator.onLine)와 Mac Studio(/api/health 30초 폴링)의 연결을 분리해서 본다. */
export function useConnection(enabled: boolean): ConnectionState {
  const online = useOnline();
  const q = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    enabled: enabled && online,
    refetchInterval: HEALTH_POLL_MS,
    refetchOnReconnect: true,
    retry: false,
  });
  if (!enabled) return DEFAULT_CONNECTION;
  const mac = q.isError ? "offline" : q.isSuccess ? "online" : "checking";
  return { online, mac, lastOkAt: q.dataUpdatedAt || null };
}
