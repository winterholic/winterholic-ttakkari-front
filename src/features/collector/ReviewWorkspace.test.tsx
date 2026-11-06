import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CollectSummary, ReviewItem } from "../../api/collector";

const api = vi.hoisted(() => ({
  collectReviewQueue: vi.fn(), collectHoldAudit: vi.fn(), collectItemDetail: vi.fn(), reprocessCollectItem: vi.fn(),
  collectSummary: vi.fn(), collectRuntime: vi.fn(), setCollectRuntime: vi.fn(), registerCollectPilot: vi.fn(),
  reviewCollectItem: vi.fn(), importCollectItem: vi.fn(), collectQuality: vi.fn(), trainCollectQuality: vi.fn(),
}));

vi.mock("../../api/collector", () => api);
vi.mock("../kb/Quality", async importOriginal => ({ ...(await importOriginal<typeof import("../kb/Quality")>()), QualityPanel: () => <div /> }));

import { Review } from "./Review";
import { Overview } from "./Overview";
import { ResearchPanel } from "./ResearchPanel";
import type { CollectionMission } from "../../api/collectionMissions";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const row = (patch: Partial<ReviewItem> = {}): ReviewItem => ({
  id: "i1", url: "https://example.com/a", source_key: "example.com", status: "held", reason_codes: ["l0_too_short"],
  language: "ko", text_chars: 420, preview: "검토할 본문 미리보기", signals: {}, can_reprocess: true, ...patch,
});
const summary: CollectSummary = {
  funnel: { discovered: 200, fetched: 150, extracted: 110, accepted: 48, held: 30, blocked: 12, failed: 4, not_modified: 5, delivered: 39, awaiting_delivery: 9, awaiting_review: 52 },
  jobs: {}, outbox: {}, waiting: [], runtime: { loop_available: true, paused: false, reason: null, since: null },
  budget: { day: "2026-11-07", timezone: "Asia/Seoul", teacher_enabled: false, unsettled: 0,
    tokens: { limit: 100, used: 0, remaining: 100 }, calls: { limit: 10, used: 0, remaining: 10 },
    micro_usd: { limit: 100000, used: 0, remaining: 100000 }, per_job: { tokens: 100, calls: 10, micro_usd: 100000 } },
};
function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

it("검토 화면은 전체 총량과 현재 로드 범위를 구분하고 필터가 로드 항목에만 적용됨을 알린다", async () => {
  api.collectReviewQueue.mockResolvedValue({ items: [row(), row({ id: "i2", url: "https://other.test/b", source_key: "other.test", reason_codes: ["exact_duplicate"], can_reprocess: false })], total: 120, limit: 2, offset: 0 });
  mount(<Review />);
  expect(await screen.findByRole("heading", { name: "서버 검토 대기 120건" })).toBeTruthy();
  expect(screen.getByText(/현재 2건을 불러왔습니다.*전체/)).toBeTruthy();
  expect(screen.getByText(/자동 평가와 불확실성은 목록 API에 값이 없어 미확인입니다/)).toBeTruthy();
  expect(screen.getByText(/정밀 판정 엔진·모델·상태: API 미제공 · 미확인/)).toBeTruthy();
  expect(screen.getByText(/정밀 평가 대기 건수: API 미제공 · 미확인/)).toBeTruthy();
  expect(screen.getByText(/중복 관계 대상: 미제공/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("자료 검색"), { target: { value: "other.test" } });
  expect(screen.queryByText("https://example.com/a")).toBeNull();
  expect(screen.getByText("https://other.test/b")).toBeTruthy();
  expect(screen.getByText(/불러온 2건 중 1건 표시/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("보류 사유"), { target: { value: "exact_duplicate" } });
  expect(screen.getByText("https://other.test/b")).toBeTruthy();
  expect(screen.queryByText("https://example.com/a")).toBeNull();
  fireEvent.change(screen.getByLabelText("출처"), { target: { value: "example.com" } });
  expect(screen.getByText(/조건에 맞는 자료가 없습니다/)).toBeTruthy();
});

it("정책 차단 자료의 재처리를 숨기고 보류 감사 표본의 출처·사유 모수를 보인다", async () => {
  api.collectReviewQueue.mockResolvedValue({ items: [row({ reason_codes: ["store_not_permitted"], can_reprocess: true })], total: 1, limit: 20, offset: 0 });
  api.collectHoldAudit.mockResolvedValue({ day: "2026-11-07", per_group: 2,
    groups: [{ source_key: "example.com", reason: "store_not_permitted", held: 14, sampled: 2 }], items: [] });
  mount(<Review />);
  await screen.findByText("https://example.com/a");
  expect(screen.queryByRole("button", { name: "원문으로 다시 처리" })).toBeNull();
  expect(screen.getByText(/재처리를 표시하지 않습니다/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "보류 표본 감사" }));
  const technical = await screen.findByText("기술 상세: 원 사유 코드");
  expect(technical.closest("li")?.textContent).toContain("보류 총량 14건 중 2건 표본");
  expect(technical.closest("li")?.textContent).toContain("원문 보관 권리가 허용되지 않음");
});

it("ItemReview는 이유를 요구하고 사용자 판단과 적재 요청의 실제 API 조작을 유지한다", async () => {
  api.collectReviewQueue.mockResolvedValue({ items: [row()], total: 1, limit: 20, offset: 0 });
  api.reviewCollectItem.mockResolvedValue({});
  api.importCollectItem.mockResolvedValue({});
  mount(<Review />);
  await screen.findByText("https://example.com/a");
  const accept = screen.getByRole("button", { name: "유용함" });
  expect((accept as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("자료의 유용성 검토"), { target: { value: "본문을 확인했고 주제와 직접 관련됩니다." } });
  fireEvent.click(accept);
  await screen.findByText(/유용성 검토를 기록했어요/);
  expect(api.reviewCollectItem).toHaveBeenCalledWith("i1", undefined, "accept", "본문을 확인했고 주제와 직접 관련됩니다.");
  fireEvent.click(screen.getByRole("button", { name: "검토한 자료 도서관에 적재" }));
  await screen.findByText(/적재 요청을 등록했어요/);
  expect(api.importCollectItem).toHaveBeenCalledWith("i1", undefined);
});

it("재처리 요청 중·성공 상태를 행에 알린다", async () => {
  api.collectReviewQueue.mockResolvedValue({ items: [row()], total: 1, limit: 20, offset: 0 });
  let resolveRequest!: (value: { job_id: string; status: string }) => void;
  api.reprocessCollectItem.mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));
  mount(<Review />);
  await screen.findByText("https://example.com/a");
  fireEvent.click(screen.getByRole("button", { name: "원문으로 다시 처리" }));
  expect((await screen.findByRole("status")).textContent).toContain("재처리 요청을 보내고 있어요");
  expect((screen.getByRole("button", { name: "원문으로 다시 처리" }) as HTMLButtonElement).disabled).toBe(true);
  resolveRequest({ job_id: "j1", status: "queued" });
  expect(await screen.findByText(/재처리 작업을 등록했어요/)).toBeTruthy();
});

it("재처리 API 실패를 성공으로 보이지 않고 오류로 알린다", async () => {
  api.collectReviewQueue.mockResolvedValue({ items: [row()], total: 1, limit: 20, offset: 0 });
  api.reprocessCollectItem.mockRejectedValue(new Error("source_policy_missing"));
  mount(<Review />);
  await screen.findByText("https://example.com/a");
  fireEvent.click(screen.getByRole("button", { name: "원문으로 다시 처리" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("재처리 작업을 등록하지 못했어요");
  expect(screen.getByRole("alert").textContent).not.toContain("source_policy_missing");
});

it("운영 화면은 사용자 조치 총량과 자동 평가 대기·정책 차단의 미분리 상태를 명시한다", async () => {
  api.collectSummary.mockResolvedValue(summary);
  api.collectRuntime.mockResolvedValue({ loop_available: true, general_consume_enabled: true, paused: false, reason: null, since: null, pilot: null, pilot_enabled: false, ml_spending_enabled: false });
  mount(<Overview />);
  await screen.findByText("서버 검토 대기 총량");
  expect(screen.getByText("서버 검토 대기 총량").parentElement?.textContent).toContain("52건");
  expect(screen.getByText(/사용자 조치가 필요한 자료의 전체 수는 API에서 분리 제공하지 않습니다/)).toBeTruthy();
  expect(screen.getByText(/자동 평가 대기와 정책 차단은 별도 총량이 제공되지 않습니다/)).toBeTruthy();
  expect(screen.getByText(/정밀 판정 엔진·모델·실행 상태: API 미제공 · 미확인/)).toBeTruthy();
  expect(screen.getByText(/정밀 평가 대기 건수: API 미제공 · 미확인/)).toBeTruthy();
  expect(screen.queryByText(/규칙 검사만 하므로 수집량이 늘어도 모델 비용은 0/)).toBeNull();
  expect(screen.queryByText(/모델 호출은 꺼져 있어요/)).toBeNull();
  expect(document.body.textContent).not.toMatch(/Qwen|로컬 실행|teacher_enabled/);
  expect(screen.queryByLabelText("단계별 건수")).toBeNull();
});

it("조사 확보 수치는 출처 수 기준이며 사실 정확성 판정이 아님을 기본 표시한다", async () => {
  const mission = { id: "m1", title: "t", goal: "g", status: "partial", counts: {}, jobs: [], gaps: [], results: [], run_seq: 1,
    knowledge_processing: { storage: "pending", semantic: "unverified" }, created_at: "", updated_at: "",
    plan: { title: "t", mode: "research", steps: [], sources: [], queries: [], coverage: [], budget: { pages: 10, depth: 1, searches: 16, seconds: 1800, rounds: 3, papers: 20 }, stop_conditions: [] },
    research: { round: 1, stop: null, searches_used: 2, coverage: [{ topic: "주제", key: "a", state: "covered", sources: 2, documents: 2, hosts: 2 }] },
  } as unknown as CollectionMission;
  mount(<ResearchPanel mission={mission} />);
  await waitFor(() => expect(screen.getByRole("note").textContent).toMatch(/사실 정확성이나 품질 승인을 보장하지 않습니다/));
});
