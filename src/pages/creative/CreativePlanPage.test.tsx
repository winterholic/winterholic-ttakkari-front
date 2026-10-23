import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import type { CreativePlan, ProductionView } from "../../api/creativeV2";
import { CreativePlanDetailPage, CreativePlanNewPage } from "./CreativePlanPage";

vi.mock("../../shell/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
    engine: null,
    outdated_segments: [],
    segments: [],
    final: null,
    log: [],
    ...overrides,
  };
}

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

test("creating a plan requires confirmed structured intent and sends the chosen duration", async () => {
  const created = planFixture();
  const calls = stub((url, init) => {
    if (url.endsWith("/api/creative/v2/catalog")) return { catalogs: { C01: { name: "콘텐츠 유형", entries: [{ id: "C01.tech_explainer", name: "기술 설명" }] } } };
    if (url.endsWith("/api/creative/v2/intent/validate")) return { valid: true, needs_confirmation: false, errors: [], warnings: [] };
    if (url.endsWith("/api/creative/v2/plans") && init?.method === "POST") return created;
    if (url.endsWith("/api/creative/v2/plans")) return [];
    return created;
  });
  mountPlanNew();
  const submit = await screen.findByRole("button", { name: "계획 만들기" });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByPlaceholderText(/주제, 분위기/), { target: { value: "기술 설명 영상" } });
  fireEvent.click(screen.getByRole("button", { name: "직접 의도 작성" }));
  fireEvent.change(screen.getByRole("combobox", { name: "콘텐츠 형식" }), { target: { value: "C01.tech_explainer" } });
  fireEvent.change(screen.getByRole("textbox", { name: "근거 문구" }), { target: { value: "기술 설명" } });
  fireEvent.click(screen.getByRole("button", { name: "의도 검증 후 확인" }));
  await waitFor(() => expect(calls.some((call) => call.url.endsWith("/intent/validate"))).toBe(true));
  await screen.findByText("검증을 통과했고 사용자가 확인했습니다.");
  fireEvent.click(screen.getByRole("radio", { name: "3분" }));
  fireEvent.click(screen.getByRole("radio", { name: "정확히" }));
  await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(submit);
  await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/creative/v2/plans") && c.method === "POST")).toBe(true));
  const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/creative/v2/plans"));
  expect(post?.body).toMatchObject({ brief: "기술 설명 영상", duration: { mode: "exact", seconds: 180 }, intent: { extraction: { method: "user_structured" }, duration: { mode: "exact", seconds: 180 }, selections: [{ entry_id: "C01.tech_explainer", source: "user_explicit", evidence: [{ quote: "기술 설명" }] }] } });
});

test("AI intent draft runs through Ttakkari and exposes editable structured fields", async () => {
  const calls = stub((url, init) => {
    if (url.endsWith("/api/creative/v2/intent/runs") && init?.method === "POST") {
      return {
        session_id: "session-1", run_id: "run-1", status: "queued", engine: "qwen-local", model: "Qwen3.8-Flash-Next-Q2_K",
      };
    }
    if (url.endsWith("/api/creative/v2/intent/runs/run-1")) {
      return {
        session_id: "session-1", run_id: "run-1", status: "succeeded", engine: "qwen-local",
        model: "Qwen3.8-Flash-Next-Q2_K", profile: "Qwen local (personal)", error: null,
        brief: "기술 설명 영상으로 요청을 받아 검증하는 과정을 만들어줘",
        intent: {
          schema_version: 1,
          selections: [{ entry_id: "C01.tech_explainer", role: "primary", source: "llm_inferred", strength: "soft", confidence: 0.8, evidence: [{ quote: "기술 설명" }] }],
          constraints: [], duration: { mode: "auto", seconds: null, platform: null, source: null, as_of: null },
          aspect: "16:9", info_items: [{ id: "i1", title: "요청 흐름", narration: "요청을 받아 검증하는 과정", weight: 1, essential: false, evidence: [{ quote: "요청을 받아 검증하는 과정" }] }],
          music_seconds: null, open_questions: ["AI가 제안한 의도와 근거를 확인해 주세요."],
          extraction: { method: "llm", model: "Qwen3.8-Flash-Next-Q2_K" },
        },
        validation: { valid: true, needs_confirmation: true, errors: [], warnings: [{ code: "semantic_support_unverified", message: "인용이 브리프에 존재하는지는 확인했지만, 의미적으로 뒷받침하는지는 자동 검증하지 않았습니다.", path: "intent" }] },
        selection_labels: [{ entry_id: "C01.tech_explainer", catalog: "콘텐츠 유형", name: "기술 설명" }],
        review_required: true,
      };
    }
    if (url.endsWith("/api/creative/v2/intent/validate")) return { valid: true, needs_confirmation: false, errors: [], warnings: [] };
    if (url.endsWith("/api/creative/v2/plans") && init?.method === "POST") return planFixture();
    if (url.includes("/api/creative/v2/plans/")) return planFixture();
    if (url.endsWith("/api/creative/v2/plans")) return [];
    if (url.endsWith("/api/creative/v2/catalog")) {
      return { catalogs: { C01: { name: "콘텐츠 유형", entries: [{ id: "C01.tech_explainer", name: "기술 설명" }] } } };
    }
    return {};
  });
  mountPlanNew();
  fireEvent.change(await screen.findByPlaceholderText(/주제, 분위기/), { target: { value: "기술 설명 영상으로 요청을 받아 검증하는 과정을 만들어줘" } });
  fireEvent.click(screen.getByRole("button", { name: "AI로 의도 분석" }));
  expect(await screen.findByRole("combobox", { name: "콘텐츠 형식" })).toBeTruthy();
  expect(await screen.findByText(/의미적으로 뒷받침하는지는 자동 검증하지 않았습니다/)).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "근거 문구" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "전달할 내용" })).toBeTruthy();
  expect(calls.some((c) => c.url.endsWith("/api/creative/v2/intent/runs") && c.method === "POST")).toBe(true);
  expect(calls.some((c) => c.url.endsWith("/api/creative/v2/intent/runs/run-1"))).toBe(true);
  const submit = screen.getByRole("button", { name: "계획 만들기" }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "근거 문구" }), { target: { value: "기술 설명" } });
  fireEvent.click(screen.getByRole("button", { name: "확인하고 닫기" }));
  fireEvent.click(screen.getByRole("button", { name: "의도 검증 후 확인" }));
  await screen.findByText("검증을 통과했고 사용자가 확인했습니다.");
  fireEvent.click(screen.getByRole("radio", { name: "3분" }));
  await waitFor(() => expect(submit.disabled).toBe(false));
  fireEvent.click(submit);
  await waitFor(() => expect(calls.some((c) => c.url.endsWith("/api/creative/v2/plans") && c.method === "POST")).toBe(true));
  const created = calls.find((c) => c.url.endsWith("/api/creative/v2/plans") && c.method === "POST");
  expect(created?.body).toMatchObject({
    intent: { extraction: { method: "user_structured", model: null }, selections: [{ source: "llm_inferred", strength: "soft", evidence: [{ quote: "기술 설명" }] }] },
  });
});

test("late intent response from an edited brief is not attached to the current brief", async () => {
  let finishStart: ((value: unknown) => void) | undefined;
  const calls = stub((url, init) => {
    if (url.endsWith("/api/creative/v2/intent/runs") && init?.method === "POST") {
      return new Promise((resolve) => { finishStart = resolve; });
    }
    if (url.endsWith("/api/creative/v2/catalog")) return { catalogs: {} };
    return [];
  });
  mountPlanNew();
  const brief = await screen.findByPlaceholderText(/주제, 분위기/);
  fireEvent.change(brief, { target: { value: "이전 브리프" } });
  fireEvent.click(screen.getByRole("button", { name: "AI로 의도 분석" }));
  fireEvent.change(brief, { target: { value: "새 브리프" } });
  await waitFor(() => expect(finishStart).toBeDefined());
  finishStart?.({ session_id: "session-old", run_id: "run-old", status: "queued", engine: "qwen-local", model: "qwen" });
  expect(calls.some((call) => call.url.endsWith("/intent/runs/run-old"))).toBe(false);
  await waitFor(() => expect(calls.some((call) => call.url.endsWith("/api/runs/run-old/cancel"))).toBe(true));
  expect(screen.queryByText("AI 의도 초안")).toBeNull();
});

test("only the newest extraction request can attach a draft after overlapping brief edits", async () => {
  const completions: Array<(value: unknown) => void> = [];
  const calls = stub((url, init) => {
    if (url.endsWith("/api/creative/v2/intent/runs") && init?.method === "POST") {
      return new Promise((resolve) => { completions.push(resolve); });
    }
    if (url.endsWith("/api/creative/v2/catalog")) return { catalogs: {} };
    return [];
  });
  mountPlanNew();
  const brief = await screen.findByPlaceholderText(/주제, 분위기/);
  fireEvent.change(brief, { target: { value: "새 브리프에 겹치는 공통 문구" } });
  fireEvent.click(screen.getByRole("button", { name: "AI로 의도 분석" }));
  await waitFor(() => expect(completions).toHaveLength(1));

  fireEvent.change(brief, { target: { value: "수정된 새 브리프에 겹치는 공통 문구" } });
  fireEvent.click(screen.getByRole("button", { name: "AI로 의도 분석" }));
  await waitFor(() => expect(completions).toHaveLength(2));
  completions[1]({ session_id: "session-b", run_id: "run-b", status: "queued", engine: "qwen-local", model: "qwen" });
  await waitFor(() => expect(calls.some((call) => call.url.endsWith("/intent/runs/run-b"))).toBe(true));

  completions[0]({ session_id: "session-a", run_id: "run-a", status: "queued", engine: "qwen-local", model: "qwen" });
  await waitFor(() => expect(calls.some((call) => call.url.endsWith("/api/runs/run-a/cancel"))).toBe(true));
  expect(calls.some((call) => call.url.endsWith("/intent/runs/run-a"))).toBe(false);
  expect((brief as HTMLTextAreaElement).value).toBe("수정된 새 브리프에 겹치는 공통 문구");
});

test("reviewed desired duration and aspect reach creation unless the user changes them", async () => {
  const calls = stub((url, init) => {
    if (url.endsWith("/api/creative/v2/intent/runs") && init?.method === "POST") {
      return { session_id: "session-1", run_id: "run-1", status: "queued", engine: "qwen-local", model: "qwen" };
    }
    if (url.endsWith("/api/creative/v2/intent/runs/run-1")) return {
      session_id: "session-1", run_id: "run-1", status: "succeeded", engine: "qwen-local", model: "qwen", profile: "Qwen", error: null,
      brief: "정확히 3분, 세로 9:16 기술 설명",
      intent: {
        schema_version: 1,
        selections: [{ entry_id: "C01.tech_explainer", role: "primary", source: "llm_inferred", strength: "soft", confidence: 0.8, evidence: [{ quote: "기술 설명" }] }],
        constraints: [], duration: { mode: "preferred", seconds: 180, platform: null, source: null, as_of: null },
        aspect: "9:16", info_items: [], music_seconds: null, open_questions: [], extraction: { method: "llm", model: "qwen" },
      },
      validation: { valid: true, needs_confirmation: true, errors: [], warnings: [] }, selection_labels: [], review_required: true,
    };
    if (url.endsWith("/api/creative/v2/intent/validate")) return { valid: true, needs_confirmation: false, errors: [], warnings: [] };
    if (url.endsWith("/api/creative/v2/plans") && init?.method === "POST") return planFixture();
    if (url.endsWith("/api/creative/v2/catalog")) return { catalogs: { C01: { name: "형식", entries: [{ id: "C01.tech_explainer", name: "기술 설명" }] } } };
    return [];
  });
  mountPlanNew();
  fireEvent.change(await screen.findByPlaceholderText(/주제, 분위기/), { target: { value: "정확히 3분, 세로 9:16 기술 설명" } });
  fireEvent.click(screen.getByRole("button", { name: "AI로 의도 분석" }));
  await screen.findByRole("combobox", { name: "콘텐츠 형식" });
  expect((screen.getByRole("radio", { name: "3분" }) as HTMLButtonElement).getAttribute("aria-checked")).toBe("true");
  expect((screen.getByRole("combobox", { name: "화면 비율" }) as HTMLSelectElement).value).toBe("9:16");
  fireEvent.click(screen.getByRole("button", { name: "의도 검증 후 확인" }));
  await screen.findByText("검증을 통과했고 사용자가 확인했습니다.");
  const submit = screen.getByRole("button", { name: "계획 만들기" });
  await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(submit);
  await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/creative/v2/plans"))).toBe(true));
  const created = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/creative/v2/plans"));
  expect(created?.body).toMatchObject({
    duration: { mode: "preferred", seconds: 180 }, aspect: "9:16",
    intent: { duration: { mode: "preferred", seconds: 180 }, aspect: "9:16", selections: [{ source: "llm_inferred", strength: "soft" }] },
  });
});

test("auto length is the default request and an invalid custom length blocks submission", async () => {
  const calls = stub((url, init) => {
    if (url.endsWith("/api/creative/v2/catalog")) return { catalogs: { C01: { name: "콘텐츠 유형", entries: [{ id: "C01.tech_explainer", name: "기술 설명" }] } } };
    if (url.endsWith("/api/creative/v2/intent/validate")) return { valid: true, needs_confirmation: false, errors: [], warnings: [] };
    return init?.method === "POST" ? planFixture() : [];
  });
  mount("/creative/plan");
  const submit = (await screen.findByRole("button", { name: "계획 만들기" })) as HTMLButtonElement;
  fireEvent.change(screen.getByPlaceholderText(/주제, 분위기/), { target: { value: "내용" } });
  fireEvent.click(screen.getByRole("button", { name: "직접 의도 작성" }));
  fireEvent.change(screen.getByRole("combobox", { name: "콘텐츠 형식" }), { target: { value: "C01.tech_explainer" } });
  fireEvent.change(screen.getByRole("textbox", { name: "근거 문구" }), { target: { value: "내용" } });
  fireEvent.click(screen.getByRole("button", { name: "의도 검증 후 확인" }));
  await waitFor(() => expect(calls.some((call) => call.url.endsWith("/intent/validate"))).toBe(true));
  await screen.findByText("검증을 통과했고 사용자가 확인했습니다.");
  await waitFor(() => expect(submit.disabled).toBe(false));
  fireEvent.click(screen.getByRole("radio", { name: "직접 입력" }));
  expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(/직접 입력 \(초/), { target: { value: "901" } });
  expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(/직접 입력 \(초/), { target: { value: "45" } });
  expect(submit.disabled).toBe(false);
  fireEvent.click(screen.getByRole("radio", { name: "자동" }));
  fireEvent.click(submit);
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/api/creative/v2/plans"))?.body).toMatchObject({ duration: { mode: "auto" } });
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
    if (url.endsWith("/production") && init?.method === "POST") {
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
  expect(within(screen.getByLabelText("제작을 진행할 수 없는 이유")).getByText("음악 자산이 없습니다.")).toBeTruthy();
  expect(screen.getByText(/skill\.v1_ffmpeg_slideshow \(ffmpeg version 7\.1\)/)).toBeTruthy();
  expect(within(screen.getByLabelText("장면 이미지")).getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByLabelText("음악 파일")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "렌더 시작" })).toBeNull();
  expect(screen.getByText(/정지 이미지 슬라이드쇼 하나/)).toBeTruthy();
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
  await screen.findByText("렌더 중", { selector: "span" });
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
  await screen.findByText("렌더 중", { selector: "span" });
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
