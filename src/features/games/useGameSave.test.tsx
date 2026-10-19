import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { GamePlay } from "../../api/gameTypes";
import { SAVE_KEY_PREFIX, readSave, writeSave } from "./gameSave";
import { AUTOSAVE_MS, IMPORT_FALLBACK_MS, useGameSave } from "./useGameSave";

const play = (over: Partial<GamePlay> = {}): GamePlay => ({
  url: "http://127.0.0.1:18795/p/tok1/index.html", origin: "http://127.0.0.1:18795", expires_at: "2026-10-19T02:00:00Z", build_id: "b2", build_seq: 2,
  bundle_sha256: "sha2", frame_ancestors: [], sandbox: "allow-scripts", ...over,
});

/** 실제 iframe 하나와 그 안의 bridge 를 흉내 내는 응답기. 부모가 보낸 요청에만 응답한다. */
function fakeGame(initial: Record<string, unknown> = {}) {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const win = iframe.contentWindow as Window;
  let store: Record<string, unknown> = { ...initial };
  const sent: { type: string; data?: string }[] = [];
  vi.spyOn(win, "postMessage").mockImplementation(((msg: { type: string; id: string; data?: string }) => {
    sent.push({ type: msg.type, data: msg.data });
    const reply = (data: Record<string, unknown>) => window.dispatchEvent(new MessageEvent("message", { data: { ...data, id: msg.id }, origin: "null", source: win }));
    if (msg.type === "ttakkari:save-export") reply({ type: "ttakkari:save-export:result", data: JSON.stringify(store) });
    if (msg.type === "ttakkari:save-import") {
      store = JSON.parse(msg.data ?? "{}") as Record<string, unknown>;
      reply({ type: "ttakkari:save-import:result", ok: true });
    }
  }) as unknown as typeof win.postMessage);
  return {
    iframe, sent, setStore: (s: Record<string, unknown>) => { store = s; }, store: () => store,
    ready: () => window.dispatchEvent(new MessageEvent("message", { data: { type: "ttakkari:ready" }, origin: "null", source: win })),
  };
}

const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => { window.localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); document.body.innerHTML = ""; vi.useRealTimers(); vi.restoreAllMocks(); });

describe("useGameSave", () => {
  it("게임이 ready 를 알리면 저장된 세이브를 넣어 준다", async () => {
    writeSave("g1", '{"level":4}', 1);
    const game = fakeGame();
    renderHook(() => useGameSave("g1", { current: game.iframe }, play(), true));
    expect(game.sent).toEqual([]); // ready 전에는 보내지 않는다
    act(() => game.ready());
    await flush();
    expect(game.sent).toEqual([{ type: "ttakkari:save-import", data: '{"level":4}' }]);
    expect(game.store()).toEqual({ level: 4 });
    act(() => game.ready()); // 중복 ready 는 다시 덮어쓰지 않는다
    await flush();
    expect(game.sent.filter((m) => m.type === "ttakkari:save-import")).toHaveLength(1);
  });

  it("ready 를 보내지 않는 이전 빌드는 폴백 시간 뒤 한 번 불러온다", async () => {
    writeSave("g1", '{"coins":7}', 1);
    const game = fakeGame();
    renderHook(() => useGameSave("g1", { current: game.iframe }, play(), true));
    await flush(IMPORT_FALLBACK_MS - 100);
    expect(game.sent).toEqual([]);
    await flush(200);
    expect(game.sent[0]).toEqual({ type: "ttakkari:save-import", data: '{"coins":7}' });
  });

  it("바뀐 세이브만 주기적으로 저장하고, 같은 값은 다시 쓰지 않는다", async () => {
    const game = fakeGame();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useGameSave("g1", { current: game.iframe }, play(), true));
    act(() => game.ready());
    await flush();
    game.setStore({ score: 10 });
    await flush(AUTOSAVE_MS);
    expect(readSave("g1")).toMatchObject({ data: '{"score":10}', buildSeq: 2 });
    expect(result.current.saved?.data).toBe('{"score":10}');
    expect(setItem).toHaveBeenCalledTimes(1);
    await flush(AUTOSAVE_MS * 2); // 변화 없음
    expect(setItem).toHaveBeenCalledTimes(1);
    game.setStore({ score: 11 });
    await flush(AUTOSAVE_MS);
    expect(readSave("g1")?.data).toBe('{"score":11}');
  });

  it("불러오기 전의 빈 세이브는 실제 저장을 덮어쓰지 않는다", async () => {
    writeSave("g1", '{"level":4}', 1);
    const game = fakeGame(); // 게임 메모리는 비어 있다
    renderHook(() => useGameSave("g1", { current: game.iframe }, play(), true));
    await flush(AUTOSAVE_MS * 2); // ready 도 폴백도 지나기 전/후 모두
    expect(readSave("g1")?.data).toBe('{"level":4}');
    expect(game.store()).toEqual({ level: 4 }); // 폴백이 저장된 값을 게임에 넣어 줬다
  });

  it("게임별로 따로 저장한다", async () => {
    const a = fakeGame({ who: "a" });
    renderHook(() => useGameSave("ga", { current: a.iframe }, play(), true));
    act(() => a.ready());
    await flush(AUTOSAVE_MS);
    expect(readSave("ga")?.data).toBe('{"who":"a"}');
    expect(readSave("gb")).toBeNull();
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith(SAVE_KEY_PREFIX))).toEqual([SAVE_KEY_PREFIX + "ga"]);
  });

  it("지우면 저장을 없애고 열린 게임의 메모리도 비워 다시 저장되지 않는다", async () => {
    writeSave("g1", '{"level":4}', 1);
    const game = fakeGame();
    const { result } = renderHook(() => useGameSave("g1", { current: game.iframe }, play(), true));
    act(() => game.ready());
    await flush();
    expect(result.current.saved).not.toBeNull();
    await act(async () => { const p = result.current.clear(); await vi.advanceTimersByTimeAsync(0); await p; });
    expect(result.current.saved).toBeNull();
    expect(readSave("g1")).toBeNull();
    expect(game.store()).toEqual({});
    await flush(AUTOSAVE_MS * 2);
    expect(readSave("g1")).toBeNull();
  });

  it("다른 창이 보낸 ready·내보내기 응답은 무시한다", async () => {
    writeSave("g1", '{"level":4}', 1);
    const game = fakeGame();
    renderHook(() => useGameSave("g1", { current: game.iframe }, play(), true));
    act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "ttakkari:ready" }, origin: "https://evil.example", source: window })); });
    await flush(100);
    expect(game.sent).toEqual([]);
  });

  it("비활성(게임이 없음)이면 아무것도 하지 않는다", async () => {
    const game = fakeGame({ a: 1 });
    renderHook(() => useGameSave("g1", { current: game.iframe }, undefined, false));
    await flush(AUTOSAVE_MS * 3);
    expect(game.sent).toEqual([]);
    expect(readSave("g1")).toBeNull();
  });
});
