import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { resetUpdateStateForTest } from "./pwaUpdate";

afterEach(() => {
  cleanup();
  resetUpdateStateForTest();
  vi.restoreAllMocks();
});

function Stale(): never {
  throw new TypeError("'text/html' is not a valid JavaScript MIME type for module script 'https://x/assets/CalendarPage-OBUAh2ZN.js'.");
}

describe("AppErrorBoundary", () => {
  it("렌더 예외에도 빈 화면 대신 다시 읽기 버튼이 남는다", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    resetUpdateStateForTest(reload);
    const { container } = render(<AppErrorBoundary><Stale /></AppErrorBoundary>);
    expect(container.childElementCount).toBeGreaterThan(0);
    expect(screen.getByRole("alert").textContent).toContain("새 버전으로 바뀌어");
    fireEvent.click(screen.getByRole("button", { name: "다시 읽기" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
