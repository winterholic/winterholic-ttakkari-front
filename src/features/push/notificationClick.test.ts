// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const origin = "https://ttakkari.example";
const script = readFileSync(new URL("../../../public/push-sw.js", import.meta.url), "utf8");

function setup(windows: object[] = []) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const openWindow = vi.fn<(url: string) => Promise<ReturnType<typeof client> | null>>().mockResolvedValue(null);
  const showNotification = vi.fn().mockResolvedValue(undefined);
  runInNewContext(script, {
    URL,
    self: {
      location: { origin },
      addEventListener: (type: string, listener: (event: unknown) => void) => { listeners[type] = listener; },
      registration: { showNotification },
      clients: { matchAll: vi.fn().mockResolvedValue(windows), openWindow },
    },
  });
  const click = async (url?: string) => {
    let done: Promise<unknown> | undefined;
    const close = vi.fn();
    listeners.notificationclick({ notification: { data: { url }, close }, waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    expect(close).toHaveBeenCalledOnce();
  };
  return { click, openWindow, listeners, showNotification };
}

function client(url = `${origin}/chat`) {
  const win = { url, focus: vi.fn(), navigate: vi.fn() };
  win.focus.mockResolvedValue(win);
  win.navigate.mockResolvedValue(win);
  return win;
}

describe("알림 클릭 목적지", () => {
  it("기존 창을 목적지로 이동한 뒤 활성화한다", async () => {
    const win = client();
    const { click, openWindow } = setup([win]);
    await click("/chat/session-1?artifact=file-2");
    expect(win.navigate).toHaveBeenCalledWith(`${origin}/chat/session-1?artifact=file-2`);
    expect(win.navigate.mock.invocationCallOrder[0]).toBeLessThan(win.focus.mock.invocationCallOrder[0]);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("활성화가 거절되어도 기존 창에 목적지를 전달한다", async () => {
    const win = client();
    win.focus.mockRejectedValue(new Error("background client"));
    const { click } = setup([win]);
    await click("/meetings/meeting-1");
    expect(win.navigate).toHaveBeenCalledWith(`${origin}/meetings/meeting-1`);
  });

  it("기존 창 이동이 실패하면 새 창으로 해당 페이지를 연다", async () => {
    const win = client();
    win.navigate.mockRejectedValue(new Error("uncontrolled"));
    const { click, openWindow } = setup([win]);
    await click("/calendar?event=event-1&date=2026-10-15");
    expect(openWindow).toHaveBeenCalledWith(`${origin}/calendar?event=event-1&date=2026-10-15`);
  });

  it("앱이 닫혀 있으면 목적지로 바로 연다", async () => {
    const { click, openWindow } = setup();
    await click("/work/session-1");
    expect(openWindow).toHaveBeenCalledWith(`${origin}/work/session-1`);
  });

  it("새로 열린 PWA가 시작 화면을 반환해도 목적지로 이동한다", async () => {
    const win = client();
    const { click, openWindow } = setup();
    openWindow.mockResolvedValue(win);
    await click("/chat/session-1");
    expect(win.navigate).toHaveBeenCalledWith(`${origin}/chat/session-1`);
  });

  it("이동 결과가 없으면 새 창으로 목적지를 연다", async () => {
    const win = client();
    win.navigate.mockResolvedValue(null);
    const { click, openWindow } = setup([win]);
    await click("/chat/session-1");
    expect(openWindow).toHaveBeenCalledWith(`${origin}/chat/session-1`);
  });

  it("이미 목적지에 있으면 다시 로드하지 않는다", async () => {
    const win = client(`${origin}/chat/session-1`);
    const { click } = setup([win]);
    await click("/chat/session-1");
    expect(win.navigate).not.toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalledOnce();
  });

  it("목적지가 없는 이전 알림은 채팅으로 연다", async () => {
    const { click, openWindow } = setup();
    await click();
    expect(openWindow).toHaveBeenCalledWith(`${origin}/chat`);
  });
});
