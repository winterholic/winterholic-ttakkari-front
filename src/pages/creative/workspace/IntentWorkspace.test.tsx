import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { IntentResolveRequest, IntentResolveResult, IntentSpecV2 } from "../../../api/creativeV2";
import fx from "./fixtures/intent-v2-local-backend.json";
import { IntentWorkspace, createPlanFromIntent } from "./IntentWorkspace";
import { buildLabels } from "./intentModel";

// fixtures/intent-v2-local-backend.json 은 intent v2 브랜치(aeb19745)를 로컬로 띄워 받은 실제 resolve·facets·catalog 응답이다.
type Reply = IntentResolveResult | ((req: IntentResolveRequest) => IntentResolveResult);
const fixture = (key: string) => (fx as unknown as Record<string, IntentResolveResult>)[key];

function stub(resolve: Reply, extra?: (url: string, init?: RequestInit) => unknown) {
  const calls: Array<{ url: string; method: string; body: Record<string, any> }> = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? "GET", body });
    const custom = extra?.(url, init);
    if (custom !== undefined) return custom instanceof Response ? custom : new Response(JSON.stringify(custom), { status: 200 });
    if (url.endsWith("/api/creative/v2/catalog")) return new Response(JSON.stringify(fx.catalog), { status: 200 });
    if (url.endsWith("/api/creative/v2/intent/facets")) return new Response(JSON.stringify(fx.facets), { status: 200 });
    if (url.endsWith("/api/creative/v2/intent/resolve")) return new Response(JSON.stringify(typeof resolve === "function" ? resolve(body) : resolve), { status: 200 });
    return new Response("[]", { status: 200 });
  }));
  return calls;
}
const resolveCalls = (calls: ReturnType<typeof stub>) => calls.filter((c) => c.url.endsWith("/intent/resolve"));

function mount() {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/creative"]}>
        <Routes><Route path="/creative" element={<IntentWorkspace />} /><Route path="/creative/plan/:id" element={<p>계획 화면</p>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const type = async (text: string) => {
  fireEvent.change(await screen.findByLabelText("만들고 싶은 콘텐츠"), { target: { value: text } });
};
const activeGroups = () => [...document.querySelectorAll(".cw-group")].map((e) => e.getAttribute("data-group"));
const slow = { timeout: 4000 };

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("scenarios A, B, C draw different active groups from the resolve result, not 12 catalogs", async () => {
  const seen: Record<string, string[]> = {};
  for (const [key, brief] of [["A", "일본 애니 SF 공포 액션 2분"], ["B", "Kafka 16초"], ["C", "감성 뮤직비디오 3분"]] as const) {
    const calls = stub(fixture(`scenario${key}`));
    mount();
    await type(brief);
    await waitFor(() => expect(document.querySelector(".cw-group")).toBeTruthy(), slow);
    seen[key] = activeGroups() as string[];
    expect(resolveCalls(calls)[0].body).toMatchObject({ brief, read_free_text: true });
    expect(resolveCalls(calls)[0].body.intent).toBeNull();
    // 시작 축 4개만 보이고 카탈로그 12개를 나열하지 않는다.
    expect(document.querySelectorAll(".cw-dim").length).toBe(4);
    cleanup(); vi.unstubAllGlobals();
  }
  expect(seen.A).toContain("horror");
  expect(seen.A).toContain("character");
  expect(seen.B).toContain("diagram");
  expect(seen.B).not.toContain("horror");
  expect(seen.C).toContain("music");
  expect(seen.C).toContain("lyrics");
  expect(new Set([seen.A.join(), seen.B.join(), seen.C.join()]).size).toBe(3);
});

test("duplicate questions are not drawn twice and each question carries the server recommendation with its reason", async () => {
  stub(fixture("scenarioA"));
  mount();
  await type("일본 애니 SF 공포 액션");
  await waitFor(() => expect(document.querySelector(".cw-group")).toBeTruthy(), slow);
  const tempo = screen.getAllByText("전체 템포는 어떻게 가져갈까요?");
  expect(tempo.length).toBe(1);
  expect(screen.getAllByText(/AI 추천: 느리게 쌓다가 폭발/).length).toBeGreaterThan(0);
  // 숨긴 묶음(설명·가사 등)은 화면에 없고 전문 설정에서 열린다.
  expect(document.querySelector('[data-group="diagram"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /전문 설정 열기/ }));
  const dialog = await screen.findByRole("dialog", { name: "전문 설정" });
  expect(within(dialog).getByText("다이어그램·데이터 시각화")).toBeTruthy();
});

test("AI-inferred and sentence-read values look different from confirmed ones and can be confirmed at once", async () => {
  const calls = stub(fixture("scenarioB"));
  mount();
  await type("Kafka 16초");
  await waitFor(() => expect(document.querySelector(".cw-cond")).toBeTruthy(), slow);
  const chip = document.querySelector('.cw-cond[data-origin="ai_inferred"]');
  expect(chip?.textContent).toContain("기술 설명");
  expect(chip?.textContent).toContain("AI 추론");
  expect(document.querySelector('.cw-cond[data-origin="user_confirmed"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /읽은 값 \d+개 모두 확정/ }));
  await waitFor(() => expect(resolveCalls(calls).length).toBe(2), slow);
  const req = resolveCalls(calls)[1].body as IntentResolveRequest;
  expect(req.structured?.selections?.map((s) => s.id)).toContain("C01.tech_explainer");
  expect(req.intent?.revision).toBe(1);
});

test("an open duration conflict shows both candidates, blocks the next step, and choosing one unblocks it", async () => {
  const resolved = fixture("scenarioC_ready");
  const calls = stub((req) => (req.resolutions?.length ? resolved : fixture("scenarioC_conflict_confirmed")));
  mount();
  await type("감성 뮤직비디오 3분");
  const conflict = await screen.findByRole("group", { name: "길이 충돌" }, slow);
  expect(within(conflict).getByText("30초 (희망)")).toBeTruthy();
  expect(within(conflict).getByText("180초 (희망)")).toBeTruthy();
  expect(within(conflict).getByText(/“3분”/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "이 의도로 계획 만들기" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/충돌을 해결해 주세요/)).toBeTruthy();
  fireEvent.click(within(conflict).getByRole("button", { name: "30초 (희망) 선택" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "이 의도로 계획 만들기" }) as HTMLButtonElement).disabled).toBe(false), slow);
  const last = resolveCalls(calls).at(-1)!.body as IntentResolveRequest;
  expect(last.resolutions).toEqual([{ conflict_id: "conflict.duration", choice: "target:30" }]);
  // 열린 충돌의 확정 후보를 다시 실어 보내 사용자의 30초가 버려지지 않는다.
  expect(last.structured?.duration).toEqual({ mode: "target", seconds: 30 });
});

test("length policy and aspect are set in one place; a new length forgets the previous one", async () => {
  const calls = stub(fixture("scenarioC_ready"));
  mount();
  await type("감성 뮤직비디오 3분");
  await screen.findByRole("heading", { name: "길이와 화면 비율" }, slow);
  expect(screen.getAllByRole("radio", { name: /자동|희망|엄격/ }).length).toBe(3);
  fireEvent.click(screen.getByRole("radio", { name: "엄격" }));
  fireEvent.change(screen.getByLabelText(/원하는 길이/), { target: { value: "150" } });
  fireEvent.click(screen.getByRole("button", { name: "길이 적용" }));
  await waitFor(() => expect(resolveCalls(calls).length).toBe(2), slow);
  const req = resolveCalls(calls)[1].body as IntentResolveRequest;
  expect(req.structured?.duration).toEqual({ mode: "strict", seconds: 150 });
  expect(req.intent?.duration?.origin).toBe("default");
  expect(req.intent?.conflicts.some((c) => c.id === "conflict.duration")).toBe(false);
  fireEvent.click(screen.getByRole("radio", { name: "9:16 세로" }));
  await waitFor(() => expect(resolveCalls(calls).length).toBe(3), slow);
  expect((resolveCalls(calls)[2].body as IntentResolveRequest).structured?.aspect).toBe("9:16");
  // 30/60/120/240 같은 고정 템플릿 선택지는 없다.
  expect(screen.queryByRole("radio", { name: /^(30|60|120|240)초$/ })).toBeNull();
});

test("the next button creates the plan with the confirmed intent in the request body and navigates", async () => {
  const ready = fixture("scenarioC_ready");
  const calls = stub(ready, (url, init) => {
    if (url.endsWith("/api/creative/v2/plans") && init?.method === "POST") return { id: "plan-1", revision: 1, intent_v2: { revision: ready.intent.revision } };
    return undefined;
  });
  mount();
  await type("감성 뮤직비디오 3분");
  const next = await screen.findByRole("button", { name: "이 의도로 계획 만들기" });
  await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false), slow);
  fireEvent.click(next);
  await screen.findByText("계획 화면");
  const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/plans"))!;
  expect(post.body.intent_v2.schema_version).toBe(2);
  expect(post.body.intent_v2.conditions.some((c: { id: string; origin: string }) => c.id === "C01.music_video" && c.origin === "user_confirmed")).toBe(true);
  expect(post.body.intent_v2.duration).toMatchObject({ mode: "target", seconds: 30 });
  expect(post.body).not.toHaveProperty("duration");
  expect(post.body).not.toHaveProperty("aspect");
});

test("a rejected intent never creates a fallback plan without the selected conditions", async () => {
  const intent = fixture("scenarioC_ready").intent as IntentSpecV2;
  const labels = buildLabels(fx.catalog as never, fx.facets as never);
  const bodies: Array<Record<string, any>> = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.stubGlobal("fetch", vi.fn(async (_: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length === 1
      ? new Response(JSON.stringify({ detail: [{ type: "extra_forbidden" }] }), { status: 422 })
      : new Response(JSON.stringify({ id: "plan-2", revision: 1 }), { status: 200 });
  }));
  await expect(createPlanFromIntent(intent, "", labels)).rejects.toMatchObject({ status: 422 });
  expect(bodies).toHaveLength(1);
  expect(bodies[0].intent_v2).toBeTruthy();
});

test("a server that accepts but ignores the field is also reported as not linked", async () => {
  const intent = fixture("scenarioC_ready").intent as IntentSpecV2;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "plan-3", revision: 1 }), { status: 200 })));
  const { link } = await createPlanFromIntent(intent, "brief", buildLabels(fx.catalog as never, fx.facets as never));
  expect(link).toEqual({ linked: false, revision: intent.revision });
});

test("a server without the intent contract says so instead of showing an empty form", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 })));
  mount();
  expect(await screen.findByText(/아직 제작 의도 v2를 지원하지 않아요/)).toBeTruthy();
});
