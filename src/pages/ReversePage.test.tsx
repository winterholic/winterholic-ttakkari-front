import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const h = vi.hoisted(() => ({ list: vi.fn(), start: vi.fn(), get: vi.fn(), remove: vi.fn(), retry: vi.fn() }));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  listReverseJobs: (...a: unknown[]) => h.list(...a),
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
  h.start.mockResolvedValue(doneJob);
  h.remove.mockResolvedValue({ id: "job-1", deleted: true });
  h.get.mockResolvedValue(detail);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("부가 기능에 등록되고 빈 목록·분석 시작을 안내한다", async () => {
  expect(FEATURES.find((x) => x.root === "reverse")?.to).toBe("/reverse");
  mountList();
  expect(await screen.findByText("아직 분석한 저장소가 없어요")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("분석 대상"), { target: { value: "morluto/rea" } });
  fireEvent.click(screen.getByRole("button", { name: "분석 시작" }));
  await waitFor(() => expect(h.start).toHaveBeenCalledWith("morluto/rea"));
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
