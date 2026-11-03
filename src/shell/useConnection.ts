import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { apiUrl } from "../api/client";
import { DEFAULT_CONNECTION } from "./ShellContext";
import type { ConnectionState } from "./ShellContext";

const HEALTH_POLL_MS = 30_000;
// 한 번의 확인 실패로 "끊김"이라고 하지 않는다. 큰 파일을 올리는 동안 연결이 잠깐 막히거나 터널이 한 번 흔들려도(8초 안에 응답이
// 없으면) 최대 30초 동안 끊김이 떴다. 2초 뒤 한 번 더 확인하고, 둘 다 실패해야 끊긴 것으로 본다.
export const HEALTH_TIMEOUT_MS = 10_000;
export const HEALTH_RETRIES = 1;
export const HEALTH_RETRY_DELAY_MS = 2_000;

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
    retry: HEALTH_RETRIES,
    retryDelay: HEALTH_RETRY_DELAY_MS,
  });
  if (!enabled) return DEFAULT_CONNECTION;
  const mac = q.isError ? "offline" : q.isSuccess ? "online" : "checking";
  return { online, mac, lastOkAt: q.dataUpdatedAt || null };
}
