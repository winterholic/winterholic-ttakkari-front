import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import type { CollectionMission, MissionTrace } from "../../api/collectionMissions";

const api = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), trace: vi.fn() }));
vi.mock("../../api/collectionMissions", () => ({
  collectionMissions: api.list, collectionMission: api.detail, collectionMissionTrace: api.trace,
  createCollectionMission: vi.fn(), previewCollectionPlan: vi.fn(), pauseCollectionMission: vi.fn(), resumeCollectionMission: vi.fn(),
  cancelCollectionMission: vi.fn(), extendCollectionMission: vi.fn(), rerunCollectionMission: vi.fn(), scheduleCollectionMission: vi.fn(),
  supplementCollectionMission: vi.fn(), unholdCollectionMissionItem: vi.fn(),
}));
import { Missions } from "./Missions";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

function project(id: string, title: string, updatedAt: string): CollectionMission {
  return {
    id, title, goal: `${title}\n세부 분야: 논문`, status: "partial",
    plan: { title, mode: "guided", steps: [], sources: [], queries: [], coverage: [{ topic: "논문", state: "thin" }], budget: { pages: 10, depth: 1, searches: 2, seconds: 60 }, stop_conditions: [] },
    counts: { imported: 6 }, jobs: [], gaps: [], results: [], knowledge_processing: { storage: "stored", semantic: "pending" },
    created_at: updatedAt, updated_at: updatedAt,
  };
}

function Probe() { const location = useLocation(); return <output aria-label="현재 주소">{location.search}</output>; }

function renderMissions(entry = "/collect") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><Missions /><Probe /></MemoryRouter></QueryClientProvider>);
}

const trace: MissionTrace = { id: "m1", title: "연구", goal: "목적", status: "partial", run_seq: 1, targets: [], requirements: [], rules: [], stages: [],
  ontology: { documents: 0, stages: [] }, jobs: { total: 0, failed: 0, running: 0, queued: 0 }, grades: {}, events: [], discarded: [], documents: [] };

it("프로젝트를 최근 활동순으로 보여주고 검색 결과에서 기존 mission URL을 연다", async () => {
  api.list.mockResolvedValue({ items: [project("old", "해양 연구", "2026-11-01T00:00:00Z"), project("m1", "해양 연구", "2026-11-06T00:00:00Z")] });
  api.detail.mockResolvedValue(project("m1", "해양 연구", "2026-11-06T00:00:00Z"));
  api.trace.mockResolvedValue(trace);
  renderMissions();

  fireEvent.change(await screen.findByRole("searchbox", { name: "프로젝트 검색" }), { target: { value: "해양" } });
  fireEvent.click(screen.getAllByRole("button", { name: "상세 보기: 해양 연구" })[0]);
  expect(screen.getByLabelText("현재 주소").textContent).toContain("mission=m1");
});

it("기존 new 쿼리로 새 연구 계획 화면을 연다", async () => {
  api.list.mockResolvedValue({ items: [] });
  renderMissions("/collect?new=1");
  expect(await screen.findByRole("heading", { name: "새 연구 계획" })).toBeTruthy();
});

it("정밀 평가 수치를 제공값대로 표시하고 busy를 로컬 엔진으로 단정하지 않는다", async () => {
  const mission = project("m1", "평가 상태 확인", "2026-11-06T00:00:00Z");
  mission.triage = { precise_eval: { engine: "busy", pending: 4, processing: 3, unresolved: 2 } };
  mission.results = [{ id: "r1", url: "https://example.test/a", title: "결과", status: "accepted", reasons: [], document_id: null,
    revision_id: null, delivery: null, triage: { axes: {}, status: "accepted" } }];
  api.list.mockResolvedValue({ items: [mission] });
  api.detail.mockResolvedValue(mission);
  api.trace.mockResolvedValue(trace);
  renderMissions("/collect?mission=m1&tab=docs");

  expect((await screen.findByLabelText("정밀평가 대기")).textContent).toContain("4건");
  expect(screen.getByLabelText("정밀평가 처리 중").textContent).toContain("3건");
  expect(screen.getByLabelText("정밀평가 확인 불가").textContent).toContain("2건");
  fireEvent.click(screen.getByText(/품질 판정 상세/));
  expect(screen.getByLabelText("품질 판정 집계").textContent).toContain("대기 4건 · 처리 중 3건 · 결과 확인 불가 2건");
  fireEvent.click(screen.getByText("품질 축과 평가 상태"));
  expect(screen.getByText(/정밀 평가 엔진: 사용 상태 확인 중/)).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/로컬 모델 사용 중|로컬 엔진/);
});

it("triage가 없는 상세는 구형 대기·처리 합계와 미해결 집계를 보존한다", async () => {
  const legacy = project("m1", "구형 임무", "2026-11-06T00:00:00Z");
  legacy.counts = { precise_waiting: 7, precise_unresolved: 0 };
  api.list.mockResolvedValue({ items: [legacy] });
  api.detail.mockResolvedValue(legacy);
  api.trace.mockResolvedValue(trace);
  renderMissions("/collect?mission=m1&tab=docs");

  expect(await screen.findByLabelText("정밀평가 대기·처리 합계")).toBeTruthy();
  expect(screen.getByLabelText("정밀평가 대기·처리 합계").textContent).toContain("7건");
  expect(screen.getByLabelText("정밀평가 집계").textContent).toContain("대기·처리 합계 7건 · 개별 대기·처리 미확인 · 결과 확인 불가 0건");
});
