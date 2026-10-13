import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CanvasBoundary } from "./CanvasBoundary";

afterEach(cleanup);

let boom = true;
function Flaky() {
  if (boom) throw new Error("판 오류");
  return <p>판</p>;
}

describe("CanvasBoundary", () => {
  it("판 오류는 판 자리에만 안내를 보이고, 다시 그리면 돌아온다", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <>
        <CanvasBoundary>
          <Flaky />
        </CanvasBoundary>
        <p>입력창</p>
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain("판 오류");
    expect(screen.getByText("입력창")).toBeTruthy();
    boom = false;
    fireEvent.click(screen.getByRole("button", { name: /다시 그리기/ }));
    expect(screen.getByText("판")).toBeTruthy();
    err.mockRestore();
  });
});
