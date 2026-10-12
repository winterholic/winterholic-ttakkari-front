import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useForegroundResync } from "./useForegroundResync";

describe("useForegroundResync", () => {
  it("화면이 보일 때와 online, pageshow 에서 부르고 해제 후에는 부르지 않는다", () => {
    const fn = vi.fn();
    const { unmount } = renderHook(() => useForegroundResync(fn));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("pageshow"));
    expect(fn).toHaveBeenCalledTimes(3);
    unmount();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("숨겨진 상태에서는 부르지 않는다", () => {
    const fn = vi.fn();
    renderHook(() => useForegroundResync(fn));
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    spy.mockRestore();
    expect(fn).not.toHaveBeenCalled();
  });
});
