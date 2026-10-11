import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Menu } from "./Menu";
import { ToastRegion } from "./Toast";
import { clearToasts, toast } from "./toastStore";

afterEach(() => {
  cleanup();
  clearToasts();
  vi.useRealTimers();
});

describe("Menu 키보드 계약", () => {
  const items = [
    { label: "세션 고정", onSelect: vi.fn() },
    { label: "전체 실행 로그", onSelect: vi.fn() },
    { label: "세션 삭제…", onSelect: vi.fn(), danger: true },
  ];

  it("↓ 로 열고 방향키로 움직이고 Esc 로 닫으면 트리거로 돌아간다", () => {
    render(<Menu label="세션 메뉴" items={items}>···</Menu>);
    const trigger = screen.getByRole("button", { name: "세션 메뉴" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu");
    const first = screen.getByRole("menuitem", { name: "세션 고정" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "세션 삭제…" }));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("↑ 는 마지막 항목에서 열고, 항목을 고르면 닫고 실행한다", () => {
    render(<Menu label="세션 메뉴" items={items}>···</Menu>);
    const trigger = screen.getByRole("button", { name: "세션 메뉴" });
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "세션 삭제…" }));
    fireEvent.click(document.activeElement as HTMLElement);
    expect(items[2].onSelect).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Toast", () => {
  it("행동이 없으면 5초 뒤 닫히고, 행동이 있으면 닫히지 않는다", () => {
    vi.useFakeTimers();
    render(<ToastRegion />);
    expect(screen.getByRole("status")).toBeTruthy();

    act(() => {
      toast({ message: "복사했어요" });
      toast({ message: "요약이 끝났어요", tone: "success", action: { label: "열기" } });
    });
    expect(screen.getByText("복사했어요")).toBeTruthy();

    act(() => void vi.advanceTimersByTime(6000));
    expect(screen.queryByText("복사했어요")).toBeNull();
    expect(screen.getByText("요약이 끝났어요")).toBeTruthy();

    const onClick = vi.fn();
    act(() => void toast({ message: "x", action: { label: "보기", onClick } }));
    fireEvent.click(screen.getByRole("button", { name: "보기" }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("Menu 토글 항목", () => {
  it("menuitemcheckbox 로 상태를 알리고, 눌러도 메뉴를 닫지 않는다", () => {
    const onSelect = vi.fn();
    render(<Menu label="사용자 메뉴" items={[{ label: "다크 모드", checked: false, onSelect }]}><span>열기</span></Menu>);
    fireEvent.click(screen.getByRole("button", { name: "사용자 메뉴" }));
    const item = screen.getByRole("menuitemcheckbox", { name: "다크 모드" });
    expect(item.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "사용자 메뉴" }).getAttribute("aria-expanded")).toBe("true");
  });
});
