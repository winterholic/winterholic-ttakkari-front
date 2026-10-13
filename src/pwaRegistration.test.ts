import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetUpdateStateForTest, setupPwaUpdate } from "./pwaUpdate";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
});

afterEach(() => {
  resetUpdateStateForTest();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(controller: object | null) {
  const sw = Object.assign(new EventTarget(), { controller, register: vi.fn() });
  const update = vi.fn().mockResolvedValue(undefined);
  const registration = Object.assign(new EventTarget(), {
    update,
    waiting: null as { postMessage: (value: unknown) => void } | null,
    installing: null as (EventTarget & { state: string }) | null,
  });
  sw.register.mockResolvedValue(registration);
  vi.stubGlobal("navigator", { serviceWorker: sw });
  const reload = vi.fn();
  resetUpdateStateForTest(reload);
  setupPwaUpdate();
  return { sw, reload, update, registration };
}

describe("PWA 새 배포 확인", () => {
  it("이미 대기 중인 새 서비스워커를 활성화한다", async () => {
    const { registration } = setup({});
    const postMessage = vi.fn();
    registration.waiting = { postMessage };
    await Promise.resolve();
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("앱을 연 뒤 설치된 새 서비스워커도 대기 상태에 남기지 않는다", async () => {
    const { registration } = setup({});
    await Promise.resolve();
    const worker = Object.assign(new EventTarget(), { state: "installing", postMessage: vi.fn() });
    registration.installing = worker;
    registration.dispatchEvent(new Event("updatefound"));
    worker.state = "installed";
    registration.waiting = worker;
    worker.dispatchEvent(new Event("statechange"));
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("첫 설치로 제어권을 받았을 때는 유지하고, 그다음 배포에서는 다시 읽는다", () => {
    const { sw, reload } = setup(null);
    sw.controller = {};
    sw.dispatchEvent(new Event("controllerchange"));
    expect(reload).not.toHaveBeenCalled();
    sw.controller = {};
    sw.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("데스크톱 창으로 돌아올 때 새 배포를 확인한다", async () => {
    const { update } = setup({});
    await Promise.resolve();
    update.mockClear();
    window.dispatchEvent(new Event("focus"));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("이미 제어 중인 앱은 새 워커가 활성화되면 다시 읽는다", () => {
    const { sw, reload } = setup({});
    sw.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
