import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";
import { THEME_KEY } from "./useTheme";

beforeEach(() => {
  document.head.innerHTML =
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="x"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="y">';
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});
afterEach(cleanup);

describe("ThemeToggle", () => {
  it("누르면 data-theme 과 localStorage 와 aria-pressed 가 함께 바뀐다", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: "다크 모드 전환" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(btn);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    // 상태 표시줄 색도 강제된 테마에 맞춰진다
    const colors = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content"));
    expect(new Set(colors).size).toBe(1);
    expect(colors[0]).not.toBe("x");

    fireEvent.click(btn);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("이미 다크로 강제돼 있으면 pressed 로 시작한다", () => {
    document.documentElement.dataset.theme = "dark";
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "다크 모드 전환" }).getAttribute("aria-pressed")).toBe("true");
  });
});
