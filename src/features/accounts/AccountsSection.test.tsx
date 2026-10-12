import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AccountOut } from "../../api/types";
import { ApiError } from "../../api/client";
import { AccountsSection } from "./AccountsSection";

const acc = (o: Partial<AccountOut>): AccountOut => ({
  id: "a", name: "claude", engine: "claude", pool: "personal", config_dir: null, enabled: true, priority: 0, login: "ok",
  login_label: "me@example.com", cooldown_seconds: 0, ...o,
});
const api = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  patchAccount: vi.fn(),
  reorderAccounts: vi.fn(),
  createAccount: vi.fn(),
  deleteAccount: vi.fn(),
  clearAccountCooldown: vi.fn(),
}));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));

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

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><AccountsSection /></QueryClientProvider>);
}

describe("AccountsSection", () => {
  it("우선순위 번호·로그인·한도 대기를 보이고, 스위치로 끈다", async () => {
    api.listAccounts.mockResolvedValue([acc({}), acc({ id: "b", name: "codex", engine: "codex", login: "unknown", login_label: null, cooldown_seconds: 600, login_command: "codex login" })]);
    api.patchAccount.mockResolvedValue(acc({ enabled: false }));
    renderIt();
    expect(await screen.findByText("me@example.com")).toBeTruthy();
    expect(screen.getByLabelText("2순위")).toBeTruthy();
    expect(screen.getByText("로그인 필요")).toBeTruthy();
    expect(screen.getByText("한도 대기 10분")).toBeTruthy();
    // 로그인 안 된 계정에만 로그인 명령과 복사 버튼이 보인다.
    expect(screen.getByText("codex login")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "복사" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("switch", { name: "claude 사용" }));
    await waitFor(() => expect(api.patchAccount).toHaveBeenCalledWith("a", { enabled: false }));
  });

  it("켜진 계정이 없으면 경고한다", async () => {
    api.listAccounts.mockResolvedValue([acc({ enabled: false })]);
    renderIt();
    expect(await screen.findByText(/켜진 계정이 없어요/)).toBeTruthy();
  });

  it("회사 그룹 계정도 같은 목록에 배지로 보이고, 메뉴로 그룹에서 뺀다", async () => {
    api.listAccounts.mockResolvedValue([acc({}), acc({ id: "w", name: "FDE", pool: "work", priority: 1 })]);
    api.patchAccount.mockResolvedValue(acc({ id: "w", name: "FDE", pool: "personal", priority: 1 }));
    renderIt();
    expect(await screen.findByText("FDE")).toBeTruthy();
    expect(screen.getByLabelText("2순위")).toBeTruthy();
    expect(screen.getAllByText("회사")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "FDE 메뉴" }));
    fireEvent.click(await screen.findByRole("button", { name: "회사 그룹에서 빼기" }));
    await waitFor(() => expect(api.patchAccount).toHaveBeenCalledWith("w", { pool: "personal" }));
  });
  it("stale permanent order retries with the latest server account list", async () => {
    const a = acc({ id: "a", name: "A" });
    const b = acc({ id: "b", name: "B", priority: 1 });
    const stale = acc({ id: "deleted", name: "삭제된 계정", priority: 2 });
    const c = acc({ id: "c", name: "C", priority: 2 });
    api.listAccounts.mockResolvedValueOnce([a, b, stale]).mockResolvedValueOnce([a, b, c]);
    api.reorderAccounts
      .mockRejectedValueOnce(new ApiError(400, { code: "bad_input", message: "모든 계정 id 를 한 번씩 보내야 합니다." }))
      .mockResolvedValueOnce([b, a, c]);
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "B 메뉴" }));
    fireEvent.click(await screen.findByRole("button", { name: "위로" }));
    await waitFor(() => expect(api.reorderAccounts).toHaveBeenCalledTimes(2));
    expect(api.reorderAccounts).toHaveBeenNthCalledWith(1, ["b", "a", "deleted"]);
    expect(api.reorderAccounts).toHaveBeenNthCalledWith(2, ["b", "a", "c"]);
    expect(await screen.findByLabelText("3순위")).toBeTruthy();
  });

  it("disables drag handles while a permanent order save is pending", async () => {
    const a = acc({ id: "a", name: "A" });
    const b = acc({ id: "b", name: "B", priority: 1 });
    let finish!: (rows: AccountOut[]) => void;
    api.listAccounts.mockResolvedValue([a, b]);
    api.reorderAccounts.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "B 메뉴" }));
    fireEvent.click(await screen.findByRole("button", { name: "위로" }));
    await waitFor(() => expect(api.reorderAccounts).toHaveBeenCalledTimes(1));
    const handles = screen.getAllByRole("button", { name: "끌어서 순서 바꾸기" });
    expect(handles.every((h) => (h as HTMLButtonElement).disabled)).toBe(true);
    finish([b, a]);
  });

});
