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
  sw.register.mockResolvedValue({ update });
  vi.stubGlobal("navigator", { serviceWorker: sw });
  const reload = vi.fn();
  resetUpdateStateForTest(reload);
  setupPwaUpdate();
  return { sw, reload, update };
}

describe("PWA 새 배포 확인", () => {
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
