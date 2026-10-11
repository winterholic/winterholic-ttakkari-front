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
