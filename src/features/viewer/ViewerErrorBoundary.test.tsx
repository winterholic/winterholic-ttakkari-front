import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerErrorBoundary } from "./ViewerErrorBoundary";

function Boom(): never {
  throw new Error("렌더러 폭발");
}

describe("ViewerErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("렌더러가 던져도 닫기 버튼이 남고 누르면 onClose", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onClose = vi.fn();
    render(<ViewerErrorBoundary onClose={onClose} withToolbar><Boom /></ViewerErrorBoundary>);
    expect(screen.getByRole("alert").textContent).toContain("렌더러 폭발");
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("청크 오류면 같은 자리 다시 시도 대신 새 버전 다시 읽기", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Stale(): never {
      throw new TypeError("Importing a module script failed.");
    }
    render(<ViewerErrorBoundary onClose={() => {}}><Stale /></ViewerErrorBoundary>);
    expect(screen.getByRole("alert").getAttribute("data-viewer-error")).toBe("stale");
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(screen.getByRole("button", { name: "다시 읽기" })).toBeTruthy();
  });

  it("다른 결과물을 열면(resetKey) 오류 화면을 버린다", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<ViewerErrorBoundary onClose={() => {}} resetKey="a"><Boom /></ViewerErrorBoundary>);
    expect(screen.queryByRole("alert")).not.toBeNull();
    rerender(<ViewerErrorBoundary onClose={() => {}} resetKey="b"><p>정상</p></ViewerErrorBoundary>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("정상")).toBeTruthy();
  });
});
