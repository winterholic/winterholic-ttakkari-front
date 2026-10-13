import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { scrollDeltaForCaret, useCaretVisible } from "./caret";

describe("scrollDeltaForCaret", () => {
  it("보이는 구간 안이면 움직이지 않는다", () => {
    expect(scrollDeltaForCaret(100, 120, 0, 400)).toBe(0);
  });
  it("캐럿이 아래로 넘어가면 여백까지 포함해 그만큼 내린다", () => {
    expect(scrollDeltaForCaret(390, 410, 0, 400, 16)).toBe(26);
  });
  it("캐럿이 위로 넘어가면 올린다", () => {
    expect(scrollDeltaForCaret(-30, -10, 0, 400, 16)).toBe(-46);
  });
  it("구간이 캐럿 줄보다 좁아도 아래쪽(입력 위치)을 우선한다", () => {
    expect(scrollDeltaForCaret(100, 120, 0, 10, 0)).toBe(110);
  });
});

const LINE = 20;
const SCROLLER = { top: 0, bottom: 700 };
const TA_TOP = 100;

function Harness({ value }: { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useCaretVisible(ref, value, true);
  return (
    <div className="memo-editor">
      <div data-testid="scroller" style={{ overflowY: "auto" }}>
        <textarea ref={ref} value={value} onChange={() => {}} />
      </div>
    </div>
  );
}

// jsdom 은 배치를 계산하지 않는다. 줄 높이 20px, 텍스트에어리어 위쪽 100px, 스크롤 상자 0~700px 로 가정하고 센다.
function stubLayout(vvHeight: number) {
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === "SPAN" ? ((this.parentElement?.textContent ?? "").split("\n").length - 1) * LINE : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => LINE });
  const rect = (el: Element) => {
    if (el.tagName === "TEXTAREA") {
      // 스크롤 상자를 내린 만큼 텍스트에어리어가 위로 올라간다.
      const top = TA_TOP - (el.closest<HTMLElement>("[data-testid=scroller]")?.scrollTop ?? 0);
      return { top, bottom: top + 300, left: 0, right: 0, width: 0, height: 300, x: 0, y: top, toJSON() {} };
    }
    return { ...SCROLLER, left: 0, right: 0, width: 0, height: SCROLLER.bottom, x: 0, y: 0, toJSON() {} };
  };
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return rect(this) as DOMRect;
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { offsetTop: 0, height: vvHeight, addEventListener() {}, removeEventListener() {} },
  });
}

describe("useCaretVisible", () => {
  beforeEach(() => stubLayout(400));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as { offsetTop?: number }).offsetTop;
    delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    Reflect.deleteProperty(window, "visualViewport");
  });

  const lines = (n: number) => "줄\n".repeat(n);

  it("엔터로 캐럿이 키보드(보이는 영역 400px) 밑으로 내려가면 스크롤 상자를 내려 캐럿 줄을 위로 올린다", () => {
    const { getByTestId, container, rerender } = render(<Harness value={lines(2)} />);
    const ta = container.querySelector("textarea")!;
    act(() => ta.focus());
    rerender(<Harness value={lines(3)} />);
    const scroller = getByTestId("scroller");
    expect(scroller.scrollTop).toBe(0); // 캐럿 줄 하단 100+60+20=180 → 보임
    // 줄 15개 뒤: 캐럿 줄은 100+300=400~420, 여백 16 → 36px 내린다
    rerender(<Harness value={lines(15)} />);
    expect(scroller.scrollTop).toBe(36);
    // 엔터를 두 번 더: 줄마다 20px 씩 더 따라간다
    rerender(<Harness value={lines(16)} />);
    rerender(<Harness value={lines(17)} />);
    expect(scroller.scrollTop).toBe(36 + 2 * LINE);
  });

  it("키보드가 가린 높이만큼 편집기 아래 여백을 주고, 포커스를 잃으면 거둔다", () => {
    const { container, rerender } = render(<Harness value={lines(1)} />);
    const ta = container.querySelector("textarea")!;
    const editor = container.querySelector<HTMLElement>(".memo-editor")!;
    act(() => ta.focus());
    rerender(<Harness value={lines(2)} />);
    expect(editor.style.getPropertyValue("--memo-kbd-inset")).toBe("300px"); // 700 - 400
    act(() => ta.blur());
    rerender(<Harness value={lines(3)} />);
    expect(editor.style.getPropertyValue("--memo-kbd-inset")).toBe("0px");
  });

  it("포커스가 다른 칸에 있으면 본문 스크롤을 건드리지 않는다", () => {
    const { getByTestId, rerender } = render(<Harness value={lines(1)} />);
    rerender(<Harness value={lines(30)} />);
    expect(getByTestId("scroller").scrollTop).toBe(0);
  });
});
