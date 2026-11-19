import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { ReactNode } from "react";
import { ApiError } from "../api/client";
import type { Draft, DraftPatchIn, KeyIssued, LinkIssued, ShareKey } from "../api/contextSharingTypes";
import {
  ALPHA, ALPHA_SOURCES, BETA, BETA_SOURCES, D1, D2, D3, GAMMA, GW_OFF, GW_OK, LIMITATIONS, cleanPreview, doc, draft, key, pub,
} from "../features/context-sharing/testFixtures";

// 이 파일의 서버 응답은 계약 문서(back docs/context-sharing-private-contract.md)를 따른 합성 값이다. 실제 서버 연동 검증은 docs/work-history 에 남긴다.
const h = vi.hoisted(() => ({
  getSite: vi.fn(), patchSite: vi.fn(),
  shareProjects: vi.fn(), shareSources: vi.fn(), createDraft: vi.fn(), listDrafts: vi.fn(), getDraft: vi.fn(), patchDraft: vi.fn(),
  publishDraft: vi.fn(), issueKey: vi.fn(), listKeys: vi.fn(), revokeKey: vi.fn(), revokeProject: vi.fn(),
  issueLink: vi.fn(), listLinks: vi.fn(), revokeLink: vi.fn(),
}));
vi.mock("../api/contextSharing", async (orig) => ({
  ...(await orig<typeof import("../api/contextSharing")>()),
  getSite: (...a: unknown[]) => h.getSite(...a),
  patchSite: (...a: unknown[]) => h.patchSite(...a),
  shareProjects: (...a: unknown[]) => h.shareProjects(...a),
  shareSources: (...a: unknown[]) => h.shareSources(...a),
  createDraft: (...a: unknown[]) => h.createDraft(...a),
  listDrafts: (...a: unknown[]) => h.listDrafts(...a),
  getDraft: (...a: unknown[]) => h.getDraft(...a),
  patchDraft: (...a: unknown[]) => h.patchDraft(...a),
  publishDraft: (...a: unknown[]) => h.publishDraft(...a),
  issueKey: (...a: unknown[]) => h.issueKey(...a),
  listKeys: (...a: unknown[]) => h.listKeys(...a),
  revokeKey: (...a: unknown[]) => h.revokeKey(...a),
  revokeProject: (...a: unknown[]) => h.revokeProject(...a),
  issueLink: (...a: unknown[]) => h.issueLink(...a),
  listLinks: (...a: unknown[]) => h.listLinks(...a),
  revokeLink: (...a: unknown[]) => h.revokeLink(...a),
}));
vi.mock("../shell/PageHeader", () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));

import { ContextSharingPage } from "./ContextSharingPage";

const WRITE_FNS = ["createDraft", "patchDraft", "publishDraft", "issueKey", "revokeKey", "revokeProject"] as const;
const RAW_KEY = "tkgw_RAWKEY_do_not_leak_0123456789";

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}
function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes>
          <Route path="/context-sharing" element={<ContextSharingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, qc };
}
const where = () => screen.getByTestId("where").textContent;
const apiErr = (status: number, code: string, extra: Record<string, unknown> = {}, message = "서버 메시지") =>
  new ApiError(status, { code, message, extra });
const alertText = () => screen.getAllByRole("alert").map((a) => a.textContent).join("\n");

/** 서버를 흉내 낸다: 초안 한 개의 현재 상태를 들고 patch·get 이 같은 상태를 읽고 쓴다. */
let server: Draft;
const setServer = (d: Draft) => { server = d; };

beforeAll(() => {
  // jsdom 에는 <dialog> 모달 API 가 없다.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  setServer(draft());
  h.getSite.mockImplementation(async () => ({ enabled: true, public_url: "https://share.example.test" }));
  h.shareProjects.mockImplementation(async () => ({ gateway: GW_OK, projects: [ALPHA, BETA, GAMMA] }));
  h.shareSources.mockImplementation(async (id: string) => (id === "e-beta" ? BETA_SOURCES : ALPHA_SOURCES));
  h.listDrafts.mockImplementation(async () => ({ drafts: [], total: 0, limit: 50, offset: 0 }));
  h.getDraft.mockImplementation(async () => server);
  h.listKeys.mockImplementation(async () => ({ keys: [] }));
  h.listLinks.mockImplementation(async () => ({ links: [] }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("사이트 운영 콘솔", () => {
  it("사이트 상태와 외부 주소를 보여 주고 닫기 확인에서 기존 세션 영향과 키 폐기를 구분한다", async () => {
    renderAt("/context-sharing");
    const consoleRegion = await screen.findByRole("region", { name: "사이트 운영" });
    expect(within(consoleRegion).getByText("외부 공유 열림")).toBeTruthy();
    expect(within(consoleRegion).getByRole("link", { name: "https://share.example.test" }).getAttribute("href")).toBe("https://share.example.test");
    fireEvent.click(within(consoleRegion).getByRole("button", { name: "사이트 임시 닫기" }));
    const dialog = await screen.findByRole("dialog", { name: "사이트를 임시로 닫을까요?" });
    expect(within(dialog).getByText(/기존 키와 이미 열린 세션을 포함해 외부 읽기/)).toBeTruthy();
    expect(within(dialog).getByText(/키 폐기와 프로젝트 공유 철회는 각각 별도/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기 실행" }));
    await waitFor(() => expect(h.patchSite).toHaveBeenCalledWith({ enabled: false }));
  });

  it("사이트 상태 조회 오류는 설정 /status 정보와 섞지 않고 재시도한다", async () => {
    h.getSite.mockRejectedValueOnce(apiErr(503, "gateway_unavailable"));
    renderAt("/context-sharing");
    const consoleRegion = await screen.findByRole("region", { name: "사이트 운영" });
    expect(within(consoleRegion).getByRole("alert").textContent).toMatch(/사이트 운영 상태/);
    expect(within(consoleRegion).queryByText("외부 공유 열림")).toBeNull();
    fireEvent.click(within(consoleRegion).getByRole("button", { name: "상태 다시 불러오기" }));
    expect(await within(consoleRegion).findByText("외부 공유 열림")).toBeTruthy();
    expect(screen.getAllByText((_, element) => element?.textContent?.includes("연결 설정 진단은 기존 /status") ?? false).length).toBeGreaterThan(0);
  });

  it("요청 처리 중에는 상태를 성공으로 바꾸지 않고 중복 조작을 막는다", async () => {
    let finish!: (value: { enabled: boolean; public_url: string }) => void;
    h.patchSite.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderAt("/context-sharing");
    const consoleRegion = await screen.findByRole("region", { name: "사이트 운영" });
    fireEvent.click(within(consoleRegion).getByRole("button", { name: "사이트 임시 닫기" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "사이트를 임시로 닫을까요?" })).getByRole("button", { name: "닫기 실행" }));
    expect(within(consoleRegion).getByText("외부 공유 열림")).toBeTruthy();
    const dialog = screen.getByRole("dialog", { name: "사이트를 임시로 닫을까요?" });
    expect((within(dialog).getByRole("button", { name: "처리 중" }) as HTMLButtonElement).disabled).toBe(true);
    finish({ enabled: false, public_url: "https://share.example.test" });
    expect(await within(consoleRegion).findByText("외부 공유 일시 중단")).toBeTruthy();
  });

  it("사이트 변경 실패를 성공으로 표시하지 않고 재시도할 수 있다", async () => {
    h.patchSite.mockRejectedValueOnce(apiErr(503, "gateway_unavailable"));
    renderAt("/context-sharing");
    const consoleRegion = await screen.findByRole("region", { name: "사이트 운영" });
    fireEvent.click(within(consoleRegion).getByRole("button", { name: "사이트 임시 닫기" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "사이트를 임시로 닫을까요?" })).getByRole("button", { name: "닫기 실행" }));
    expect(await within(consoleRegion).findByRole("alert")).toBeTruthy();
    expect(within(await screen.findByRole("dialog", { name: "사이트를 임시로 닫을까요?" })).getByRole("alert")).toBeTruthy();
    expect(within(consoleRegion).getByText("외부 공유 열림")).toBeTruthy();
    expect(within(consoleRegion).queryByText("외부 공유 일시 중단")).toBeNull();
  });

  it("열린 사이트에서는 재개 조작을 제공하지 않고 닫힌 사이트에만 재개를 제공한다", async () => {
    h.getSite.mockImplementation(async () => ({ enabled: false, public_url: "https://share.example.test" }));
    renderAt("/context-sharing");
    const consoleRegion = await screen.findByRole("region", { name: "사이트 운영" });
    expect(within(consoleRegion).getByText("외부 공유 일시 중단")).toBeTruthy();
    fireEvent.click(within(consoleRegion).getByRole("button", { name: "사이트 다시 열기" }));
    await waitFor(() => expect(h.patchSite).toHaveBeenCalledWith({ enabled: true }));
  });

  it("첫 화면에서 공유 키를 발급하고 키 목록의 만료·폐기 상태를 관리한다", async () => {
    h.listKeys.mockImplementation(async () => ({ keys: [key({ id: "k-active", label: "활성 연결" }), key({ id: "k-expired", label: "지난 연결", status: "expired" })] }));
    h.issueKey.mockImplementation(async () => ({ ...key({ id: "k-new", label: "로컬 테스트" }), scopes: ["read", "search"], key: RAW_KEY, connect: { url: "https://share.example.test", note: "합성 키" } }));
    h.revokeKey.mockImplementation(async () => key({ id: "k-active", status: "revoked" }));
    renderAt("/context-sharing");
    const keyRegion = await screen.findByRole("region", { name: "접근 키 관리" });
    expect(within(keyRegion).getByLabelText("발급 대상 프로젝트")).toBeTruthy();
    fireEvent.change(within(keyRegion).getByLabelText("키 이름"), { target: { value: "로컬 테스트" } });
    fireEvent.click(within(keyRegion).getByRole("button", { name: "키 발급" }));
    expect(await within(keyRegion).findByRole("region", { name: "발급된 키" })).toBeTruthy();
    const list = within(keyRegion).getByRole("list", { name: "접근 키 목록" });
    expect(within(list).getByText("만료")).toBeTruthy();
    fireEvent.click(within(list).getByRole("button", { name: "키 폐기: 활성 연결" }));
    const dialog = await screen.findByRole("dialog", { name: "키를 폐기할까요?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "폐기 실행" }));
    await waitFor(() => expect(h.revokeKey).toHaveBeenCalledWith("k-active"));
    expect(h.listKeys).toHaveBeenCalled();
  });

  it("전체 운영 키 목록에서 revoking을 폐기 완료와 구분한다", async () => {
    h.listKeys.mockImplementation(async () => ({ keys: [key({ id: "k-revoking", label: "진행 중 키", status: "revoking" })] }));
    renderAt("/context-sharing");
    const region = await screen.findByRole("region", { name: "접근 키 관리" });
    const row = within(await within(region).findByRole("list", { name: "접근 키 목록" })).getByRole("listitem");
    expect(within(row).getByText("폐기 처리 중")).toBeTruthy();
    expect(within(row).queryByText("폐기됨")).toBeNull();
  });

  it("키 발급 중 중복 클릭은 요청 하나만 보낸다", async () => {
    let finish!: (value: KeyIssued) => void;
    h.issueKey.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderAt("/context-sharing?project=e-beta");
    const button = within(await screen.findByRole("region", { name: "프로그램용 API Key" })).getByRole("button", { name: "재사용 API Key 발급" });
    fireEvent.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(h.issueKey).toHaveBeenCalledTimes(1);
    finish({ ...key({ id: "k-new" }), scopes: ["read"], key: RAW_KEY, connect: { url: "https://ctx.example.test", project_id: "g1", note: "test" } });
    expect(await screen.findByText(RAW_KEY)).toBeTruthy();
  });

  it("상세 키 발급의 늦은 성공은 다른 경로를 왕복한 뒤에도 원문을 노출하지 않는다", async () => {
    let finish!: (value: KeyIssued) => void;
    h.issueKey.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(within(await screen.findByRole("region", { name: "프로그램용 API Key" })).getByRole("button", { name: "재사용 API Key 발급" }));
    fireEvent.click(screen.getByRole("link", { name: "프로젝트 목록" }));
    await screen.findByRole("list", { name: "프로젝트" });
    fireEvent.click(screen.getByRole("link", { name: /Beta 회사 프로젝트/ }));
    await screen.findByRole("region", { name: "프로그램용 API Key" });
    await act(async () => { finish({ ...key({ id: "k-late" }), scopes: ["read"], key: RAW_KEY, connect: { url: "https://ctx.example.test", project_id: "g1", note: "test" } }); });
    expect(where()).toBe("/context-sharing?project=e-beta");
    expect(document.body.textContent).not.toContain(RAW_KEY);
  });

  it("기존 콘솔 키 발급의 늦은 성공은 프로젝트 상세로 이동한 뒤 원문을 노출하지 않는다", async () => {
    let finish!: (value: KeyIssued) => void;
    h.issueKey.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderAt("/context-sharing");
    fireEvent.click(await screen.findByRole("button", { name: "키 발급" }));
    fireEvent.click(screen.getByRole("link", { name: /Beta 회사 프로젝트/ }));
    await screen.findByRole("region", { name: "프로그램용 API Key" });
    await act(async () => { finish({ ...key({ id: "k-late" }), scopes: ["read"], key: RAW_KEY, connect: { url: "https://ctx.example.test", project_id: "g1", note: "test" } }); });
    expect(where()).toBe("/context-sharing?project=e-beta");
    expect(document.body.textContent).not.toContain(RAW_KEY);
  });

  it("키 복사 응답이 라우트 변경 뒤 도착하면 이전 화면의 성공·실패 상태를 덮어쓰지 않는다", async () => {
    let finish!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    h.issueKey.mockImplementation(async () => ({ ...key({ id: "k-copy" }), scopes: ["read"], key: RAW_KEY, connect: { url: "https://ctx.example.test", project_id: "g1", note: "test" } }));
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(within(await screen.findByRole("region", { name: "프로그램용 API Key" })).getByRole("button", { name: "재사용 API Key 발급" }));
    const reveal = await screen.findByRole("region", { name: "발급된 키" });
    fireEvent.click(within(reveal).getByRole("button", { name: "키 복사 후 원문 지우기" }));
    fireEvent.click(screen.getByRole("link", { name: "프로젝트 목록" }));
    await screen.findByRole("list", { name: "프로젝트" });
    await act(async () => { finish(); });
    expect(screen.queryByText("키를 복사했습니다. 원문은 화면에서 지웠습니다.")).toBeNull();
    expect(document.body.textContent).not.toContain(RAW_KEY);
  });
});

describe("프로젝트 목록", () => {
  it("기본 화면에서 프로젝트를 먼저 보여 주고 현재 스냅샷·활성 키·게시 시각을 함께 표시한다", async () => {
    renderAt("/context-sharing");
    expect(await screen.findByRole("heading", { name: "공유 프로젝트" })).toBeTruthy();
    const list = await screen.findByRole("list", { name: "프로젝트" });
    const beta = within(list).getByRole("link", { name: /Beta 회사 프로젝트/ }).closest("li") as HTMLElement;
    expect(within(beta).getByText("스냅샷 snap1")).toBeTruthy();
    expect(within(beta).getByText("활성 키 1개")).toBeTruthy();
    expect(within(beta).getByText("활성 링크 2개")).toBeTruthy();
    expect(within(beta).getByText(/게시 시각/)).toBeTruthy();
    expect(within(list).getAllByText("현재 스냅샷 없음")).toHaveLength(2);
    expect(screen.queryByText("Context Gateway 운영")).toBeNull();
  });

  it("전체 사이트와 기존 키 운영은 프로젝트 목록 아래 접힌 운영 영역에 둔다", async () => {
    renderAt("/context-sharing");
    await screen.findByRole("list", { name: "프로젝트" });
    const operations = screen.getByText("전체 사이트·기존 키 운영").closest("details");
    expect(operations?.hasAttribute("open")).toBe(false);
    expect(within(operations as HTMLElement).getByRole("region", { name: "사이트 운영" })).toBeTruthy();
    expect(within(operations as HTMLElement).getByRole("region", { name: "접근 키 관리" })).toBeTruthy();
  });

  it("읽기만으로는 어떤 쓰기 API 도 부르지 않는다", async () => {
    renderAt("/context-sharing");
    await screen.findByRole("link", { name: /Alpha/ });
    for (const f of WRITE_FNS) expect(h[f]).not.toHaveBeenCalled();
  });

  it("프로젝트마다 범위·문서 수·게시 상태·활성 키 수를 보여 준다", async () => {
    renderAt("/context-sharing");
    const list = await screen.findByRole("list", { name: "프로젝트" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("개인")).toBeTruthy();
    expect(within(items[0]).getByText("게시 전")).toBeTruthy();
    expect(within(items[1]).getByText("회사")).toBeTruthy();
    expect(within(items[1]).getByText("게시 중")).toBeTruthy();
    expect(within(items[1]).getByText("활성 키 1개")).toBeTruthy();
    expect(within(items[2]).getByText("철회됨")).toBeTruthy();
  });

  it("프로젝트를 고르면 URL 에 프로젝트 id 만 실린다", async () => {
    renderAt("/context-sharing");
    fireEvent.click(await screen.findByRole("link", { name: /Alpha/ }));
    await waitFor(() => expect(where()).toBe("/context-sharing?project=e-alpha"));
  });

  it("프로젝트 상세는 현재 snapshot 요약과 기존 project·draft 딥링크를 함께 유지한다", async () => {
    setServer(draft({ entity_id: "e-beta", project_name: "Beta 회사 프로젝트", slug: "beta" }));
    renderAt("/context-sharing?project=e-beta&draft=d1");
    const context = within(await screen.findByRole("region", { name: "현재 맥락" }));
    expect(context.getAllByText("snap1")).toHaveLength(2);
    expect(await screen.findByRole("region", { name: "게시 전 검토" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "게시 승인" })).toBeTruthy();
    expect(screen.getByText("게시 및 갱신").closest("details")?.hasAttribute("open")).toBe(true);
    expect(where()).toBe("/context-sharing?project=e-beta&draft=d1");
  });

  it("프로젝트 상세에서 사람용 링크와 재사용 키를 주 액션으로 보여 주고 게시 검토는 접는다", async () => {
    renderAt("/context-sharing?project=e-beta");
    const detail = await screen.findByRole("region", { name: "Beta 회사 프로젝트 프로젝트 상세" });
    expect(within(detail).getByRole("region", { name: "사람용 공유 링크" })).toBeTruthy();
    expect(within(detail).getByRole("region", { name: "프로그램용 API Key" })).toBeTruthy();
    expect(within(detail).getByRole("button", { name: "공유 링크 생성" })).toBeTruthy();
    expect(within(detail).getByRole("button", { name: "재사용 API Key 발급" })).toBeTruthy();
    expect(within(detail).getByText("활성 공유 링크 2개")).toBeTruthy();
    const publication = within(detail).getByText("게시 및 갱신").closest("details");
    expect(publication?.hasAttribute("open")).toBe(false);
    expect(h.createDraft).not.toHaveBeenCalled();
    expect(h.issueKey).not.toHaveBeenCalled();
  });

  it("상세 링크 수가 응답에 없으면 0으로 단정하지 않는다", async () => {
    h.shareProjects.mockImplementation(async () => ({ gateway: GW_OK, projects: [{ ...BETA, active_link_count: undefined }] }));
    renderAt("/context-sharing?project=e-beta");
    const links = within(await screen.findByRole("region", { name: "사람용 공유 링크" }));
    expect(links.getByText("활성 공유 링크 확인 불가")).toBeTruthy();
    expect(links.queryByText("활성 공유 링크 0개")).toBeNull();
  });

  it("Gateway 가 설정되지 않았으면 누락 항목과 초안은 가능하다는 안내를 보여 준다", async () => {
    h.shareProjects.mockImplementation(async () => ({ gateway: GW_OFF, projects: [ALPHA] }));
    renderAt("/context-sharing");
    expect(await screen.findByText("Context Gateway 연결이 설정되지 않았습니다")).toBeTruthy();
    expect(screen.getByText(/context_gateway_control_url/)).toBeTruthy();
  });

  it("목록을 불러오지 못하면 이유와 다시 불러오기를 보여 주고 성공한 것처럼 보이지 않는다", async () => {
    h.shareProjects.mockRejectedValueOnce(apiErr(503, "gateway_unavailable"));
    renderAt("/context-sharing");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Context Gateway 연결이 설정되지 않았습니다")).toBeNull();
    expect(screen.queryByRole("list", { name: "프로젝트" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(await screen.findByRole("list", { name: "프로젝트" })).toBeTruthy();
  });

  it("프로젝트가 없으면 도서관에서 출처를 연결하라고 안내한다", async () => {
    h.shareProjects.mockImplementation(async () => ({ gateway: GW_OK, projects: [] }));
    renderAt("/context-sharing");
    expect(await screen.findByText("공유할 수 있는 프로젝트가 없습니다")).toBeTruthy();
    expect(screen.getByRole("link", { name: "맥락 도서관 열기" }).getAttribute("href")).toBe("/context-library");
  });

  it("프로젝트 목록을 기다리는 동안에도 별도 사이트 운영 상태를 표시한다", async () => {
    h.shareProjects.mockImplementation(() => new Promise(() => {}));
    renderAt("/context-sharing");
    const site = await screen.findByRole("region", { name: "사이트 운영" });
    expect(within(site).getByText("외부 공유 열림")).toBeTruthy();
    expect(screen.getAllByText((_, element) => element?.textContent?.includes("연결 설정: 확인 중") ?? false).length).toBeGreaterThan(0);
  });
});

describe("문서 선택과 초안 만들기", () => {
  it("출처별 문서를 보여 주고 꺼진 출처는 고를 수 없다고 말한다", async () => {
    renderAt("/context-sharing?project=e-alpha");
    expect(await screen.findByRole("checkbox", { name: /arch\.md/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /plan\.md/ })).toBeTruthy();
    expect(screen.getByText(/old-notes/)).toBeTruthy();
    expect(screen.getByText(/꺼진 출처라 고를 수 없습니다/)).toBeTruthy();
  });

  it("출처의 문서가 잘렸으면 앞 500개만 보인다고 알린다", async () => {
    renderAt("/context-sharing?project=e-beta");
    expect(await screen.findByText(/앞 500개만 보입니다/)).toBeTruthy();
  });

  it("고를 문서가 하나도 없으면 빈 상태를 알린다", async () => {
    h.shareSources.mockImplementation(async () => ({ ...ALPHA_SOURCES, sources: [ALPHA_SOURCES.sources[1]] }));
    renderAt("/context-sharing?project=e-alpha");
    expect(await screen.findByText("고를 수 있는 문서가 없습니다")).toBeTruthy();
    expect((screen.getByRole("button", { name: "초안 만들기" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("문서 목록 오류는 다시 시도할 수 있다", async () => {
    h.shareSources.mockRejectedValueOnce(apiErr(404, "project_not_found", {}, "라이브러리에 그런 프로젝트가 없습니다."));
    renderAt("/context-sharing?project=e-alpha");
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(await screen.findByRole("checkbox", { name: /arch\.md/ })).toBeTruthy();
  });

  it("선택한 문서 id 만 보내고, 아무것도 고르지 않으면 만들 수 없다", async () => {
    h.createDraft.mockImplementation(async () => draft({ id: "d-new" }));
    renderAt("/context-sharing?project=e-alpha");
    const create = await screen.findByRole("button", { name: "초안 만들기" });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /plan\.md/ }));
    expect(screen.getByText("선택 1/50")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("초안 제목"), { target: { value: "  외부용 구조  " } });
    fireEvent.change(screen.getByLabelText("요약"), { target: { value: "설명" } });
    fireEvent.click(create);
    await waitFor(() => expect(h.createDraft).toHaveBeenCalledTimes(1));
    expect(h.createDraft.mock.calls[0][0]).toEqual({
      entity_id: "e-alpha", document_ids: ["doc-plan"], title: "외부용 구조", summary: "설명", confirm_work_scope: false,
    });
    await waitFor(() => expect(where()).toBe("/context-sharing?project=e-alpha&draft=d-new"));
  });

  it("제목을 비워 두면 서버 기본 제목에 맡긴다", async () => {
    h.createDraft.mockImplementation(async () => draft({ id: "d-new" }));
    renderAt("/context-sharing?project=e-alpha");
    fireEvent.click(await screen.findByRole("checkbox", { name: /arch\.md/ }));
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    await waitFor(() => expect(h.createDraft).toHaveBeenCalled());
    const body = h.createDraft.mock.calls[0][0];
    expect(body.title).toBeUndefined();
    expect(body.summary).toBe("");
  });

  it("회사 범위는 확인을 켜기 전에는 초안을 만들 수 없고, 켜면 확인값이 함께 간다", async () => {
    h.createDraft.mockImplementation(async () => draft({ id: "d-w", scope: "work" }));
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(await screen.findByRole("checkbox", { name: /spec\.md/ }));
    const create = screen.getByRole("button", { name: "초안 만들기" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByText(/회사\(work\) 범위/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /외부 공유 의도/ }));
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() => expect(h.createDraft).toHaveBeenCalled());
    expect(h.createDraft.mock.calls[0][0].confirm_work_scope).toBe(true);
  });

  it("문서를 50개까지만 고를 수 있다", async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      document_id: `m${i}`, title: `n${i}.md`, logical_path: `n${i}.md`, chunk_count: 1, chars: 10, source_revision: "r", indexed_at: null,
    }));
    h.shareSources.mockImplementation(async () => ({ ...ALPHA_SOURCES, sources: [{ ...ALPHA_SOURCES.sources[0], documents: many }] }));
    renderAt("/context-sharing?project=e-alpha");
    await screen.findByRole("checkbox", { name: /n0\.md/ });
    for (let i = 0; i < 50; i++) fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(`n${i}\\.md`) }));
    expect(screen.getByText("선택 50/50")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /n50\.md/ }) as HTMLInputElement).disabled).toBe(true);
  });

  it("생성 오류(회사 범위 확인 요구)는 이유를 보여 주고 이동하지 않는다", async () => {
    h.createDraft.mockRejectedValueOnce(apiErr(403, "work_scope_confirmation_required"));
    renderAt("/context-sharing?project=e-alpha");
    fireEvent.click(await screen.findByRole("checkbox", { name: /arch\.md/ }));
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    expect(await screen.findByText("회사 범위 확인이 필요합니다")).toBeTruthy();
    expect(where()).toBe("/context-sharing?project=e-alpha");
  });

  it("이 프로젝트의 초안 목록에서 기존 초안을 열 수 있다", async () => {
    h.listDrafts.mockImplementation(async () => ({
      drafts: [{ ...draft(), id: "d-old", title: "지난 초안" }], total: 1, limit: 50, offset: 0,
    }));
    renderAt("/context-sharing?project=e-alpha");
    const link = await screen.findByRole("link", { name: /지난 초안/ });
    expect(link.getAttribute("href")).toBe("/context-sharing?project=e-alpha&draft=d-old");
    expect(h.listDrafts.mock.calls[0][0]).toMatchObject({ entityId: "e-alpha" });
  });
});

describe("초안 편집", () => {
  const docGroup = (path: string) => screen.getByRole("group", { name: path });
  const open = (path: string) => fireEvent.click(within(docGroup(path)).getByRole("button", { name: "내용 보기·편집" }));

  it("원본과 비교하지 않은 문서는 미검증으로 보이고 자동으로 확인되지 않는다", async () => {
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("group", { name: "docs/arch.md" });
    const arch = within(docGroup("docs/arch.md"));
    expect(arch.getByText("원본 미대조")).toBeTruthy();
    expect((arch.getByRole("checkbox", { name: "원본과 대조해 확인함" }) as HTMLInputElement).checked).toBe(false);
    const plan = within(docGroup("docs/plan.md"));
    expect(plan.getByText(/원본 대조 확인함/)).toBeTruthy();
    expect((plan.getByRole("checkbox", { name: "원본과 대조해 확인함" }) as HTMLInputElement).checked).toBe(true);
  });

  it("내용을 고치면 저장 전까지 변경 중으로 표시하고 저장은 바뀐 부분만 expected_digest 와 함께 보낸다", async () => {
    h.patchDraft.mockImplementation(async (_id: string, body: DraftPatchIn) => {
      expect(body.expected_digest).toBe(D1);
      setServer(draft({ digest: D2, revision: 2, documents: [doc({ id: "x1", content: "새 본문", edited: true }), server.documents[1]] }));
      return server;
    });
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("group", { name: "docs/arch.md" });
    open("docs/arch.md");
    fireEvent.change(within(docGroup("docs/arch.md")).getByLabelText("내용"), { target: { value: "새 본문" } });
    expect(screen.getByText(/저장하지 않은 변경이 있습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() => expect(h.patchDraft).toHaveBeenCalledTimes(1));
    expect(h.patchDraft.mock.calls[0][0]).toBe("d1");
    expect(h.patchDraft.mock.calls[0][1]).toEqual({ documents: [{ id: "x1", content: "새 본문" }], expected_digest: D1 });
    await waitFor(() => expect(screen.queryByText(/저장하지 않은 변경이 있습니다/)).toBeNull());
    expect(screen.getByText(/승인 대상 digest b{12}/)).toBeTruthy();
  });

  it("문서를 고치면 이전 대조 확인이 풀리고 다시 직접 선택해야 한다", async () => {
    h.patchDraft.mockImplementation(async () => server);
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("group", { name: "docs/plan.md" });
    open("docs/plan.md");
    const plan = within(docGroup("docs/plan.md"));
    fireEvent.change(plan.getByLabelText("내용"), { target: { value: "계획을 고침" } });
    expect((plan.getByRole("checkbox", { name: "원본과 대조해 확인함" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() => expect(h.patchDraft).toHaveBeenCalled());
    // 확인을 다시 켜지 않았으므로 owner_verified 를 보내지 않는다.
    expect(h.patchDraft.mock.calls[0][1].documents).toEqual([{ id: "x2", content: "계획을 고침" }]);
  });

  it("이미 확인한 문서를 편집한 뒤 다시 확인하면 새 내용의 owner_verified 를 명시적으로 보낸다", async () => {
    h.patchDraft.mockImplementation(async () => server);
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("group", { name: "docs/plan.md" });
    open("docs/plan.md");
    const plan = within(docGroup("docs/plan.md"));
    fireEvent.change(plan.getByLabelText("내용"), { target: { value: "새 원본 대조 내용" } });
    fireEvent.click(plan.getByRole("checkbox", { name: "원본과 대조해 확인함" }));
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() => expect(h.patchDraft).toHaveBeenCalled());
    expect(h.patchDraft.mock.calls[0][1].documents).toEqual([{ id: "x2", content: "새 원본 대조 내용", owner_verified: true }]);
  });

  it("원본 대조 확인은 사용자가 선택했을 때만 owner_verified 로 보낸다", async () => {
    h.patchDraft.mockImplementation(async () => server);
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("group", { name: "docs/arch.md" });
    fireEvent.click(within(docGroup("docs/arch.md")).getByRole("checkbox", { name: "원본과 대조해 확인함" }));
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() => expect(h.patchDraft).toHaveBeenCalled());
    expect(h.patchDraft.mock.calls[0][1]).toEqual({ documents: [{ id: "x1", owner_verified: true }], expected_digest: D1 });
  });

  it("제목과 요약을 고쳐 저장하고, 변경 되돌리기는 서버 값으로 돌린다", async () => {
    h.patchDraft.mockImplementation(async () => server);
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    const title = (await screen.findByLabelText("초안 제목")) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "다른 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 되돌리기" }));
    expect(title.value).toBe("Alpha 프로젝트 맥락");
    fireEvent.change(title, { target: { value: "다른 제목" } });
    fireEvent.change(screen.getByLabelText("요약"), { target: { value: "새 요약" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() => expect(h.patchDraft).toHaveBeenCalled());
    expect(h.patchDraft.mock.calls[0][1]).toEqual({ title: "다른 제목", summary: "새 요약", expected_digest: D1 });
  });

  it("문서를 초안에서 제외하는 것도 저장 전에는 되돌릴 수 있고 마지막 한 문서는 뺄 수 없다", async () => {
    h.patchDraft.mockImplementation(async () => server);
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("group", { name: "docs/arch.md" });
    fireEvent.click(within(docGroup("docs/arch.md")).getByRole("button", { name: "초안에서 제외" }));
    expect(within(docGroup("docs/arch.md")).getByText("제외 예정")).toBeTruthy();
    expect((within(docGroup("docs/plan.md")).getByRole("button", { name: "초안에서 제외" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(docGroup("docs/arch.md")).getByRole("button", { name: "제외 취소" }));
    expect(within(docGroup("docs/plan.md")).getByRole("button", { name: "초안에서 제외" })).toBeTruthy();
    expect((within(docGroup("docs/plan.md")).getByRole("button", { name: "초안에서 제외" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(docGroup("docs/arch.md")).getByRole("button", { name: "초안에서 제외" }));
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() => expect(h.patchDraft).toHaveBeenCalled());
    expect(h.patchDraft.mock.calls[0][1]).toEqual({ remove_document_ids: ["x1"], expected_digest: D1 });
  });

  it("다른 곳에서 초안이 바뀌어 저장이 거절되면 편집을 지우지 않고 선택지를 준다", async () => {
    h.patchDraft.mockRejectedValueOnce(apiErr(409, "digest_mismatch"));
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    const title = (await screen.findByLabelText("초안 제목")) as HTMLInputElement;
    fireEvent.change(title, { target: { value: "내 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    expect(await screen.findByText("승인한 내용과 현재 초안이 다릅니다")).toBeTruthy();
    expect(title.value).toBe("내 제목");
    setServer(draft({ digest: D3, title: "서버 제목" }));
    fireEvent.click(screen.getByRole("button", { name: "내 편집을 버리고 최신 내용 불러오기" }));
    await waitFor(() => expect((screen.getByLabelText("초안 제목") as HTMLInputElement).value).toBe("서버 제목"));
  });
});

describe("검토와 게시 승인", () => {
  const confirmBox = () => screen.getByRole("checkbox", { name: /현재 내용을 읽었고/ }) as HTMLInputElement;
  const publishBtn = () => screen.getByRole("button", { name: "게시" }) as HTMLButtonElement;
  const verified = (id: string, path: string) => doc({ id, title: path, logical_path: path, verified_at: "2026-11-16T00:40:00.000000+00:00", verified_by: "owner" });
  const readyDraft = (digest = D1) => draft({ digest, documents: [verified("x1", "docs/arch.md"), verified("x2", "docs/plan.md")] });

  it("탐지 결과와 한계를 그대로 보여 주고 고위험이 있으면 게시를 막는다", async () => {
    setServer(draft({
      digest: D1,
      preview: cleanPreview(D1, {
        blocked: true, counts: { high: 1, medium: 1 },
        findings: [
          { rule: "credential_assignment", category: "credential", severity: "high", field: "content", document_id: "x1", line: 4, excerpt: "password=«credential_assignment»" },
          { rule: "email", category: "personal", severity: "medium", field: "summary", document_id: null, line: 1, excerpt: "문의 «email»" },
        ],
      }),
    }));
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    const review = await screen.findByRole("region", { name: "게시 전 검토" });
    expect(within(review).getByText("고위험 1건")).toBeTruthy();
    expect(within(review).getByText("주의 1건")).toBeTruthy();
    expect(within(review).getByText("password=«credential_assignment»")).toBeTruthy();
    expect(within(review).getByText(/arch\.md · 4행/)).toBeTruthy();
    for (const l of LIMITATIONS) expect(within(review).getByText(l)).toBeTruthy();
    expect(within(review).getByText(/정규식 탐지는 보조 수단/)).toBeTruthy();
    expect(screen.getByText(/고위험 항목이 남아 있어 게시할 수 없습니다/)).toBeTruthy();
    expect(publishBtn().disabled).toBe(true);
  });

  it("읽었다는 확인이 없으면 게시할 수 없고, 확인하면 현재 digest 로만 승인한다", async () => {
    setServer(readyDraft());
    h.publishDraft.mockImplementation(async () => ({ draft: { ...readyDraft(), status: "published", publication: pub() }, publication: pub() }));
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("region", { name: "게시 승인" });
    expect(publishBtn().disabled).toBe(true);
    expect(screen.getByText(/읽었다는 확인이 필요합니다/)).toBeTruthy();
    fireEvent.click(confirmBox());
    expect(publishBtn().disabled).toBe(false);
    fireEvent.click(publishBtn());
    await waitFor(() => expect(h.publishDraft).toHaveBeenCalledTimes(1));
    expect(h.publishDraft.mock.calls[0]).toEqual(["d1", D1]);
    expect(await screen.findByText(/게시했습니다/)).toBeTruthy();
  });

  it("원본 대조 없이도 별도 게시 승인 뒤 null provenance 로 게시한다", async () => {
    const unverified = draft({ documents: [doc({ id: "x1", title: "docs/arch.md", logical_path: "docs/arch.md", verified_at: null, verified_by: null })] });
    setServer(unverified);
    h.publishDraft.mockImplementation(async () => ({ draft: { ...unverified, status: "published", publication: pub() }, publication: pub() }));
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("region", { name: "게시 승인" });
    const docView = within(screen.getByRole("group", { name: "docs/arch.md" }));
    expect(docView.getByText("원본 미대조")).toBeTruthy();
    expect((docView.getByRole("checkbox", { name: "원본과 대조해 확인함" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/verified_at: null/)).toBeTruthy();
    fireEvent.click(confirmBox());
    expect(publishBtn().disabled).toBe(false);
    fireEvent.click(publishBtn());
    await waitFor(() => expect(h.publishDraft).toHaveBeenCalledWith("d1", D1));
  });

  it("저장하지 않은 변경이 있으면 게시할 수 없고, 저장 후에는 새 digest 로 다시 확인해야 한다", async () => {
    setServer(readyDraft(D1));
    h.patchDraft.mockImplementation(async () => {
      setServer(readyDraft(D2));
      return server;
    });
    h.publishDraft.mockImplementation(async () => ({ draft: { ...server, status: "published" }, publication: pub() }));
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("region", { name: "게시 승인" });
    fireEvent.click(confirmBox());
    expect(publishBtn().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("요약"), { target: { value: "바뀐 요약" } });
    expect(publishBtn().disabled).toBe(true);
    expect(screen.getByText(/저장하지 않은 변경이 있어 게시할 수 없습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() => expect(screen.getByText(/승인 대상 digest b{12}/)).toBeTruthy());
    // 이전 digest 에 대한 확인은 새 내용에 이어지지 않는다.
    expect(confirmBox().checked).toBe(false);
    expect(publishBtn().disabled).toBe(true);
    fireEvent.click(confirmBox());
    fireEvent.click(publishBtn());
    await waitFor(() => expect(h.publishDraft).toHaveBeenCalledTimes(1));
    expect(h.publishDraft.mock.calls[0]).toEqual(["d1", D2]);
  });

  it("오래된 승인으로 보냈다가 digest_mismatch 를 받으면 최신 내용을 다시 불러오고 승인을 풀어 재검토로 유도한다", async () => {
    setServer(readyDraft(D1));
    h.publishDraft.mockImplementation(async () => {
      setServer(readyDraft(D3));
      throw apiErr(409, "digest_mismatch", { current_digest: D3 });
    });
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("region", { name: "게시 승인" });
    fireEvent.click(confirmBox());
    fireEvent.click(publishBtn());
    expect(await screen.findByText("승인한 내용과 현재 초안이 다릅니다")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/승인 대상 digest c{12}/)).toBeTruthy());
    expect(confirmBox().checked).toBe(false);
    expect(publishBtn().disabled).toBe(true);
    // 새 승인 없이는 같은 요청을 다시 보내지 않는다.
    expect(h.publishDraft).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["verification_required", 422, { document_ids: ["x1"] }, "원본 대조 확인이 필요합니다"],
    ["sensitive_content_blocked", 422, { counts: { high: 2, medium: 0 }, findings: [] }, "고위험 항목이 남아 게시할 수 없습니다"],
    ["gateway_not_configured", 503, { gateway: GW_OFF }, "Context Gateway 연결이 설정되지 않았습니다"],
  ])("게시 오류 %s 는 이해할 수 있는 안내를 보여 주고 게시됨으로 바뀌지 않는다", async (code, status, extra, title) => {
    setServer(readyDraft());
    h.publishDraft.mockRejectedValueOnce(apiErr(status, code, extra));
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("region", { name: "게시 승인" });
    fireEvent.click(confirmBox());
    fireEvent.click(publishBtn());
    expect(await screen.findByText(title)).toBeTruthy();
    expect(screen.queryByText(/게시했습니다/)).toBeNull();
    expect(screen.getByRole("region", { name: "게시 승인" })).toBeTruthy();
  });

  it("이미 게시한 초안은 읽기 전용이고 게시 승인 영역이 없다", async () => {
    setServer(draft({ status: "published", publication: pub({ draft_id: "d1" }) }));
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    expect(await screen.findByText(/이미 게시한 초안입니다/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "게시" })).toBeNull();
    expect(screen.queryByRole("button", { name: "변경 저장" })).toBeNull();
    expect((screen.getByLabelText("초안 제목") as HTMLInputElement).readOnly).toBe(true);
  });

  it("초안을 못 찾으면 안내와 프로젝트로 돌아가는 길을 준다", async () => {
    h.getDraft.mockRejectedValueOnce(apiErr(404, "draft_not_found"));
    renderAt("/context-sharing?project=e-alpha&draft=zzz");
    expect(await screen.findByText("초안을 찾을 수 없습니다")).toBeTruthy();
    expect(screen.getByRole("link", { name: "프로젝트로 돌아가기" }).getAttribute("href")).toBe("/context-sharing?project=e-alpha");
  });
});

describe("외부 공유 키", () => {
  const issued = (o: Partial<KeyIssued> = {}): KeyIssued => ({
    ...key({ id: "k-new", label: "claude", single_use: false, credential_type: "reusable_api_v2", ttl_seconds: 259200 }), scopes: ["read", "search"], key: RAW_KEY,
    connect: { url: "https://ctx.example.test", project_id: "gateway-project-uuid", note: "재사용 API Key" }, ...o,
  });
  const panel = () => screen.findByRole("region", { name: "프로그램용 API Key" });
  const consoleSpies = () => (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
  const leaked = (spies: ReturnType<typeof consoleSpies>) => spies.some((s) => JSON.stringify(s.mock.calls).includes(RAW_KEY));

  it("게시 전 프로젝트에는 키 발급이 없고 초안 승인을 먼저 하라고 안내한다", async () => {
    renderAt("/context-sharing?project=e-alpha");
    await screen.findByRole("checkbox", { name: /arch\.md/ });
    expect(screen.queryByRole("button", { name: "재사용 API Key 발급" })).toBeNull();
    expect(screen.getByText(/게시한 뒤에 키를 발급할 수 있습니다/)).toBeTruthy();
  });

  it("철회된 프로젝트는 새로 게시하기 전까지 키를 발급할 수 없다", async () => {
    renderAt("/context-sharing?project=e-gamma");
    const p = await panel();
    expect(within(p).queryByRole("button", { name: "재사용 API Key 발급" })).toBeNull();
    expect(within(p).getByText(/철회됨/)).toBeTruthy();
  });

  it("재사용 키는 기본 3일·pinned·읽기와 검색이고 label·scope 를 요청한다", async () => {
    h.issueKey.mockImplementation(async () => issued());
    renderAt("/context-sharing?project=e-beta");
    const p = within(await panel());
    expect(p.getByText(/기본 3일/)).toBeTruthy();
    expect(Array.from((p.getByLabelText("만료 기간") as HTMLSelectElement).options).map((option) => option.value)).toEqual(["1", "3", "7", "30"]);
    expect((p.getByRole("checkbox", { name: /읽기/ }) as HTMLInputElement).checked).toBe(true);
    expect((p.getByRole("checkbox", { name: /검색/ }) as HTMLInputElement).checked).toBe(true);
    expect((p.getByRole("checkbox", { name: /내보내기/ }) as HTMLInputElement).checked).toBe(false);
    fireEvent.change(p.getByLabelText("키 이름"), { target: { value: "claude" } });
    fireEvent.change(p.getByLabelText("만료 기간"), { target: { value: "7" } });
    fireEvent.change(p.getByLabelText("snapshot 정책"), { target: { value: "latest" } });
    fireEvent.click(p.getByRole("button", { name: "재사용 API Key 발급" }));
    await waitFor(() => expect(h.issueKey).toHaveBeenCalledTimes(1));
    expect(h.issueKey.mock.calls[0][0]).toEqual({ project_slug: "beta", label: "claude", scopes: ["read", "search"], credential_type: "reusable_api_v2", ttl_days: 7, snapshot_policy: "latest" });
  });

  it("범위를 모두 끄면 발급할 수 없다", async () => {
    renderAt("/context-sharing?project=e-beta");
    const p = within(await panel());
    fireEvent.click(p.getByRole("checkbox", { name: /읽기/ }));
    fireEvent.click(p.getByRole("checkbox", { name: /검색/ }));
    expect((p.getByRole("button", { name: "재사용 API Key 발급" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("원문 키는 발급 직후 한 번 보이고, 복사할 수 있으며, 어디에도 저장·기록되지 않는다", async () => {
    const spies = consoleSpies();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    h.issueKey.mockImplementation(async () => issued());
    const { qc } = renderAt("/context-sharing?project=e-beta");
    fireEvent.click(within(await panel()).getByRole("button", { name: "재사용 API Key 발급" }));
    const reveal = await screen.findByRole("region", { name: "발급된 키" });
    expect(within(reveal).getByText(RAW_KEY)).toBeTruthy();
    expect(within(reveal).getByText(/한 번만 보입니다/)).toBeTruthy();
    fireEvent.click(within(reveal).getByRole("button", { name: "키 복사 후 원문 지우기" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(RAW_KEY));
    await waitFor(() => expect(screen.queryByText(RAW_KEY)).toBeNull());

    // 스토리지·URL·쿼리 캐시·콘솔 어디에도 원문이 없다
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(RAW_KEY);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(RAW_KEY);
    expect(where()).not.toContain(RAW_KEY);
    expect(JSON.stringify(qc.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(RAW_KEY);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
    expect(leaked(spies)).toBe(false);
  });

  it("REST와 Claude Code MCP 연결 안내는 Gateway 경로와 project_id를 쓰고 원문 키를 담지 않는다", async () => {
    h.issueKey.mockImplementation(async () => issued());
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(within(await panel()).getByRole("button", { name: "재사용 API Key 발급" }));
    const reveal = await screen.findByRole("region", { name: "발급된 키" });
    const guide = (within(reveal).getByLabelText("REST / MCP 연결 설정") as HTMLTextAreaElement).value;
    expect(guide).toContain("$CONTEXT_GATEWAY_KEY");
    expect(guide).toContain("gateway-project-uuid");
    expect(guide).toContain("/api/v1/projects/$GATEWAY_PROJECT_ID/context");
    expect(guide).toContain("https://ctx.example.test/mcp");
    expect(guide).toContain("Bearer ${CONTEXT_GATEWAY_KEY}");
    expect(guide).toContain("https://ctx.example.test");
    expect(guide).not.toContain(RAW_KEY);
    expect(within(reveal).getByRole("link", { name: /Gateway 주소/ }).getAttribute("href")).toBe("https://ctx.example.test");
  });

  it("링크 발급은 선택한 TTL·정책·export를 보내고 URL은 발급 때만 노출한 뒤 복사 후 지운다", async () => {
    const spies = consoleSpies();
    const rawUrl = "https://ctx.example.test/s#token=RAW_LINK_SECRET";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    h.issueLink.mockImplementation(async () => ({
      id: "l-new", project_slug: "beta", label: "검토 링크", status: "active", ttl_seconds: 604800,
      credential_type: "share_link_v2", snapshot_policy: "latest", pinned_snapshot_id: null, scopes: ["read", "export"],
      last_used_at: null, usage_status: "available", issued_at: "2026-11-19T00:00:00Z", expires_at: "2026-11-26T00:00:00Z",
      revoked_at: null, publication_id: "pub1", url: rawUrl,
    }));
    const { qc } = renderAt("/context-sharing?project=e-beta");
    const links = within(await screen.findByRole("region", { name: "사람용 공유 링크" }));
    fireEvent.change(links.getByLabelText("링크 이름"), { target: { value: "검토 링크" } });
    fireEvent.change(links.getByLabelText("만료 기간"), { target: { value: "7" } });
    fireEvent.change(links.getByLabelText("공유할 snapshot"), { target: { value: "latest" } });
    fireEvent.click(links.getByRole("checkbox", { name: "파일 내보내기 허용" }));
    fireEvent.click(links.getByRole("button", { name: "공유 링크 생성" }));
    const reveal = await screen.findByRole("region", { name: "발급된 공유 링크" });
    expect(h.issueLink).toHaveBeenCalledWith({ project_slug: "beta", label: "검토 링크", ttl_days: 7, snapshot_policy: "latest", allow_export: true });
    expect(within(reveal).getByText(rawUrl)).toBeTruthy();
    fireEvent.click(within(reveal).getByRole("button", { name: "링크 복사 후 원문 지우기" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(rawUrl));
    await waitFor(() => expect(screen.queryByText(rawUrl)).toBeNull());
    expect(where()).not.toContain(rawUrl);
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain(rawUrl);
    expect(JSON.stringify(qc.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(rawUrl);
    expect(leaked(spies)).toBe(false);
  });

  it("링크 폐기는 확인 뒤 요청하고 revoking 상태와 사용 기록 불가를 구분한다", async () => {
    h.listLinks.mockImplementation(async () => ({ links: [{
      id: "l1", project_slug: "beta", label: "검토 링크", status: "revoking", ttl_seconds: 259200,
      credential_type: "share_link_v2", snapshot_policy: "pinned", pinned_snapshot_id: "snap1", scopes: ["read"],
      last_used_at: null, usage_status: "unavailable", issued_at: "2026-11-18T00:00:00Z", expires_at: "2026-11-21T00:00:00Z",
      revoked_at: null, publication_id: "pub1",
    }] }));
    renderAt("/context-sharing?project=e-beta");
    const list = await screen.findByRole("list", { name: "공유 링크 목록" });
    expect(within(list).getByText("폐기 처리 중")).toBeTruthy();
    expect(within(list).getByText(/생성/)).toBeTruthy();
    expect(within(list).getByText(/생성 2026/)).toBeTruthy();
    expect(within(list).getByText("마지막 사용 사용 기록 확인 불가")).toBeTruthy();
    expect(within(list).queryByRole("button")).toBeNull();
  });

  it("링크 발급 응답이 패널 unmount 뒤 도착해도 상태를 갱신하지 않는다", async () => {
    let finish!: (value: LinkIssued) => void;
    h.issueLink.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { unmount } = renderAt("/context-sharing?project=e-beta");
    const links = within(await screen.findByRole("region", { name: "사람용 공유 링크" }));
    fireEvent.change(links.getByLabelText("링크 이름"), { target: { value: "late" } });
    fireEvent.click(links.getByRole("button", { name: "공유 링크 생성" }));
    const listCallsBeforeUnmount = h.listLinks.mock.calls.length;
    unmount();
    await act(async () => { finish({ id: "l-late", project_slug: "beta", label: "late", status: "active", ttl_seconds: 86400, credential_type: "share_link_v2", snapshot_policy: "pinned", pinned_snapshot_id: "snap1", scopes: ["read"], last_used_at: null, usage_status: "available", issued_at: "2026-11-18T00:00:00Z", expires_at: "2026-11-19T00:00:00Z", revoked_at: null, publication_id: "pub1", url: "https://ctx.test/RAW" }); });
    expect(document.body.textContent).not.toContain("RAW");
    expect(h.listLinks).toHaveBeenCalledTimes(listCallsBeforeUnmount);
  });

  it("링크 폐기 확인 후에도 응답 상태가 revoking이면 완료라고 표시하지 않는다", async () => {
    let state: "active" | "revoking" = "active";
    const link = (status: "active" | "revoking") => ({
      id: "l2", project_slug: "beta", label: "진행 링크", status, ttl_seconds: 259200,
      credential_type: "share_link_v2" as const, snapshot_policy: "pinned" as const, pinned_snapshot_id: "snap1", scopes: ["read"] as Array<"read" | "export">,
      last_used_at: null, usage_status: "available" as const, issued_at: "2026-11-18T00:00:00Z", expires_at: "2026-11-21T00:00:00Z",
      revoked_at: null, publication_id: "pub1",
    });
    h.listLinks.mockImplementation(async () => ({ links: [link(state)] }));
    h.revokeLink.mockImplementation(async () => { state = "revoking"; return link("revoking"); });
    renderAt("/context-sharing?project=e-beta");
    const list = await screen.findByRole("list", { name: "공유 링크 목록" });
    fireEvent.click(within(list).getByRole("button", { name: "링크 폐기: 진행 링크" }));
    const dialog = await screen.findByRole("dialog", { name: "공유 링크를 폐기할까요?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "링크 폐기" }));
    expect(await within(list).findByText("폐기 처리 중")).toBeTruthy();
    expect(await screen.findByText(/링크 폐기를 요청했습니다/)).toBeTruthy();
  });

  it("닫으면 원문 키가 화면에서 사라지고 다시 볼 수 없다", async () => {
    h.issueKey.mockImplementation(async () => issued());
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(within(await panel()).getByRole("button", { name: "재사용 API Key 발급" }));
    const reveal = await screen.findByRole("region", { name: "발급된 키" });
    fireEvent.click(within(reveal).getByRole("button", { name: "닫기" }));
    expect(screen.queryByText(RAW_KEY)).toBeNull();
    expect(screen.queryByRole("region", { name: "발급된 키" })).toBeNull();
    expect(document.body.textContent).not.toContain(RAW_KEY);
  });

  it("다른 화면으로 이동했다가 돌아오면 원문 키가 지워져 있다", async () => {
    h.issueKey.mockImplementation(async () => issued());
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(within(await panel()).getByRole("button", { name: "재사용 API Key 발급" }));
    await screen.findByText(RAW_KEY);
    fireEvent.click(screen.getByRole("link", { name: "프로젝트 목록" }));
    await screen.findByRole("list", { name: "프로젝트" });
    expect(document.body.textContent).not.toContain(RAW_KEY);
    fireEvent.click(screen.getByRole("link", { name: /Beta/ }));
    await panel();
    expect(document.body.textContent).not.toContain(RAW_KEY);
  });

  it("화면을 벗어나면(언마운트) 원문 키를 들고 있지 않는다", async () => {
    h.issueKey.mockImplementation(async () => issued());
    const { unmount } = renderAt("/context-sharing?project=e-beta");
    fireEvent.click(within(await panel()).getByRole("button", { name: "재사용 API Key 발급" }));
    await screen.findByText(RAW_KEY);
    unmount();
    expect(document.body.textContent).not.toContain(RAW_KEY);
  });

  it("키 발급 오류는 키를 보여 주지 않고 이유를 말한다", async () => {
    h.issueKey.mockRejectedValueOnce(apiErr(503, "gateway_contract_incomplete"));
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(within(await panel()).getByRole("button", { name: "재사용 API Key 발급" }));
    expect(await screen.findByText("지금은 키를 발급할 수 없습니다")).toBeTruthy();
    expect(screen.getByText(/Gateway 계약 갱신이 필요합니다/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "발급된 키" })).toBeNull();
  });

  it("Gateway 미설정 503 도 안내하고 키 영역은 성공 상태가 되지 않는다", async () => {
    h.issueKey.mockRejectedValueOnce(apiErr(503, "gateway_not_configured", { gateway: GW_OFF }));
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(within(await panel()).getByRole("button", { name: "재사용 API Key 발급" }));
    expect(await screen.findByText("Context Gateway 연결이 설정되지 않았습니다")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "발급된 키" })).toBeNull();
  });

  it("발급한 키 목록은 활성·만료·폐기를 구분해 보여 주고 원문은 없다", async () => {
    h.listKeys.mockImplementation(async () => ({
      keys: [
        key({ id: "k1", label: "활성 키", usage_status: "unavailable" }),
        key({ id: "k2", label: "만료 키", status: "expired" }),
        key({ id: "k3", label: "폐기 키", status: "revoked", revoked_at: "2026-11-16T01:30:00.000000+00:00" }),
      ] satisfies ShareKey[],
    }));
    renderAt("/context-sharing?project=e-beta");
    const list = await screen.findByRole("list", { name: "발급한 키" });
    const rows = within(list).getAllByRole("listitem");
    expect(within(rows[0]).getByText("활성")).toBeTruthy();
    expect(within(rows[0]).getByText("마지막 사용 사용 기록 확인 불가")).toBeTruthy();
    expect(within(rows[1]).getByText("만료")).toBeTruthy();
    expect(within(rows[2]).getByText("폐기됨")).toBeTruthy();
    expect(within(rows[0]).getByRole("button", { name: "키 폐기: 활성 키" })).toBeTruthy();
    expect(within(rows[1]).queryByRole("button")).toBeNull();
    expect(within(rows[2]).queryByRole("button")).toBeNull();
    expect(h.listKeys.mock.calls[0][0]).toBe("beta");
  });

  it("키 폐기는 확인 뒤에만 호출되고 성공하면 목록이 새로 고쳐진다", async () => {
    let revoked = false;
    h.listKeys.mockImplementation(async () => ({ keys: [key({ status: revoked ? "revoked" : "active" })] }));
    h.revokeKey.mockImplementation(async () => { revoked = true; return key({ status: "revoked" }); });
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(await screen.findByRole("button", { name: "키 폐기: claude 데스크톱" }));
    expect(h.revokeKey).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: "키를 폐기할까요?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "폐기 실행" }));
    await waitFor(() => expect(h.revokeKey).toHaveBeenCalledWith("k1"));
    expect(await screen.findByText("폐기됨")).toBeTruthy();
  });

  it("키 폐기가 실패하면 성공처럼 보이지 않고 활성 그대로 둔다", async () => {
    h.listKeys.mockImplementation(async () => ({ keys: [key()] }));
    h.revokeKey.mockRejectedValueOnce(apiErr(503, "gateway_unavailable"));
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(await screen.findByRole("button", { name: "키 폐기: claude 데스크톱" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "키를 폐기할까요?" })).getByRole("button", { name: "폐기 실행" }));
    expect(await screen.findByText("Gateway 에 연결할 수 없습니다")).toBeTruthy();
    const row = screen.getByRole("list", { name: "발급한 키" });
    expect(within(row).getByText("활성")).toBeTruthy();
    expect(within(row).queryByText("폐기")).toBeNull();
  });

  it("프로젝트 공유 철회는 영향을 설명하는 확인 뒤에만 호출되고 결과 수를 알린다", async () => {
    h.revokeProject.mockImplementation(async () => ({
      project_slug: "beta", publication: pub({ status: "revoked" }), revoked_snapshots: 2, revoked_keys: 1, already_revoked: false,
    }));
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(within(await panel()).getByRole("button", { name: "공유 철회" }));
    expect(h.revokeProject).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: "프로젝트 공유를 철회할까요?" });
    expect(within(dialog).getByText(/즉시 읽을 수 없게/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "철회 실행" }));
    await waitFor(() => expect(h.revokeProject).toHaveBeenCalledWith("beta"));
    expect(await screen.findByText(/스냅샷 2개·키 1개를 폐기했습니다/)).toBeTruthy();
  });

  it("철회가 일부만 성공하면 남은 항목을 알리고 같은 버튼으로 이어서 하게 한다", async () => {
    h.revokeProject.mockRejectedValueOnce(
      apiErr(503, "gateway_unavailable", { partial: { revoked_snapshots: 1, remaining_snapshots: 1, revoked_keys: 0, remaining_keys: 1 } }),
    );
    renderAt("/context-sharing?project=e-beta");
    fireEvent.click(within(await panel()).getByRole("button", { name: "공유 철회" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "프로젝트 공유를 철회할까요?" })).getByRole("button", { name: "철회 실행" }));
    expect(await screen.findByText(/스냅샷 1개·키 1개가 남았습니다/)).toBeTruthy();
    expect(screen.queryByText(/폐기했습니다$/)).toBeNull();
    expect(within(await panel()).getByRole("button", { name: "공유 철회" })).toBeTruthy();
  });

  it("키 목록을 불러오지 못하면 이유와 다시 불러오기를 보여 준다", async () => {
    h.listKeys.mockRejectedValueOnce(apiErr(500, "boom", {}, "서버 오류"));
    renderAt("/context-sharing?project=e-beta");
    const p = within(await panel());
    expect(await p.findByText("서버 오류")).toBeTruthy();
    fireEvent.click(p.getByRole("button", { name: "다시 불러오기" }));
    await waitFor(() => expect(h.listKeys).toHaveBeenCalledTimes(2));
  });
});

describe("전체 흐름의 접근성 기본기", () => {
  it("게시 승인 영역과 검토 영역은 이름 있는 region 이고 모든 입력에 이름이 있다", async () => {
    setServer(draft());
    renderAt("/context-sharing?project=e-alpha&draft=d1");
    await screen.findByRole("region", { name: "게시 승인" });
    expect(screen.getByRole("region", { name: "게시 전 검토" })).toBeTruthy();
    for (const el of screen.getAllByRole("textbox")) expect(el.getAttribute("aria-label") || (el as HTMLInputElement).labels?.length).toBeTruthy();
    for (const el of screen.getAllByRole("checkbox")) expect((el as HTMLInputElement).labels?.length).toBeGreaterThan(0);
  });

  it("오류 안내는 alert 로 읽힌다", async () => {
    h.shareProjects.mockRejectedValueOnce(apiErr(500, "boom", {}, "서버 오류"));
    renderAt("/context-sharing");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(alertText()).toContain("서버 오류");
  });
});
