import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AccountOut } from "../../api/types";
import { ApiError } from "../../api/client";
import { AccountsSection } from "./AccountsSection";

const acc = (o: Partial<AccountOut>): AccountOut => ({
  id: "a", name: "claude", engine: "claude", pool: "personal", config_dir: null, enabled: true, priority: 0, max_used_percent: 100, work_enabled: true, work_priority: 0, login: "ok",
  login_label: "me@example.com", cooldown_seconds: 0, ...o,
});
const api = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  getAccountStatus: vi.fn(),
  patchAccount: vi.fn(),
  reorderAccounts: vi.fn(),
  createAccount: vi.fn(),
  deleteAccount: vi.fn(),
  clearAccountCooldown: vi.fn(),
  checkAntigravityAccount: vi.fn(),
  checkOpencodeAccount: vi.fn(),
  checkCopilotAccount: vi.fn(),
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
  return qc;
}

describe("AccountsSection", () => {
  it("인증 확인 후 목록을 다시 받아도 예전 로그인 상태로 돌아가지 않는다", async () => {
    const a = acc({ engine: "copilot", login: "unknown", status_pending: true, login_label: null });
    api.listAccounts.mockResolvedValue([a]);
    api.getAccountStatus.mockResolvedValue({ login: "unknown", login_label: null, login_command: "copilot login", auth_state: "setup_required" });
    api.checkCopilotAccount.mockResolvedValue({ ...a, status_pending: false, login: "ok", login_label: "new@example.test", auth_state: "authenticated", login_command: null });
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "인증 확인" }));
    await waitFor(() => expect(api.listAccounts).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("GitHub Copilot (new@example.test)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "인증 확인" })).toBeNull();
  });

  it("느린 계정의 상태를 기다리지 않고 목록과 다른 계정 상태를 보이고 요청을 모드 간 공유한다", async () => {
    const slow = acc({ id: "slow", name: "느린 계정", pool: "work", status_pending: true, login: "unknown" });
    const fast = acc({ id: "fast", name: "빠른 계정", pool: "work", status_pending: true, login: "unknown" });
    api.listAccounts.mockResolvedValue([slow, fast]);
    api.getAccountStatus.mockImplementation((id: string) => id === "slow" ? new Promise(() => {}) : Promise.resolve({ login: "ok", login_label: "fast@example.test" }));
    renderIt();
    await screen.findAllByText("빠른 계정");
    expect(screen.getAllByRole("switch", { name: /느린 계정.*사용/ })).toHaveLength(2);
    expect(await screen.findAllByText("fast@example.test")).toHaveLength(2);
    expect(screen.getAllByText("로그인 상태 확인 중")).toHaveLength(2);
    expect(screen.queryByText("로그인 필요")).toBeNull();
    expect(api.getAccountStatus).toHaveBeenCalledTimes(2);
    expect(api.listAccounts).toHaveBeenCalledTimes(1);
  });

  it("계정 상태 조회 실패를 해당 행에서 재시도하며 목록 조작을 유지한다", async () => {
    api.listAccounts.mockResolvedValue([acc({ status_pending: true })]);
    api.getAccountStatus.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ login: "ok", login_label: "recovered@example.test" });
    api.patchAccount.mockResolvedValue(acc({ enabled: false }));
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "claude 상태 다시 확인" }));
    expect(await screen.findByText("recovered@example.test")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "claude 사용" }));
    await waitFor(() => expect(api.patchAccount).toHaveBeenCalledWith("a", { enabled: false }));
  });

  it("계정별 사용 상한을 설정한다", async () => {
    api.listAccounts.mockResolvedValue([acc({})]);
    api.patchAccount.mockResolvedValue(acc({ max_used_percent: 90 }));
    renderIt();
    await screen.findByLabelText("claude 메뉴");
    fireEvent.click(screen.getByLabelText("claude 메뉴"));
    fireEvent.click(await screen.findByRole("button", { name: "이름·사용 상한" }));
    const cap = await screen.findByLabelText("사용 상한 (%)");
    fireEvent.change(cap, { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(api.patchAccount).toHaveBeenCalledWith("a", { name: "claude", max_used_percent: 90 }));
  });

  it("계정 이름과 엔진에 상관없이 새 계정의 상한은 100이고 입력 범위는 50~100이다", async () => {
    api.listAccounts.mockResolvedValue([acc({})]);
    api.createAccount.mockResolvedValue(acc({ id: "new", name: "내 클로드", max_used_percent: 100 }));
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "계정 추가" }));
    const name = await screen.findByLabelText("이름");
    fireEvent.change(name, { target: { value: "내 클로드" } });
    const cap = screen.getByLabelText("사용 상한 (%)") as HTMLInputElement;
    expect(cap.min).toBe("50");
    expect(cap.max).toBe("100");
    expect(cap.value).toBe("100");
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() => expect(api.createAccount).toHaveBeenCalledWith({ name: "내 클로드", engine: "claude", max_used_percent: 100 }));
  });

  it("Antigravity 계정을 단일 로그인 프로필로 추가하고 사용량 상한을 요구하지 않는다", async () => {
    api.listAccounts.mockResolvedValue([]);
    api.createAccount.mockResolvedValue(acc({
      id: "agy", name: "Antigravity", engine: "antigravity", login: "unknown",
      login_label: null, login_command: "agy",
    }));
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "계정 추가" }));
    fireEvent.change(await screen.findByLabelText("이름"), { target: { value: "Antigravity" } });
    fireEvent.click(screen.getByRole("combobox", { name: "엔진" }));
    fireEvent.click(screen.getByRole("option", { name: /Antigravity CLI/ }));
    expect(screen.queryByLabelText("사용 상한 (%)")).toBeNull();
    expect(screen.getByText(/로그인 상태는 앱에서 확인할 수 없어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() => expect(api.createAccount).toHaveBeenCalledWith({
      name: "Antigravity", engine: "antigravity", max_used_percent: 100,
    }));
  });

  it("Antigravity 추가 계정은 전용 로그인 명령과 계정 확인 단계를 보이고, 확인 뒤 준비 상태가 된다", async () => {
    const pending = acc({
      id: "agy2", name: "agy-b", engine: "antigravity", login: "missing", login_label: null,
      login_command: "env PYTHONPATH=/x python -m ttakkari.antigravity_accounts login /h/antigravity-home",
      auth_state: "auth_required", isolation_mode: "managed_home_keychain", execution_enabled: false,
    });
    api.listAccounts.mockResolvedValue([pending]);
    api.checkAntigravityAccount.mockResolvedValue({
      ...pending, login: "ok", login_label: "b@example.test", login_command: null, auth_state: "ready", execution_enabled: true,
    });
    renderIt();
    expect(await screen.findByText("로그인 필요")).toBeTruthy();
    expect(screen.getByText(/ttakkari\.antigravity_accounts login/)).toBeTruthy();
    const input = screen.getByLabelText("로그인한 Google 계정");
    fireEvent.change(input, { target: { value: "b@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인 확인" }));
    await waitFor(() => expect(api.checkAntigravityAccount).toHaveBeenCalledWith("agy2", { principal: "b@example.test", confirm: true }));
    expect(await screen.findByText("b@example.test")).toBeTruthy();
    expect(screen.queryByLabelText("로그인한 Google 계정")).toBeNull();
  });

  it("OpenCode 계정 추가 시 전용 보관함 안내를 보이고, 터미널 로그인 후 확인하면 인증 상태가 된다", async () => {
    const pending = acc({
      id: "oc1", name: "Copilot", engine: "opencode", login: "unknown", login_label: null,
      login_command: "TMPDIR=/tmp XDG_DATA_HOME=/h/data opencode auth login -p github-copilot",
      auth_state: "setup_required", isolation_mode: "managed_xdg_home", execution_enabled: false,
    });
    api.listAccounts.mockResolvedValue([pending]);
    api.checkOpencodeAccount.mockResolvedValue({
      ...pending, login: "ok", login_label: "user@github", login_command: null, auth_state: "authenticated", execution_enabled: true,
    });
    renderIt();
    expect(await screen.findByText("로그인 필요 · 터미널 명령 실행")).toBeTruthy();
    expect(screen.getByText(/opencode auth login -p github-copilot/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "인증 확인" }));
    await waitFor(() => expect(api.checkOpencodeAccount).toHaveBeenCalledWith("oc1"));
  });

  it("Copilot CLI 계정 추가 시 로그인 명령 안내를 보이고, 터미널 로그인 후 확인하면 인증 상태가 된다", async () => {
    const pending = acc({
      id: "cp1", name: "Copilot CLI", engine: "copilot", login: "unknown", login_label: null,
      login_command: "COPILOT_HOME=/h/copilot copilot login --device-code",
      auth_state: "setup_required", isolation_mode: "managed_copilot_home", execution_enabled: false,
    });
    api.listAccounts.mockResolvedValue([pending]);
    api.checkCopilotAccount.mockResolvedValue({
      ...pending, login: "ok", login_label: "user@github", login_command: null, auth_state: "authenticated", execution_enabled: true,
    });
    renderIt();
    expect(await screen.findByText("로그인 필요 · 터미널 명령 실행")).toBeTruthy();
    expect(screen.getByText(/copilot login --device-code/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "인증 확인" }));
    await waitFor(() => expect(api.checkCopilotAccount).toHaveBeenCalledWith("cp1"));
  });

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
    expect(await screen.findByText(/켜진 개인 계정이 없어요/)).toBeTruthy();
  });

  it("개인·회사 계정이 별개 섹션이고, 회사 계정은 개인 계정에서 고른 것만 보인다", async () => {
    api.listAccounts.mockResolvedValue([acc({}), acc({ id: "w", name: "FDE", pool: "work", priority: 1 })]);
    renderIt();
    await screen.findAllByLabelText("1순위");
    const personal = within(screen.getByRole("region", { name: "개인 계정" }));
    const work = within(screen.getByRole("region", { name: "회사 계정" }));
    expect(personal.getByText("claude")).toBeTruthy();
    expect(personal.getByText("FDE")).toBeTruthy();
    expect(personal.getAllByText("회사")).toHaveLength(1);
    expect(work.getByText("FDE")).toBeTruthy();
    expect(work.queryByText("claude")).toBeNull();
    // 계정 추가는 개인 계정에만 있다.
    expect(screen.getAllByRole("button", { name: "계정 추가" })).toHaveLength(1);
    expect(personal.getByRole("button", { name: "계정 추가" })).toBeTruthy();
  });

  it("같은 계정의 개인·회사 켜기는 독립이다", async () => {
    api.listAccounts.mockResolvedValue([acc({ id: "w", name: "FDE", pool: "work", enabled: false, work_enabled: true })]);
    api.patchAccount.mockResolvedValue(acc({ id: "w", name: "FDE", pool: "work", enabled: false, work_enabled: false }));
    renderIt();
    await screen.findAllByLabelText("1순위");
    const personal = within(screen.getByRole("region", { name: "개인 계정" }));
    const work = within(screen.getByRole("region", { name: "회사 계정" }));
    expect((personal.getByRole("switch", { name: "FDE 사용" }) as HTMLInputElement).checked).toBe(false);
    expect((work.getByRole("switch", { name: "FDE 회사 사용" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(work.getByRole("switch", { name: "FDE 회사 사용" }));
    await waitFor(() => expect(api.patchAccount).toHaveBeenCalledWith("w", { work_enabled: false }));
    // 회사 쪽만 껐으니 개인 쪽 스위치와 경고는 바뀌지 않는다.
    await waitFor(() => expect((work.getByRole("switch", { name: "FDE 회사 사용" }) as HTMLInputElement).checked).toBe(false));
    expect((personal.getByRole("switch", { name: "FDE 사용" }) as HTMLInputElement).checked).toBe(false);
    expect(await work.findByText(/켜진 회사 계정이 없어요/)).toBeTruthy();
    fireEvent.click(personal.getByRole("switch", { name: "FDE 사용" }));
    await waitFor(() => expect(api.patchAccount).toHaveBeenLastCalledWith("w", { enabled: true }));
  });

  it("개인 계정 메뉴에서 회사 계정에 넣고 뺀다. 회사 계정 메뉴에는 추가·삭제가 없다", async () => {
    api.listAccounts.mockResolvedValue([acc({}), acc({ id: "w", name: "FDE", pool: "work", priority: 1 })]);
    api.patchAccount.mockResolvedValue(acc({ id: "w", name: "FDE", pool: "personal", priority: 1 }));
    renderIt();
    await screen.findAllByLabelText("1순위");
    const personal = within(screen.getByRole("region", { name: "개인 계정" }));
    const work = within(screen.getByRole("region", { name: "회사 계정" }));
    fireEvent.click(work.getByRole("button", { name: "FDE 메뉴" }));
    expect(await screen.findByRole("button", { name: "위로" })).toBeTruthy();
    for (const name of ["삭제", "이름·사용 상한", "회사 계정에서 빼기", "회사 계정에 넣기"]) expect(screen.queryByRole("button", { name })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(personal.getByRole("button", { name: "FDE 메뉴" }));
    fireEvent.click(await screen.findByRole("button", { name: "회사 계정에서 빼기" }));
    await waitFor(() => expect(api.patchAccount).toHaveBeenCalledWith("w", { pool: "personal" }));
  });

  it("회사 계정 순서는 회사 순서로만 저장한다", async () => {
    const a = acc({ id: "a", name: "A", pool: "work", priority: 0, work_priority: 1 });
    const b = acc({ id: "b", name: "B", pool: "work", priority: 1, work_priority: 0 });
    api.listAccounts.mockResolvedValue([a, b]);
    api.reorderAccounts.mockResolvedValue([a, b]);
    renderIt();
    await screen.findAllByLabelText("1순위");
    const work = within(screen.getByRole("region", { name: "회사 계정" }));
    // 회사 목록은 work_priority 순이라 B, A 로 보인다.
    expect(work.getAllByRole("button", { name: /메뉴$/ }).map((x) => x.getAttribute("aria-label"))).toEqual(["B 메뉴", "A 메뉴"]);
    fireEvent.click(work.getByRole("button", { name: "A 메뉴" }));
    fireEvent.click(await screen.findByRole("button", { name: "위로" }));
    await waitFor(() => expect(api.reorderAccounts).toHaveBeenCalledWith(["a", "b"], "work"));
    expect(api.reorderAccounts).toHaveBeenCalledTimes(1);
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
    expect(api.reorderAccounts).toHaveBeenNthCalledWith(1, ["b", "a", "deleted"], "personal");
    expect(api.reorderAccounts).toHaveBeenNthCalledWith(2, ["b", "a", "c"], "personal");
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

  it("a background refetch in flight does not overwrite the saved order", async () => {
    const a = acc({ id: "a", name: "A" });
    const b = acc({ id: "b", name: "B", priority: 1 });
    let staleFetch!: (rows: AccountOut[]) => void;
    api.listAccounts
      .mockResolvedValueOnce([a, b])
      .mockImplementationOnce(() => new Promise((resolve) => { staleFetch = resolve; }))
      .mockResolvedValue([b, a]);
    api.reorderAccounts.mockResolvedValue([b, a]);
    const qc = renderIt();
    fireEvent.click(await screen.findByRole("button", { name: "B 메뉴" }));
    void qc.refetchQueries({ queryKey: ["accounts"] });
    await waitFor(() => expect(api.listAccounts).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "위로" }));
    await waitFor(() => expect(api.reorderAccounts).toHaveBeenCalledWith(["b", "a"], "personal"));
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    staleFetch([a, b]);
    await new Promise((r) => setTimeout(r, 0));
    expect(qc.getQueryData<AccountOut[]>(["accounts"])?.map((x) => x.id)).toEqual(["b", "a"]);
  });

});
