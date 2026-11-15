import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ACCOUNTS } from "../features/github/fixtures";
import { DONE, DONE_CACHED, DONE_DETERMINISTIC, FAILED, HISTORY, QUEUED, RUNNING } from "../features/repo-appraisal/fixtures";

const h = vi.hoisted(() => ({
  ghAccounts: vi.fn(), startAppraisal: vi.fn(), getAppraisal: vi.fn(), listAppraisals: vi.fn(),
}));
vi.mock("../api/githubClient", async (orig) => ({
  ...(await orig<typeof import("../api/githubClient")>()),
  ghAccounts: (...a: unknown[]) => h.ghAccounts(...a),
}));
vi.mock("../api/repoAppraisalClient", async (orig) => ({
  ...(await orig<typeof import("../api/repoAppraisalClient")>()),
  startAppraisal: (...a: unknown[]) => h.startAppraisal(...a),
  getAppraisal: (...a: unknown[]) => h.getAppraisal(...a),
  listAppraisals: (...a: unknown[]) => h.listAppraisals(...a),
}));

import { GhApiError } from "../api/githubClient";
import { RepoAppraisalPage } from "./RepoAppraisalPage";
import { FEATURES } from "../shell/features";

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes>
          <Route path="/repo-appraisal/*" element={<RepoAppraisalPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, qc };
}

const where = () => screen.getByTestId("where").textContent;
const accountsOk = () => ({ accounts: ACCOUNTS, gh_available: true, fetched_at: "2026-11-15T01:00:00Z" });

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  h.ghAccounts.mockImplementation(async () => accountsOk());
  h.listAppraisals.mockImplementation(async () => ({ items: [] }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

it("메뉴 기능 목록에 저장소 평가가 있고 /repo-appraisal 로 간다", () => {
  const f = FEATURES.find((x) => x.root === "repo-appraisal");
  expect(f?.to).toBe("/repo-appraisal");
  expect(f?.label).toBe("저장소 평가");
});

it("계정을 고르기 전에는 평가 버튼이 비활성이다", async () => {
  renderAt("/repo-appraisal");
  expect(await screen.findByRole("heading", { name: "GitHub 계정 선택" })).toBeTruthy();
  const target = await screen.findByLabelText("저장소 주소");
  fireEvent.change(target, { target: { value: "acme/widgets" } });
  expect((screen.getByRole("button", { name: "평가" }) as HTMLButtonElement).disabled).toBe(true);
});

it("계정을 고르면 as 가 붙고 평가 버튼이 활성화된다", async () => {
  renderAt("/repo-appraisal");
  fireEvent.click(await screen.findByRole("button", { name: /bob-work/ }));
  await waitFor(() => expect(where()).toBe("/repo-appraisal?as=bob-work"));
  const target = await screen.findByLabelText("저장소 주소");
  fireEvent.change(target, { target: { value: "acme/widgets" } });
  expect((screen.getByRole("button", { name: "평가" }) as HTMLButtonElement).disabled).toBe(false);
});

it("저장된 마지막 계정이 아직 유효하면 as 를 자동으로 채운다", async () => {
  window.localStorage.setItem("ttakkari.github.account", JSON.stringify("bob-work"));
  renderAt("/repo-appraisal");
  await waitFor(() => expect(where()).toBe("/repo-appraisal?as=bob-work"));
});

it("모드 기본값은 빠른이고 정밀을 고르면 deep 으로 요청한다", async () => {
  h.startAppraisal.mockImplementation(async () => ({ reused: false, appraisal: QUEUED }));
  renderAt("/repo-appraisal?as=alice");
  expect((await screen.findByRole("button", { name: "빠른" })).getAttribute("aria-pressed")).toBe("true");
  fireEvent.change(await screen.findByLabelText("저장소 주소"), { target: { value: "acme/widgets" } });
  fireEvent.click(screen.getByRole("button", { name: "평가" }));
  await waitFor(() => expect(h.startAppraisal).toHaveBeenCalledWith({ target: "acme/widgets", account: "alice", mode: "quick", force: false }));
  cleanup();
  h.startAppraisal.mockClear();
  h.startAppraisal.mockImplementation(async () => ({ reused: false, appraisal: QUEUED }));
  renderAt("/repo-appraisal?as=alice");
  fireEvent.click(await screen.findByRole("button", { name: "정밀" }));
  fireEvent.change(await screen.findByLabelText("저장소 주소"), { target: { value: "acme/widgets" } });
  fireEvent.click(screen.getByRole("button", { name: "평가" }));
  await waitFor(() => expect(h.startAppraisal).toHaveBeenCalledWith({ target: "acme/widgets", account: "alice", mode: "deep", force: false }));
});

it("다시 계산을 펼치면 force 를 켤 수 있다", async () => {
  h.startAppraisal.mockImplementation(async () => ({ reused: false, appraisal: QUEUED }));
  renderAt("/repo-appraisal?as=alice");
  fireEvent.change(await screen.findByLabelText("저장소 주소"), { target: { value: "acme/widgets" } });
  const details = screen.getByText("다시 계산").closest("details")!;
  expect(details.open).toBe(false);
  fireEvent.click(within(details).getByText("다시 계산"));
  fireEvent.click(await screen.findByLabelText("캐시 무시하고 다시 계산"));
  fireEvent.click(screen.getByRole("button", { name: "평가" }));
  await waitFor(() => expect(h.startAppraisal).toHaveBeenCalledWith({ target: "acme/widgets", account: "alice", mode: "quick", force: true }));
});

it("202 면 상세로 이동해 진행 단계를 보여 준다", async () => {
  h.startAppraisal.mockImplementation(async () => ({ reused: false, appraisal: QUEUED }));
  h.getAppraisal.mockImplementation(async () => RUNNING);
  renderAt("/repo-appraisal?as=alice");
  fireEvent.change(await screen.findByLabelText("저장소 주소"), { target: { value: "acme/widgets" } });
  fireEvent.click(screen.getByRole("button", { name: "평가" }));
  await waitFor(() => expect(where()).toBe(`/repo-appraisal/${QUEUED.id}?as=alice`));
  const steps = await screen.findByRole("list", { name: "평가 진행 단계" });
  expect(within(steps).getByText("수집")).toBeTruthy();
  expect(within(steps).getByText("채점")).toBeTruthy();
  expect(within(steps).getByText("AI 판정")).toBeTruthy();
  expect(within(steps).getByText("완료")).toBeTruthy();
});

it("200(캐시 적중)이면 결과를 바로 보여 주고 다시 묻지 않는다", async () => {
  h.startAppraisal.mockImplementation(async () => ({ reused: true, appraisal: DONE }));
  renderAt("/repo-appraisal?as=alice");
  fireEvent.change(await screen.findByLabelText("저장소 주소"), { target: { value: "acme/widgets" } });
  fireEvent.click(screen.getByRole("button", { name: "평가" }));
  await waitFor(() => expect(where()).toBe(`/repo-appraisal/${DONE.id}?as=alice`));
  expect(await screen.findByRole("heading", { name: "평가 결과" })).toBeTruthy();
  expect(screen.getByText("B+")).toBeTruthy();
  expect(h.getAppraisal).not.toHaveBeenCalled();
});

it("열 수 없는 주소는 입력 아래에 이유를 보여 주고 이동하지 않는다", async () => {
  h.startAppraisal.mockRejectedValue(new GhApiError({ status: 422, code: "invalid_target", message: "저장소 주소여야 합니다." }));
  renderAt("/repo-appraisal?as=alice");
  fireEvent.change(await screen.findByLabelText("저장소 주소"), { target: { value: "not a repo" } });
  fireEvent.click(screen.getByRole("button", { name: "평가" }));
  expect(await screen.findByText(/owner\/repo 또는/)).toBeTruthy();
  expect(where()).toBe("/repo-appraisal?as=alice");
});

it("계정이 하나도 없으면 gh auth login 안내", async () => {
  h.ghAccounts.mockImplementation(async () => ({ accounts: [], gh_available: true, fetched_at: "2026-11-15T01:00:00Z" }));
  renderAt("/repo-appraisal");
  expect(await screen.findByText(/gh auth login/)).toBeTruthy();
});

it("진행 중에는 폴링하고 완료되면 멈춘다", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  h.getAppraisal
    .mockResolvedValueOnce(RUNNING)
    .mockResolvedValueOnce({ ...RUNNING, stage: "llm" })
    .mockResolvedValue(DONE);
  h.listAppraisals.mockImplementation(async () => ({ items: HISTORY }));
  renderAt(`/repo-appraisal/${RUNNING.id}?as=alice`);
  expect(await screen.findByRole("list", { name: "평가 진행 단계" })).toBeTruthy();
  expect(h.getAppraisal).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(2100));
  expect(h.getAppraisal).toHaveBeenCalledTimes(2);
  await act(() => vi.advanceTimersByTimeAsync(3100));
  await screen.findByRole("heading", { name: "평가 결과" });
  const n = h.getAppraisal.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(h.getAppraisal).toHaveBeenCalledTimes(n);
});

it("폴링 중 화면을 벗어나면 추가 요청이 없다", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  h.getAppraisal.mockImplementation(async () => RUNNING);
  const r = renderAt(`/repo-appraisal/${RUNNING.id}?as=alice`);
  expect(await screen.findByRole("list", { name: "평가 진행 단계" })).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(2100));
  expect(h.getAppraisal).toHaveBeenCalledTimes(2);
  r.unmount();
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(h.getAppraisal).toHaveBeenCalledTimes(2);
});

it("실패한 평가는 서버 error 문구를 보여 준다", async () => {
  h.getAppraisal.mockImplementation(async () => FAILED);
  renderAt(`/repo-appraisal/${FAILED.id}?as=alice`);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("gh_not_found: 없거나 이 계정에 권한이 없습니다.");
});

it("실패 화면의 다시 평가는 입력에 주소를 채워 시작 화면으로 보낸다", async () => {
  h.getAppraisal.mockImplementation(async () => FAILED);
  renderAt(`/repo-appraisal/${FAILED.id}?as=alice`);
  fireEvent.click(await screen.findByRole("button", { name: "다시 평가" }));
  await waitFor(() => expect(where()).toContain("/repo-appraisal?"));
  expect(where()).toContain("as=alice");
  expect((await screen.findByLabelText("저장소 주소") as HTMLInputElement).value).toBe("acme/widgets");
});

it("결과 카드는 등급·점수·축 막대·약점·총평·delta 를 보여 준다", async () => {
  h.getAppraisal.mockImplementation(async () => DONE);
  h.listAppraisals.mockImplementation(async () => ({ items: HISTORY }));
  renderAt(`/repo-appraisal/${DONE.id}?as=alice`);
  expect(await screen.findByRole("heading", { name: "평가 결과" })).toBeTruthy();
  expect(screen.getByText("82.4점")).toBeTruthy();
  expect(screen.getByRole("progressbar", { name: "코드 품질" }).getAttribute("aria-valuenow")).toBe("3.8");
  expect(await screen.findByText("약점 Top 3")).toBeTruthy();
  expect(screen.getByText(/워크플로를 추가하세요/)).toBeTruthy();
  expect(screen.getByText(/구조는 탄탄하지만/)).toBeTruthy();
  expect(screen.getByText("▲ 2.3")).toBeTruthy();
});

it("점수가 떨어지면 ▼ 로 보여 준다", async () => {
  h.getAppraisal.mockImplementation(async () => DONE_CACHED);
  renderAt(`/repo-appraisal/${DONE_CACHED.id}?as=alice`);
  expect(await screen.findByText("▼ 1.1")).toBeTruthy();
});

it("축 상태 null·na·미검증을 구분하고 독창성에 신뢰도 라벨을 단다", async () => {
  h.getAppraisal.mockImplementation(async () => DONE);
  renderAt(`/repo-appraisal/${DONE.id}?as=alice`);
  expect(await screen.findByRole("heading", { name: "평가 결과" })).toBeTruthy();
  const harness = screen.getByTestId("axis-ai_harness");
  expect(within(harness).getByText("해당 없음")).toBeTruthy();
  expect(screen.queryByRole("progressbar", { name: "AI 하네스" })).toBeNull();
  const orig = screen.getByTestId("axis-originality");
  expect(within(orig).getByText("의견·신뢰도 낮음")).toBeTruthy();
});

it("미검증 항목이 있는 축은 미검증으로 표시한다", async () => {
  const unverified = {
    ...DONE,
    result: DONE.result && {
      ...DONE.result,
      axes: { ...DONE.result.axes, architecture: null },
      items: DONE.result.items.map((i) => (i.item === "architecture.layering" ? { ...i, score: null, status: "unverified" as const } : i)),
    },
  };
  h.getAppraisal.mockImplementation(async () => unverified);
  renderAt(`/repo-appraisal/${DONE.id}?as=alice`);
  expect(await screen.findByRole("heading", { name: "평가 결과" })).toBeTruthy();
  expect(within(screen.getByTestId("axis-architecture")).getByText("미검증")).toBeTruthy();
});

it("항목별 근거는 펼침으로 본다", async () => {
  h.getAppraisal.mockImplementation(async () => DONE);
  renderAt(`/repo-appraisal/${DONE.id}?as=alice`);
  expect(await screen.findByRole("heading", { name: "평가 결과" })).toBeTruthy();
  const details = screen.getByText("코드 품질 항목 3건").closest("details")!;
  fireEvent.click(within(details).getByText("코드 품질 항목 3건"));
  expect(within(details).getByText(/lint_config/)).toBeTruthy();
  const arch = screen.getByText("아키텍처 항목 2건").closest("details")!;
  fireEvent.click(within(arch).getByText("아키텍처 항목 2건"));
  expect(within(arch).getByText(/src\/index\.ts/)).toBeTruthy();
});

it("LLM 을 안 썼으면 결정론 점수만이라고 쓰고 비용 정보를 작게 보여 준다", async () => {
  h.getAppraisal.mockImplementation(async () => DONE_DETERMINISTIC);
  renderAt(`/repo-appraisal/${DONE_DETERMINISTIC.id}?as=alice`);
  expect(await screen.findByText(/결정론 점수만/)).toBeTruthy();
  expect(screen.getByText(/근거 32,100자/)).toBeTruthy();
  expect(screen.queryByText(/mock-model/)).toBeNull();
});

it("LLM 을 썼으면 모델명을 보여 준다", async () => {
  h.getAppraisal.mockImplementation(async () => DONE);
  renderAt(`/repo-appraisal/${DONE.id}?as=alice`);
  expect(await screen.findByText(/mock-model/)).toBeTruthy();
  expect(screen.queryByText("결정론 점수만")).toBeNull();
});

it("같은 저장소 이력은 점수 추이와 함께 보이고 항목을 누르면 그 평가를 연다", async () => {
  h.getAppraisal.mockImplementation(async () => DONE);
  h.listAppraisals.mockImplementation(async () => ({ items: HISTORY }));
  renderAt(`/repo-appraisal/${DONE.id}?as=alice`);
  expect(await screen.findByRole("heading", { name: "점수 추이" })).toBeTruthy();
  expect(await screen.findByRole("link", { name: /74\.9점/ })).toBeTruthy();
  expect(h.listAppraisals.mock.calls[0].slice(0, 3)).toEqual(["acme", "widgets", 20]);
  expect(screen.getByRole("img", { name: /점수 추이/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: /74\.9점/ }));
  await waitFor(() => expect(where()).toContain(`/repo-appraisal/${HISTORY[2].id}`));
});

it("이력이 없으면 빈 상태를 보여 준다", async () => {
  h.getAppraisal.mockImplementation(async () => DONE);
  h.listAppraisals.mockImplementation(async () => ({ items: [] }));
  renderAt(`/repo-appraisal/${DONE.id}?as=alice`);
  expect(await screen.findByText("이전 평가가 없어요")).toBeTruthy();
});

it("없는 평가는 없음 문구, 권한 없음은 구분 문구를 보여 준다", async () => {
  h.getAppraisal.mockRejectedValue(new GhApiError({ status: 404, code: "not_found", message: "평가가 없습니다." }));
  renderAt("/repo-appraisal/no-such-id?as=alice");
  expect(await screen.findByText(/평가를 찾을 수 없어요/)).toBeTruthy();
  cleanup();
  h.getAppraisal.mockRejectedValue(new GhApiError({ status: 403, code: "forbidden", message: "forbidden" }));
  renderAt("/repo-appraisal/no-such-id?as=alice");
  expect(await screen.findByText(/볼 권한이 없어요/)).toBeTruthy();
});

it("네트워크 오류는 연결 문구와 다시 시도를 보여 준다", async () => {
  h.getAppraisal.mockRejectedValueOnce(new GhApiError({ status: 0, code: "network", message: "Mac Studio 에 연결하지 못했어요." }));
  h.getAppraisal.mockResolvedValue(DONE);
  renderAt(`/repo-appraisal/${DONE.id}?as=alice`);
  expect(await screen.findByText("연결하지 못했어요")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("heading", { name: "평가 결과" })).toBeTruthy();
});

it("열어 본 평가는 최근 평가에 남고 저장소 무관하게 보인다", async () => {
  h.getAppraisal.mockImplementation(async () => DONE);
  renderAt(`/repo-appraisal/${DONE.id}?as=alice`);
  expect(await screen.findByRole("heading", { name: "평가 결과" })).toBeTruthy();
  const stored = window.localStorage.getItem("ttakkari.repo-appraisal.recent") ?? "";
  expect(JSON.parse(stored)[0]).toMatchObject({ id: DONE.id, owner: "acme", repo: "widgets" });
  expect(stored).not.toMatch(/token|ghp_|Bearer/i);
  cleanup();
  renderAt("/repo-appraisal?as=bob-work");
  expect(await screen.findByRole("heading", { name: "최근 평가" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /acme\/widgets/ })).toBeTruthy();
});

it("최근 평가가 없으면 빈 상태를 보여 준다", async () => {
  renderAt("/repo-appraisal?as=alice");
  expect(await screen.findByText("아직 평가한 저장소가 없어요")).toBeTruthy();
});
