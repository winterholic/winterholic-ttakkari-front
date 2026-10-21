import { useSyncExternalStore } from "react";

/**
 * 음성 설정. TTS 페이지, 채팅 재생 버튼, 설정 화면이 같은 값을 본다.
 * 소리는 기기마다 듣는 것이라 서버가 아니라 이 기기의 localStorage 에 둔다. voiceOutput 의 기본값은 꺼짐(텍스트만)이다.
 */
export interface TtsPrefs {
  /** 채팅 응답에 재생 버튼을 보일지. 기본 꺼짐. */
  voiceOutput: boolean;
  /** null 이면 서버 기본 음성. 목록에 없는 값이 남아 있어도 요청 때 걸러진다. */
  voice: string | null;
  speed: number;
}

export const TTS_PREFS_KEY = "tk-tts-prefs";
export const SPEED_OPTIONS = [0.8, 1, 1.2, 1.5] as const;
const DEFAULTS: TtsPrefs = { voiceOutput: false, voice: null, speed: 1 };

const listeners = new Set<() => void>();
let cache: TtsPrefs | null = null;

function clampSpeed(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 1;
  return Math.min(2, Math.max(0.5, Math.round(v * 100) / 100));
}

function read(): TtsPrefs {
  try {
    const raw = localStorage.getItem(TTS_PREFS_KEY);
    if (!raw) return DEFAULTS;
    const j = JSON.parse(raw) as Partial<TtsPrefs>;
    return {
      voiceOutput: j.voiceOutput === true,
      voice: typeof j.voice === "string" && j.voice ? j.voice : null,
      speed: clampSpeed(j.speed),
    };
  } catch {
    return DEFAULTS;
  }
}

export function getTtsPrefs(): TtsPrefs {
  return (cache ??= read());
}

export function setTtsPrefs(patch: Partial<TtsPrefs>): TtsPrefs {
  const next: TtsPrefs = { ...getTtsPrefs(), ...patch };
  next.speed = clampSpeed(next.speed);
  cache = next;
  try {
    localStorage.setItem(TTS_PREFS_KEY, JSON.stringify(next));
  } catch {
    // 저장 공간이 막혀도(사생활 보호 모드) 이 탭 안에서는 값이 유지된다.
  }
  listeners.forEach((l) => l());
  return next;
}

/** 테스트에서 저장소를 비운 뒤 캐시를 버린다. */
export function resetTtsPrefsCache(): void {
  cache = null;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TTS_PREFS_KEY || e.key === null) {
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

export function useTtsPrefs(): TtsPrefs {
  return useSyncExternalStore(subscribe, getTtsPrefs, () => DEFAULTS);
}
