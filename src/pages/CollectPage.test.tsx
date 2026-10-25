import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), detail: vi.fn(), plan: vi.fn() }));
vi.mock("../api/collectionMissions", () => ({ collectionMissions: api.list, createCollectionMission: api.create, collectionMission: api.detail, previewCollectionPlan: api.plan }));
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
const mount = (url = "/collect") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[url]}><CollectPage /></MemoryRouter></QueryClientProvider>);

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
