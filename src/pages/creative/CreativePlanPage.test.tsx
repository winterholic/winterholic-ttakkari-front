import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import type { CreativePlan } from "../../api/creativeV2";
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

function stub(handler: Handler) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
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
        validation: { valid: true, needs_confirmation: true, errors: [], warnings: [] },
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
  const calls = stub((_url, init) => (init?.method === "POST" ? approved : planFixture()));
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
