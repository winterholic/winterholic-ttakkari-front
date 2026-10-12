import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useKeyboardOpen } from "./useKeyboardOpen";

function Probe() {
  useKeyboardOpen();
  return (
    <>
      <textarea aria-label="t" />
      <input type="checkbox" aria-label="c" />
    </>
  );
}

const on = () => "kbd" in document.documentElement.dataset;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useKeyboardOpen", () => {
  it("글자 입력 칸에 포커스가 있을 때만 data-kbd 를 켠다", () => {
    vi.useFakeTimers();
    const { getByLabelText } = render(<Probe />);
    act(() => getByLabelText("c").focus());
    expect(on()).toBe(false);
    act(() => getByLabelText("t").focus());
    expect(on()).toBe(true);
    act(() => getByLabelText("t").blur());
    act(() => void vi.advanceTimersByTime(200));
    expect(on()).toBe(false);
  });
});
