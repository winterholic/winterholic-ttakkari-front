import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const h = vi.hoisted(() => ({ list: vi.fn(), start: vi.fn(), get: vi.fn(), remove: vi.fn(), retry: vi.fn(), workspaces: vi.fn(), message: vi.fn(), patch: vi.fn(), resolveArtifact: vi.fn(), content: vi.fn() }));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  listReverseJobs: (...a: unknown[]) => h.list(...a),
  listWorkspaces: (...a: unknown[]) => h.workspaces(...a),
  messageReverseJob: (...a: unknown[]) => h.message(...a),
  startReverseJob: (...a: unknown[]) => h.start(...a),
  getReverseJob: (...a: unknown[]) => h.get(...a),
  deleteReverseJob: (...a: unknown[]) => h.remove(...a),
  retryReverseJob: (...a: unknown[]) => h.retry(...a),
  patchReverseJob: (...a: unknown[]) => h.patch(...a),
  resolveArtifactLink: (...a: unknown[]) => h.resolveArtifact(...a),
  contentBlob: (...a: unknown[]) => h.content(...a),
}));
import { ReversePage } from "./ReversePage";
import { ReverseDetailPage } from "./ReverseDetailPage";
import { Reconstruction } from "../features/reverse/Reconstruction";
import { FEATURES } from "../shell/features";

const expectedCapture = new Uint8Array(readFileSync(`${process.cwd()}/src/features/reverse/test-fixtures/capture-expected.png`));
const sameSizeOtherShaCapture = new Uint8Array(readFileSync(`${process.cwd()}/src/features/reverse/test-fixtures/capture-same-size-other-sha.png`));
async function sha256(bytes: Uint8Array) {
  const input = new ArrayBuffer(bytes.length);
  new Uint8Array(input).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function captureJob({ round = 1, sha, sessionId = `impl-session-r${round}`, outputPath = "/work/project/reverse-engineering/job-1", workspaceId = "ws-1" }:
  { round?: number; sha: string; sessionId?: string; outputPath?: string; workspaceId?: string }) {
  const item = { id: "same-web-case", behavior: `회차 ${round} 캡처`, target_type: "web" as const,
    original: { screenshot: { path: "captures/original.png", sha256: sha, size_bytes: expectedCapture.length, format: "png" as const } },
    replica: { screenshot: { path: "captures/replica.png", sha256: sha, size_bytes: expectedCapture.length, format: "png" as const } },
    input: {}, pre_state: {}, environment: {}, evidence_level: "observed" as const,
    evidence: [{ kind: "web_capture", integrity: { status: "verified" }, provenance: { status: "unverified", reason: "fixture" } }],
    result: "match" as const, functional_result: "match" as const, visual_result: "match" as const, difference: null,
    run_id: `impl-run-r${round}` };
  return { ...doneJob, id: "job-capture-identity", kind: "reconstruction", status: "done", workspace_id: workspaceId,
    output_path: outputPath, session_id: sessionId, verifier_session_id: `verifier-session-r${round}`,
    result: { schema_version: 2, latest: { run_id: `impl-run-r${round}`, comparisons: [item] } },
    stages, rounds: [], activity: [], outputs: [], reconstruction: null };
}

function renderReconstruction(job: ReturnType<typeof captureJob>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><Reconstruction job={job as never} /></MemoryRouter></QueryClientProvider>);
}

const doneJob = {
  id: "job-1", target: "https://github.com/morluto/rea.git", kind: "git_url", status: "done",
  revision: "a".repeat(40), stage: "summarize", error: null,
  created_at: "2026-10-18T00:00:00+00:00", updated_at: "2026-10-18T00:05:00+00:00",
  overview: "REA 개요",
};
const stages = [
  { key: "request", label: "요청 접수", status: "done", started_at: null, finished_at: null, evidence: ["대상 접수: morluto/rea"], notes: [] },
  { key: "collect", label: "수집", status: "done", started_at: null, finished_at: null, evidence: ["shallow clone 완료"], notes: [] },
  { key: "inventory", label: "목록화", status: "done", started_at: null, finished_at: null, evidence: ["파일 10개 관찰"], notes: [] },
  { key: "structure", label: "구조 파악", status: "done", started_at: null, finished_at: null, evidence: ["README에서 제목 확인"], notes: [] },
  { key: "flows", label: "핵심 흐름", status: "done", started_at: null, finished_at: null, evidence: ["import 3건 관찰"], notes: [] },
  { key: "survey", label: "모델 조사", status: "done", started_at: null, finished_at: null, evidence: ["모델이 읽을 파일 2개 지정"], notes: [] },
  { key: "synthesize", label: "모델 합성", status: "done", started_at: null, finished_at: null, evidence: ["모델 합성: 모듈 1건"], notes: [] },
  { key: "summarize", label: "정리·요약", status: "done", started_at: null, finished_at: null, evidence: ["모델 합성 병합"], notes: [] },
];
const detail = {
  ...doneJob,
  stages,
  result: {
    overview: { text: "REA 개요 본문", evidence: ["README.md:1"] },
    architecture: [{ title: "최상위 구성", body: "src(5개)", evidence: ["src/"] }],
    modules: [{ path: "src/index.ts", role: "중심 모듈", evidence: ["src/index.ts"] }],
    flows: [{ title: "cli 흐름", steps: ["cli.js", "setup.js"], evidence: ["cli.js"] }],
    ideas: [{ title: "근거 명시", body: "관행", evidence: ["docs/"] }],
    limitations: ["런타임 동작은 확인 필요"],
    stats: { files: 10, bytes: 2048, langs: [["typescript", 5]], revision: "a".repeat(40), files_parsed: 4,
             model: { engine: "antigravity", model: "claude-sonnet-5-5-high", account: "개인1",
                      via: "policy", files_read: 2, merged: true, masked: 0 } },
  },
};

function mountList() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } }})}>
    <MemoryRouter initialEntries={["/reverse"]}>
      <Routes><Route path="/reverse" element={<ReversePage />} /><Route path="/reverse/:jobId" element={<div>상세 작업</div>} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>);
}

function mountDetail(job: unknown) {
  h.get.mockResolvedValue(job);
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } }})}>
    <MemoryRouter initialEntries={["/reverse/job-1"]}>
      <Routes><Route path="/reverse/:jobId" element={<ReverseDetailPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>);
}

beforeEach(() => {
  h.list.mockResolvedValue({ items: [] });
  h.workspaces.mockResolvedValue([{ id: "ws-1", name: "우리 프로젝트", root_path: "/work/project" }]);
  h.start.mockResolvedValue(doneJob);
  h.remove.mockResolvedValue({ id: "job-1", deleted: true });
  h.patch.mockResolvedValue({ ...doneJob, status: "queued" });
  h.resolveArtifact.mockResolvedValue({ id: "artifact-1" });
  h.content.mockResolvedValue({ text: async () => "# README\n실행: pytest -q" } as Blob);
  h.get.mockResolvedValue(detail);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("부가 기능에 등록되고 빈 목록·분석 시작을 안내한다", async () => {
  expect(FEATURES.find((x) => x.root === "reverse")?.to).toBe("/reverse");
  mountList();
  expect(await screen.findByText("아직 시작한 작업이 없어요")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("대상과 원하는 결과"), { target: { value: "이 계산기의 버튼과 계산 동작을 분석해 소스로 재현해줘." } });
  fireEvent.change(screen.getByLabelText(/짧은 제목/), { target: { value: "계산기 동작 재현" } });
  fireEvent.change(screen.getByLabelText(/참고 URL·파일·문서/), { target: { value: "https://example.test/calc\nfixtures/calc.json" } });
  fireEvent.click(screen.getByText("고급 설정").closest("summary")!);
  fireEvent.change(screen.getByLabelText("대상 유형 · 추천 유형: 자동"), { target: { value: "web" } });
  fireEvent.click(screen.getByRole("button", { name: "재현 작업 시작" }));
  await waitFor(() => expect(h.start).toHaveBeenCalledWith({
    description: "이 계산기의 버튼과 계산 동작을 분석해 소스로 재현해줘.", mode: "analyze_reconstruct",
    title: "계산기 동작 재현", references: ["https://example.test/calc", "fixtures/calc.json"], target_type: "web",
  }));
});

it("목록에서 상태·요약·실패 이유를 보고 지운다", async () => {
  h.list.mockResolvedValue({ items: [doneJob, { ...doneJob, id: "job-2", status: "failed", error: "복제 실패", overview: undefined }] });
  mountList();
  expect(await screen.findByText("REA 개요")).toBeTruthy();
  expect(screen.getByText("복제 실패")).toBeTruthy();
  fireEvent.click(screen.getByText("REA 개요").closest("li")!.querySelector("button")!);
  await waitFor(() => expect(h.remove).toHaveBeenCalledWith("job-1"));
});

it("메인 작업 목록을 진행·수정 필요·최근 완료로 나누고 제목 검색을 적용한다", async () => {
  h.list.mockResolvedValue({ items: [
    { ...doneJob, kind: "reconstruction", status: "running", title: "현재 조사" },
    { ...doneJob, id: "job-2", kind: "reconstruction", title: "불일치 수정", direct_comparison: { status: "mismatch", count: 1, matched: 0, mismatched: 1, unverified: 0 } },
    { ...doneJob, id: "job-3", kind: "reconstruction", title: "완료한 작업", direct_comparison: { status: "match", count: 1, matched: 1, mismatched: 0, unverified: 0 } },
  ] });
  mountList();
  expect(await screen.findByText("현재 조사")).toBeTruthy();
  expect(screen.getByRole("region", { name: "진행 중" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "수정 필요" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "최근 완료" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("작업 검색"), { target: { value: "불일치" } });
  expect(screen.getByText("불일치 수정")).toBeTruthy();
  expect(screen.queryByText("현재 조사")).toBeNull();
});

it("상세에서 타임라인 근거와 최종 결과를 모두 본다", async () => {
  mountDetail(detail);
  expect(await screen.findByRole("heading", { name: "과정 타임라인" })).toBeTruthy();
  expect(screen.getByText("REA 개요 본문")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "핵심 모듈" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "차용할 아이디어" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "한계·확인 필요" })).toBeTruthy();
  fireEvent.click(screen.getAllByText(/근거 1건/)[1]);
  expect(await screen.findByText("shallow clone 완료")).toBeTruthy();
});

it("진행 중에는 결과 대신 대기 문구를 낸다", async () => {
  mountDetail({ ...doneJob, status: "running", result: null, stages: stages.map((s) => ({ ...s, status: "running" })) });
  expect(await screen.findByText("분석이 진행 중입니다. 잠시 후 결과가 나옵니다.")).toBeTruthy();
});

it("모델 합성 정보를 결과 하단에 보여준다", async () => {
  mountDetail(detail);
  expect(await screen.findByText(/모델 합성: antigravity\/claude-sonnet-5-5-high/)).toBeTruthy();
  expect(screen.getByText(/계정 개인1/)).toBeTruthy();
});

it("대기·부분·실패 작업은 다시 시도로 재시작한다", async () => {
  h.retry.mockResolvedValue({ ...doneJob, status: "queued" });
  mountDetail({ ...doneJob, status: "waiting", error: "계정 쿼터가 소진됐습니다.", result: null, stages });
  expect(await screen.findByText("계정 쿼터가 소진됐습니다.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(h.retry).toHaveBeenCalledWith("job-1"));
});

it("부분 완료는 정적 정리 안내를 보여준다", async () => {
  mountDetail({ ...detail, status: "partial" });
  expect(await screen.findByText(/정적 정리만 됐어요/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
});


it("자연어 설명은 여러 줄이고 작업공간을 선택할 수 있다", async () => {
  mountList();
  const input = screen.getByLabelText("대상과 원하는 결과");
  expect(input.tagName).toBe("TEXTAREA");
  await screen.findByRole("option", { name: "우리 프로젝트" });
  fireEvent.change(screen.getByLabelText("작업공간"), { target: { value: "ws-1" } });
  const description = "웹앱의 검색 동작을 재현해줘.\n입력하면 결과가 바로 필터링돼야 해.";
  fireEvent.change(input, { target: { value: description } });
  fireEvent.change(screen.getByLabelText(/목적·성공 기준/), { target: { value: "검색 결과가 입력 즉시 갱신되어야 함" } });
  fireEvent.click(screen.getByRole("button", { name: "재현 작업 시작" }));
  await waitFor(() => expect(h.start).toHaveBeenCalledWith({ description: `${description}\n\n목적·성공 기준: 검색 결과가 입력 즉시 갱신되어야 함`, workspace_id: "ws-1", mode: "analyze_reconstruct" }));
});

it("재현 작업은 소스 경로·관찰·검증·후속 설명을 보여준다", async () => {
  h.message.mockResolvedValue({ ...doneJob, status: "queued" });
  mountDetail({ ...doneJob, kind: "reconstruction", output_path: "/work/project/reverse-engineering/job-1",
    session_id: "session-1", result: null, stages, rounds: [], activity: [], outputs: [],
    reconstruction: { summary: "계산 동작 재현", source_files: ["src/main.py"], verification: "passed",
      observations: [{ finding: "12 + 3 = 15", evidence: "사용자 설명" }],
      checks: [{ command: "pytest", exit_code: 0, log: "evidence/test.log" }], limitations: [] } });
  expect(await screen.findByText("src/main.py")).toBeTruthy();
  expect(screen.getByText("12 + 3 = 15")).toBeTruthy();
  expect(screen.getByText(/기존 검증 보고:/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("추가 설명·검사·수정 요청"), { target: { value: "소수 계산도 재현해줘." } });
  fireEvent.click(screen.getByRole("button", { name: "이어서 지시" }));
  await waitFor(() => expect(h.message).toHaveBeenCalledWith("job-1", "소수 계산도 재현해줘."));
});

it("재현 작업의 부분 완료에는 막힌 검사의 이유를 표시한다", async () => {
  mountDetail({ ...doneJob, kind: "reconstruction", status: "partial", error: "필수 회귀 검사가 실패했습니다.",
    result: null, stages, rounds: [], activity: [], outputs: [], reconstruction: null });
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "필수 회귀 검사가 실패했습니다.");
});

it("v2 상세는 일치·불일치·미검증을 분리하고 비교 양쪽과 비어 있는 사례를 설명한다", async () => {
  const v2 = { schema_version: 2 as const, latest: {
    source: { status: "verified", files: ["src/main.py"] }, execution: { status: "verified", checks: [{ command: "pytest", exit_code: 0, log: "tests.log" }] },
    direct_comparison: { status: "mismatch" as const, count: 2, matched: 1, mismatched: 1, unverified: 0 },
    independent_verification: { status: "pending", run_id: "verify-1", verdict: null },
    comparisons: [{ id: "one", behavior: "공백 이름", target_type: "cli" as const, input: { argv: ["tool", "two words"] }, pre_state: { cwd: "/tmp" },
      original: { stdout: "two-words\\n", stderr: "", exit_code: 0 }, replica: { stdout: "two_words\\n", stderr: "", exit_code: 0 }, environment: { os: "linux" },
      evidence_level: "direct" as const, evidence: [{ kind: "execution", path: ".reverse/one.json" }], verified_at: "2026-11-07T00:00:00Z", run_id: "run-1", result: "mismatch" as const,
      difference: { field: "stdout", original: "two-words", replica: "two_words" } }],
  }, history: [] };
  mountDetail({ ...doneJob, kind: "reconstruction", result: v2, stages, rounds: [], activity: [], outputs: [], reconstruction: null });
  expect(await screen.findByText("원본과 재현 결과 비교")).toBeTruthy();
  expect(screen.getByText("원본 결과")).toBeTruthy(); expect(screen.getByText("재현 결과")).toBeTruthy();
  expect(screen.getByText("Run ID").parentElement?.textContent).toContain("run-1");
  expect(screen.getByText(/독립 검증:/).textContent).toContain("진행 중");
});

it("v2 직접 비교가 없는 응답은 0건·미검증 빈 상태를 보여준다", async () => {
  mountDetail({ ...doneJob, kind: "reconstruction", result: { schema_version: 2, latest: { direct_comparison: { status: "unverified", count: 0, matched: 0, mismatched: 0, unverified: 0 }, comparisons: [] }, history: [] }, stages, rounds: [], activity: [], outputs: [], reconstruction: null });
  expect(await screen.findByText("비교 사례가 없습니다. 직접 비교는 0건이며 결과는 미검증입니다.")).toBeTruthy();
  expect(screen.getByText(/독립 검증:/).textContent).toContain("기록 없음");
});

it("실제 public API의 최상위 latest·history·result_state를 v2 결과로 복원하고 skipped를 표시한다", async () => {
  const apiJob = { ...doneJob, kind: "reconstruction", mode: "analyze", workspace_id: "ws-1", session_id: "session-1",
    result: null, plan: ["README 확인"], result_state: { direct_comparison: { status: "unverified", count: 0, matched: 0, mismatched: 0, unverified: 0 }, independent_verification: { status: "unverified" } },
    latest: { run_id: "run-current", source: { status: "unverified", files: [] }, direct_comparison: { status: "unverified", count: 0, matched: 0, mismatched: 0, unverified: 0 }, comparisons: [], report: { summary: "분석 결과", observations: [{ finding: "README의 실행법", evidence: "README.md", evidence_level: "document" }] } },
    history: [{ run_id: "run-old", comparisons: [{ id: "old", behavior: "기존 사례", target_type: "web", input: {}, pre_state: {}, original: null, replica: {}, environment: {}, evidence_level: "unknown", evidence: [{ kind: "visual_assessment", path: "visual.json" }], verified_at: null, run_id: "run-old", result: "unverified", difference: null }] }],
    reconstruction: { summary: "분석 결과", source_files: [], observations: [{ finding: "README의 실행법", evidence: "README.md", evidence_level: "document" }], hypotheses: [{ finding: "버튼은 SPA일 수 있음", evidence_level: "inferred" }], unknowns: ["원본 동작 미실행"], checks: [{ command: "pytest -q", exit_code: 0, log: "logs/tests.log" }], limitations: [] },
    stages: [{ key: "implement", label: "구현", status: "skipped", started_at: null, finished_at: null, evidence: [], notes: [] }] };
  mountDetail(apiJob);
  expect(await screen.findByRole("region", { name: "이전 비교 회차" })).toBeTruthy();
  expect(screen.getAllByText(/run-old/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getAllByText(/run-old/)[0].closest("summary")!);
  expect(screen.getAllByText(/시각 평가/).length).toBeGreaterThan(0);
  expect(screen.getByText(/근거 수준 미상/)).toBeTruthy();
  fireEvent.click(screen.getByText("관찰·수정·재검증 활동 단계").closest("summary")!);
  expect(screen.getByText(/건너뜀/)).toBeTruthy();
  expect(screen.getByText(/문서 근거/)).toBeTruthy();
  expect(screen.getByText(/추론 근거/)).toBeTruthy();
  expect(screen.getByText("visual.json")).toBeTruthy();
});

it("분석에서 재현 전환은 PATCH로 저장하고 제목·유형·모드도 PATCH로 저장한다", async () => {
  h.patch.mockResolvedValue({ ...doneJob, mode: "reconstruct" });
  mountDetail({ ...doneJob, kind: "reconstruction", mode: "analyze", title: "분석", result: null, latest: null, history: [], stages, rounds: [], activity: [], outputs: [], reconstruction: null });
  fireEvent.click(await screen.findByRole("button", { name: "분석에서 재현으로 전환" }));
  await waitFor(() => expect(h.patch).toHaveBeenCalledWith("job-1", { mode: "reconstruct" }));
  fireEvent.change(screen.getByLabelText("작업 제목"), { target: { value: "수정 제목" } });
  fireEvent.change(screen.getByLabelText("대상 유형"), { target: { value: "api" } });
  fireEvent.change(screen.getByLabelText("실행 방식"), { target: { value: "analyze_reconstruct" } });
  fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
  await waitFor(() => expect(h.patch).toHaveBeenLastCalledWith("job-1", { title: "수정 제목", target_type: "api", mode: "analyze_reconstruct" }));
});

it("Workspace API에서 README와 검사 로그 본문을 읽어 표시한다", async () => {
  mountDetail({ ...doneJob, kind: "reconstruction", workspace_id: "ws-1", session_id: "session-1", result: null, latest: null, history: [], stages, rounds: [], activity: [], outputs: [],
    reconstruction: { summary: "작업", source_files: ["README.md"], observations: [], checks: [{ command: "pytest -q", exit_code: 0, log: "logs/tests.log" }], limitations: [] } });
  fireEvent.click(await screen.findByRole("button", { name: "README.md 미리보기" }));
  await waitFor(() => expect(h.resolveArtifact).toHaveBeenCalledWith({ path: "README.md", workspace_id: "ws-1", session_id: "session-1" }));
  expect(await screen.findByText(/README[\s\S]*실행: pytest -q/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "로그 읽기" }));
  await waitFor(() => expect(h.resolveArtifact).toHaveBeenCalledWith({ path: "logs/tests.log", workspace_id: "ws-1", session_id: "session-1" }));
});

it.each([
  ["failed", "실패"],
  ["unverified", "미검증"],
  ["pending", "진행 중"],
])("독립 검증 서버 상태 %s는 passed verdict보다 우선한다", async (status, label) => {
  mountDetail({ ...doneJob, kind: "reconstruction", result: { schema_version: 2, latest: {
    independent_verification: { status, verdict: "passed", run_id: "verify-run-1" },
  } }, stages, rounds: [], activity: [], outputs: [], reconstruction: null });
  const verification = await screen.findAllByText(label, { selector: "b" });
  expect(verification.some((item) => item.parentElement?.textContent?.startsWith("독립 검증:"))).toBe(true);
});

it("실제 재현 출력 경로 아래의 소스와 로그 본문을 resolve한다", async () => {
  const outputPath = "/work/project/reverse-engineering/job-1";
  h.content.mockResolvedValueOnce({ text: async () => "print('source file')" } as Blob)
    .mockResolvedValueOnce({ text: async () => "pytest log body" } as Blob);
  mountDetail({ ...doneJob, kind: "reconstruction", workspace_id: "ws-1", session_id: "session-1", output_path: outputPath,
    result: null, latest: null, history: [], stages, rounds: [], activity: [], outputs: [],
    reconstruction: { summary: "작업", source_files: ["src/main.py"], observations: [],
      checks: [{ command: "pytest -q", exit_code: 0, log: "logs/tests.log" }], limitations: [] } });
  fireEvent.click(await screen.findByRole("button", { name: "src/main.py 미리보기" }));
  await waitFor(() => expect(h.resolveArtifact).toHaveBeenCalledWith({ path: `${outputPath}/src/main.py`, workspace_id: "ws-1", session_id: "session-1" }));
  expect(await screen.findByText("print('source file')")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "로그 읽기" }));
  await waitFor(() => expect(h.resolveArtifact).toHaveBeenCalledWith({ path: `${outputPath}/logs/tests.log`, workspace_id: "ws-1", session_id: "session-1" }));
  expect(await screen.findByText("pytest log body")).toBeTruthy();
});

it("검증 대화 링크는 verifier_session_id를 쓰고 Run ID는 별도로 보존한다", async () => {
  mountDetail({ ...doneJob, kind: "reconstruction", verifier_session_id: "verifier-session-1", result: { schema_version: 2, latest: {
    independent_verification: { status: "passed", verdict: "passed", run_id: "verify-run-1" },
  } }, stages, rounds: [], activity: [], outputs: [], reconstruction: null });
  const link = await screen.findByRole("link", { name: "검증 대화 보기" });
  expect(link.getAttribute("href")).toBe("/chat/verifier-session-1");
  expect(screen.getByText("verify-run-1")).toBeTruthy();
});

it("검증 세션 ID가 없으면 Run ID를 대화 링크로 쓰지 않는다", async () => {
  mountDetail({ ...doneJob, kind: "reconstruction", result: { schema_version: 2, latest: {
    independent_verification: { status: "passed", verdict: "passed", run_id: "verify-run-1" },
  } }, stages, rounds: [], activity: [], outputs: [], reconstruction: null });
  expect(await screen.findByText("verify-run-1")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "검증 대화 보기" })).toBeNull();
});

it("구현 비교가 일치해도 verifier 불일치 사례·필수 검사 실패와 근거를 표시하고 후속 수정에 포함한다", async () => {
  const verifierMismatch = { id: "verify-case", behavior: "빈 입력 반례", target_type: "cli" as const,
    input: { argv: ["tool", ""] }, pre_state: {}, original: { stdout: "help" }, replica: { stdout: "" }, environment: {},
    evidence_level: "direct" as const, evidence: [{ kind: "execution", path: "evidence/verify-case.json" }],
    verified_at: "2026-11-07T00:00:00Z", run_id: "verify-run-1", result: "mismatch" as const,
    difference: { field: "stdout", original: "help", replica: "" } };
  mountDetail({ ...doneJob, kind: "reconstruction", output_path: "/work/reverse/job-1", session_id: "impl-session",
    verifier_session_id: "verifier-session", result: { schema_version: 2, latest: {
      run_id: "impl-run", direct_comparison: { status: "match", count: 1, matched: 1, mismatched: 0, unverified: 0 },
      comparisons: [{ ...verifierMismatch, id: "impl-case", behavior: "정상 입력", result: "match", run_id: "impl-run", difference: null }],
      independent_verification: { status: "failed", verdict: "failed", run_id: "verify-run-1" },
      verification_direct_comparison: { status: "mismatch", count: 1, matched: 0, mismatched: 1, unverified: 0 },
      verification_comparisons: [verifierMismatch],
      verification_report: { verdict: "failed", problems: ["필수 검사가 실패했습니다."],
        checks: [{ command: "pnpm test", exit_code: 1, expected_exit_code: 0, required: true, log: "evidence/verifier.log" }] },
    } }, stages, rounds: [], activity: [], outputs: [], reconstruction: null });

  const verificationRegion = await screen.findByRole("region", { name: "독립 검증 비교" });
  expect(screen.getByText("빈 입력 반례")).toBeTruthy();
  expect(verificationRegion.querySelector(".rv-verification-summary")?.textContent).toContain("차이 발견");
  expect(screen.getByText(/필수 검사 실패/)).toBeTruthy();
  expect(screen.getByText(/기대 종료 코드 0/)).toBeTruthy();
  expect(screen.getByText(/필수 검사가 실패했습니다\./)).toBeTruthy();
  expect(document.querySelector(".rv-summary__meta")?.textContent).toContain("직접 비교: 확인됨");

  fireEvent.click(screen.getByRole("button", { name: "불일치 차이 수정" }));
  fireEvent.click(screen.getByRole("button", { name: "이어서 지시" }));
  await waitFor(() => expect(h.message).toHaveBeenCalledWith("job-1", expect.stringContaining("빈 입력 반례")));
});

it("verifier 비교 사례가 0건이면 구현 비교와 분리해 0건·미검증으로 표시한다", async () => {
  mountDetail({ ...doneJob, kind: "reconstruction", result: { schema_version: 2, latest: {
    direct_comparison: { status: "match", count: 1, matched: 1, mismatched: 0, unverified: 0 },
    comparisons: [{ id: "impl-case", behavior: "구현 사례", target_type: "cli", input: {}, pre_state: {}, original: {}, replica: {}, environment: {},
      evidence_level: "direct", evidence: [], verified_at: null, run_id: "impl-run", result: "match", difference: null }],
    independent_verification: { status: "failed", verdict: "failed", run_id: "verify-run-1" },
    verification_direct_comparison: { status: "unverified", count: 0, matched: 0, mismatched: 0, unverified: 0 },
    verification_comparisons: [], verification_report: { verdict: "failed", checks: [], problems: ["비교 사례가 없습니다."] },
  } }, stages, rounds: [], activity: [], outputs: [], reconstruction: null });

  const verificationRegion = await screen.findByRole("region", { name: "독립 검증 비교" });
  expect(verificationRegion.textContent).toContain("검증 비교 사례가 없습니다");
  expect(verificationRegion.querySelector(".rv-verification-summary")?.textContent).toContain("미검증");
  expect(document.querySelector(".rv-summary__meta")?.textContent).toContain("직접 비교: 확인됨");
});

it("verifier 로그는 output_path와 verifier_session_id로 읽고 구현 소스 경로는 기존 session을 쓴다", async () => {
  const outputPath = "/work/project/reverse-engineering/job-1";
  h.content.mockResolvedValueOnce({ text: async () => "implementation source" } as Blob)
    .mockResolvedValueOnce({ text: async () => "verifier failure log" } as Blob);
  mountDetail({ ...doneJob, kind: "reconstruction", output_path: outputPath, workspace_id: "ws-1",
    session_id: "impl-session", verifier_session_id: "verifier-session",
    result: { schema_version: 2, latest: { independent_verification: { status: "failed", run_id: "verify-run-1" },
      verification_direct_comparison: { status: "unverified", count: 0, matched: 0, mismatched: 0, unverified: 0 },
      verification_comparisons: [], verification_report: { checks: [{ command: "pnpm test", exit_code: 1, expected_exit_code: 0, required: true, log: "evidence/verifier.log" }] } } },
    stages, rounds: [], activity: [], outputs: [], reconstruction: { summary: "구현", source_files: ["src/main.ts"], observations: [], checks: [], limitations: [] } });

  fireEvent.click(await screen.findByRole("button", { name: "src/main.ts 미리보기" }));
  await waitFor(() => expect(h.resolveArtifact).toHaveBeenCalledWith({ path: `${outputPath}/src/main.ts`, workspace_id: "ws-1", session_id: "impl-session" }));
  fireEvent.click(screen.getByRole("button", { name: "검증 로그 읽기" }));
  await waitFor(() => expect(h.resolveArtifact).toHaveBeenCalledWith({ path: `${outputPath}/evidence/verifier.log`, workspace_id: "ws-1", session_id: "verifier-session" }));
  expect(await screen.findByText("verifier failure log")).toBeTruthy();
});

it("result_state의 기능·시각 요약을 구현과 verifier별로 합산하지 않고 표시한다", async () => {
  mountDetail({ ...doneJob, kind: "reconstruction", result: null, latest: null,
    result_state: {
      direct_comparison: { status: "match", count: 2, matched: 2, mismatched: 0, unverified: 0 },
      visual_comparison: { status: "mismatch", count: 2, matched: 1, mismatched: 1, unverified: 0 },
      verification_direct_comparison: { status: "mismatch", count: 1, matched: 0, mismatched: 1, unverified: 0 },
      verification_visual_comparison: { status: "unverified", count: 1, matched: 0, mismatched: 0, unverified: 1 },
    }, stages, rounds: [], activity: [], outputs: [], reconstruction: null });

  const implementation = await screen.findByRole("region", { name: "직접 비교" });
  expect(implementation.textContent).toContain("기능 비교 2건");
  expect(implementation.textContent).toContain("시각 비교 2건");
  expect(implementation.textContent).toContain("불일치 1");
  const verifier = screen.getByRole("region", { name: "독립 검증 비교" });
  expect(verifier.textContent).toContain("검증 기능 비교 1건");
  expect(verifier.textContent).toContain("검증 시각 비교 1건");
  expect(verifier.textContent).toContain("미검증 1");
  expect(implementation.textContent).not.toContain("기능 비교 3건");
});

it("웹 캡처는 기능·시각·무결성·관찰 출처를 분리하고 역할별 PNG를 요청 시 읽는다", async () => {
  const outputPath = "/work/project/reverse-engineering/job-1";
  const png = expectedCapture;
  const captureSha = await sha256(png);
  const captureRef = (path: string) => ({ path, sha256: captureSha, size_bytes: png.length,
    viewport: { width: 390, height: 844, device_scale_factor: 1 }, format: "png" as const });
  const evidence = { kind: "web_capture", path: "captures/web.json",
    capture: { path: "captures/web.json", sha256: "b".repeat(64), size_bytes: 512 },
    integrity: { status: "verified", reasons: [] },
    provenance: { status: "unverified", reason: "RunEvent/tool-result 연결이 없어 실제 브라우저 실행 출처를 확인하지 못했습니다." } };
  const implementation = { id: "impl-web", behavior: "저장 후 요약 보기", target_type: "web" as const,
    input: {}, pre_state: {}, original: { screenshot: captureRef("captures/impl-original.png") },
    replica: { screenshot: captureRef("captures/impl-replica.png") }, environment: {},
    evidence_level: "observed" as const, evidence: [evidence], verified_at: "2026-11-07T00:00:00Z",
    run_id: "impl-run", result: "match" as const, functional_result: "match" as const,
    visual_result: "mismatch" as const, visual_assessment: { reason: "pixel mismatch", different_pixels: 17 },
    difference: null };
  const verifier = { ...implementation, id: "verify-web", behavior: "모바일 메뉴 열기", run_id: "verify-run",
    original: { screenshot: captureRef("captures/verify-original.png") },
    replica: { screenshot: captureRef("captures/verify-replica.png") },
    result: "mismatch" as const, functional_result: "mismatch" as const,
    visual_result: "unverified" as const, difference: { field: "dom", reason: "verifier result differs" } };
  h.content.mockResolvedValue(new Blob([png], { type: "image/png" }));
  const createObjectURL = vi.fn(() => "blob:reverse-capture");
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  mountDetail({ ...doneJob, kind: "reconstruction", workspace_id: "ws-1", output_path: outputPath,
    session_id: "impl-session", verifier_session_id: "verifier-session",
    result: { schema_version: 2, latest: {
      direct_comparison: { status: "match", count: 1, matched: 1, mismatched: 0, unverified: 0 },
      visual_comparison: { status: "mismatch", count: 1, matched: 0, mismatched: 1, unverified: 0 },
      comparisons: [implementation],
      verification_direct_comparison: { status: "mismatch", count: 1, matched: 0, mismatched: 1, unverified: 0 },
      verification_visual_comparison: { status: "unverified", count: 1, matched: 0, mismatched: 0, unverified: 1 },
      verification_comparisons: [verifier],
    } }, stages, rounds: [], activity: [], outputs: [], reconstruction: null });

  const webRegions = await screen.findAllByRole("group", { name: "웹 증거 상태" });
  expect(webRegions[0].textContent).toContain("파일 무결성: 확인됨");
  expect(webRegions.every((region) => region.textContent?.includes("실제 관찰 출처: 미검증"))).toBe(true);
  expect(webRegions[0].textContent).toContain("RunEvent/tool-result 연결이 없어");
  expect(screen.getByText(/시각 평가: 차이 발견/)).toBeTruthy();
  expect(screen.getByText(/기능: 일치/)).toBeTruthy();
  expect(screen.getByText(/기능: 불일치/)).toBeTruthy();
  expect(createObjectURL).not.toHaveBeenCalled();

  fireEvent.click(within(webRegions[0]).getByRole("button", { name: "원본 캡처 미리보기" }));
  await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
  fireEvent.click(within(webRegions[0]).getByRole("button", { name: "재현 캡처 미리보기" }));
  await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(2));
  fireEvent.click(within(webRegions[1]).getByRole("button", { name: "원본 캡처 미리보기" }));
  await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(3));
  fireEvent.click(within(webRegions[1]).getByRole("button", { name: "재현 캡처 미리보기" }));
  await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(4));
  expect(h.resolveArtifact).toHaveBeenCalledWith({ path: `${outputPath}/captures/impl-original.png`, workspace_id: "ws-1", session_id: "impl-session" });
  expect(h.resolveArtifact).toHaveBeenCalledWith({ path: `${outputPath}/captures/impl-replica.png`, workspace_id: "ws-1", session_id: "impl-session" });
  expect(h.resolveArtifact).toHaveBeenCalledWith({ path: `${outputPath}/captures/verify-original.png`, workspace_id: "ws-1", session_id: "verifier-session" });
  expect(h.resolveArtifact).toHaveBeenCalledWith({ path: `${outputPath}/captures/verify-replica.png`, workspace_id: "ws-1", session_id: "verifier-session" });

  fireEvent.click(screen.getByRole("button", { name: "불일치 차이 수정" }));
  expect((screen.getByLabelText("추가 설명·검사·수정 요청") as HTMLTextAreaElement).value)
    .toContain("구현 비교 · 시각 확인 필요 · 저장 후 요약 보기");
  expect((screen.getByLabelText("추가 설명·검사·수정 요청") as HTMLTextAreaElement).value)
    .toContain("실제 관찰 출처: 미검증");
  expect((screen.getByLabelText("추가 설명·검사·수정 요청") as HTMLTextAreaElement).value)
    .toContain("원본 PNG: captures/impl-original.png · 재현 PNG: captures/impl-replica.png");
});

it("4096바이트의 다른 유효 PNG는 실제 SHA-256이 달라 미리보기에서 거부한다", async () => {
  expect(expectedCapture).toHaveLength(4096);
  expect(sameSizeOtherShaCapture).toHaveLength(4096);
  const expectedSha = await sha256(expectedCapture);
  const otherSha = await sha256(sameSizeOtherShaCapture);
  expect(expectedSha).toBe("a3d513e88935c15e2df081463311d1716cd97b35cf7327c24a03141798f1d955");
  expect(otherSha).toBe("15b951ed6868d526a751d5af59a616ce8a68759cfab86a4c328493130ee97c49");
  h.content.mockResolvedValue(new Blob([sameSizeOtherShaCapture], { type: "image/png" }));
  const createObjectURL = vi.fn(() => "blob:tampered");
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  renderReconstruction(captureJob({ sha: expectedSha }));

  fireEvent.click(await screen.findByRole("button", { name: "원본 캡처 미리보기" }));
  expect((await screen.findByRole("alert")).textContent).toContain("SHA-256");
  expect(screen.queryByRole("img", { name: "회차 1 캡처 · 원본 캡처" })).toBeNull();
  expect(createObjectURL).not.toHaveBeenCalled();
});

it("새 회차는 같은 경로의 이전 URL·loading을 지우고 늦은 이전 응답은 새 이미지를 덮지 않는다", async () => {
  const round1Sha = await sha256(expectedCapture);
  const round2Sha = await sha256(sameSizeOtherShaCapture);
  let resolveLate!: (blob: Blob) => void;
  h.content.mockResolvedValueOnce(new Blob([expectedCapture], { type: "image/png" }));
  h.content.mockResolvedValueOnce(new Blob([sameSizeOtherShaCapture], { type: "image/png" }));
  h.content.mockReturnValueOnce(new Promise<Blob>((resolve) => { resolveLate = resolve; }));
  h.content.mockResolvedValueOnce(new Blob([sameSizeOtherShaCapture], { type: "image/png" }));
  let urlNo = 0;
  const createObjectURL = vi.fn(() => `blob:round-${++urlNo}`);
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
  const first = captureJob({ round: 1, sha: round1Sha });
  const view = renderReconstruction(first);
  const oldOriginalButton = await screen.findByRole("button", { name: "원본 캡처 미리보기" });
  fireEvent.click(oldOriginalButton);
  expect(await screen.findByRole("img", { name: "회차 1 캡처 · 원본 캡처" })).toBeTruthy();

  view.rerender(<QueryClientProvider client={new QueryClient()}><MemoryRouter>
    <Reconstruction job={captureJob({ round: 1, sha: round2Sha }) as never} />
  </MemoryRouter></QueryClientProvider>);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:round-1");
  expect(screen.queryByRole("img", { name: "회차 1 캡처 · 원본 캡처" })).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: "원본 캡처 미리보기" }));
  expect(await screen.findByRole("img", { name: "회차 1 캡처 · 원본 캡처" })).toBeTruthy();

  const oldReplicaButton = screen.getByRole("button", { name: "재현 캡처 미리보기" });
  h.resolveArtifact.mockRejectedValueOnce(new Error("회차 1 전송 실패"));
  fireEvent.click(oldReplicaButton);
  expect((await screen.findByRole("alert")).textContent).toContain("회차 1 전송 실패");
  expect((oldReplicaButton as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(oldReplicaButton);
  await waitFor(() => expect(h.content).toHaveBeenCalledTimes(3));

  view.rerender(<QueryClientProvider client={new QueryClient()}><MemoryRouter>
    <Reconstruction job={captureJob({ round: 2, sha: round2Sha, sessionId: "impl-session-r1" }) as never} />
  </MemoryRouter></QueryClientProvider>);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:round-2");
  expect(screen.queryByRole("img", { name: "회차 1 캡처 · 원본 캡처" })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  const newOriginalButton = await screen.findByRole("button", { name: "원본 캡처 미리보기" }) as HTMLButtonElement;
  expect(newOriginalButton.disabled).toBe(false);
  fireEvent.click(newOriginalButton);
  expect(await screen.findByRole("img", { name: "회차 2 캡처 · 원본 캡처" })).toBeTruthy();
  expect(h.resolveArtifact).toHaveBeenLastCalledWith({ path: "/work/project/reverse-engineering/job-1/captures/original.png",
    workspace_id: "ws-1", session_id: "impl-session-r1" });

  resolveLate(new Blob([sameSizeOtherShaCapture], { type: "image/png" }));
  await waitFor(() => expect(h.content).toHaveBeenCalledTimes(4));
  expect(createObjectURL).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole("img", { name: "회차 1 캡처 · 재현 캡처" })).toBeNull();
  expect((screen.getByRole("img", { name: "회차 2 캡처 · 원본 캡처" }) as HTMLImageElement).src).toContain("blob:round-3");
});

it("무결성이 확인되지 않거나 캡처 참조가 빠진 웹 증거는 미검증으로 남기고 이미지 경로를 열지 않는다", async () => {
  const unsafe = { id: "unsafe", behavior: "경로 반례", target_type: "web" as const, input: {}, pre_state: {},
    original: { screenshot: { path: "../outside.png", sha256: "a".repeat(64), size_bytes: 20, format: "png" } },
    replica: {}, environment: {}, evidence_level: "unknown" as const,
    evidence: [{ kind: "web_capture", integrity: { status: "unverified", reasons: ["sha256 불일치"] },
      provenance: { status: "unverified", reason: "실행 연결 없음" } }], verified_at: null, run_id: "run-1",
    result: "match" as const, functional_result: "match" as const, visual_result: "unverified" as const, difference: null };
  const noEvidence = { ...unsafe, id: "no-evidence", behavior: "캡처 누락 반례", original: null, replica: {},
    evidence: [], result: "unverified" as const, functional_result: "unverified" as const };
  mountDetail({ ...doneJob, kind: "reconstruction", result: { schema_version: 2, latest: {
    comparisons: [unsafe, noEvidence], visual_comparison: { status: "unverified", count: 2, matched: 0, mismatched: 0, unverified: 2 },
  } }, stages, rounds: [], activity: [], outputs: [], reconstruction: null });

  const allWebRegions = await screen.findAllByRole("group", { name: "웹 증거 상태" });
  const webRegion = allWebRegions[0];
  expect(webRegion.textContent).toContain("파일 무결성: 미검증");
  expect(webRegion.textContent).toContain("sha256 불일치");
  expect(webRegion.textContent).toContain("원본 캡처 경로: 미검증 또는 누락");
  expect(allWebRegions[1].textContent).toContain("웹 캡처 증거가 없습니다");
  expect(screen.queryByRole("button", { name: "원본 캡처 미리보기" })).toBeNull();
  expect(h.resolveArtifact).not.toHaveBeenCalled();
});

it("캡처 artifact 읽기 실패를 알리고 같은 경로를 다시 요청할 수 있다", async () => {
  const screenshot = { path: "captures/original.png", sha256: await sha256(expectedCapture), size_bytes: expectedCapture.length, format: "png" as const };
  const item = { id: "web-retry", behavior: "읽기 실패", target_type: "web" as const, input: {}, pre_state: {},
    original: { screenshot }, replica: {}, environment: {}, evidence_level: "observed" as const,
    evidence: [{ kind: "web_capture", capture: { path: "captures/web.json" },
      integrity: { status: "verified" }, provenance: { status: "unverified", reason: "실행 연결 없음" } }],
    verified_at: null, run_id: "run-1", result: "match" as const, functional_result: "match" as const,
    visual_result: "match" as const, difference: null };
  h.resolveArtifact.mockRejectedValueOnce(new Error("artifact not found"));
  const createObjectURL = vi.fn(() => "blob:retry-capture");
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  const png = new Blob([expectedCapture], { type: "image/png" });
  h.content.mockResolvedValue(png);
  mountDetail({ ...doneJob, kind: "reconstruction", workspace_id: "ws-1", output_path: "/work/job", session_id: "impl-session",
    result: { schema_version: 2, latest: { comparisons: [item] } }, stages, rounds: [], activity: [], outputs: [], reconstruction: null });

  const captureButton = await screen.findByRole("button", { name: "원본 캡처 미리보기" }) as HTMLButtonElement;
  fireEvent.click(captureButton);
  expect((await screen.findByRole("alert")).textContent).toContain("캡처 미리보기 실패: artifact not found");
  expect(captureButton.disabled).toBe(false);
  fireEvent.click(captureButton);
  await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole("img", { name: "읽기 실패 · 원본 캡처" })).toBeTruthy();
});
