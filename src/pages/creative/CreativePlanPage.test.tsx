import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CreativePlan, ProductionView } from "../../api/creativeV2";
import { CreativePlanDetailPage, CreativePlanNewPage } from "./CreativePlanPage";

vi.mock("../../shell/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => sessionStorage.clear());

function scene(i: number, seconds: number, floor = 9) {
  return {
    scene_id: `s${i}`,
    title: `단계 ${i}`,
    narration: "요청을 받아 검증하는 과정을 설명합니다.",
    seconds,
    start_time: 0,
    end_time: 0,
    start_frame: 0,
    end_frame: 0,
    duration_state: "ok" as const,
    floor,
    ideal: 12,
    ceiling: 19,
    speech_seconds: 8,
    info_weight: 1,
    essential: true,
    narrative_goal: `단계 ${i}`,
    required_skills: ["skill.scene_review"],
    selected_tools: ["tool.ffmpeg"],
    quality_checks: ["qa.machine_video"],
  };
}

function planFixture(overrides: Partial<CreativePlan> = {}): CreativePlan {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    name: "요청 처리 설명",
    brief: "기술 설명",
    aspect: "16:9",
    intent_status: "confirmed",
    basis: "info_items",
    match: {
      status: "ready_unverified",
      execution_scope: "lab_manual",
      primary_recipe: "R03",
      auxiliary_recipes: [],
      candidates: [{ recipe_id: "R03", name: "React 컴포넌트 조립", score: 0.6, verdict: "unverified", disqualified: null }],
      gaps: [
        { options: ["render.dataviz"], priority: "must", status: "unverified", why: "설치만 확인됐고 실행 기록이 없다", alternatives: [] },
      ],
      conflicts: [],
      dropped: [],
      style_resolution_needed: [],
    },
    duration: {
      status: "target_met",
      deviation_level: "none",
      request: { mode: "preferred", seconds: 180 },
      fps: 30,
      needed: { min_seconds: 120, ideal_seconds: 150, max_seconds: 240, speech_seconds: 100, music_seconds: null, beats: [], reasons: [] },
      planned_seconds: 180,
      planned_frames: 5400,
      reasons: ["희망 3분은 콘텐츠 범위 안이라 장면 길이를 맞췄습니다."],
      warnings: [],
      alternatives: [],
    },
    duration_check: null,
    scenes: [scene(1, 90), scene(2, 90)],
    notes: [],
    approval: null,
    render_blockers: [],
    render_gate: false,
    updated_at: "2026-10-22T00:00:00Z",
    history: [],
    ...overrides,
  };
}

type Handler = (url: string, init?: RequestInit) => unknown;

function productionFixture(overrides: Partial<ProductionView> = {}): ProductionView {
  return {
    plan_id: "11111111-1111-4111-8111-111111111111",
    plan_revision: 1,
    state: "not_dispatched",
    dispatchable: true,
    reasons: [],
    assets: { scenes_total: 3, scenes_with_asset: 0, missing_scene_ids: ["s1", "s2", "s3"], music: null, music_problem: "음악 자산이 없습니다.", complete: false },
    asset_generation: null,
    engine: null,
    outdated_segments: [],
    segments: [],
    final: null,
    quality_report: null,
    repair_plan: null,
    review_execution: null,
    history: [],
    log: [],
    ...overrides,
  };
}

test("production panel displays server QA verdict and honest unknown review states", async () => {
  const plan = planFixture({ approval: { revision: 1, planned_frames: 5400, planned_seconds: 180, fps: 30, approved_at: "2026-11-07T00:00:00Z" }, render_gate: true });
  const report = {
    schema_version: 1,
    overall_verdict: "needs_review",
    machine_qa: { verdict: "pass", checks: [] },
    semantic_qa: { verdict: "unknown", reason: "독립 검수는 아직 없습니다.", checks: [] },
    viewing_qa: { verdict: "unknown", reason: "독립 검수는 아직 없습니다.", checks: [] },
    defects: [],
    repair_plan: { schema_version: 1, status: "not_needed", actions: [], blocked: [], invalidate: { scene_ids: [], shot_ids: [], layers: [], segment_ids: [], final: false, quality_evidence: false }, preserve: { scene_ids: [], shot_ids: [], segment_run_keys: {}, asset_groups: [], asset_keys: [] } },
  };
  stub((url) => {
    if (url.endsWith(`/api/creative/v2/plans/${plan.id}/production`)) return productionFixture({
      state: "succeeded",
      caption_mode: "title_only",
      assets: { scenes_total: 2, scenes_with_asset: 2, missing_scene_ids: [], music: null, music_problem: null, complete: true },
      final: { status: "qa_passed", id: "final-id", sha256: "a".repeat(64), size: 42, name: "final.mp4", qa: { passed: true, checks: [] }, planned_seconds: 180, duration: null, assembled_at: "2026-11-07T00:00:00Z", error: null },
      quality_report: report,
    });
    return plan;
  });
  mount(`/creative/plan/${plan.id}`);
  await screen.findByRole("heading", { name: "품질 판정" });
  expect(screen.getByText(/전체 판정: 추가 검수 필요/)).toBeTruthy();
  expect(screen.getByText(/기계 검사: 통과/)).toBeTruthy();
  expect(screen.getAllByText(/미확인/).length).toBeGreaterThan(0);
});

test("review sends only the approved revision and preserves not-connected as unknown", async () => {
  const plan = planFixture({ approval: { revision: 1, planned_frames: 5400, planned_seconds: 180, fps: 30, approved_at: "2026-11-07T00:00:00Z" }, render_gate: true });
  const calls = stub((url) => {
    if (url.endsWith(`/api/creative/v2/plans/${plan.id}/production/review`)) return { status: "not_connected", verdict: "unknown" };
    if (url.endsWith(`/api/creative/v2/plans/${plan.id}/production`)) return productionFixture({
      plan_revision: 1,
      state: "succeeded",
      final: { status: "qa_passed", id: "final-id", sha256: "d".repeat(64), size: 42, name: "final.mp4", qa: { passed: true, checks: [] }, planned_seconds: 180, duration: null, assembled_at: "2026-11-07T00:00:00Z", error: null },
      quality_report: {
        schema_version: 1,
        overall_verdict: "unknown",
        machine_qa: { verdict: "pass", checks: [] },
        semantic_qa: { verdict: "unknown", reason: "독립 평가 연결 없음", checks: [] },
        viewing_qa: { verdict: "unknown", reason: "독립 평가 연결 없음", checks: [] },
        defects: [],
        repair_plan: { schema_version: 1, status: "not_needed", actions: [], blocked: [], invalidate: { scene_ids: [], shot_ids: [], layers: [], segment_ids: [], final: false, quality_evidence: false }, preserve: { scene_ids: [], shot_ids: [], segment_run_keys: {}, asset_groups: [], asset_keys: [] } },
      },
    });
    return plan;
  });
  mount(`/creative/plan/${plan.id}`);
  fireEvent.click(await screen.findByRole("button", { name: "서버 검수 요청" }));
  await screen.findByText(/검수 연결 상태: not_connected/);
  expect(calls.find((call) => call.url.endsWith(`/api/creative/v2/plans/${plan.id}/production/review`))?.body).toEqual({ revision: 1 });
});

test("partial caption repair requires a changed value and sends the new revision request", async () => {
  const plan = planFixture({ approval: { revision: 1, planned_frames: 5400, planned_seconds: 180, fps: 30, approved_at: "2026-11-07T00:00:00Z" }, render_gate: true, scenes: [{ ...scene(1, 16), title: "기존 제목", strategy: "motion_graphics" }] });
  const defects = [{ scene_id: "s1", code: "fake_text", layer: "captions", summary: "표기를 고쳐 주세요." }];
  const calls = stub((url, init) => {
    if (url.endsWith(`/api/creative/v2/plans/${plan.id}/production`)) return productionFixture({
      state: "succeeded",
      final: { status: "qa_passed", id: "final-id", sha256: "a".repeat(64), size: 42, name: "final.mp4", qa: { passed: true, checks: [] }, planned_seconds: 16, duration: null, assembled_at: "2026-11-07T00:00:00Z", error: null },
      quality_report: {
        schema_version: 1,
        overall_verdict: "fail",
        machine_qa: { verdict: "pass", checks: [] },
        semantic_qa: { verdict: "unknown", checks: [] },
        viewing_qa: { verdict: "unknown", checks: [] },
        defects,
        repair_plan: {
          schema_version: 1,
          status: "partial",
          actions: [],
          blocked: [],
          invalidate: { scene_ids: [], shot_ids: [], layers: [], segment_ids: [], final: false, quality_evidence: false },
          preserve: { scene_ids: [], shot_ids: [], segment_run_keys: {}, asset_groups: [], asset_keys: [] },
        },
      },
      repair_plan: {
        schema_version: 1,
        status: "partial",
        caption_mode: "title_only",
        actions: [{ ...defects[0], shot_id: "s1a", strategy: "captions" }],
        blocked: [],
        invalidate: { scene_ids: ["s1"], shot_ids: ["s1a"], layers: ["captions"], segment_ids: ["seg1"], final: true, quality_evidence: true },
        preserve: { scene_ids: [], shot_ids: [], segment_run_keys: {}, asset_groups: [], asset_keys: [] },
        proposal_sha256: "b".repeat(64),
      },
    });
    if (url.endsWith(`/api/creative/v2/plans/${plan.id}/production/repair`)) {
      expect(init?.method).toBe("POST");
      return { status: "applied_needs_approval", source_revision: 1, revision: 2, changes: [{ scene_id: "s1", shot_id: "s1a", layer: "captions", field: "title", before: "기존 제목", after: "수정 제목" }], preserve: { scene_ids: [], shot_ids: [], segment_run_keys: {}, asset_groups: [], asset_keys: [] }, quality_state: "unknown_until_new_review" };
    }
    return plan;
  });
  mount(`/creative/plan/${plan.id}`);
  const apply = await screen.findByRole("button", { name: "문구 수정 적용 · 새 revision" });
  expect(apply).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByRole("textbox", { name: "수정 문구 s1" }), { target: { value: "수정 제목" } });
  expect(apply).toHaveProperty("disabled", false);
  fireEvent.click(apply);
  await waitFor(() => expect(calls.some((call) => call.method === "POST" && call.url.endsWith(`/api/creative/v2/plans/${plan.id}/production/repair`))).toBe(true));
  const repairCall = calls.find((call) => call.url.endsWith(`/api/creative/v2/plans/${plan.id}/production/repair`));
  expect(repairCall?.body).toMatchObject({ revision: 1, updates: [{ scene_id: "s1", shot_id: "s1a", layer: "captions", field: "title", text: "수정 제목" }] });
  expect(calls.some((call) => call.url.endsWith(`/api/creative/v2/plans/${plan.id}/approve`) || call.url.endsWith(`/api/creative/v2/plans/${plan.id}/production/render`))).toBe(false);
});

test("dispatch preserves the prior title-only caption mode as a query parameter", async () => {
  const plan = planFixture({ approval: { revision: 1, planned_frames: 5400, planned_seconds: 180, fps: 30, approved_at: "2026-11-07T00:00:00Z" }, render_gate: true });
  const calls = stub((url) => {
    if (url.split("?")[0].endsWith(`/api/creative/v2/plans/${plan.id}/production`)) return productionFixture({ caption_mode: "title_only", dispatchable: true });
    return plan;
  });
  mount(`/creative/plan/${plan.id}`);
  fireEvent.click(await screen.findByRole("button", { name: "제작 시작 준비" }));
  await waitFor(() => expect(calls.some((call) => call.method === "POST" && call.url.includes(`/api/creative/v2/plans/${plan.id}/production?caption_mode=title_only`))).toBe(true));
  expect(calls.find((call) => call.url.includes("?caption_mode=title_only"))?.body).toEqual({ revision: 1 });
  expect(calls.some((call) => call.url.endsWith(`/api/creative/v2/plans/${plan.id}/production/render`))).toBe(false);
});

test("caption repair stays pending until approval, then dispatches with the same mode before render", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const sourcePlan = planFixture({ id, approval: { revision: 1, planned_frames: 480, planned_seconds: 16, fps: 30, approved_at: "2026-11-07T00:00:00Z" }, render_gate: true, scenes: [{ ...scene(1, 16), title: "이전 제목", strategy: "motion_graphics" }] });
  let currentPlan = sourcePlan;
  const defects = [{ scene_id: "s1", shot_id: "s1a", code: "fake_text", layer: "captions" }];
  const calls = stub((url, init) => {
    const path = url.split("?")[0];
    if (path.endsWith(`/api/creative/v2/plans/${id}/production/repair`)) {
      currentPlan = { ...sourcePlan, revision: 2, approval: null, scenes: [{ ...scene(1, 16), title: "수정 제목", strategy: "motion_graphics" }] };
      return { status: "applied_needs_approval", source_revision: 1, revision: 2, quality_state: "unknown_until_new_review" };
    }
    if (path.endsWith(`/api/creative/v2/plans/${id}/approve`)) {
      currentPlan = { ...currentPlan, approval: { revision: 2, planned_frames: 480, planned_seconds: 16, fps: 30, approved_at: "2026-11-07T00:01:00Z" } };
      return currentPlan;
    }
    if (path.endsWith(`/api/creative/v2/plans/${id}/production/render`)) return productionFixture({ plan_revision: 2, caption_mode: "title_only", state: "rendering", dispatchable: false });
    if (path.endsWith(`/api/creative/v2/plans/${id}/production`) && init?.method === "POST") return productionFixture({ plan_revision: 2, caption_mode: "title_only", state: "ready_to_render", dispatchable: false });
    if (path.endsWith(`/api/creative/v2/plans/${id}/production`)) {
      if (currentPlan.revision === 1) return productionFixture({
        plan_revision: 1, caption_mode: "title_only", state: "qa_failed", dispatchable: false,
        final: { status: "qa_failed", id: "old-final", sha256: "a".repeat(64), size: 42, name: "old.mp4", qa: { passed: false, checks: [] }, planned_seconds: 16, duration: null, assembled_at: "2026-11-07T00:00:00Z", error: null },
        quality_report: { schema_version: 1, overall_verdict: "fail", machine_qa: { verdict: "fail", checks: [] }, semantic_qa: { verdict: "unknown", checks: [] }, viewing_qa: { verdict: "unknown", checks: [] }, defects, repair_plan: { schema_version: 1, status: "planned", actions: [], blocked: [], invalidate: { scene_ids: [], shot_ids: [], layers: [], segment_ids: [], final: false, quality_evidence: false }, preserve: { scene_ids: [], shot_ids: [], segment_run_keys: {}, asset_groups: [], asset_keys: [] } } },
        repair_plan: { schema_version: 1, status: "planned", plan_revision: 1, caption_mode: "title_only", proposal_sha256: "b".repeat(64), actions: [{ ...defects[0], strategy: "caption_edit" }], blocked: [], invalidate: { scene_ids: ["s1"], shot_ids: ["s1a"], layers: ["captions"], segment_ids: ["seg-01"], final: true, quality_evidence: true }, preserve: { scene_ids: [], shot_ids: [], segment_run_keys: {}, asset_groups: [], asset_keys: [] } },
      });
      return productionFixture({ plan_revision: 2, caption_mode: null, state: "not_dispatched", dispatchable: true });
    }
    if (path.endsWith(`/api/creative/v2/plans/${id}`)) return currentPlan;
    return currentPlan;
  });

  mount(`/creative/plan/${id}`);
  fireEvent.change(await screen.findByRole("textbox", { name: "수정 문구 s1" }), { target: { value: "수정 제목" } });
  fireEvent.click(screen.getByRole("button", { name: "문구 수정 적용 · 새 revision" }));
  await screen.findByText(/수정 내용이 r2에 적용됐습니다\. 상태: applied_needs_approval/);
  expect(screen.queryByRole("button", { name: "제작 시작 준비" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "이 예상 길이로 승인" }));
  await screen.findByRole("button", { name: "제작 시작 준비" });
  fireEvent.click(screen.getByRole("button", { name: "제작 시작 준비" }));
  await screen.findByRole("button", { name: "렌더 시작" });
  fireEvent.click(screen.getByRole("button", { name: "렌더 시작" }));
  await waitFor(() => expect(calls.some((call) => call.url.includes(`/api/creative/v2/plans/${id}/production?caption_mode=title_only`))).toBe(true));
  expect(calls.find((call) => call.url.includes("?caption_mode=title_only"))?.body).toEqual({ revision: 2 });
  expect(calls.find((call) => call.url.endsWith(`/api/creative/v2/plans/${id}/production/render`))?.body).toEqual({ revision: 2 });
  expect(sessionStorage.getItem(`creative-caption-mode:${id}`)).toBe("title_only");
});

test("revision comparison requests bound temporary links and can load an old caption as a draft", async () => {
  const plan = planFixture({ revision: 2, approval: { revision: 2, planned_frames: 5400, planned_seconds: 180, fps: 30, approved_at: "2026-11-07T00:00:00Z" }, render_gate: true, scenes: [{ ...scene(1, 90), title: "현재 제목" }, scene(2, 90)] });
  const oldSha = "1".repeat(64);
  const currentSha = "2".repeat(64);
  const calls = stub((url, init) => {
    if (url.split("?")[0].endsWith(`/api/creative/v2/plans/${plan.id}/production`)) return productionFixture({
      plan_revision: 2,
      state: "succeeded",
      final: { status: "qa_passed", id: "current-final", sha256: currentSha, size: 42, name: "current.mp4", qa: { passed: true, checks: [] }, planned_seconds: 180, duration: null, assembled_at: "2026-11-07T00:00:00Z", error: null },
      history: [
        { revision: 1, dispatched_at: "2026-11-06T00:00:00Z", final: "qa_passed", final_sha256: oldSha, snapshot_available: true },
        { revision: 2, dispatched_at: "2026-11-07T00:00:00Z", final: "qa_passed", final_sha256: currentSha, snapshot_available: true },
      ],
      repair_plan: {
        schema_version: 1, status: "planned", plan_revision: 2, caption_mode: "title_only", proposal_sha256: "c".repeat(64),
        actions: [{ scene_id: "s1", shot_id: "s1a", code: "fake_text", layer: "captions", strategy: "caption_edit" }], blocked: [],
        invalidate: { scene_ids: ["s1"], shot_ids: ["s1a"], layers: ["captions"], segment_ids: ["seg-01"], final: true, quality_evidence: true },
        preserve: { scene_ids: [], shot_ids: [], segment_run_keys: {}, asset_groups: [], asset_keys: [] },
      },
    });
    if (url.endsWith(`/api/creative/v2/plans/${plan.id}/production/revisions/1`)) return {
      plan_id: plan.id, revision: 1, scenes: [{ ...scene(1, 90), title: "이전 제목" }, scene(2, 90)], snapshot_available: true, producer_style_reviews: [], quality_report: null, review_execution: null,
      final: { id: "old-final", status: "qa_passed", sha256: oldSha, name: "old.mp4" }, segments: [], repairs: [{ changes: [{ scene_id: "s1", shot_id: "s1a", layer: "captions", field: "title", before: "원본 제목", after: "이전 제목" }] }],
    };
    if (url.endsWith(`/api/creative/v2/plans/${plan.id}/production/result-link`)) {
      const body = JSON.parse(String(init?.body));
      const sha256 = body.revision === 1 ? oldSha : currentSha;
      return { url: `/api/creative/v2/plans/${plan.id}/production/results/${body.revision}/final?token=temp`, expires_at: "2026-11-07T01:00:00Z", sha256, revision: body.revision, result_id: body.result_id };
    }
    return plan;
  });
  mount(`/creative/plan/${plan.id}`);
  await screen.findByRole("button", { name: "결과 영상 열기" });
  fireEvent.click(await screen.findByRole("button", { name: "직전 결과와 비교" }));
  await screen.findByLabelText("이전 revision 1 결과");
  await screen.findByLabelText("현재 revision 2 결과");
  fireEvent.click(await screen.findByRole("button", { name: "이전 문구를 수정 초안에 불러오기" }));
  expect(screen.getByRole("textbox", { name: "수정 문구 s1" })).toHaveProperty("value", "이전 제목");
  fireEvent.click(await screen.findByRole("button", { name: "수정 전 문구를 수정 초안에 불러오기" }));
  expect(screen.getByRole("textbox", { name: "수정 문구 s1" })).toHaveProperty("value", "원본 제목");
  const links = calls.filter((call) => call.url.endsWith(`/api/creative/v2/plans/${plan.id}/production/result-link`));
  expect(links.map((call) => call.body)).toEqual([{ revision: 2, result_id: "final" }, { revision: 1, result_id: "final" }]);
  expect(screen.getByText(/링크 SHA 222222222222/)).toBeTruthy();
});

function stub(handler: Handler) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: init?.method ?? "GET", body });
      const result = await handler(url, init);
      if (result instanceof Response) return result;
      return new Response(JSON.stringify(result), { status: 200 });
    }),
  );
  return calls;
}

function mount(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/creative/plan" element={<CreativePlanNewPage />} />
          <Route path="/creative/plan/:id" element={<CreativePlanDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mountPlanNew() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/creative/plan"]}><CreativePlanNewPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

test("a creator can make a plan directly from a brief with optional duration and aspect", async () => {
  const created = planFixture();
  const calls = stub((url, init) => {
    if (url.endsWith("/api/creative/projects")) return [];
    if (url.endsWith("/api/creative/v2/catalog")) return { catalogs: { C01: { name: "콘텐츠 유형", entries: [{ id: "C01.tech_explainer", name: "기술 설명" }] } } };
    if (url.endsWith("/api/creative/v2/plans") && init?.method === "POST") return created;
    if (url.endsWith("/api/creative/v2/plans")) return [];
    return created;
  });
  mountPlanNew();
  fireEvent.click(screen.getByText("구조화 계획 입력 (보조 경로)"));
  const submit = await screen.findByRole("button", { name: "장면 계획 만들기" });
  fireEvent.change(screen.getAllByPlaceholderText(/주제, 전달할 내용/)[1], { target: { value: "기술 설명 영상" } });
  fireEvent.click(screen.getByText("원하는 길이 (선택)"));
  fireEvent.click(screen.getByRole("radio", { name: "3분" }));
  fireEvent.change(screen.getByRole("combobox", { name: "화면 비율" }), { target: { value: "9:16" } });
  await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(submit);
  await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/creative/v2/plans") && c.method === "POST")).toBe(true));
  const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/creative/v2/plans"));
  expect(post?.body).toMatchObject({ brief: "기술 설명 영상", aspect: "9:16", duration: { mode: "preferred", seconds: 180 } });
  expect(post?.body).not.toHaveProperty("intent");
  expect(calls.some((call) => call.url.endsWith("/intent/validate"))).toBe(false);
});

test("storyboard is the default entry and structured plan input stays secondary", async () => {
  stub((url) => url.endsWith("/api/creative/projects") || url.endsWith("/api/creative/v2/plans") ? [] : { catalogs: {} });
  mount("/creative/plan");
  expect(await screen.findByRole("button", { name: "AI 장면 구성 만들기" })).toBeTruthy();
  expect(screen.getByText("구조화 계획 입력 (보조 경로)").closest("details")?.open).toBe(false);
  expect(screen.getByRole("button", { name: "장면 계획 만들기", hidden: true }).closest("details")?.open).toBe(false);
});

test("automatic duration is the default; invalid optional custom duration blocks submission", async () => {
  const calls = stub((url, init) => {
    if (url.endsWith("/api/creative/projects")) return [];
    if (url.endsWith("/api/creative/v2/plans") && init?.method === "POST") return planFixture();
    return [];
  });
  mount("/creative/plan");
  fireEvent.click(screen.getByText("구조화 계획 입력 (보조 경로)"));
  const submit = (await screen.findByRole("button", { name: "장면 계획 만들기" })) as HTMLButtonElement;
  fireEvent.change(screen.getAllByPlaceholderText(/주제, 전달할 내용/)[1], { target: { value: "내용" } });
  expect(submit.disabled).toBe(false);
  fireEvent.click(screen.getByText("원하는 길이 (선택)"));
  fireEvent.click(screen.getByRole("radio", { name: "직접 입력" }));
  fireEvent.change(screen.getByLabelText(/직접 입력 \(초/), { target: { value: "901" } });
  expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(/직접 입력 \(초/), { target: { value: "45" } });
  expect(submit.disabled).toBe(false);
  fireEvent.click(screen.getByRole("radio", { name: "자동" }));
  fireEvent.click(submit);
  await waitFor(() => expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/api/creative/v2/plans"))).toBe(true));
  expect(calls.find((call) => call.method === "POST" && call.url.endsWith("/api/creative/v2/plans"))?.body).toMatchObject({ brief: "내용", duration: { mode: "auto" } });
});

test("plan detail shows expected runtime, reasons, range, honest match status and gaps before render", async () => {
  stub(() => planFixture());
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  await screen.findByText("예상 러닝타임");
  expect(screen.getByLabelText("3분")).toBeTruthy();
  expect(screen.getByText("3:00")).toBeTruthy();
  expect(screen.getByText("희망에 맞춤")).toBeTruthy();
  expect(screen.getByText(/희망 3분은 콘텐츠 범위 안/)).toBeTruthy();
  expect(screen.getByRole("group", { name: "콘텐츠 필요 길이 범위" })).toBeTruthy();
  expect(screen.getByText("검증 필요")).toBeTruthy();
  expect(screen.getByText(/lab에서 수동 실행하는 수준/)).toBeTruthy();
  expect(screen.getByText(/render.dataviz/)).toBeTruthy();
  expect(screen.getByText(/R03 React 컴포넌트 조립/)).toBeTruthy();
  fireEvent.click(screen.getAllByText("장면 근거·목표 검사")[0]);
  expect(screen.getAllByText("qa.machine_video").length).toBeGreaterThan(0);
  expect(screen.getAllByText("tool.ffmpeg").length).toBeGreaterThan(0);
});

test("plan detail exposes why a 600-second preference deviated to 24 seconds", async () => {
  const base = planFixture();
  const deviated = planFixture({
    duration: {
      ...base.duration,
      status: "deviated",
      request: { mode: "preferred", seconds: 600 },
      planned_seconds: 24,
      planned_frames: 720,
      reasons: ["장면 3개만 있어 반복 없이 늘릴 수 있는 최대 24.0초로 정했습니다. 목표와 96% 차이입니다."],
      alternatives: [],
    },
  });
  stub(() => deviated);
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  await screen.findByText("예상 러닝타임");
  expect(screen.getByText("0:24")).toBeTruthy();
  expect(screen.getByText("희망과 차이")).toBeTruthy();
  expect(screen.getByText(/장면 3개만 있어 반복 없이 늘릴 수 있는 최대 24.0초/)).toBeTruthy();
});

test("editing a scene previews the new total and saving sends the revision for recomputation", async () => {
  const edited = planFixture({
    revision: 2,
    duration_check: { status: "ok", total_frames: 5520, total_seconds: 184, fps: 30, target_delta_seconds: 4, errors: [], warnings: [] },
    scenes: [scene(1, 94), scene(2, 90)],
  });
  const calls = stub((_url, init) => (init?.method === "PATCH" ? edited : planFixture()));
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  const inputs = (await screen.findAllByLabelText("길이(초)")) as HTMLInputElement[];
  const save = screen.getByRole("button", { name: "변경 저장·다시 계산" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(inputs[0], { target: { value: "94" } });
  expect(screen.getByText(/입력한 길이 합계 3분 4초/)).toBeTruthy();
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await screen.findByText("재계산 결과: 규칙을 지켜요");
  const patch = calls.find((c) => c.method === "PATCH");
  expect(patch?.body).toMatchObject({ revision: 1, scenes: [{ id: "s1", seconds: 94 }, { id: "s2", seconds: 90 }] });
  expect(screen.getByText(/요청과 \+4초/)).toBeTruthy();
});

test("a scene shorter than its speech floor warns, and invalid seconds block saving", async () => {
  stub(() => planFixture());
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  const inputs = (await screen.findAllByLabelText("길이(초)")) as HTMLInputElement[];
  const save = screen.getByRole("button", { name: "변경 저장·다시 계산" }) as HTMLButtonElement;
  fireEvent.change(inputs[0], { target: { value: "2" } });
  expect(screen.getByText("대사가 잘려요")).toBeTruthy();
  for (const bad of ["0", "-1", "NaN", "Infinity", "901", ""]) {
    fireEvent.change(inputs[0], { target: { value: bad } });
    expect(save.disabled).toBe(true);
  }
});

test("violations from the server are shown and approval stays disabled with the reasons", async () => {
  const violated = planFixture({
    revision: 3,
    duration: { ...planFixture().duration, request: { mode: "exact", seconds: 184 } },
    duration_check: {
      status: "violation",
      total_frames: 5190,
      total_seconds: 173.13,
      fps: 30,
      target_delta_seconds: -10.87,
      errors: ["장면 s2: 2.00초는 발화·최소 길이 9.61초보다 짧아 내용이 잘립니다."],
      warnings: [],
    },
    render_blockers: ["장면 s2: 2.00초는 발화·최소 길이 9.61초보다 짧아 내용이 잘립니다."],
  });
  stub(() => violated);
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  await screen.findByText("재계산 결과: 고쳐야 할 점이 있어요");
  const approve = screen.getByRole("button", { name: "이 예상 길이로 승인" }) as HTMLButtonElement;
  expect(approve.disabled).toBe(true);
  const reasons = screen.getByLabelText("승인할 수 없는 이유");
  expect(within(reasons).getByText(/내용이 잘립니다/)).toBeTruthy();
});

test("approving binds the approval to the revision and shows the frame count", async () => {
  const approved = planFixture({
    approval: { revision: 1, planned_frames: 5400, planned_seconds: 180, fps: 30, approved_at: "2026-10-22T00:00:00Z" },
    render_gate: true,
  });
  const calls = stub((url, init) => (url.includes("/production") ? productionFixture() : init?.method === "POST" ? approved : planFixture()));
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  const button = await screen.findByRole("button", { name: "이 예상 길이로 승인" });
  fireEvent.click(button);
  await screen.findByText("승인됨");
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({ revision: 1 });
  expect(screen.getByText("승인됨").closest("p")?.textContent).toContain("5400프레임");
});

test("a strict conflict shows no runtime, explains alternatives, and applies the feasible length", async () => {
  const conflict = planFixture({
    duration: {
      ...planFixture().duration,
      status: "conflict",
      deviation_level: "none",
      request: { mode: "exact", seconds: 30 },
      planned_seconds: null,
      planned_frames: null,
      reasons: ["정확히 30초로 지정됐지만 콘텐츠는 120~240초가 필요합니다."],
      alternatives: [
        { kind: "relax_to_feasible", label: "필요한 최소 길이로 조정", seconds: 120, detail: "정보를 지우지 않고 담을 수 있는 가장 짧은 길이는 120.0초입니다.", requires_user_approval: true, feasible: true },
        { kind: "speed_up_speech", label: "발화 3.20배속", seconds: 30, detail: "명료도 한계로 1.15배까지만 권합니다.", requires_user_approval: true, feasible: false },
      ],
    },
    render_blockers: ["길이 요청이 콘텐츠와 충돌합니다. 대안을 고르거나 장면을 직접 맞춰 주세요."],
  });
  const calls = stub((_url, init) => (init?.method === "PATCH" ? planFixture() : conflict));
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  await screen.findByText("길이 충돌");
  expect(screen.getByLabelText("계획 없음").textContent).toBe("—");
  expect(screen.getByText("현실적이지 않음")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "2분로 다시 계획" }));
  await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ revision: 1, duration: { mode: "preferred", seconds: 120 } });
});

test("an unconfirmed hint plan says the decision is not final", async () => {
  stub(() => planFixture({ intent_status: "unconfirmed_hint", render_blockers: ["의도가 확인되지 않았습니다(단어 힌트 초안)."] }));
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  await screen.findByText(/의도를 아직 확인하지 않았어요/);
  expect((screen.getByRole("button", { name: "이 예상 길이로 승인" }) as HTMLButtonElement).disabled).toBe(true);
});

test("a missing plan shows an error with a retry button", async () => {
  stub(() => new Response(JSON.stringify({ code: "not_found", message: "제작 계획이 없습니다." }), { status: 404 }));
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("제작 계획이 없습니다");
  expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeTruthy();
});

test("shows the split render plan as not executed, with resume keys and renderer limit warnings", async () => {
  const split = planFixture({
    render_plan: {
      segment_target_seconds: 60,
      requires_split: true,
      segments: [
        { id: "seg-01", scene_ids: ["s1", "s2"], start_frame: 0, end_frame: 1800, seconds: 60, input_sha256: "a".repeat(64) },
        { id: "seg-02", scene_ids: ["s3"], start_frame: 1800, end_frame: 2400, seconds: 20, input_sha256: "b".repeat(64) },
      ],
      join: { method: "concat_in_order", inputs: ["seg-01", "seg-02"] },
      resume: "구간의 input_sha256이 같고 산출물이 남아 있으면 그 구간은 다시 렌더하지 않는다.",
      executed: false,
      warnings: ["장면 s9이(가) 75초로 렌더러 장면 한도 60초를 넘습니다. 장면을 나눠야 합니다."],
    },
  });
  stub(() => split);
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  const summary = await screen.findByText(/분할 렌더 계획 · 2개 구간/);
  expect(summary.textContent).toContain("한 번에 렌더할 수 없는 길이");
  expect(screen.getByText(/아직 실행된 구간은 없어요/)).toBeTruthy();
  const list = screen.getByLabelText("렌더 구간");
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  expect(within(list).getByText(/seg-02 · 장면 1개 · .*키 bbbbbbbb/)).toBeTruthy();
  expect(within(screen.getByLabelText("렌더러 한도 경고")).getByText(/한도 60초/)).toBeTruthy();
});

test("an older server without render_plan still renders the approval panel", async () => {
  stub(() => planFixture());
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  await screen.findByRole("button", { name: "이 예상 길이로 승인" });
  expect(screen.queryByText(/분할 렌더 계획/)).toBeNull();
});

const approvedGate = () =>
  planFixture({
    approval: { revision: 1, planned_frames: 5400, planned_seconds: 180, fps: 30, approved_at: "2026-10-22T00:00:00Z" },
    render_gate: true,
  });

test("the production panel stays hidden until the render gate is open", async () => {
  const calls = stub(() => planFixture());
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  await screen.findByRole("button", { name: "이 예상 길이로 승인" });
  expect(screen.queryByText("제작 연결")).toBeNull();
  expect(calls.some((c) => c.url.includes("/production"))).toBe(false);
});

const ENGINE = { adapter: "skill.v1_ffmpeg_slideshow", version: "ffmpeg version 7.1" };
const SEG = {
  id: "seg-01",
  scene_ids: ["s1", "s2", "s3"],
  seconds: 25.8,
  status: "pending" as const,
  attempts: 0,
  error: null,
  project_id: null,
  job_id: null,
  run_key: null,
  metrics: null,
};

test("a dispatchable approved plan is prepared, then asks for scene images and music", async () => {
  const calls = stub((url, init) => {
    if (url.includes("/production?") && init?.method === "POST") {
      return productionFixture({
        state: "awaiting_assets",
        dispatchable: false,
        reasons: ["장면 s1에 이미지가 없습니다.", "음악 자산이 없습니다."],
        engine: ENGINE,
        segments: [SEG],
      });
    }
    if (url.includes("/production")) return productionFixture();
    return approvedGate();
  });
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  fireEvent.click(await screen.findByRole("button", { name: "제작 시작 준비" }));
  await screen.findByText("이미지·음악 자산을 기다리는 중");
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({ revision: 1 });
  expect(calls.find((c) => c.method === "POST")?.url).toContain("?caption_mode=narration");
  expect(within(screen.getByLabelText("제작을 진행할 수 없는 이유")).getByText("음악 자산이 없습니다.")).toBeTruthy();
  expect(screen.getByText(/skill\.v1_ffmpeg_slideshow \(ffmpeg version 7\.1\)/)).toBeTruthy();
  expect(within(screen.getByLabelText("장면 이미지")).getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByLabelText("음악 파일")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "렌더 시작" })).toBeNull();
  expect(screen.getByText(/현재 제작 기록의 엔진: skill\.v1_ffmpeg_slideshow/)).toBeTruthy();
});

test("uploading a scene image posts multipart form data with the scene id and refreshes the state", async () => {
  const uploads: FormData[] = [];
  stub((url, init) => {
    if (url.endsWith("/production/assets") && init?.method === "POST") {
      uploads.push(init.body as FormData);
      return { id: "a1", sha256: "x", name: "s1.png" };
    }
    if (url.includes("/production")) {
      return productionFixture({ state: "awaiting_assets", dispatchable: false, engine: ENGINE, segments: [SEG] });
    }
    return approvedGate();
  });
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  const input = (await screen.findByLabelText("장면 s1 이미지")) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([new Uint8Array([1, 2, 3])], "s1.png", { type: "image/png" })] } });
  await waitFor(() => expect(uploads).toHaveLength(1));
  expect(uploads[0].get("kind")).toBe("scene");
  expect(uploads[0].get("scene_id")).toBe("s1");
  expect((uploads[0].get("file") as File).name).toBe("s1.png");
});

test("R21 offers automatic asset generation and refreshes its execution state", async () => {
  const r21 = planFixture({ match: { ...planFixture().match, primary_recipe: "R21" } });
  const plan = { ...r21, approval: approvedGate().approval, render_gate: true };
  let started = false;
  const calls = stub((url, init) => {
    if (url.endsWith("/production/generate-assets") && init?.method === "POST") {
      started = true;
      return { plan_id: r21.id, plan_revision: 1, status: "queued" };
    }
    if (url.includes("/production")) return productionFixture({
      state: "awaiting_assets",
      dispatchable: false,
      engine: ENGINE,
      asset_generation: started ? {
        id: "gen-1", plan_revision: 1, recipe_id: "R21", status: "running",
        engine: { id: "creative-v2.managed-comfy+supertonic+acestep", version: "real" },
        assets: { scenes: { s1: { id: "image-s1", sha256: "sha-image" } }, voices: { s1: { id: "voice-s1", sha256: "sha-voice" } }, music: { id: "m", sha256: "sha" } }, receipt: null, error: null,
      } : null,
    });
    return plan;
  });
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  fireEvent.click(await screen.findByRole("button", { name: "장면 이미지·음성·음악 자동 생성" }));
  await waitFor(() => expect(calls.some((call) => call.url.endsWith("/production/generate-assets"))).toBe(true));
  expect(await screen.findByText(/자동 자산 생성: 실행 중/)).toBeTruthy();
  expect(screen.getByText(/생성 이미지 · image-s1/)).toBeTruthy();
  expect(screen.getByText(/장면 음성 · voice-s1/)).toBeTruthy();
});

test("a ready plan starts the render and shows per-segment engine state", async () => {
  const calls = stub((url, init) => {
    if (url.endsWith("/production/render") && init?.method === "POST") {
      return productionFixture({
        state: "rendering",
        dispatchable: false,
        engine: ENGINE,
        assets: { scenes_total: 3, scenes_with_asset: 3, missing_scene_ids: [], music: { id: "m", name: "m.wav", sha256: "x", duration: 30 }, music_problem: null, complete: true },
        segments: [{ ...SEG, status: "queued", attempts: 1, project_id: "p", job_id: "j", run_key: "k" }],
      });
    }
    if (url.includes("/production")) {
      return productionFixture({
        state: "ready_to_render",
        dispatchable: false,
        engine: ENGINE,
        assets: { scenes_total: 3, scenes_with_asset: 3, missing_scene_ids: [], music: { id: "m", name: "m.wav", sha256: "x", duration: 30 }, music_problem: null, complete: true },
        segments: [SEG],
      });
    }
    return approvedGate();
  });
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  fireEvent.click(await screen.findByRole("button", { name: "렌더 시작" }));
  expect((await screen.findAllByText("렌더 중", { selector: "span" })).length).toBeGreaterThan(0);
  expect(calls.some((c) => c.url.endsWith("/production/render") && c.method === "POST")).toBe(true);
  expect(within(screen.getByLabelText("제작 구간")).getByText(/seg-01 .* 큐 대기 · 1회 실행/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "렌더 시작" })).toBeNull();
});

test("a failed segment offers a retry and shows the engine error", async () => {
  const calls = stub((url, init) => {
    if (url.includes("/production/render") && init?.method === "POST") return productionFixture({ state: "rendering", dispatchable: false, engine: ENGINE, segments: [{ ...SEG, status: "running", attempts: 2 }] });
    if (url.includes("/production")) {
      return productionFixture({
        state: "failed",
        dispatchable: false,
        reasons: ["구간 seg-01: 장면 s3의 이미지를 읽을 수 없습니다."],
        engine: ENGINE,
        segments: [{ ...SEG, status: "failed", attempts: 1, error: "장면 s3의 이미지를 읽을 수 없습니다.", project_id: "p" }],
      });
    }
    return approvedGate();
  });
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  fireEvent.click(await screen.findByRole("button", { name: "실패한 구간 다시 시도" }));
  expect((await screen.findAllByText("렌더 중", { selector: "span" })).length).toBeGreaterThan(0);
  expect(calls.some((c) => c.url.endsWith("/production/render") && c.method === "POST")).toBe(true);
});

test("a finished render shows measured QA checks, the duration deviation and opens the media through a signed link", async () => {
  const calls = stub((url, init) => {
    if (url.endsWith("/production/media-link") && init?.method === "POST") return { url: "/api/creative/v2/plans/x/production/media/m1?token=t" };
    if (url.includes("/production")) {
      return productionFixture({
        state: "succeeded",
        dispatchable: false,
        engine: ENGINE,
        assets: { scenes_total: 3, scenes_with_asset: 3, missing_scene_ids: [], music: { id: "m", name: "m.wav", sha256: "x", duration: 30 }, music_problem: null, complete: true },
        segments: [{ ...SEG, status: "succeeded", attempts: 1, project_id: "p", job_id: "j", run_key: "k", metrics: { elapsed_seconds: 3, peak_rss_bytes: 1, cached_scenes: 2 } }],
        final: {
          status: "qa_passed",
          id: "m1",
          sha256: "s",
          size: 1000,
          name: "영상.mp4",
          planned_seconds: 25.8,
          duration: { requested: { mode: "preferred", seconds: 600 }, plan_status: "deviated", planned_seconds: 25.8, measured_seconds: 25.8 },
          assembled_at: "t",
          error: null,
          qa: {
            passed: true,
            checks: [
              { id: "resolution", passed: true, detail: "기대 1280x720", measured: "1280x720" },
              { id: "audible", passed: true, detail: "오디오 최대 음량 -60 dB 초과", measured: { mean_db: -20, max_db: -9 } },
            ],
          },
        },
      });
    }
    return approvedGate();
  });
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  await screen.findByText("렌더 완료·검사 통과");
  const checks = screen.getByLabelText("결과 검사 항목");
  expect(within(checks).getByText(/통과 · 기대 1280x720 · 측정 1280x720/)).toBeTruthy();
  expect(screen.getByText(/요청 길이 .*계획 .*\(deviated\) · 실제/)).toBeTruthy();
  expect(screen.getByText(/장면 2개 재사용/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "결과 영상 열기" }));
  const video = await screen.findByLabelText("결과 영상");
  expect(video.getAttribute("src")).toContain("/production/media/m1?token=t");
  expect(calls.find((c) => c.url.endsWith("/production/media-link"))?.body).toEqual({ id: "m1" });
});

test("a failed QA never offers the media", async () => {
  stub((url) =>
    url.includes("/production")
      ? productionFixture({
          state: "qa_failed",
          dispatchable: false,
          reasons: ["검은 화면 비율 90% 미만"],
          engine: ENGINE,
          segments: [{ ...SEG, status: "succeeded", attempts: 1 }],
          final: {
            status: "qa_failed", id: "m1", sha256: "s", size: 1, name: "a.mp4", planned_seconds: 10, duration: null, assembled_at: "t", error: null,
            qa: { passed: false, checks: [{ id: "not_black", passed: false, detail: "검은 화면 비율 90% 미만", measured: 1 }] },
          },
        })
      : approvedGate(),
  );
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  await screen.findByText("검사 실패");
  expect(screen.getByLabelText("결과 검사 항목")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "결과 영상 열기" })).toBeNull();
});

test("a plan the engine cannot take shows why instead of a dispatch button", async () => {
  stub((url) =>
    url.includes("/production")
      ? productionFixture({ dispatchable: false, reasons: ["필수 의존성 없음: 한국어 자막 글꼴이 없습니다."] })
      : approvedGate(),
  );
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  await screen.findByText("아직 엔진으로 보내지 않음");
  expect(screen.getByText(/필수 의존성 없음/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "제작 시작 준비" })).toBeNull();
});

test("an approved plan whose gate is closed shows the server's gate reasons, not a promise of a later step", async () => {
  const closed = planFixture({
    approval: { revision: 1, planned_frames: 5400, planned_seconds: 180, fps: 30, approved_at: "2026-10-22T00:00:00Z" },
    render_gate: false,
    render_gate_reasons: ["실행 범위가 lab_manual(ready_unverified)라 스튜디오 렌더러로 실행할 수 없습니다. 승인은 계획 확정까지만 의미합니다."],
  });
  const calls = stub(() => closed);
  mount("/creative/plan/11111111-1111-4111-8111-111111111111");
  const list = await screen.findByLabelText("스튜디오 렌더러로 실행할 수 없는 이유");
  expect(within(list).getByText(/lab_manual/)).toBeTruthy();
  expect(screen.queryByText("제작 연결")).toBeNull();
  expect(calls.some((c) => c.url.includes("/production"))).toBe(false);
});
