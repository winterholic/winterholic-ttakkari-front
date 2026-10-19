import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { ApiError } from "../api/client";
import { NOTEBOOK, authStatus, job } from "../features/notebooklm/fixtures";
import { NotebookLMDetailPage } from "./NotebookLMDetailPage";
import { NotebookLMPage } from "./NotebookLMPage";

const h = vi.hoisted(() => ({
  status: vi.fn(), list: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn(), detail: vi.fn(), addUrl: vi.fn(), addText: vi.fn(),
  upload: vi.fn(), delSource: vi.fn(), jobs: vi.fn(), cancelJob: vi.fn(), toast: vi.fn(),
}));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  getNotebookLMStatus: h.status,
  listNotebooks: h.list,
  createNotebook: h.create,
  renameNotebook: h.rename,
  deleteNotebook: h.remove,
  getNotebook: h.detail,
  addNotebookUrlSource: h.addUrl,
  addNotebookTextSource: h.addText,
  uploadNotebookSource: h.upload,
  deleteNotebookSource: h.delSource,
  listNotebookJobs: h.jobs,
  cancelNotebookJob: h.cancelJob,
}));
vi.mock("../shell/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("../hooks/useForegroundResync", () => ({ useForegroundResync: () => {} }));
vi.mock("../ui/toastStore", () => ({ toast: h.toast }));

const READY = authStatus({ state: "ready", message: null, logged_in: true });
const LIST = [
  { id: "nb1", title: "AI 논문 리서치", source_count: 3, created_at: null, updated_at: "2026-10-19T01:00:00Z", is_owner: true },
  { id: "nb2", title: "공유받은 노트", source_count: 1, created_at: null, updated_at: null, is_owner: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  h.status.mockResolvedValue(READY);
  h.list.mockResolvedValue(LIST);
  h.detail.mockResolvedValue(NOTEBOOK);
  h.jobs.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function mount(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/notebooklm" element={<NotebookLMPage />} />
          <Route path="/notebooklm/:notebookId" element={<NotebookLMDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const apiError = (status: number, code: string, message: string, retryAfter?: number) => new ApiError(status, { code, message }, retryAfter);

it("login_required 이면 상태 카드만 그리고 노트북 목록은 Google 에 요청하지 않는다", async () => {
  h.status.mockResolvedValue(authStatus());
  mount("/notebooklm");
  expect(await screen.findByText("로그인 필요")).toBeTruthy();
  expect(screen.getByTestId("list-locked")).toBeTruthy();
  expect(h.list).not.toHaveBeenCalled();
});

it("상태를 읽지 못하면(네트워크) 오류 안내와 다시 읽기를 준다", async () => {
  h.status.mockRejectedValue(new TypeError("Failed to fetch"));
  mount("/notebooklm");
  expect(await screen.findByText("서버에 연결하지 못했어요")).toBeTruthy();
  h.status.mockResolvedValue(READY);
  fireEvent.click(screen.getByRole("button", { name: "상태 다시 읽기" }));
  expect(await screen.findByText("연결됨")).toBeTruthy();
});

it("연결되면 노트북 목록을 보이고 소유하지 않은 노트북은 수정·삭제를 숨긴다", async () => {
  mount("/notebooklm");
  expect(await screen.findByText("AI 논문 리서치")).toBeTruthy();
  expect(screen.getByText("공유받음")).toBeTruthy();
  expect(screen.getByRole("button", { name: "AI 논문 리서치 삭제" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "공유받은 노트 삭제" })).toBeNull();
});

it("노트북이 없으면 빈 상태를 보인다", async () => {
  h.list.mockResolvedValue([]);
  mount("/notebooklm");
  expect(await screen.findByText("아직 노트북이 없어요")).toBeTruthy();
});

it("목록이 429 쿨다운이면 남은 시간 안내를 보인다", async () => {
  h.list.mockRejectedValue(apiError(429, "rate_limited", "Google 사용 제한", 120));
  mount("/notebooklm");
  expect(await screen.findByText("Google 사용 제한 중이에요")).toBeTruthy();
});

it("목록이 auth_required 면 재로그인 안내를 보인다", async () => {
  h.list.mockRejectedValue(apiError(409, "auth_required", "로그인 필요"));
  mount("/notebooklm");
  expect(await screen.findByText("다시 로그인해야 해요")).toBeTruthy();
});

it("삭제는 확인 대화상자를 거친 뒤에만 보낸다", async () => {
  h.remove.mockResolvedValue(undefined);
  mount("/notebooklm");
  fireEvent.click(await screen.findByRole("button", { name: "AI 논문 리서치 삭제" }));
  expect(h.remove).not.toHaveBeenCalled();
  const dlg = screen.getByRole("dialog", { name: "노트북을 삭제할까요?" });
  expect(within(dlg).getByText(/되돌릴 수 없어요/)).toBeTruthy();
  fireEvent.click(within(dlg).getByRole("button", { name: "삭제" }));
  await waitFor(() => expect(h.remove).toHaveBeenCalledWith("nb1"));
});

it("이름 변경은 새 이름을 보낸다", async () => {
  h.rename.mockResolvedValue({ ...LIST[0], title: "새 이름" });
  mount("/notebooklm");
  fireEvent.click(await screen.findByRole("button", { name: "AI 논문 리서치 이름 변경" }));
  const dlg = screen.getByRole("dialog", { name: "이름 변경" });
  fireEvent.change(within(dlg).getByLabelText("노트북 이름"), { target: { value: "새 이름" } });
  fireEvent.click(within(dlg).getByRole("button", { name: "바꾸기" }));
  await waitFor(() => expect(h.rename).toHaveBeenCalledWith("nb1", "새 이름"));
});

it("상세: 소스의 유형과 상태를 보인다", async () => {
  mount("/notebooklm/nb1");
  const panel = within(await screen.findByRole("region", { name: "소스" }));
  expect(panel.getByText("Attention Is All You Need")).toBeTruthy();
  expect(panel.getByText("PDF")).toBeTruthy();
  expect(panel.getByText("처리 중")).toBeTruthy();
  expect(panel.getByText("오류")).toBeTruthy();
  expect(panel.getByText("YouTube")).toBeTruthy();
});

it("상세: 연결되지 않았으면 노트북을 읽지 않고 안내한다", async () => {
  h.status.mockResolvedValue(authStatus({ state: "reauth_required" }));
  mount("/notebooklm/nb1");
  expect(await screen.findByTestId("not-connected")).toBeTruthy();
  expect(h.detail).not.toHaveBeenCalled();
});

it("소스 삭제는 확인을 거친다", async () => {
  h.delSource.mockResolvedValue(undefined);
  mount("/notebooklm/nb1");
  fireEvent.click(await screen.findByRole("button", { name: "메모 삭제" }));
  expect(h.delSource).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog", { name: "소스를 삭제할까요?" })).getByRole("button", { name: "삭제" }));
  await waitFor(() => expect(h.delSource).toHaveBeenCalledWith("nb1", "s3"));
});

async function openAdd() {
  mount("/notebooklm/nb1");
  fireEvent.click(await screen.findByRole("button", { name: /소스 추가/ }));
  const dlg = screen.getByRole("dialog", { name: "소스 추가" });
  fireEvent.change(within(dlg).getByLabelText("웹페이지 주소"), { target: { value: "https://example.com/post" } });
  return dlg;
}

it("소스 추가: 이미 등록된 URL 이면 '이미 등록됨'과 기존 소스를 보여 준다", async () => {
  h.addUrl.mockResolvedValue({ duplicate: true, job: null, source: { id: "s1", title: "Attention Is All You Need", kind: "url" } });
  const dlg = await openAdd();
  fireEvent.click(within(dlg).getByRole("button", { name: "추가" }));
  const found = await within(dlg).findByTestId("duplicate-found");
  expect(within(found).getByText("이미 등록됨")).toBeTruthy();
  expect(within(found).getByText("Attention Is All You Need")).toBeTruthy();
  expect(within(found).getByText("PDF")).toBeTruthy();
});

it("소스 추가: 409 duplicate 는 목록을 확인한 뒤에만 force 를 열고, force 로 다시 보낸다", async () => {
  h.addUrl.mockRejectedValueOnce(apiError(409, "duplicate", "이전 등록 요청의 결과를 알 수 없습니다."))
    .mockResolvedValueOnce({ duplicate: false, job: job(), source: null });
  const dlg = await openAdd();
  fireEvent.click(within(dlg).getByRole("button", { name: "추가" }));
  const conflict = await within(dlg).findByTestId("duplicate-conflict");
  expect(within(conflict).getByText(/이전 등록 요청의 결과를 알 수 없습니다/)).toBeTruthy();
  expect(within(conflict).queryByRole("button", { name: /force/ })).toBeNull();
  const before = h.detail.mock.calls.length;
  fireEvent.click(within(conflict).getByRole("button", { name: /소스 목록 확인/ }));
  await within(conflict).findByTestId("recheck-list");
  expect(h.detail.mock.calls.length).toBeGreaterThan(before);
  fireEvent.click(within(conflict).getByRole("button", { name: /그래도 등록\(force\)/ }));
  await waitFor(() => expect(h.addUrl).toHaveBeenCalledTimes(2));
  expect(h.addUrl.mock.calls[0][1]).toMatchObject({ url: "https://example.com/post", force: false });
  expect(h.addUrl.mock.calls[1][1]).toMatchObject({ url: "https://example.com/post", force: true });
});

it("소스 추가: 202 이면 작업을 시작했다고 알리고 대화상자를 닫는다", async () => {
  h.addUrl.mockResolvedValue({ duplicate: false, job: job(), source: null });
  const dlg = await openAdd();
  fireEvent.click(within(dlg).getByRole("button", { name: "추가" }));
  await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "success" })));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "소스 추가" })).toBeNull());
});

it("소스 추가: 텍스트는 제목과 내용을 보낸다", async () => {
  h.addText.mockResolvedValue({ duplicate: false, job: job({ kind: "source_add_text", params: { title: "메모", chars: 3 } }), source: null });
  mount("/notebooklm/nb1");
  fireEvent.click(await screen.findByRole("button", { name: /소스 추가/ }));
  const dlg = screen.getByRole("dialog", { name: "소스 추가" });
  fireEvent.click(within(dlg).getByLabelText("텍스트"));
  fireEvent.change(within(dlg).getByLabelText("제목"), { target: { value: "메모" } });
  fireEvent.change(within(dlg).getByLabelText("내용"), { target: { value: "본문" } });
  fireEvent.click(within(dlg).getByRole("button", { name: "추가" }));
  await waitFor(() => expect(h.addText).toHaveBeenCalledWith("nb1", { title: "메모", text: "본문", force: false }));
});

it("소스 추가: 파일이 너무 크면(413) 그 사유를 보여 준다", async () => {
  h.upload.mockRejectedValue(apiError(413, "too_large", "파일이 너무 큽니다."));
  mount("/notebooklm/nb1");
  fireEvent.click(await screen.findByRole("button", { name: /소스 추가/ }));
  const dlg = screen.getByRole("dialog", { name: "소스 추가" });
  fireEvent.click(within(dlg).getByLabelText("파일"));
  const input = dlg.querySelector("input[type=file]") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "big.pdf", { type: "application/pdf" })] } });
  expect(await within(dlg).findByTestId("picked-file")).toBeTruthy();
  fireEvent.click(within(dlg).getByRole("button", { name: "추가" }));
  expect(await within(dlg).findByText("파일이 너무 커요")).toBeTruthy();
});

it("진행 중인 job 이 있을 때만 폴링하고, 끝나면 멈추며 소스 목록을 새로 읽는다", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  h.jobs.mockResolvedValue([job()]);
  mount("/notebooklm/nb1");
  expect(await screen.findByText("등록하고 처리하는 중")).toBeTruthy();
  const first = h.jobs.mock.calls.length;
  const detailBefore = h.detail.mock.calls.length;

  h.jobs.mockResolvedValue([job({ status: "succeeded", result: { ready: true }, finished_at: new Date().toISOString() })]);
  await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
  await waitFor(() => expect(screen.getByText("등록 완료")).toBeTruthy());
  const afterDone = h.jobs.mock.calls.length;
  expect(afterDone).toBeGreaterThan(first);
  await waitFor(() => expect(h.detail.mock.calls.length).toBeGreaterThan(detailBefore));

  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(h.jobs.mock.calls.length).toBe(afterDone);
});

it("job 진행 중에는 취소 버튼이 있고, 취소를 요청한다", async () => {
  h.cancelJob.mockResolvedValue(job({ status: "cancelled" }));
  h.jobs.mockResolvedValue([job()]);
  mount("/notebooklm/nb1");
  const list = await screen.findByRole("list", { name: "소스 등록 작업" });
  fireEvent.click(within(list).getByRole("button", { name: "취소" }));
  await waitFor(() => expect(h.cancelJob).toHaveBeenCalledWith("j1"));
});

it("결과를 알 수 없는 job 은 목록 확인을 안내한다", async () => {
  h.jobs.mockResolvedValue([job({ status: "unknown", finished_at: new Date().toISOString(), result: { outcome_unknown: true } })]);
  mount("/notebooklm/nb1");
  expect(await screen.findByText(/소스 목록부터 확인/)).toBeTruthy();
});
