import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Select } from "./Select";

afterEach(cleanup);

const options = [
  { value: "", label: "기본" },
  { value: "low", label: "낮음" },
  { value: "high", label: "높음" },
];

describe("Select 키보드 계약", () => {
  it("↓ 로 열면 고른 항목에 포커스, ↓ Enter 로 다음 값을 고르고 트리거로 돌아간다", () => {
    const onChange = vi.fn();
    render(<Select id="s" value="low" options={options} onChange={onChange} />);
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.textContent).toBe("낮음");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("높음");
    fireEvent.click(document.activeElement!);
    expect(onChange).toHaveBeenCalledWith("high");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("Esc 는 값을 바꾸지 않고 닫는다, 같은 값을 다시 고르면 onChange 를 부르지 않는다", () => {
    const onChange = vi.fn();
    render(<Select id="s" value="" options={options} onChange={onChange} />);
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "기본" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Select 열림 위치", () => {
  const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  /** jsdom 은 레이아웃이 없어서 트리거·탭바 좌표와 목록 높이를 직접 정한다. */
  function layout({ triggerTop, innerHeight, menuHeight, tabbarTop }: { triggerTop: number; innerHeight: number; menuHeight: number; tabbarTop: number }) {
    const tabbar = document.createElement("nav");
    tabbar.className = "tk-tabbar";
    document.body.append(tabbar);
    vi.stubGlobal("innerHeight", innerHeight);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this === tabbar) return rect(tabbarTop, innerHeight - tabbarTop);
      if (this.getAttribute("role") === "combobox") return rect(triggerTop, 40);
      return rect(0, 0);
    });
    const boxHeight = (el: HTMLElement) => (el.style.getPropertyValue("--tk-select-room") ? parseFloat(el.style.getPropertyValue("--tk-select-room")) : menuHeight);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute("role") === "listbox") return boxHeight(this);
      return this.getAttribute("role") === "option" ? 40 : 0;
    });
    // 테두리 2px 를 뺀 안쪽 높이
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("role") === "listbox" ? boxHeight(this) - 2 : 0;
    });
    return tabbar;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.querySelector(".tk-tabbar")?.remove();
  });

  it("아래 칸이 탭바에 막히면 위로 열고, 위 칸에 다 들어가면 높이를 줄이지 않는다", () => {
    layout({ triggerTop: 272, innerHeight: 390, menuHeight: 90, tabbarTop: 325 });
    render(<Select id="s" value="" options={options} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    const list = screen.getByRole("listbox");
    expect(list.className).toContain("tk-menu--up");
    expect(list.style.getPropertyValue("--tk-select-room")).toBe("");
  });

  it("어느 쪽에도 다 안 들어가면 넉넉한 쪽으로 열고 남는 칸만큼 높이를 제한한다", () => {
    layout({ triggerTop: 150, innerHeight: 390, menuHeight: 300, tabbarTop: 325 });
    render(<Select id="s" value="" options={options} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    const list = screen.getByRole("listbox");
    // 위 칸 150 - 12 = 138, 아래 칸 325 - 190 - 12 = 123 → 위
    expect(list.className).toContain("tk-menu--up");
    expect(list.style.getPropertyValue("--tk-select-room")).toBe("138px");
  });

  it("아래 칸이 충분하면 아래로 열고 열린 뒤에도 항목 포커스는 그대로다", () => {
    layout({ triggerTop: 100, innerHeight: 800, menuHeight: 90, tabbarTop: 735 });
    render(<Select id="s" value="low" options={options} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox").className).not.toContain("tk-menu--up");
    expect(document.activeElement?.textContent).toBe("낮음");
  });
});
