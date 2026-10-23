import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  summary: vi.fn(), runtime: vi.fn(), setRuntime: vi.fn(), pilot: vi.fn(), review: vi.fn(), detail: vi.fn(),
  deliveries: vi.fn(), reconcile: vi.fn(), audit: vi.fn(),
}));
vi.mock("../../api/collector", () => ({
  collectSummary: mocks.summary, collectRuntime: mocks.runtime, setCollectRuntime: mocks.setRuntime,
  registerCollectPilot: mocks.pilot, collectReviewQueue: mocks.review, collectItemDetail: mocks.detail,
  collectDeliveries: mocks.deliveries, collectHoldAudit: mocks.audit, reconcileCollectDelivery: mocks.reconcile,
  reviewCollectItem: vi.fn(), importCollectItem: vi.fn(), collectQuality: vi.fn(), trainCollectQuality: vi.fn(),
  collectSources: vi.fn(), collectJobs: vi.fn(), runCollectSource: vi.fn(), updateCollectSource: vi.fn(),
  createCollectSource: vi.fn(), editCollectSource: vi.fn(), collectItems: vi.fn(), retryCollectJob: vi.fn(),
  cancelCollectJob: vi.fn(), collectBudgets: vi.fn(),
}));
import { Overview } from "./Overview";
import { Review } from "./Review";
import { Deliveries } from "./Deliveries";

afterEach(() => { cleanup(); vi.resetAllMocks(); });
const wrap = (node: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);

const budget = { day: "2026-10-23", timezone: "Asia/Seoul", teacher_enabled: false, unsettled: 0,
  tokens: { limit: 60000, used: 0, remaining: 60000 }, calls: { limit: 20, used: 0, remaining: 20 },
  micro_usd: { limit: 1000000, used: 0, remaining: 1000000 }, per_job: { tokens: 12000, calls: 4, micro_usd: 200000 },
  pages: { limit: 500, reserved: 12 } };
const funnel = { discovered: 2, fetched: 26, extracted: 24, accepted: 23, held: 1, blocked: 0, failed: 0, not_modified: 8,
  delivered: 15, awaiting_delivery: 0, awaiting_review: 9 };
const base = { funnel, jobs: { succeeded: 3 }, outbox: {}, waiting: [], runtime: { loop_available: true, paused: false, reason: null, since: null },
  budget, daily_page_cap: 500 };

it("현황은 단계별 건수와 모델 비용 0을 보여 주고 일시정지 요청을 보낸다", async () => {
  mocks.summary.mockResolvedValue(base);
  mocks.runtime.mockResolvedValue({ pilot: null });
  mocks.setRuntime.mockResolvedValue({ paused: true });
  wrap(<Overview scope="personal" />);
  expect(await screen.findByText("내 검토 대기")).toBeTruthy();
  expect(screen.getByText("26")).toBeTruthy();
  expect(screen.getByText(/모델 호출은 꺼져 있어요/)).toBeTruthy();
  expect(screen.getByText("0 / 20회 (0%)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "자동 수집 일시정지" }));
  await waitFor(() => expect(mocks.setRuntime).toHaveBeenCalledWith("personal", true, "owner pause"));
});

it("일시정지·예산 대기·빈 상태를 숨기지 않는다", async () => {
  mocks.summary.mockResolvedValue({ ...base, funnel: Object.fromEntries(Object.keys(funnel).map((k) => [k, 0])),
    runtime: { loop_available: true, paused: true, reason: "owner", since: "2026-10-23T08:00:00Z" },
    waiting: [{ job_id: "j1", status: "budget_wait", source_key: "pilot:x", not_before: "2026-10-24T00:00:00Z", reason: "fetch_deferred" }] });
  mocks.runtime.mockResolvedValue({ pilot: null });
  wrap(<Overview scope="personal" />);
  expect(await screen.findByText(/새 수집을 시작하지 않아요/)).toBeTruthy();
  expect(screen.getByText("예산 대기")).toBeTruthy();
  expect(screen.getByText(/아직 수집한 자료가 없어요/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "자동 수집 재개" })).toBeTruthy();
});

it("서버에서 수집 루프가 꺼져 있으면 스위치를 숨기고 이유를 알린다", async () => {
  mocks.summary.mockResolvedValue({ ...base, runtime: { loop_available: false, paused: false, reason: null, since: null } });
  mocks.runtime.mockResolvedValue({ pilot: null });
  wrap(<Overview scope="work" />);
  expect(await screen.findByText(/수집 반복 작업이 꺼져 있어요/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /자동 수집/ })).toBeNull();
});

it("현황 읽기 실패는 다시 시도할 수 있다", async () => {
  mocks.summary.mockRejectedValue(new Error("offline"));
  mocks.runtime.mockResolvedValue({ pilot: null });
  wrap(<Overview scope="personal" />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
});

it("예시 출처 추가 결과를 알린다", async () => {
  mocks.summary.mockResolvedValue(base);
  mocks.runtime.mockResolvedValue({ pilot: { seeded: [], rights_checked_at: "2026-10-23T07:30:00Z" } });
  mocks.pilot.mockResolvedValue({ created: [], available: ["a", "b", "c"] });
  wrap(<Overview scope="personal" />);
  fireEvent.click(await screen.findByRole("button", { name: "예시 출처 추가" }));
  expect(await screen.findByText("이미 모두 등록돼 있어요.")).toBeTruthy();
});

it("검토 대기 목록이 비면 안내하고, 있으면 근거와 처리 이력을 연다", async () => {
  mocks.review.mockResolvedValueOnce({ items: [], total: 0, limit: 20, offset: 0 });
  const first = wrap(<Review scope="personal" />);
  expect(await screen.findByText("검토할 자료가 없어요.")).toBeTruthy();
  first.unmount();
  mocks.review.mockResolvedValue({ total: 1, limit: 20, offset: 0, items: [{ id: "i1", url: "https://docs.test/short", source_key: "s", status: "held",
    reason_codes: ["l0_too_short"], language: "ko", text_chars: 120, preview: "짧은 본문", signals: {} }] });
  mocks.detail.mockResolvedValue({ id: "i1", url: "https://docs.test/short", final_url: null, status: "held", stage: "decide", http_status: 200,
    language: "ko", text_chars: 120, reason_codes: [], preview: "", decision: { state: "hold", reason_codes: ["l0_too_short"] }, quality: null,
    versions: { parser: "p1", normalizer: "n1" }, hashes: { raw_sha256: "a".repeat(64), text_sha256: "b".repeat(64), payload: null },
    rights: { license_id: "CC-BY-4.0", purposes: ["store"] }, reviews: [], deliveries: [] });
  wrap(<Review scope="personal" />);
  expect(await screen.findByText("검토 대기 1건")).toBeTruthy();
  expect(screen.getByText("본문이 짧아 검토 대기")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "근거와 처리 이력" }));
  expect(await screen.findByText(/측정하지 않음/)).toBeTruthy();
  expect(screen.getByText("aaaaaaaaaaaa")).toBeTruthy();
});

it("전달 결과에서 실패 항목을 점검하고 결과 문구를 보여 준다", async () => {
  mocks.deliveries.mockResolvedValue({ total: 1, limit: 30, offset: 0, items: [{ outbox_id: "o1", job_id: "j", sink: "export", status: "failed",
    attempts: 5, not_before: null, last_error: "transient:OSError", created_at: "2026-10-23T08:00:00Z", delivered_at: null, outcome: null }] });
  mocks.reconcile.mockResolvedValue({ state: "reopened", status: "pending" });
  wrap(<Deliveries scope="personal" />);
  expect(await screen.findByText("transient:OSError")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "상태 점검" }));
  expect(await screen.findByText("다시 전달하도록 열었어요.")).toBeTruthy();
  expect(mocks.reconcile).toHaveBeenCalledWith("o1", "personal");
});

it("보류 표본 감사는 출처·사유별 표본 규모를 보여 준다", async () => {
  mocks.review.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
  mocks.audit.mockResolvedValue({ day: "2026-10-23", per_group: 2, groups: [{ source_key: "pilot:x", reason: "l0_too_short", held: 5, sampled: 2 }],
    items: [{ id: "i9", url: "https://docs.test/a", source_key: "pilot:x", status: "held", reason_codes: ["l0_too_short"], language: "ko", text_chars: 80, preview: "표본 본문", signals: {} }] });
  wrap(<Review scope="personal" />);
  fireEvent.click(await screen.findByRole("button", { name: "보류 표본 감사" }));
  expect(await screen.findByText(/보류 5건 중 2건 표본/)).toBeTruthy();
  expect(screen.getByText("표본 본문")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "검토 대기 목록으로" }));
  expect(await screen.findByText("검토할 자료가 없어요.")).toBeTruthy();
});
