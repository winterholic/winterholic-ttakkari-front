import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useThreadFollow } from "./useThreadFollow";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("과거 대화를 붙인 뒤 사용자가 새로 읽는 위치를 후속 높이 갱신에서도 지킨다", () => {
  vi.useFakeTimers();
  let resize = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  function Thread() {
    const thread = useThreadFollow("conversation");
    return (
      <div ref={thread.ref} data-testid="thread">
        <button onClick={thread.holdPosition}>이전 대화</button>
        <div ref={thread.inner}>
          <article className="tk-message" data-testid="old">기준 메시지</article>
          <article className="tk-message" data-testid="new">이동해서 읽는 메시지</article>
        </div>
      </div>
    );
  }
  const page = render(<Thread />);
  const thread = page.getByTestId("thread");
  const box = (top: number, height: number) => new DOMRect(0, top, 300, height);
  let oldTop = 200;
  let newTop = 500;
  let total = 950;
  Object.defineProperties(thread, {
    clientHeight: { value: 140 },
    scrollHeight: { get: () => total },
  });
  thread.getBoundingClientRect = () => box(0, 140);
  page.getByTestId("old").getBoundingClientRect = () => box(oldTop - thread.scrollTop, 80);
  page.getByTestId("new").getBoundingClientRect = () => box(newTop - thread.scrollTop, 80);

  thread.scrollTop = 190;
  act(() => page.getByRole("button").click());
  oldTop += 200;
  newTop += 200;
  total += 200;
  act(resize);
  expect(thread.scrollTop).toBe(390);

  act(() => {
    vi.advanceTimersByTime(200);
    thread.dispatchEvent(new WheelEvent("wheel", { deltaY: 300 }));
    thread.scrollTop = 690;
    thread.dispatchEvent(new Event("scroll"));
  });
  expect(page.getByTestId("new").getBoundingClientRect().top).toBe(10);

  act(() => {
    total += 60;
    resize();
  });
  expect(page.getByTestId("new").getBoundingClientRect().top).toBe(10);
});
