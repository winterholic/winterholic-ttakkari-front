import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { GoogleAccountCard } from "./GoogleAccountCard";
import { GoogleAccountSection } from "./GoogleAccountSection";
import { gaAccount, gaFeature } from "./fixtures";

const h = vi.hoisted(() => ({
  list: vi.fn(), start: vi.fn(), complete: vi.fn(), cancel: vi.fn(), remove: vi.fn(), toast: vi.fn(),
}));
vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  listGoogleAccounts: h.list,
  startGoogleLogin: h.start,
  completeGoogleLogin: h.complete,
  cancelGoogleLogin: h.cancel,
  deleteGoogleSession: h.remove,
}));
vi.mock("../../ui/toastStore", () => ({ toast: h.toast }));

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);

const wrap = (ui: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>,
);

const STORED = { stored: true, cookie_names: ["SID", "__Secure-1PSIDTS"], permissions_ok: true, encrypted: false, protection: "소유자 전용 파일 권한(0600/0700)만 사용합니다. 암호화하지 않습니다." };

it("로그인 전 계정은 한 번 로그인하면 모든 기능이 같이 쓴다고 알리고 로그인 창 열기를 준다", async () => {
  h.start.mockResolvedValue({ state: "starting", active: true });
  wrap(<GoogleAccountCard account={gaAccount()} />);
  expect(screen.getAllByText("로그인 필요").length).toBe(2); // 계정 + 기능
  expect(screen.getByText(/모든 기능이 같은 로그인을 함께 써요/)).toBeTruthy();
  expect(h.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /로그인 창 열기/ }));
  await waitFor(() => expect(h.start).toHaveBeenCalledWith("primary", "notebooklm"));
});

it("연결돼 있어도 계정 화면에서는 다시 로그인할 수 있다", async () => {
  h.start.mockResolvedValue({ state: "starting", active: true });
  wrap(<GoogleAccountCard account={gaAccount({ state: "ready", session: STORED })} />);
  expect(screen.getByText("연결됨")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /다시 로그인/ }));
  await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1));
});

it("로그인 창이 열려 있으면 완료·취소만 보이고 계정 ID 로 요청한다", async () => {
  h.complete.mockResolvedValue({});
  h.cancel.mockResolvedValue({});
  wrap(<GoogleAccountCard account={gaAccount({ login: { state: "waiting", message: null, active: true, feature: "notebooklm", started_at: null, finished_at: null } })} />);
  expect(screen.queryByRole("button", { name: /로그인 창 열기/ })).toBeNull();
  expect(screen.getByText(/Mac Studio 화면의 Chrome 창에서 Google 로그인/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /로그인 완료/ }));
  await waitFor(() => expect(h.complete).toHaveBeenCalledWith("primary"));
  fireEvent.click(screen.getByRole("button", { name: /로그인 취소/ }));
  await waitFor(() => expect(h.cancel).toHaveBeenCalledWith("primary"));
});

it("재인증 필요는 계정 수준으로 보이고 같은 계정을 쓰는 모든 기능이 같이 막힌 것으로 나온다", () => {
  const other = gaFeature({ id: "drive", label: "드라이브", description: "다른 기능", path: "/drive", state: "reauth_required" });
  wrap(<GoogleAccountCard account={gaAccount({ state: "reauth_required", message: "만료", session: STORED, features: [gaFeature({ state: "reauth_required" }), other] })} />);
  expect(screen.getAllByText("다시 로그인 필요").length).toBe(3); // 계정 + 기능 둘
  expect(screen.getByText(/만료됐거나 거부됐어요/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /로그인 창 열기/ })).toBeTruthy();
});

it("기능별 상태는 서로 독립이다: 한 기능의 쿨다운이 다른 기능과 계정 상태에 번지지 않는다", () => {
  const drive = gaFeature({ id: "drive", label: "드라이브", description: "다른 기능", path: "/drive", state: "ready" });
  wrap(<GoogleAccountCard account={gaAccount({ state: "ready", session: STORED, features: [gaFeature({ state: "cooldown" }), drive] })} />);
  const list = screen.getByRole("region", { name: "이 계정을 쓰는 기능" });
  const nlm = list.querySelector('[data-feature="notebooklm"]') as HTMLElement;
  const dr = list.querySelector('[data-feature="drive"]') as HTMLElement;
  expect(within(nlm).getByText("사용 제한 대기")).toBeTruthy();
  expect(within(dr).getByText("연결됨")).toBeTruthy();
  expect(screen.getAllByText("연결됨").length).toBe(2); // 계정 + 드라이브
  expect(within(nlm).getByRole("link", { name: "열기" }).getAttribute("href")).toBe("/notebooklm");
});

it("기능이 둘 이상이면 로그인할 화면을 고르고, 고른 기능으로 시작한다", async () => {
  h.start.mockResolvedValue({ state: "starting", active: true });
  const drive = gaFeature({ id: "drive", label: "드라이브", description: "다른 기능", path: "/drive", state: "login_required" });
  wrap(<GoogleAccountCard account={gaAccount({ features: [gaFeature({ state: "login_required" }), drive] })} />);
  fireEvent.click(screen.getByRole("combobox", { name: /로그인할 화면/ }));
  fireEvent.click(screen.getByRole("option", { name: "드라이브" }));
  fireEvent.click(screen.getByRole("button", { name: /로그인 창 열기/ }));
  await waitFor(() => expect(h.start).toHaveBeenCalledWith("primary", "drive"));
});

it("세션에 이 기능의 쿠키 범위가 없으면 그 기능 화면에서 한 번 더 로그인하라고 알린다", () => {
  wrap(<GoogleAccountCard account={gaAccount({ state: "ready", session: STORED, features: [gaFeature({ covered: false })] })} />);
  expect(screen.getByText(/쿠키가 저장된 세션에 없어요/)).toBeTruthy();
});

it("세션 삭제는 모든 기능에 영향을 알리고 확인한 뒤에만 지운다", async () => {
  h.remove.mockResolvedValue(gaAccount());
  wrap(<GoogleAccountCard account={gaAccount({ state: "ready", session: STORED })} />);
  fireEvent.click(screen.getByRole("button", { name: /세션 삭제/ }));
  expect(h.remove).not.toHaveBeenCalled();
  const dlg = screen.getByRole("dialog", { name: "저장된 세션을 지울까요?" });
  expect(within(dlg).getByText(/모든 기능/)).toBeTruthy();
  fireEvent.click(within(dlg).getByRole("button", { name: "세션 삭제" }));
  await waitFor(() => expect(h.remove).toHaveBeenCalledWith("primary"));
});

it("세션 정보는 쿠키 이름 개수만 보여 주고 값은 화면에 없다", () => {
  wrap(<GoogleAccountCard account={gaAccount({ state: "ready", session: STORED })} />);
  expect(screen.getByText("파일 권한으로 보호, 암호화 안 함")).toBeTruthy();
  expect(screen.getByText(/쿠키 2개 저장\(이름만 보이고 값은 화면에 오지 않아요\)/)).toBeTruthy();
});

it("Chrome 이 없으면 로그인 버튼을 막고 이유를 말한다", () => {
  wrap(<GoogleAccountCard account={gaAccount({ browser_available: false })} />);
  expect((screen.getByRole("button", { name: /로그인 창 열기/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Chrome을 찾지 못해/)).toBeTruthy();
});

it("설정 섹션: 계정 목록을 읽어 카드로 보여 주고 #google-accounts 로 닿는다", async () => {
  h.list.mockResolvedValue({ accounts: [gaAccount({ state: "ready", session: STORED })] });
  const { container } = wrap(<GoogleAccountSection />);
  expect(container.querySelector("#google-accounts")).toBeTruthy();
  await screen.findByText("연결됨");
  expect(screen.getByRole("heading", { level: 2, name: "Google 계정" })).toBeTruthy();
  expect(h.list).toHaveBeenCalledTimes(1);
});

it("설정 섹션: 불러오기에 실패하면 다시 시도할 수 있다", async () => {
  h.list.mockRejectedValueOnce(new Error("offline"));
  h.list.mockResolvedValueOnce({ accounts: [gaAccount()] });
  wrap(<GoogleAccountSection />);
  const retry = await screen.findByRole("button", { name: /다시/ });
  fireEvent.click(retry);
  await waitFor(() => expect(screen.getAllByText("로그인 필요").length).toBe(2));
});
