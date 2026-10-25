import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  detail: vi.fn(),
  plan: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
  extend: vi.fn(),
  rerun: vi.fn(),
  schedule: vi.fn(),
  unhold: vi.fn(),
}));
vi.mock("../api/collectionMissions", () => ({
  collectionMissions: api.list,
  createCollectionMission: api.create,
  collectionMission: api.detail,
  previewCollectionPlan: api.plan,
  pauseCollectionMission: api.pause,
  resumeCollectionMission: api.resume,
  cancelCollectionMission: api.cancel,
  extendCollectionMission: api.extend,
  rerunCollectionMission: api.rerun,
  scheduleCollectionMission: api.schedule,
  unholdCollectionMissionItem: api.unhold,
}));
vi.mock("../features/collector/Overview", () => ({ Overview: () => <p>운영 현황</p>, BudgetCard: () => <p>한도 카드</p> }));
vi.mock("../features/collector/Review", () => ({ Review: () => <p>검토</p> }));
vi.mock("../features/collector/Deliveries", () => ({ Deliveries: () => <p>전달 결과</p> }));
vi.mock("../features/kb/Collection", () => ({ SourcesPanel: () => <p>출처 설정</p>, RunsPanel: () => <p>실행 이력</p> }));
vi.mock("../features/kb/Quality", () => ({ QualityPanel: () => <p>품질 설정</p> }));
vi.mock("../api/collector", () => ({ collectBudgets: vi.fn().mockResolvedValue({}) }));
import { CollectPage } from "./CollectPage";

const mission = { id: "m1", title: "하네스 엔지니어링", goal: "하네스 엔지니어링", status: "running", counts: { discovered: 4, acquired: 2, accepted: 1, held: 1, failed: 0, blocked: 0, duplicate: 0, imported: 1, pending_delivery: 0 }, plan: { steps: ["독립 출처 탐색", "지식 도서관 적재"], sources: [], queries: [], coverage: [], budget: { pages: 200, searches: 16, seconds: 1800 }, stop_conditions: ["예산 소진"] }, gaps: [], jobs: [], results: [{ id: "i1", title: "설계 원전", url: "https://example.com/doc", status: "accepted", reasons: ["l0_pass"], document_id: "d1", revision_id: "r1", delivery: "imported" }], knowledge_processing: { storage: "verified", semantic: "unverified" } };
beforeEach(() => { vi.clearAllMocks(); api.list.mockResolvedValue({ items: [] }); api.create.mockResolvedValue(mission); api.detail.mockResolvedValue(mission); });
afterEach(cleanup);
const mount = (url = "/collect", queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => {
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[url]}><CollectPage /></MemoryRouter></QueryClientProvider>);
  return queryClient;
};

it("첫 화면은 자연어 임무 입력이고 범위 토글이나 출처 설정을 요구하지 않는다", async () => {
  mount();
  expect(screen.getByLabelText("무엇을 수집하고 싶으세요?")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "회사" })).toBeNull();
  expect(screen.queryByText("운영 현황")).toBeNull();
  expect(await screen.findByText("아직 수집 임무가 없습니다.")).toBeTruthy();
});

it("사용자 맥락과 목적을 한 번에 제출하고 실제 적재 결과를 연다", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("무엇을 수집하고 싶으세요?"), { target: { value: "하네스 엔지니어링" } });
  fireEvent.click(screen.getByText("참고 자료 추가"));
  fireEvent.change(screen.getByLabelText("조사 내용과 참고 주소"), { target: { value: "가설과 https://example.com/doc" } });
  fireEvent.click(screen.getByRole("button", { name: "수집 시작" }));
  await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ goal: "하네스 엔지니어링", context: "가설과 https://example.com/doc" })));
  expect(await screen.findByText("설계 원전")).toBeTruthy();
  expect(screen.getByRole("link", { name: "도서관에서 보기" }).getAttribute("href")).toContain("doc=d1");
  expect(screen.getByText("원문 적재와 의미·관계 처리는 별도로 진행됩니다.")).toBeTruthy();
});

it("임무 목록 오류에는 재시도 경로가 있고 운영 설정은 접어서 제공한다", async () => {
  api.list.mockRejectedValue(new Error("연결을 확인해 주세요"));
  mount();
  expect(await screen.findByText(/연결을 확인/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeTruthy();
  expect(screen.getByText("운영·고급 설정")).toBeTruthy();
});

it("진행 중인 임무는 일시정지와 취소를 지원하고 상태에 맞는 버튼을 제공한다", async () => {
  api.detail.mockResolvedValue({ ...mission, status: "running" });
  mount("/collect?mission=m1");
  expect(await screen.findByRole("button", { name: "일시정지" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "수집 취소" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
  await waitFor(() => expect(api.pause).toHaveBeenCalledWith("m1"));
});

it("일시 중지된 임무는 재개 버튼을 제공한다", async () => {
  api.detail.mockResolvedValue({ ...mission, status: "paused" });
  mount("/collect?mission=m1");
  expect(await screen.findByRole("button", { name: "수집 재개" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "수집 재개" }));
  await waitFor(() => expect(api.resume).toHaveBeenCalledWith("m1"));
});

it("종료되거나 일부 수집된 임무는 더 수집하기와 다시 실행을 제공한다", async () => {
  api.detail.mockResolvedValue({ ...mission, status: "partial" });
  mount("/collect?mission=m1");
  expect(await screen.findByRole("button", { name: "더 수집하기" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "다시 실행" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "더 수집하기" }));
  expect(screen.getByText("추가 수집할 쪽수:")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "추가 수집 시작" }));
  await waitFor(() => expect(api.extend).toHaveBeenCalledWith("m1", 50));
});

it("임무의 자동 수집 주기를 설정할 수 있다", async () => {
  mount("/collect?mission=m1");
  expect(await screen.findByText(/주기 설정/)).toBeTruthy();
  fireEvent.click(screen.getByText(/주기 설정/));
  expect(screen.getByText("수집 주기 갱신")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("1일마다"));
  fireEvent.click(screen.getByRole("button", { name: "주기 저장" }));
  await waitFor(() => expect(api.schedule).toHaveBeenCalledWith("m1", 1440));
});

it("API가 허용하지 않는 15분 미만 직접 주기는 저장할 수 없다", async () => {
  mount("/collect?mission=m1");
  expect(await screen.findByText(/주기 설정/)).toBeTruthy();
  fireEvent.click(screen.getByText(/주기 설정/));
  const input = screen.getByLabelText("직접 입력 (분):");
  fireEvent.change(input, { target: { value: "5" } });
  expect(input.getAttribute("min")).toBe("15");
  expect(screen.getByRole("button", { name: "주기 저장" }).hasAttribute("disabled")).toBe(true);
  expect(api.schedule).not.toHaveBeenCalled();
});

it("임무 상세에 마지막 갱신 회차와 회차별 수집/적재 성과를 표시한다", async () => {
  api.detail.mockResolvedValue({
    ...mission,
    run_seq: 2,
    runs: [
      { run_seq: 2, trigger: "scheduled", started_at: "2026-10-25T15:00:00Z", page_budget: 10, pages_used: 5, collected: 3, unchanged: 2, imported: 3, in_progress: false },
      { run_seq: 1, trigger: "initial", started_at: "2026-10-25T14:00:00Z", page_budget: 10, pages_used: 10, collected: 8, unchanged: 0, imported: 7, in_progress: false },
    ],
  });
  mount("/collect?mission=m1");
  expect(await screen.findByText(/마지막 갱신 회차: 2회차/)).toBeTruthy();
  expect(screen.getByText(/수집 3건 · 적재 3건/)).toBeTruthy();
});

it("한 응답의 회차 이력과 결과별 품질 축을 함께 보여주고 점수 단위를 보존한다", async () => {
  api.detail.mockResolvedValue({
    ...mission,
    run_seq: 2,
    runs: [{ run_seq: 2, trigger: "scheduled", started_at: "2026-10-25T15:00:00Z", page_budget: 10, pages_used: 5, collected: 3, unchanged: 2, imported: 1, in_progress: false }],
    triage: { accepted: 1, review_needed: 0, held: 0, reasons: {}, policy: { status: "active", verified: false }, ml: { status: "available" }, precise_eval: { engine: "unavailable" } },
    results: [{ ...mission.results[0], triage: {
      status: "auto_accepted", reasons: ["triage:accepted"], mode: "active", verified: false,
      axes: {
        relevance_lexical: { value: 0.7, scale: "similarity", validation: "unvalidated", evidence: ["제목이 조사 목표와 일치"] },
        topic_relevance_semantic: { status: "measured", value: 0.8123, scale: "similarity", validation: "unvalidated", reason: "language_not_validated:ko" },
        information_value: { status: "measured", value: 3.2, scale: "ordinal", validation: "validated" },
        low_quality_likelihood: { status: "measured", value: -0.4, scale: "raw_logit", validation: "unvalidated" },
        explanation_quality: { status: "unmeasured", value: null, scale: "none", validation: "unvalidated", reason: "no labelled data" },
      },
      validation: { overall: "partial", validated_axes: ["information_value"] },
      stage2: { status: "unavailable", reason: "engine unavailable" },
      precise_eval: { state: "pending", reasons: ["review_needed"] },
    } }],
  });
  mount("/collect?mission=m1");
  expect(await screen.findByText(/마지막 갱신 회차: 2회차/)).toBeTruthy();
  expect(screen.getByText(/수집 3건 · 적재 1건/)).toBeTruthy();
  expect(screen.getByLabelText("품질 판정 집계").textContent).toContain("추가 확인 0건");
  fireEvent.click(screen.getByText("품질 축과 평가 상태"));
  expect(screen.getByText("임무 관련성 (규칙)")).toBeTruthy();
  expect(screen.getByText("임무 관련성 (의미 모델)")).toBeTruthy();
  expect(screen.getByText("정보 가치")).toBeTruthy();
  expect(screen.getByText("저품질 징후")).toBeTruthy();
  expect(screen.getByText(/유사도 0\.7/)).toBeTruthy();
  expect(screen.getByText(/-0\.4.*확률값 아님/)).toBeTruthy();
  expect(screen.getByText(/도서관에 적재됨/)).toBeTruthy();
  expect(screen.getByText(/판정 기준: 미검증/)).toBeTruthy();
  expect(screen.getByText(/정밀 평가 엔진: 사용할 수 없음/)).toBeTruthy();
  expect(screen.queryByText(/저품질.*%/)).toBeNull();
});

it("legacy 품질 필드가 없으면 판정 축 부재와 미검증 사실 상태를 안전하게 알린다", async () => {
  api.detail.mockResolvedValue({ ...mission, results: [{ ...mission.results[0], delivery: null }] });
  mount("/collect?mission=m1");
  expect(await screen.findByText("기존 결과에는 품질 판정 정보가 없습니다.")).toBeTruthy();
  expect(screen.getByText(/수락됨 · 도서관 적재 확인 전/)).toBeTruthy();
});

it("보류 복구는 사용자가 눌렀을 때 실행하고 가져오기 확인 전에는 적재 완료로 표시하지 않는다", async () => {
  api.detail.mockResolvedValueOnce({ ...mission, results: [{ ...mission.results[0], status: "held", delivery: null }] })
    .mockResolvedValueOnce({ ...mission, results: [{ ...mission.results[0], status: "accepted", delivery: null }] });
  api.unhold.mockResolvedValue({ item_id: "i1", status: "accepted", delivery_queued: true, review: { factuality: "unverified" } });
  const queryClient = mount("/collect?mission=m1");
  expect(await screen.findByText("설계 원전")).toBeTruthy();
  expect(await screen.findByText(/보류됨 · 복구할 수 있습니다\./)).toBeTruthy();
  expect(api.unhold).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "보류 복구" }));
  await waitFor(() => expect(api.unhold).toHaveBeenCalledWith("m1", "i1"));
  expect(await screen.findByText(/복구 요청이 처리됐습니다.*가져오기 확인/)).toBeTruthy();
  expect(await screen.findByText(/수락됨 · 도서관 적재 확인 전/)).toBeTruthy();
  expect(screen.queryByText(/도서관에 적재됨/)).toBeNull();
  api.detail.mockResolvedValue({ ...mission, results: [{ ...mission.results[0], status: "accepted", delivery: "imported" }] });
  await queryClient.invalidateQueries({ queryKey: ["collection-mission", "m1"] });
  expect(await screen.findByText(/도서관에 적재됨/)).toBeTruthy();
});

it("보류 복구에서 권리 거부를 사용자 문장으로 보여주고 임무 데이터는 보존한다", async () => {
  const { ApiError } = await import("../api/client");
  api.detail.mockResolvedValue({ ...mission, results: [{ ...mission.results[0], status: "held", delivery: null }] });
  api.unhold.mockRejectedValue(new ApiError(403, { code: "knowledge_permission_missing", message: "knowledge_permission_missing" }));
  mount("/collect?mission=m1");
  expect(await screen.findByText("설계 원전")).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "보류 복구" }));
  expect(await screen.findByText("이 자료를 도서관에 적재할 권리를 확인해 주세요.")).toBeTruthy();
  expect(screen.queryByText("knowledge_permission_missing")).toBeNull();
  expect(screen.getByRole("button", { name: "보류 복구" })).toBeTruthy();
});

it("보류 복구 422 코드와 이미 보류 아님 응답을 내부 코드 없이 알린다", async () => {
  const { ApiError } = await import("../api/client");
  api.detail.mockResolvedValue({ ...mission, results: [{ ...mission.results[0], status: "held", delivery: null }] });
  api.unhold.mockRejectedValueOnce(new ApiError(422, { code: "item_not_importable", message: "item_not_importable" }));
  mount("/collect?mission=m1");
  fireEvent.click(await screen.findByRole("button", { name: "보류 복구" }));
  expect(await screen.findByText("원문 보관 정보가 부족해 도서관에 적재할 수 없습니다.")).toBeTruthy();
  expect(screen.queryByText("item_not_importable")).toBeNull();
  api.unhold.mockResolvedValueOnce({ item_id: "i1", status: "failed", message: "item_not_held" });
  fireEvent.click(screen.getByRole("button", { name: "보류 복구" }));
  expect(await screen.findByText(/이미 보류 상태가 아니어서 바꾸지 않았습니다/)).toBeTruthy();
});

it("이미 수락된 항목의 item_not_held 응답을 복구 처리 완료로 오인하지 않는다", async () => {
  api.detail.mockResolvedValue({ ...mission, results: [{ ...mission.results[0], status: "held", delivery: null }] });
  // backend returns the item's current status (here already accepted) with message item_not_held
  api.unhold.mockResolvedValueOnce({ item_id: "i1", status: "accepted", message: "item_not_held" });
  mount("/collect?mission=m1");
  fireEvent.click(await screen.findByRole("button", { name: "보류 복구" }));
  expect(await screen.findByText(/이미 보류 상태가 아니어서 바꾸지 않았습니다/)).toBeTruthy();
  expect(screen.queryByText(/복구 요청이 처리됐습니다/)).toBeNull();
});

it("정밀평가 대기·확인 불가 건수와 엔진 상태를 정확히 표시하고 내부 상세는 숨긴다", async () => {
  const item = { ...mission.results[0], triage: { status: "review_needed", axes: {}, precise_eval: { state: "pending" } } };
  const withEngine = (engine: string) => ({
    ...mission,
    counts: { ...mission.counts, precise_waiting: 3, precise_unresolved: 1 },
    triage: { accepted: 1, review_needed: 1, held: 0, reasons: {}, policy: { status: "active", verified: false }, ml: { status: "available" },
      precise_eval: { engine, engine_detail: "내부-상세-문구", pending: 2, processing: 1, unresolved: 1 } },
    results: [item],
  });
  api.detail.mockResolvedValue(withEngine("busy"));
  mount("/collect?mission=m1");
  expect(await screen.findByText("정밀평가 대기 3건 · 결과에 따라 도서관 적재가 늘 수 있음")).toBeTruthy();
  expect(screen.getByText("정밀평가 결과 확인 불가 1건 · 운영자 확인 필요")).toBeTruthy();
  expect(screen.getByLabelText("품질 판정 집계").textContent).toContain("정밀평가 대기 3건 · 결과 확인 불가 1건");
  fireEvent.click(screen.getByText("품질 축과 평가 상태"));
  expect(screen.getByText("정밀 평가 엔진: 로컬 모델 사용 중 · 대기")).toBeTruthy();
  expect(screen.queryByText(/내부-상세-문구/)).toBeNull();
  expect(document.body.textContent).not.toContain("내부-상세-문구");
});

it.each([["ready", "준비됨"], ["unavailable", "사용할 수 없음"], ["enabled_without_registered_engine", "사용할 수 없음"], ["surprise", "확인 필요"]])(
  "정밀평가 엔진 %s 는 %s 로 표시한다", async (engine, label) => {
    api.detail.mockResolvedValue({
      ...mission, counts: { ...mission.counts, precise_waiting: 0, precise_unresolved: 0 },
      triage: { accepted: 1, review_needed: 0, held: 0, reasons: {}, policy: { status: "active", verified: false }, precise_eval: { engine } },
      results: [{ ...mission.results[0], triage: { status: "auto_accepted", axes: {}, precise_eval: { state: "not_needed" } } }],
    });
    mount("/collect?mission=m1");
    fireEvent.click(await screen.findByText("품질 축과 평가 상태"));
    expect(screen.getByText("정밀 평가 엔진: " + label)).toBeTruthy();
    expect(screen.queryByLabelText("정밀평가 대기")).toBeNull();
  });
