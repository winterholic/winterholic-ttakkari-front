import { useSyncExternalStore } from "react";

/**
 * 최근 생성. 서버는 원문을 저장하지 않으므로(설계서 §8.1) 다시 듣거나 다시 요청하려면 이 기기가 글을 들고 있어야 한다.
 * 소리 파일은 서버 캐시에 있고, 여기에는 job 번호와 글·설정만 둔다. 캐시가 지워졌으면 같은 글로 새로 요청해 이어 붙인다.
 */
export interface RecentTts {
  jobId: string;
  text: string;
  voice: string | null;
  speed: number;
  chunks: number;
  createdAt: string;
}

export const RECENT_KEY = "tk-tts-recent";
export const RECENT_MAX = 8;

const listeners = new Set<() => void>();
let cache: RecentTts[] | null = null;
const EMPTY: RecentTts[] = [];

function read(): RecentTts[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return EMPTY;
    return raw
      .filter((r): r is RecentTts => !!r && typeof r.jobId === "string" && typeof r.text === "string" && typeof r.createdAt === "string")
      .slice(0, RECENT_MAX);
  } catch {
    return EMPTY;
  }
}

export function getRecent(): RecentTts[] {
  return (cache ??= read());
}

function write(next: RecentTts[]) {
  cache = next;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // 용량이 모자라면 이 탭 안에서만 유지된다.
  }
  listeners.forEach((l) => l());
}

/** 같은 글·음성·속도는 하나로 합쳐 맨 앞에 둔다. */
export function addRecent(item: RecentTts): void {
  const rest = getRecent().filter((r) => r.jobId !== item.jobId && !(r.text === item.text && r.voice === item.voice && r.speed === item.speed));
  write([item, ...rest].slice(0, RECENT_MAX));
}

export function removeRecent(jobId: string): void {
  write(getRecent().filter((r) => r.jobId !== jobId));
}

export function clearRecent(): void {
  write([]);
}

export function resetRecentCache(): void {
  cache = null;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === RECENT_KEY || e.key === null) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRecentTts(): RecentTts[] {
  return useSyncExternalStore(subscribe, getRecent, () => EMPTY);
}
