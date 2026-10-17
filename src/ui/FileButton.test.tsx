import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FileButton } from "./FileButton";

afterEach(cleanup);

describe("FileButton", () => {
  it("input 을 hidden(display:none)으로 두지 않고 버튼과 같은 상자(.tk-file-slot) 안에 둔다", () => {
    const { container } = render(<FileButton aria-label="파일 첨부" onFiles={() => {}} />);
    const slot = container.querySelector(".tk-file-slot");
    const input = container.querySelector<HTMLInputElement>("input[type=file]");
    expect(slot).toBeTruthy();
    expect(slot?.contains(input)).toBe(true);
    expect(slot?.contains(screen.getByRole("button", { name: "파일 첨부" }))).toBe(true);
    // input 과 버튼에 같은 레이아웃 상자를 사용한다.
    expect(input?.hasAttribute("hidden")).toBe(false);
    expect(input?.getAttribute("style") ?? "").not.toMatch(/display:\s*none/);
    expect(input?.getAttribute("aria-hidden")).toBe("true");
    expect(input?.tabIndex).toBe(-1);
  });

  it("버튼을 누르면 input.click() 으로 넘기고, 고른 파일을 넘긴 뒤 값을 비운다", () => {
    const onFiles = vi.fn();
    const { container } = render(<FileButton aria-label="파일 첨부" multiple accept="image/*" onFiles={onFiles} />);
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "파일 첨부" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe("image/*");
    const file = new File(["x"], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("고른 파일이 없으면 onFiles 를 부르지 않는다", () => {
    const onFiles = vi.fn();
    const { container } = render(<FileButton aria-label="파일 첨부" onFiles={onFiles} />);
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [] } });
    expect(onFiles).not.toHaveBeenCalled();
  });
});
