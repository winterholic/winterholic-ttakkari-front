import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_STATE, createTtsPlayer, playerReducer } from "./ttsPlayer";
import type { AudioLike, ChunkSource, PlayerState, TtsPlayer } from "./ttsPlayer";

class FakeAudio implements AudioLike {
  src = "";
  ended = false;
  private handlers = new Map<string, (() => void)[]>();
  /** 다음 play() 호출들의 결과. 비면 성공. */
  plays: ("ok" | "blocked" | "abort" | "fail")[] = [];
  play = vi.fn(() => {
    const r = this.plays.shift() ?? "ok";
    if (r === "blocked") return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    if (r === "abort") return Promise.reject(new DOMException("aborted", "AbortError"));
    if (r === "fail") return Promise.reject(new Error("decode"));
    return Promise.resolve();
  });
  pause = vi.fn();
  addEventListener(type: string, fn: () => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  emit(type: string) {
    if (type === "ended") this.ended = true;
    this.handlers.get(type)?.forEach((f) => f());
    if (type === "play") this.ended = false;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const blob = (n: number) => new Blob([`chunk${n}`], { type: "audio/wav" });
const src = (n: number): ChunkSource => ({ load: async () => blob(n) });

let audio: FakeAudio;
let revoked: string[];
let player: TtsPlayer;
let seq: number;

beforeEach(() => {
  audio = new FakeAudio();
  revoked = [];
  seq = 0;
  player = createTtsPlayer({ createAudio: () => audio, createUrl: () => `blob:${++seq}`, revokeUrl: (u) => revoked.push(u) });
});

const phase = () => player.getState().phase;

describe("playerReducer", () => {
  const s = (p: Partial<PlayerState>): PlayerState => ({ ...IDLE_STATE, ...p });
  it("allows only the documented transitions", () => {
    expect(playerReducer(IDLE_STATE, { type: "start", ownerId: "a" })).toMatchObject({ phase: "loading", ownerId: "a" });
    expect(playerReducer(s({ phase: "loading", ownerId: "a" }), { type: "ready", total: 3 }).total).toBe(3);
    expect(playerReducer(s({ phase: "loading" }), { type: "playing", index: 0 }).phase).toBe("playing");
    expect(playerReducer(s({ phase: "playing" }), { type: "paused" }).phase).toBe("paused");
    expect(playerReducer(s({ phase: "playing" }), { type: "blocked", index: 2 })).toMatchObject({ phase: "blocked", index: 2 });
    expect(playerReducer(s({ phase: "blocked", index: 2 }), { type: "playing", index: 2 }).phase).toBe("playing");
    expect(playerReducer(s({ phase: "playing" }), { type: "stop" })).toBe(IDLE_STATE);
  });
  it("ignores events that do not apply, keeping the same object", () => {
    const idle = IDLE_STATE;
    expect(playerReducer(idle, { type: "paused" })).toBe(idle);
    expect(playerReducer(idle, { type: "playing", index: 0 })).toBe(idle);
    expect(playerReducer(idle, { type: "blocked", index: 0 })).toBe(idle);
    expect(playerReducer(idle, { type: "fail", message: "x" })).toBe(idle);
    const loading = s({ phase: "loading" });
    expect(playerReducer(loading, { type: "paused" })).toBe(loading);
    const err = s({ phase: "error", message: "x" });
    expect(playerReducer(err, { type: "playing", index: 1 })).toBe(err);
  });
});

describe("TtsPlayer", () => {
  it("unlock opens the element synchronously with a silent clip, before any await", () => {
    player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.src.startsWith("data:audio/wav;base64,")).toBe(true);
  });

  it("the silent clip's own end does not advance or stop anything", async () => {
    player.unlock();
    audio.emit("ended");
    expect(player.getState()).toBe(IDLE_STATE);
    player.unlock();
    const p = player.play({ ownerId: "a", prepare: async () => [src(1), src(2)] });
    await flush();
    expect(phase()).toBe("playing");
    expect(player.getState().index).toBe(0);
    await p;
  });

  it("loading → playing for a single chunk, then idle when it ends and the object URL is released", async () => {
    let release!: (s: ChunkSource[]) => void;
    const p = player.play({ ownerId: "a", prepare: () => new Promise((r) => (release = r)) });
    expect(phase()).toBe("loading");
    expect(player.getState().ownerId).toBe("a");
    release([src(1)]);
    await p;
    expect(player.getState()).toMatchObject({ phase: "playing", index: 0, total: 1 });
    expect(audio.src).toBe("blob:1");
    audio.emit("ended");
    expect(player.getState()).toBe(IDLE_STATE);
    expect(revoked).toContain("blob:1");
  });

  it("chains chunks on the same element via src and ends after the last", async () => {
    await player.play({ ownerId: "a", prepare: async () => [src(1), src(2), src(3)] });
    expect(audio.src).toBe("blob:1");
    audio.emit("ended");
    await flush();
    expect(audio.src).toBe("blob:2");
    expect(player.getState()).toMatchObject({ phase: "playing", index: 1, total: 3 });
    expect(revoked).toContain("blob:1");
    audio.emit("ended");
    await flush();
    expect(player.getState().index).toBe(2);
    audio.emit("ended");
    expect(phase()).toBe("idle");
    expect(audio.play).toHaveBeenCalledTimes(3);
  });

  it("pause and resume", async () => {
    await player.play({ ownerId: "a", prepare: async () => [src(1)] });
    player.pause();
    expect(phase()).toBe("paused");
    expect(audio.pause).toHaveBeenCalled();
    player.resume();
    await flush();
    expect(phase()).toBe("playing");
  });

  it("pause is a no-op unless playing; resume is a no-op when idle", () => {
    player.pause();
    player.resume();
    expect(phase()).toBe("idle");
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("stop returns to idle and releases the object URL", async () => {
    await player.play({ ownerId: "a", prepare: async () => [src(1), src(2)] });
    player.stop();
    expect(phase()).toBe("idle");
    expect(revoked).toContain("blob:1");
  });

  it("stop(ownerId) only stops the owner that holds the sound", async () => {
    await player.play({ ownerId: "page", prepare: async () => [src(1)] });
    player.stop("message-1");
    expect(phase()).toBe("playing");
    player.stop("page");
    expect(phase()).toBe("idle");
  });

  it("stop while still preparing: the late result never starts audio", async () => {
    let release!: (s: ChunkSource[]) => void;
    const p = player.play({ ownerId: "a", prepare: () => new Promise((r) => (release = r)) });
    player.stop();
    release([src(1)]);
    await p;
    expect(phase()).toBe("idle");
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("aborts the in-flight prepare when stopped", async () => {
    let signal!: AbortSignal;
    void player.play({ ownerId: "a", prepare: (s) => ((signal = s), new Promise(() => undefined)) });
    player.stop();
    expect(signal.aborted).toBe(true);
  });

  it("a new play replaces the old one; the old chunk loads are ignored", async () => {
    let releaseOld!: (b: Blob) => void;
    const slow: ChunkSource = { load: () => new Promise((r) => (releaseOld = r)) };
    const first = player.play({ ownerId: "old", prepare: async () => [slow] });
    await flush();
    const second = player.play({ ownerId: "new", prepare: async () => [src(9)] });
    await second;
    releaseOld(blob(1));
    await first;
    await flush();
    expect(player.getState()).toMatchObject({ ownerId: "new", phase: "playing" });
    expect(audio.src).toBe("blob:1");
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("prefetches the next chunk while the current one plays", async () => {
    const loads: number[] = [];
    const tracked = (n: number): ChunkSource => ({ load: async () => (loads.push(n), blob(n)) });
    await player.play({ ownerId: "a", prepare: async () => [tracked(1), tracked(2), tracked(3)] });
    expect(loads).toEqual([1, 2]);
  });

  describe("iOS-style autoplay blocking", () => {
    it("blocked when the very first play() is rejected with NotAllowedError, then resume plays it", async () => {
      audio.plays = ["blocked"];
      await player.play({ ownerId: "a", prepare: async () => [src(1)] });
      expect(player.getState()).toMatchObject({ phase: "blocked", index: 0 });
      player.resume();
      await flush();
      expect(player.getState()).toMatchObject({ phase: "playing", index: 0 });
    });

    it("blocked on a chunk change keeps the next chunk loaded and one tap continues from there", async () => {
      await player.play({ ownerId: "a", prepare: async () => [src(1), src(2)] });
      audio.plays = ["blocked"];
      audio.emit("ended");
      await flush();
      expect(player.getState()).toMatchObject({ phase: "blocked", index: 1 });
      expect(audio.src).toBe("blob:2");
      player.resume();
      await flush();
      expect(player.getState()).toMatchObject({ phase: "playing", index: 1 });
      audio.emit("ended");
      expect(phase()).toBe("idle");
    });

    it("stays blocked if the retap is rejected too", async () => {
      audio.plays = ["blocked", "blocked"];
      await player.play({ ownerId: "a", prepare: async () => [src(1)] });
      player.resume();
      await flush();
      expect(phase()).toBe("blocked");
    });

    it("stop from the blocked state clears it", async () => {
      audio.plays = ["blocked"];
      await player.play({ ownerId: "a", prepare: async () => [src(1)] });
      player.stop();
      expect(phase()).toBe("idle");
    });
  });

  describe("system interruptions", () => {
    it("a pause the app did not ask for (lock screen, call) moves to paused, and play resumes", async () => {
      await player.play({ ownerId: "a", prepare: async () => [src(1)] });
      audio.emit("pause");
      expect(phase()).toBe("paused");
      audio.emit("play");
      expect(phase()).toBe("playing");
    });

    it("the pause event that comes with ending playback is not an interruption", async () => {
      await player.play({ ownerId: "a", prepare: async () => [src(1), src(2)] });
      audio.ended = true;
      audio.emit("pause");
      expect(phase()).toBe("playing");
    });
  });

  describe("failures", () => {
    it("a chunk that fails to load becomes error with its message", async () => {
      await player.play({ ownerId: "a", prepare: async () => [{ load: async () => Promise.reject(new Error("캐시가 지워졌어요")) }] });
      expect(player.getState()).toMatchObject({ phase: "error", message: "캐시가 지워졌어요" });
      expect(audio.play).not.toHaveBeenCalled();
    });

    it("prepare failure (synthesis refused) becomes error", async () => {
      await player.play({ ownerId: "a", prepare: async () => Promise.reject(new Error("서버가 배포 중이에요.")) });
      expect(player.getState()).toMatchObject({ phase: "error", message: "서버가 배포 중이에요." });
    });

    it("an empty chunk list is an error, not silence", async () => {
      await player.play({ ownerId: "a", prepare: async () => [] });
      expect(phase()).toBe("error");
    });

    it("a decode error from play() is an error, not blocked", async () => {
      audio.plays = ["fail"];
      await player.play({ ownerId: "a", prepare: async () => [src(1)] });
      expect(player.getState()).toMatchObject({ phase: "error", message: "decode" });
    });

    it("an element error event during playback is an error", async () => {
      await player.play({ ownerId: "a", prepare: async () => [src(1)] });
      audio.emit("error");
      expect(phase()).toBe("error");
    });

    it("can start again after an error", async () => {
      await player.play({ ownerId: "a", prepare: async () => [] });
      await player.play({ ownerId: "a", prepare: async () => [src(1)] });
      expect(phase()).toBe("playing");
    });
  });

  it("notifies subscribers on change only", async () => {
    const cb = vi.fn();
    const off = player.subscribe(cb);
    player.pause();
    expect(cb).not.toHaveBeenCalled();
    await player.play({ ownerId: "a", prepare: async () => [src(1)] });
    expect(cb).toHaveBeenCalled();
    off();
    cb.mockClear();
    player.stop();
    expect(cb).not.toHaveBeenCalled();
  });
});
