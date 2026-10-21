import { useSyncExternalStore } from "react";

/**
 * 음성 재생 엔진. TTS 페이지와 채팅 재생 버튼이 하나의 HTMLAudioElement 를 같이 쓴다(설계서 §11).
 *
 * iOS Safari 는 사용자 제스처 안에서 play() 가 시작된 엘리먼트만 이후 src 를 바꿔 이어 재생하게 해 준다.
 * 그래서 (1) 버튼을 누른 같은 동기 구간에서 unlock() 으로 무음을 재생해 엘리먼트를 열고, (2) 문장이 바뀔 때마다
 * 새 Audio 를 만들지 않고 같은 엘리먼트의 src 만 바꾸며, (3) 그래도 막히면 NotAllowedError 를 blocked 상태로 받아
 * "이어서 듣기" 한 번 터치로 풀 수 있게 한다. 이 전략이 실기기에서 통하는지는 아직 검증하지 못했다.
 */

export type PlayerPhase = "idle" | "loading" | "playing" | "paused" | "blocked" | "error";

export interface PlayerState {
  phase: PlayerPhase;
  /** 지금 소리를 쥔 쪽. 버튼은 자기 ownerId 일 때만 상태를 보여 준다. */
  ownerId: string | null;
  /** 지금 문장 번호(0부터). */
  index: number;
  total: number;
  message: string | null;
}

export const IDLE_STATE: PlayerState = { phase: "idle", ownerId: null, index: 0, total: 0, message: null };

export type PlayerEvent =
  | { type: "start"; ownerId: string }
  | { type: "ready"; total: number }
  | { type: "playing"; index: number }
  | { type: "paused" }
  | { type: "blocked"; index: number }
  | { type: "fail"; message: string }
  | { type: "stop" };

/** 순수 상태 전이. 허용되지 않은 전이는 같은 객체를 돌려줘 구독자가 다시 그리지 않게 한다. */
export function playerReducer(s: PlayerState, e: PlayerEvent): PlayerState {
  switch (e.type) {
    case "start":
      return { phase: "loading", ownerId: e.ownerId, index: 0, total: 0, message: null };
    case "ready":
      return s.phase === "loading" ? { ...s, total: e.total } : s;
    case "playing":
      return s.phase === "idle" || s.phase === "error" ? s : { ...s, phase: "playing", index: e.index, message: null };
    case "paused":
      return s.phase === "playing" ? { ...s, phase: "paused" } : s;
    case "blocked":
      return s.phase === "idle" || s.phase === "error" ? s : { ...s, phase: "blocked", index: e.index };
    case "fail":
      return s.phase === "idle" ? s : { ...s, phase: "error", message: e.message };
    case "stop":
      return s.phase === "idle" ? s : IDLE_STATE;
  }
}

/** 문장 하나의 소리. 재생 직전(과 한 문장 앞서 미리) load 가 불린다. */
export interface ChunkSource {
  load: (signal: AbortSignal) => Promise<Blob>;
}

export interface PlayRequest {
  ownerId: string;
  /** 잠금 화면·제어 센터에 보일 제목. */
  title?: string;
  /** 합성 요청과 대기를 포함한다. 이 동안 phase 는 loading 이다. */
  prepare: (signal: AbortSignal) => Promise<ChunkSource[]>;
}

/** HTMLAudioElement 중 쓰는 부분. 테스트가 가짜를 끼운다. */
export interface AudioLike {
  src: string;
  readonly ended: boolean;
  play: () => Promise<void> | undefined;
  pause: () => void;
  addEventListener: (type: string, fn: () => void) => void;
}

export interface PlayerDeps {
  createAudio: () => AudioLike;
  createUrl: (b: Blob) => string;
  revokeUrl: (u: string) => void;
}

const browserDeps: PlayerDeps = {
  createAudio: () => new Audio(),
  createUrl: (b) => URL.createObjectURL(b),
  revokeUrl: (u) => URL.revokeObjectURL(u),
};

/** 0.01초 무음 WAV(8kHz·8bit·mono). 제스처 안에서 엘리먼트를 여는 데만 쓴다. */
function silentWav(): string {
  const n = 80;
  const buf = new Uint8Array(44 + n);
  const v = new DataView(buf.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  tag(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  tag(36, "data");
  v.setUint32(40, n, true);
  buf.fill(128, 44);
  let bin = "";
  buf.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const isBlocked = (e: unknown) => e instanceof DOMException && e.name === "NotAllowedError";
const messageOf = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export interface TtsPlayer {
  getState: () => PlayerState;
  subscribe: (cb: () => void) => () => void;
  /** 버튼 클릭 핸들러 안에서, await 보다 먼저 동기로 부른다. */
  unlock: () => void;
  play: (req: PlayRequest) => Promise<void>;
  pause: () => void;
  /** paused 와 blocked 에서 이어 듣기. 제스처 안에서 불러야 blocked 가 풀린다. */
  resume: () => void;
  /** ownerId 를 주면 그 쪽이 소리를 쥐고 있을 때만 멈춘다. */
  stop: (ownerId?: string) => void;
}

export function createTtsPlayer(deps: PlayerDeps = browserDeps): TtsPlayer {
  let state = IDLE_STATE;
  const listeners = new Set<() => void>();
  let audio: AudioLike | null = null;
  let token = 0;
  let abort: AbortController | null = null;
  let sources: ChunkSource[] = [];
  let index = 0;
  let loads = new Map<number, Promise<Blob>>();
  let currentUrl: string | null = null;
  // unlock 의 무음이 재생 중인 동안은 ended·pause·error 가 우리 쪽 문장과 상관없다.
  let silent = false;
  let silentSrc: string | null = null;
  let title = "따까리 음성";

  const dispatch = (e: PlayerEvent) => {
    const next = playerReducer(state, e);
    if (next === state) return;
    state = next;
    syncMediaSession();
    listeners.forEach((l) => l());
  };

  function syncMediaSession() {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!ms) return;
    try {
      ms.playbackState = state.phase === "playing" ? "playing" : state.phase === "paused" || state.phase === "blocked" ? "paused" : "none";
      if (state.phase === "idle") {
        ms.metadata = null;
        return;
      }
      ms.metadata = new MediaMetadata({ title, artist: "따까리" });
      ms.setActionHandler("play", () => api.resume());
      ms.setActionHandler("pause", () => api.pause());
      ms.setActionHandler("stop", () => api.stop());
    } catch {
      // 일부 브라우저는 액션 일부를 지원하지 않는다. 화면 안 버튼이 정본이라 조용히 넘긴다.
    }
  }

  function ensureAudio(): AudioLike {
    if (audio) return audio;
    const a = deps.createAudio();
    a.addEventListener("ended", () => {
      if (silent) {
        silent = false;
        return;
      }
      if (state.phase !== "playing") return;
      index += 1;
      if (index >= sources.length) api.stop();
      else void startChunk(token, index);
    });
    // 잠금 화면·전화·다른 앱이 소리를 끊으면 우리가 부르지 않은 pause 가 온다. 화면 상태를 실제 소리에 맞춘다.
    a.addEventListener("pause", () => {
      if (silent || a.ended) return;
      dispatch({ type: "paused" });
    });
    a.addEventListener("play", () => {
      if (silent || state.phase !== "paused") return;
      dispatch({ type: "playing", index: state.index });
    });
    a.addEventListener("error", () => {
      if (silent) return;
      if (state.phase === "loading" || state.phase === "playing") dispatch({ type: "fail", message: "소리를 재생하지 못했어요." });
    });
    audio = a;
    return a;
  }

  function release() {
    if (currentUrl) deps.revokeUrl(currentUrl);
    currentUrl = null;
    loads = new Map();
    sources = [];
    index = 0;
  }

  function loadChunk(i: number): Promise<Blob> {
    let p = loads.get(i);
    if (!p) {
      p = sources[i].load((abort ?? new AbortController()).signal);
      // 미리 받다 실패한 오류는 그 문장 차례에 await 하는 쪽이 받는다. 여기서는 unhandled 경고만 막는다.
      p.catch(() => undefined);
      loads.set(i, p);
    }
    return p;
  }

  async function startChunk(my: number, i: number) {
    let blob: Blob;
    try {
      blob = await loadChunk(i);
    } catch (e) {
      if (my !== token || isAbort(e)) return;
      dispatch({ type: "fail", message: messageOf(e, "소리를 불러오지 못했어요.") });
      return;
    }
    if (my !== token) return;
    if (i + 1 < sources.length) void loadChunk(i + 1);
    const a = ensureAudio();
    const prev = currentUrl;
    currentUrl = deps.createUrl(blob);
    silent = false;
    a.src = currentUrl;
    if (prev) deps.revokeUrl(prev);
    await attempt(my, a, i);
  }

  async function attempt(my: number, a: AudioLike, i: number) {
    try {
      await Promise.resolve(a.play());
    } catch (e) {
      if (my !== token || isAbort(e)) return;
      if (isBlocked(e)) dispatch({ type: "blocked", index: i });
      else dispatch({ type: "fail", message: messageOf(e, "소리를 재생하지 못했어요.") });
      return;
    }
    if (my === token) dispatch({ type: "playing", index: i });
  }

  const api: TtsPlayer = {
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    unlock() {
      const a = ensureAudio();
      silentSrc ??= silentWav();
      silent = true;
      a.src = silentSrc;
      try {
        // 거절돼도(이미 재생 중이거나 정책) 여기서 할 일은 없다. 진짜 재생이 blocked 로 복구한다.
        void Promise.resolve(a.play()).catch(() => undefined);
      } catch {
        silent = false;
      }
    },
    async play(req) {
      api.stop();
      const my = ++token;
      abort = new AbortController();
      title = req.title ?? "따까리 음성";
      dispatch({ type: "start", ownerId: req.ownerId });
      try {
        sources = await req.prepare(abort.signal);
      } catch (e) {
        if (my !== token || isAbort(e)) return;
        dispatch({ type: "fail", message: messageOf(e, "음성을 만들지 못했어요.") });
        return;
      }
      if (my !== token) return;
      if (sources.length === 0) {
        dispatch({ type: "fail", message: "재생할 소리가 없어요." });
        return;
      }
      index = 0;
      dispatch({ type: "ready", total: sources.length });
      await startChunk(my, 0);
    },
    pause() {
      if (state.phase !== "playing" || !audio) return;
      audio.pause();
      dispatch({ type: "paused" });
    },
    resume() {
      if (!audio || (state.phase !== "paused" && state.phase !== "blocked")) return;
      void attempt(token, audio, state.index);
    },
    stop(ownerId) {
      if (ownerId !== undefined && state.ownerId !== ownerId) return;
      token += 1;
      abort?.abort();
      abort = null;
      if (audio) {
        silent = false;
        audio.pause();
      }
      release();
      dispatch({ type: "stop" });
    },
  };
  return api;
}

export const ttsPlayer: TtsPlayer = createTtsPlayer();

export function usePlayerState(player: TtsPlayer = ttsPlayer): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState, () => IDLE_STATE);
}

/** ownerId 가 쥔 소리만 보인다. 다른 쪽이 재생 중이면 idle 로 읽힌다. */
export function useOwnedPlayer(ownerId: string, player: TtsPlayer = ttsPlayer): PlayerState {
  const s = usePlayerState(player);
  return s.ownerId === ownerId ? s : IDLE_STATE;
}
