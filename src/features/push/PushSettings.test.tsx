import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PushSettings } from "./PushSettings";
import type { PushState } from "./pushState";

const hook = vi.hoisted(() => ({ state: "off" as PushState, enable: vi.fn(), disable: vi.fn(), test: vi.fn() }));
vi.mock("./usePush", () => ({
  usePush: () => ({ state: hook.state, busy: false, error: null, enable: hook.enable, disable: hook.disable, test: hook.test }),
}));

beforeEach(() => {
  // jsdom 의 showModal 은 미구현이라 open 속성만 흉내 낸다.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function open() {
  render(<PushSettings />);
  fireEvent.click(screen.getByRole("button", { name: "알림 설정" }));
}

describe("PushSettings", () => {
  it("꺼짐: 스위치를 누르면 enable", () => {
    hook.state = "off";
    open();
    const sw = screen.getByRole("switch", { hidden: true });
    expect((sw as HTMLInputElement).checked).toBe(false);
    fireEvent.click(sw);
    expect(hook.enable).toHaveBeenCalledOnce();
  });
  it("켜짐: 스위치를 누르면 disable, 테스트 버튼 활성", () => {
    hook.state = "on";
    open();
    fireEvent.click(screen.getByRole("switch", { hidden: true }));
    expect(hook.disable).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", { name: "테스트 알림", hidden: true }) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each([
    ["denied", "차단"],
    ["unsupported", "지원하지 않습니다"],
    ["needs-install", "홈 화면에 추가"],
  ] as const)("%s: 스위치 비활성 + 안내 문구", (state, text) => {
    hook.state = state;
    open();
    expect((screen.getByRole("switch", { hidden: true }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId("push-message").textContent).toContain(text);
    expect((screen.getByRole("button", { name: "테스트 알림", hidden: true }) as HTMLButtonElement).disabled).toBe(true);
  });
});
