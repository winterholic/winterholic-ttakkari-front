import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AccountOut } from "../../api/types";
import { AccountsSection } from "./AccountsSection";

const acc = (o: Partial<AccountOut>): AccountOut => ({
  id: "a", name: "claude", engine: "claude", config_dir: null, enabled: true, priority: 0, login: "ok",
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
});
