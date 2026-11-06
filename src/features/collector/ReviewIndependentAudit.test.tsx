import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { ReviewItem } from "../../api/collector";

const api = vi.hoisted(() => ({
  collectReviewQueue: vi.fn(), collectHoldAudit: vi.fn(), collectItemDetail: vi.fn(), reprocessCollectItem: vi.fn(),
  reviewCollectItem: vi.fn(), importCollectItem: vi.fn(),
}));

vi.mock("../../api/collector", () => api);

import { Review } from "./Review";
import { ResearchPanel } from "./ResearchPanel";
import type { CollectionMission } from "../../api/collectionMissions";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const acceptedCanReprocess: ReviewItem = {
  id: "audit-item", url: "https://example.test/a", source_key: "example.test", status: "accepted",
  reason_codes: ["already_accepted"], language: "ko", text_chars: 100, preview: "샘플", signals: {}, can_reprocess: true,
};

function mount(node: React.ReactNode = <Review />) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {node}
  </QueryClientProvider>);
}

it("재처리 필터는 실제 버튼이 있는 보류 행만 표시한다", async () => {
  api.collectReviewQueue.mockResolvedValue({ items: [acceptedCanReprocess], total: 1, limit: 20, offset: 0 });
  mount();
  await screen.findByText(acceptedCanReprocess.url);
  fireEvent.change(screen.getByLabelText("가능 조치"), { target: { value: "reprocess" } });

  expect(screen.queryByText(acceptedCanReprocess.url)).toBeNull();
  expect(screen.getByText(/조건에 맞는 자료가 없습니다/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "원문으로 다시 처리" })).toBeNull();
});

it("decision 필드가 없으면 상세 응답의 status와 사유를 보여준다", async () => {
  api.collectReviewQueue.mockResolvedValue({ items: [acceptedCanReprocess], total: 1, limit: 20, offset: 0 });
  api.collectItemDetail.mockResolvedValue({
    id: "audit-item", url: acceptedCanReprocess.url, final_url: null, status: "accepted", stage: "scored", http_status: 200,
    language: "ko", text_chars: 100, reason_codes: ["already_accepted"], preview: "샘플", quality: {},
    versions: { parser: null, normalizer: null }, hashes: { raw_sha256: null, text_sha256: null, payload: null },
    rights: { license_id: null, purposes: [] }, reviews: [], deliveries: [],
  });
  mount();
  await screen.findByText(acceptedCanReprocess.url);
  fireEvent.click(screen.getByRole("button", { name: "근거와 처리 이력" }));

  expect(await screen.findByText(/적재 대상 · 사유 확인 필요/)).toBeTruthy();
});

it("ResearchPanel은 제공된 정밀 평가 상태와 건수를 표시한다", () => {
  const mission = {
    id: "audit-mission", title: "조사", goal: "목표", status: "partial", counts: {}, jobs: [], gaps: [], results: [],
    run_seq: 1, knowledge_processing: { storage: "pending", semantic: "unverified" }, created_at: "", updated_at: "",
    plan: { title: "조사", mode: "research", steps: [], sources: [], queries: [], coverage: [],
      budget: { pages: 10, depth: 1, searches: 16, seconds: 1800, rounds: 3, papers: 20 }, stop_conditions: [] },
    research: { round: 1, stop: null, searches_used: 0, coverage: [] },
    triage: { precise_eval: { engine: "unavailable", pending: 176, processing: 0, unresolved: 0 } },
  } as unknown as CollectionMission;
  mount(<ResearchPanel mission={mission} />);

  expect(screen.getByText(/정밀 평가: 대기 176건/)).toBeTruthy();
  expect(screen.getByText(/처리 중 0건/)).toBeTruthy();
  expect(screen.getByText(/결과 확인 불가 0건/)).toBeTruthy();
  expect(screen.getByText(/엔진 가용 상태: 사용 불가/)).toBeTruthy();
  expect(document.body.textContent).not.toContain("unavailable");
});
