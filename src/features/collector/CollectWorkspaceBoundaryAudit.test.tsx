import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { CollectDedupe, ReviewItem } from "../../api/collector";
import type { CollectionMission } from "../../api/collectionMissions";

const api = vi.hoisted(() => ({ collectReviewQueue: vi.fn(), collectHoldAudit: vi.fn(), collectItemDetail: vi.fn(), reprocessCollectItem: vi.fn() }));
vi.mock("../../api/collector", () => api);

import { Review } from "./Review";
import { ResearchPanel } from "./ResearchPanel";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(node: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>);
}

const row: ReviewItem = {
  id: "audit-item", url: "https://fixture.invalid/item", source_key: "fixture.invalid", status: "held",
  reason_codes: ["exact_duplicate"], language: "ko", text_chars: 10, preview: "fixture", signals: {}, can_reprocess: true,
};

function mission(overrides: Partial<CollectionMission> = {}): CollectionMission {
  return {
    id: "audit-mission", title: "fixture", goal: "fixture", status: "partial", counts: {}, jobs: [], gaps: [], results: [],
    run_seq: 1, knowledge_processing: { storage: "pending", semantic: "unverified" }, created_at: "", updated_at: "",
    plan: { title: "fixture", mode: "research", steps: [], sources: [], queries: [], coverage: [],
      budget: { pages: 10, depth: 1, searches: 2, seconds: 60, rounds: 2 }, stop_conditions: [] },
    research: { round: 1, stop: null, searches_used: 0, coverage: [] },
    ...overrides,
  } as CollectionMission;
}

it("구형 집계만 있으면 대기·처리 합계와 미해결 수를 구분해 표시한다", () => {
  const legacy = mission({ counts: { precise_waiting: 7, precise_unresolved: 0 }, triage: undefined });
  mount(<ResearchPanel mission={legacy} />);

  expect(screen.getByLabelText("자율 조사").textContent).toContain("정밀 평가: 대기·처리 합계 7건 · 개별 대기·처리 미확인 · 결과 확인 불가 0건");
});

it("triage의 0과 unavailable을 제공 상태로 표시하고 엔진 식별자로 노출하지 않는다", () => {
  mount(<ResearchPanel mission={mission({ triage: { precise_eval: { engine: "unavailable", pending: 0, processing: 0, unresolved: 0 } } })} />);

  expect(screen.getByText(/정밀 평가: 대기 0건 · 처리 중 0건 · 결과 확인 불가 0건/)).toBeTruthy();
  expect(screen.getByText(/엔진 가용 상태: 사용 불가 · 모델명·세부 실행 상태: 조사 응답에서 미확인/)).toBeTruthy();
  expect(document.body.textContent).not.toContain("unavailable");
  expect(document.body.textContent).not.toMatch(/모델명: [^미]/);
});

it("triage의 0은 구형 집계를 덮고 빠진 개별 pending은 만들어 내지 않는다", () => {
  const partial = mission({
    counts: { precise_waiting: 7, precise_unresolved: 4 },
    triage: { precise_eval: { processing: 0, unresolved: 0 } },
  });
  mount(<ResearchPanel mission={partial} />);

  const summary = screen.getByLabelText("자율 조사").textContent ?? "";
  expect(summary).toContain("정밀 평가: 대기·처리 합계 7건 · 처리 중 0건 · 결과 확인 불가 0건");
  expect(summary).not.toMatch(/대기 7건/);
  expect(summary).not.toMatch(/대기 [0-9]+건/);
});

it("제공된 decision은 최상위 status보다 우선하고 실제 string canonical_candidate를 그대로 보존한다", async () => {
  const dedupe = {
    exact_of: "canonical-item-id", cluster_id: "cluster-id", canonical_candidate: "candidate-item-id",
    canonical_status: "unreviewed", algorithm_version: "fixture-v1",
  } satisfies CollectDedupe;
  api.collectReviewQueue.mockResolvedValue({ items: [{ ...row, dedupe }], total: 1, limit: 20, offset: 0 });
  api.collectItemDetail.mockResolvedValue({
    id: row.id, url: row.url, final_url: null, status: "accepted", stage: "dedupe", http_status: 200,
    language: "ko", text_chars: 10, reason_codes: ["top_level_reason"], preview: "fixture",
    decision: { state: "reject", reason_codes: ["decision_reason"] }, dedupe,
    quality: {}, versions: { parser: null, normalizer: null }, hashes: { raw_sha256: null, text_sha256: null, payload: null },
    rights: { purposes: [] }, reviews: [], deliveries: [],
  });
  mount(<Review />);
  await screen.findByText(row.url);
  expect(screen.getByText(/중복 관계 대상: canonical-item-id/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "근거와 처리 이력" }));
  expect(await screen.findByText(/유용하지 않음 ·/)).toBeTruthy();
  fireEvent.click(screen.getByText("원 코드·중복 근거·처리 이력 보기"));
  const technical = screen.getByText(/"canonical_candidate": "candidate-item-id"/);
  for (const field of ["exact_of", "cluster_id", "canonical_candidate", "canonical_status", "algorithm_version"]) {
    expect(technical.textContent).toContain(`"${field}"`);
  }
});
