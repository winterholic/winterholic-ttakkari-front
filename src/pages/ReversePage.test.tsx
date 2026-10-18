import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const h = vi.hoisted(() => ({ list: vi.fn(), start: vi.fn(), get: vi.fn(), remove: vi.fn(), retry: vi.fn(), workspaces: vi.fn(), message: vi.fn() }));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  listReverseJobs: (...a: unknown[]) => h.list(...a),
  listWorkspaces: (...a: unknown[]) => h.workspaces(...a),
  messageReverseJob: (...a: unknown[]) => h.message(...a),
  startReverseJob: (...a: unknown[]) => h.start(...a),
  getReverseJob: (...a: unknown[]) => h.get(...a),
  deleteReverseJob: (...a: unknown[]) => h.remove(...a),
  retryReverseJob: (...a: unknown[]) => h.retry(...a),
}));
import { ReversePage } from "./ReversePage";
import { ReverseDetailPage } from "./ReverseDetailPage";
import { FEATURES } from "../shell/features";

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
      <Routes><Route path="/reverse" element={<ReversePage />} /></Routes>
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
  h.get.mockResolvedValue(detail);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("부가 기능에 등록되고 빈 목록·분석 시작을 안내한다", async () => {
  expect(FEATURES.find((x) => x.root === "reverse")?.to).toBe("/reverse");
  mountList();
  expect(await screen.findByText("아직 시작한 작업이 없어요")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("분석할 대상과 재현 목표"), { target: { value: "이 계산기의 버튼과 계산 동작을 분석해 소스로 재현해줘." } });
  fireEvent.click(screen.getByRole("button", { name: "분석·구현 시작" }));
  await waitFor(() => expect(h.start).toHaveBeenCalledWith({ description: "이 계산기의 버튼과 계산 동작을 분석해 소스로 재현해줘.", workspace_id: undefined }));
});

it("목록에서 상태·요약·실패 이유를 보고 지운다", async () => {
  h.list.mockResolvedValue({ items: [doneJob, { ...doneJob, id: "job-2", status: "failed", error: "복제 실패", overview: undefined }] });
  mountList();
  expect(await screen.findByText("REA 개요")).toBeTruthy();
  expect(screen.getByText("복제 실패")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: /지우기/ })[0]);
  await waitFor(() => expect(h.remove).toHaveBeenCalledWith("job-1"));
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
  const input = screen.getByLabelText("분석할 대상과 재현 목표");
  expect(input.tagName).toBe("TEXTAREA");
  await screen.findByRole("option", { name: "우리 프로젝트" });
  fireEvent.change(screen.getByLabelText("소스를 저장할 작업공간"), { target: { value: "ws-1" } });
  const description = "웹앱의 검색 동작을 재현해줘.\n입력하면 결과가 바로 필터링돼야 해.";
  fireEvent.change(input, { target: { value: description } });
  fireEvent.click(screen.getByRole("button", { name: "분석·구현 시작" }));
  await waitFor(() => expect(h.start).toHaveBeenCalledWith({ description, workspace_id: "ws-1" }));
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
  expect(screen.getByText("독립 검증 통과")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("추가 설명이나 수정 요청"), { target: { value: "소수 계산도 재현해줘." } });
  fireEvent.click(screen.getByRole("button", { name: "이어서 지시" }));
  await waitFor(() => expect(h.message).toHaveBeenCalledWith("job-1", "소수 계산도 재현해줘."));
});

it("재현 작업의 부분 완료에는 막힌 검사의 이유를 표시한다", async () => {
  mountDetail({ ...doneJob, kind: "reconstruction", status: "partial", error: "필수 회귀 검사가 실패했습니다.",
    result: null, stages, rounds: [], activity: [], outputs: [], reconstruction: null });
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "필수 회귀 검사가 실패했습니다.");
});
