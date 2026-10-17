import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { ArtcraftCatalog, ArtcraftCategory, ArtcraftRound, ArtcraftTaskDetail, ArtcraftTaskSummary } from "../api/artcraftTypes";
import type { ArtifactOut } from "../api/types";

const h = vi.hoisted(() => ({
  catalog: vi.fn(), tasks: vi.fn(), outputs: vi.fn(), create: vi.fn(), task: vi.fn(), round: vi.fn(), upload: vi.fn(), cancel: vi.fn(), patch: vi.fn(),
}));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  getArtcraftCatalog: (...a: unknown[]) => h.catalog(...a),
  listArtcraftTasks: (...a: unknown[]) => h.tasks(...a),
  listArtcraftOutputs: (...a: unknown[]) => h.outputs(...a),
  createArtcraftTask: (...a: unknown[]) => h.create(...a),
  getArtcraftTask: (...a: unknown[]) => h.task(...a),
  addArtcraftRound: (...a: unknown[]) => h.round(...a),
  uploadFile: (...a: unknown[]) => h.upload(...a),
  cancelRun: (...a: unknown[]) => h.cancel(...a),
  patchArtcraftTask: (...a: unknown[]) => h.patch(...a),
  contentBlob: () => Promise.resolve(new Blob(["x"])),
  getArtifact: () => Promise.reject(new Error("not used")),
}));
import { ArtcraftPage } from "./ArtcraftPage";
import { ArtcraftCategoryPage } from "./ArtcraftCategoryPage";
import { ArtcraftTaskPage } from "./ArtcraftTaskPage";

const category = (over: Partial<ArtcraftCategory> & { id: ArtcraftCategory["id"]; title: string }): ArtcraftCategory => ({
  section: "doc", tagline: "한 줄 설명", icon: "file-pdf",
  maturity: { level: "ready", label: "기본 작업 가능", summary: "대표 작업을 실제로 돌려 결과 파일이 나왔어요." },
  apps: [{ app: "pdfcraft", title: "PdfCraft", role: "PDF 도구", installed: true }],
  can: ["합치기·나누기"], cannot: ["인증서 전자서명"], accepts: ["pdf", "png"], outputs: ["PDF"],
  templates: [
    { id: "merge", title: "PDF 합치기", prompt: "첨부한 PDF들을 하나로 합쳐 주세요.", example: "예: 계약서 3개를 한 파일로", min_files: 2, apps: ["pdfcraft"], options: [] },
    { id: "summarize", title: "내용 요약", prompt: "내용을 요약해 주세요.", example: "예: 한 장 요약", min_files: 0, apps: ["pdfcraft"],
      options: [{ id: "format", label: "저장 형식", default: "md", choices: [{ value: "md", label: "MD" }, { value: "docx", label: "DOCX" }] }] },
  ],
  ...over,
});
const catalog = (): ArtcraftCatalog => ({
  sections: [{ id: "image", title: "이미지", categories: ["photo"] }, { id: "doc", title: "문서", categories: ["pdf"] }],
  categories: [
    category({ id: "photo", title: "사진 편집", section: "image", icon: "image", tagline: "사진 보정", maturity: { level: "limited", label: "제한적", summary: "거칠어요" }, apps: [{ app: "photocraft", title: "PhotoCraft", role: "레이어", installed: true }], templates: [] }),
    category({ id: "pdf", title: "PDF 편집" }),
  ],
  available: true, unavailable_reason: null, workspace_id: "ws-1", workspace_error: null, limits: { files: 10, prompt: 8000 },
});
const art = (over: Partial<ArtifactOut> & { id: string; filename: string }): ArtifactOut => ({
  workspace_id: "ws-1", session_id: "s-1", run_id: "r-1", mime_type: "application/pdf", kind: "pdf", source: "agent_output", area: "files", rel_path: null,
  storage_mode: "copy", size_bytes: 2048, sha256: "a".repeat(64), preview_status: "not_required", preview_mime: null, preview_error: null,
  export_policy: "allow", downloadable: true, retention_until: null, created_at: "2026-10-18T01:00:00+00:00", ...over,
});
const summary = (over: Partial<ArtcraftTaskSummary> = {}): ArtcraftTaskSummary => ({
  id: "t-1", session_id: "s-1", category: "pdf", title: "PDF 합치기", apps: ["pdfcraft"], template_id: "merge", state: "done", round_count: 1, output_count: 1,
  last_run_id: "r-1", error: null, progress: null, waiting_reason: null, created_at: "2026-10-18T01:00:00+00:00", updated_at: "2026-10-18T01:05:00+00:00", archived_at: null, ...over,
});
const round = (over: Partial<ArtcraftRound> = {}): ArtcraftRound => ({
  id: "r-1", index: 1, status: "succeeded", state: "done", prompt: "A와 B를 합쳐 주세요", result_text: "합친 파일을 만들었어요. merged.pdf", messages: ["합친 파일을 만들었어요. merged.pdf"], error: null, options: {}, use_previous: false,
  inputs: [], outputs: [art({ id: "a-1", filename: "merged.pdf" })], progress: null, waiting_reason: null,
  created_at: "2026-10-18T01:00:00+00:00", started_at: "2026-10-18T01:00:01+00:00", finished_at: "2026-10-18T01:00:20+00:00", ...over,
});
const detail = (over: Partial<ArtcraftTaskDetail> = {}): ArtcraftTaskDetail => ({ ...summary(), options: {}, rounds: [round()], ...over });

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}
function mount(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/artcraft" element={<ArtcraftPage />} />
          <Route path="/artcraft/manage" element={<p>관리 화면</p>} />
          <Route path="/artcraft/c/:category" element={<ArtcraftCategoryPage />} />
          <Route path="/artcraft/t/:taskId" element={<ArtcraftTaskPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  URL.createObjectURL = vi.fn(() => "blob:x");
  h.catalog.mockResolvedValue(catalog());
  h.tasks.mockResolvedValue({ items: [] });
  h.outputs.mockResolvedValue({ items: [], has_more: false });
  h.task.mockResolvedValue(detail());
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("허브: 묶음 아래 범주 카드, 성숙도, 담당 앱, 관리 링크를 보인다", async () => {
  mount("/artcraft");
  expect(await screen.findByRole("heading", { name: "이미지" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "문서" })).toBeTruthy();
  const pdf = screen.getByRole("link", { name: /PDF 편집/ });
  expect(pdf.getAttribute("href")).toBe("/artcraft/c/pdf");
  expect(within(pdf).getByText("기본 작업 가능")).toBeTruthy();
  expect(within(pdf).getByText("PdfCraft")).toBeTruthy();
  expect(within(screen.getByRole("link", { name: /사진 편집/ })).getByText("제한적")).toBeTruthy();
  expect(screen.getByRole("link", { name: /관리/ }).getAttribute("href")).toBe("/artcraft/manage");
});

it("허브: 진행 중 작업과 최근 작업물을 띄운다", async () => {
  h.tasks.mockResolvedValue({ items: [summary({ id: "t-2", title: "사진 보정", category: "photo", state: "running", progress: "도구 실행" }), summary()] });
  h.outputs.mockResolvedValue({ items: [{ artifact: art({ id: "a-9", filename: "result.pdf" }), task_id: "t-1", task_title: "PDF 합치기", category: "pdf", run_id: "r-1" }], has_more: false });
  mount("/artcraft");
  const active = await screen.findByRole("region", { name: "진행 중 작업" });
  expect(within(active).getByText("사진 보정")).toBeTruthy();
  expect(within(active).getByText("작업 중")).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "최근 작업물" })).getByRole("button", { name: "result.pdf 열기" })).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "최근 작업" })).getByText("PDF 합치기")).toBeTruthy();
});

it("허브: 예전 관제 링크(?tab=bugs&focus=)는 관리 화면으로 넘긴다", async () => {
  mount("/artcraft?tab=bugs&focus=BUG-001");
  expect(await screen.findByText("관리 화면")).toBeTruthy();
  expect(screen.getByTestId("where").textContent).toBe("/artcraft/manage?tab=bugs&focus=BUG-001");
});

it("저장소를 쓸 수 없으면 허브가 이유를 알려 준다", async () => {
  h.catalog.mockResolvedValue({ ...catalog(), available: false, unavailable_reason: "registry.json 을 읽을 수 없습니다." });
  mount("/artcraft");
  expect((await screen.findByRole("alert")).textContent).toContain("registry.json");
});

it("범주: 템플릿 버튼이 지시문을 채우고 파일이 모자라면 보낼 수 없다", async () => {
  mount("/artcraft/c/pdf");
  fireEvent.click(await screen.findByRole("button", { name: "PDF 합치기" }));
  const prompt = screen.getByRole("textbox", { name: "무엇을 시킬까요?" }) as HTMLTextAreaElement;
  expect(prompt.value).toBe("첨부한 PDF들을 하나로 합쳐 주세요.");
  expect(screen.getByRole("status").textContent).toContain("파일이 2개 이상 필요해요");
  fireEvent.click(screen.getByRole("button", { name: /작업 시키기/ }));
  expect(h.create).not.toHaveBeenCalled();
  expect(screen.getByText("예: 계약서 3개를 한 파일로", { exact: false })).toBeTruthy();
});

it("범주: 파일을 올리고 옵션을 골라 보내면 작업이 만들어지고 작업 상세로 간다", async () => {
  h.upload.mockImplementation((file: File) => Promise.resolve(art({ id: `up-${file.name}`, filename: file.name, source: "upload" })));
  h.create.mockResolvedValue(detail({ id: "t-new" }));
  mount("/artcraft/c/pdf");
  fireEvent.click(await screen.findByRole("button", { name: "내용 요약" }));
  fireEvent.click(screen.getByRole("radio", { name: "DOCX" }));
  fireEvent.click(screen.getByRole("radio", { name: "꼼꼼하게" }));
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["%PDF"], "a.pdf", { type: "application/pdf" })] } });
  await waitFor(() => expect(h.upload).toHaveBeenCalledTimes(1));
  expect(h.upload.mock.calls[0][1]).toBe("ws-1");
  await waitFor(() => expect(screen.queryByText("파일을 올리는 중이에요")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: /작업 시키기/ }));
  await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
  expect(h.create.mock.calls[0][0]).toEqual({
    category: "pdf", prompt: "내용을 요약해 주세요.", template_id: "summarize", input_artifact_ids: ["up-a.pdf"], options: { format: "docx" }, speed: "careful",
  });
  await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/artcraft/t/t-new"));
  expect(localStorage.getItem("tk-artcraft-draft:pdf")).toBeNull(); // 보낸 초안은 지운다
});

it("범주: 받지 않는 형식은 올리지 않고, 서버 오류는 화면에 보인다", async () => {
  h.create.mockRejectedValue(Object.assign(new Error("파일은 한 번에 10개까지 붙일 수 있어요."), { status: 422 }));
  mount("/artcraft/c/pdf");
  await screen.findByRole("button", { name: "내용 요약" });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "run.exe")] } });
  expect(h.upload).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "무엇을 시킬까요?" }), { target: { value: "그냥 지시" } });
  fireEvent.click(screen.getByRole("button", { name: /작업 시키기/ }));
  expect((await screen.findByRole("alert")).textContent).toContain("10개까지");
});

it("범주: 되는 일과 아직 안 되는 일을 쉬운 말로 보여 준다", async () => {
  mount("/artcraft/c/pdf");
  const summaryEl = await screen.findByText("되는 일 · 아직 안 되는 일");
  fireEvent.click(summaryEl);
  expect(screen.getByText("합치기·나누기")).toBeTruthy();
  expect(screen.getByText("인증서 전자서명")).toBeTruthy();
});

it("범주: 이력 탭은 이 범주의 작업을 나열하고 숨길 수 있다", async () => {
  h.tasks.mockResolvedValue({ items: [summary()] });
  h.patch.mockResolvedValue(detail());
  mount("/artcraft/c/pdf?tab=history");
  const link = await screen.findByRole("link", { name: /PDF 합치기/ });
  expect(link.getAttribute("href")).toBe("/artcraft/t/t-1");
  fireEvent.click(screen.getByRole("button", { name: "PDF 합치기 이력에서 숨기기" }));
  await waitFor(() => expect(h.patch).toHaveBeenCalledWith("t-1", { archived: true }));
});

it("범주: 작업물 탭은 갤러리 타일과 빈 상태를 보인다", async () => {
  h.outputs.mockResolvedValueOnce({ items: [{ artifact: art({ id: "a-1", filename: "merged.pdf" }), task_id: "t-1", task_title: "PDF 합치기", category: "pdf", run_id: "r-1" }], has_more: false });
  mount("/artcraft/c/pdf?tab=outputs");
  expect(await screen.findByRole("button", { name: "merged.pdf 열기" })).toBeTruthy();
  expect(h.outputs.mock.calls[0][0]).toMatchObject({ category: "pdf" });
});

it("작업 상세: 라운드의 지시·결과·결과 파일을 보이고 이어서 수정을 보낸다", async () => {
  h.round.mockResolvedValue(detail({ round_count: 2, state: "queued", rounds: [round(), round({ id: "r-2", index: 2, state: "queued", status: "queued", prompt: "더 줄여 주세요", outputs: [], result_text: null })] }));
  mount("/artcraft/t/t-1");
  expect(await screen.findByText("A와 B를 합쳐 주세요")).toBeTruthy();
  expect(screen.getByText("합친 파일을 만들었어요. merged.pdf")).toBeTruthy();
  expect(screen.getByRole("button", { name: "merged.pdf 열기" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "대화 기록 열기" }).getAttribute("href")).toBe("/chat/s-1");
  const prev = screen.getByRole("checkbox", { name: "이전 결과를 이어서 고치기" }) as HTMLInputElement;
  expect(prev.checked).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "지시" }), { target: { value: "더 줄여 주세요" } });
  fireEvent.click(screen.getByRole("button", { name: "보내기" }));
  await waitFor(() => expect(h.round).toHaveBeenCalledTimes(1));
  expect(h.round).toHaveBeenCalledWith("t-1", { prompt: "더 줄여 주세요", input_artifact_ids: [], use_previous: true });
  expect(await screen.findByText("2번째 지시")).toBeTruthy();
});

it("작업 상세: 진행 중이면 상태·진행 라벨과 취소 버튼, 실패하면 이유와 다시 하기", async () => {
  h.task.mockResolvedValue(detail({ state: "running", rounds: [round({ state: "running", status: "running", progress: "도구 실행", outputs: [], result_text: null, finished_at: null })] }));
  h.cancel.mockResolvedValue({});
  mount("/artcraft/t/t-1");
  expect(await screen.findByText("도구 실행")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "작업 취소" }));
  await waitFor(() => expect(h.cancel).toHaveBeenCalledWith("r-1"));
  cleanup();

  h.task.mockResolvedValue(detail({ state: "failed", rounds: [round({ state: "failed", status: "failed", error: "fake failure", outputs: [], result_text: null })] }));
  h.round.mockResolvedValue(detail());
  mount("/artcraft/t/t-1");
  expect((await screen.findByRole("alert")).textContent).toContain("fake failure");
  fireEvent.click(screen.getByRole("button", { name: /같은 지시로 다시 하기/ }));
  await waitFor(() => expect(h.round).toHaveBeenCalledWith("t-1", { prompt: "A와 B를 합쳐 주세요", input_artifact_ids: [], use_previous: false }));
});
