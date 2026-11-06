import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { StoryboardCreateFlow } from "./StoryboardCreateFlow";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stub(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: Array<{ url: string; method: string; body: unknown; key: string | null }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? "GET", body, key: headers.get("Idempotency-Key") });
    const result = handler(url, init);
    return result instanceof Response ? result : new Response(JSON.stringify(result), { status: 200 });
  }));
  return calls;
}

function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><StoryboardCreateFlow onAccepted={() => undefined} /></MemoryRouter>
  </QueryClientProvider>);
}

const story = {
  summary: "세 단계로 소개합니다.", catalog_ids: ["C08.three_act"],
  knowledge: [{ source_id: "brief", quote: "사용자가 준 내용", application: "도입 장면에 반영" }],
  scenes: [{ scene_id: "s1", title: "도입", narration: "요청 내용", seconds: 8, strategy: "slideshow", preset: null,
    rationale: "간단한 시작", source_ids: ["brief"], alternatives: [{ strategy: "code_motion", rationale: "다른 흐름" }],
    shots: [{ shot_id: "s1a", action: "제목을 보여 준다", layers: ["visual", "captions"], required_capabilities: ["edit.captions"] }] }],
};

test("submits the supported storyboard request once, reviews output and accepts its exact SHA", async () => {
  const calls = stub((url, init) => {
    if (url.endsWith("/storyboard/runs") && init?.method === "POST") return { run_id: "run-1", status: "queued", engine: "codex", model: null, session_id: "session-1" };
    if (url.endsWith("/storyboard/runs/run-1") && init?.method === "GET") return { run_id: "run-1", status: "succeeded", phase: "completed_needs_review", review_required: true, sources: [{ id: "brief", locator: "사용자 요청", text: "사용자가 준 내용" }], storyboard: story, output_sha256: "a".repeat(64), error: null };
    if (url.endsWith("/storyboard/runs/run-1/accept")) return { id: "plan-1", revision: 1, approval: null, director: { output_sha256: "a".repeat(64) } };
    return [];
  });
  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "사용자가 준 내용" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await screen.findByText("구성 요약");
  fireEvent.click(screen.getByRole("checkbox", { name: /출력 SHA/ }));
  fireEvent.click(screen.getByRole("button", { name: "이 출력으로 미승인 계획 만들기" }));
  await waitFor(() => expect(calls.some((c) => c.url.endsWith("/accept"))).toBe(true));
  expect(calls.find((c) => c.url.endsWith("/storyboard/runs") && c.method === "POST")?.body).toEqual({
    brief: "사용자가 준 내용", engine: "codex", sources: [{ id: "brief", locator: "사용자 요청", text: "사용자가 준 내용" }],
  });
  const start = calls.find((c) => c.url.endsWith("/storyboard/runs") && c.method === "POST");
  const accept = calls.find((c) => c.url.endsWith("/accept"));
  expect(start?.key).toBeTruthy();
  expect(accept?.body).toEqual({ reviewed_output_sha256: "a".repeat(64) });
  expect(calls.some((c) => c.url.endsWith("/approve") || c.url.endsWith("/production/render"))).toBe(false);
});

test("keeps the brief when the server rejects the new endpoint", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response('{"detail":"Not Found"}', { status: 404 })));
  mount();
  const brief = screen.getByLabelText("만들고 싶은 콘텐츠");
  fireEvent.change(brief, { target: { value: "입력 보존 확인" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/404|Not Found|미배포/);
  expect((brief as HTMLTextAreaElement).value).toBe("입력 보존 확인");
});

test("a 503 retry reuses the same idempotency key and never creates a lexical plan", async () => {
  let starts = 0;
  const calls = stub((url, init) => {
    if (url.endsWith("/storyboard/runs") && init?.method === "POST") {
      starts++;
      return starts === 1
        ? new Response('{"detail":"engine unavailable"}', { status: 503 })
        : { run_id: "run-retry", status: "queued", engine: "codex", model: null, session_id: "session" };
    }
    if (url.endsWith("/storyboard/runs/run-retry")) return { run_id: "run-retry", status: "running", phase: "running", review_required: true, sources: [], storyboard: null, error: null };
    return [];
  });
  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "재시도해도 중복 없이 입력 보존" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/HTTP 503|503|engine unavailable/);
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await screen.findByText(/실행 상태/);
  expect(calls.filter((call) => call.url.endsWith("/storyboard/runs") && call.method === "POST")).toHaveLength(2);
  expect(calls.filter((call) => call.url.endsWith("/storyboard/runs") && call.method === "POST").map((call) => call.key)).toEqual([
    calls[0].key, calls[0].key,
  ]);
  expect(calls.some((call) => call.url.endsWith("/plans") && call.method === "POST")).toBe(false);
});

test("cancellation and terminal resume follow the server phases without approving or rendering", async () => {
  let cancelled = false;
  const calls = stub((url, init) => {
    if (url.endsWith("/storyboard/runs") && init?.method === "POST") return { run_id: "run-live", status: "queued", engine: "codex", model: null, session_id: "session" };
    if (url.endsWith("/storyboard/runs/run-live/cancel")) { cancelled = true; return { status: "cancelled" }; }
    if (url.endsWith("/storyboard/runs/run-live/resume")) return { run_id: "run-resumed", status: "queued", engine: "codex", model: null, session_id: "session", resumed_from: "run-live" };
    if (url.endsWith("/storyboard/runs/run-live")) return cancelled
      ? { run_id: "run-live", status: "cancelled", phase: "cancelled", review_required: true, sources: [], storyboard: null, error: null }
      : { run_id: "run-live", status: "running", phase: "running", review_required: true, sources: [], storyboard: null, error: null };
    if (url.endsWith("/storyboard/runs/run-resumed")) return { run_id: "run-resumed", status: "succeeded", phase: "invalid_output", review_required: true, sources: [], storyboard: null, error: "schema mismatch" };
    return [];
  });
  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "취소 후 재개" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await screen.findByRole("button", { name: "취소 요청" });
  fireEvent.click(screen.getByRole("button", { name: "취소 요청" }));
  await screen.findByRole("button", { name: "이 Run 재개" });
  fireEvent.click(screen.getByRole("button", { name: "이 Run 재개" }));
  await screen.findByText(/검토할 수 없는 출력/);
  expect(calls.find((call) => call.url.endsWith("/run-live/resume"))?.body).toEqual({});
  expect(calls.find((call) => call.url.endsWith("/run-live/resume"))?.key).toBeTruthy();
  expect(calls.some((call) => call.url.endsWith("/approve") || call.url.endsWith("/production/render"))).toBe(false);
});

test("a stale accept refreshes the hash and requires a new review", async () => {
  let reads = 0;
  const calls = stub((url, init) => {
    if (url.endsWith("/storyboard/runs") && init?.method === "POST") return { run_id: "run-stale", status: "queued", engine: "codex", model: null, session_id: "session" };
    if (url.endsWith("/storyboard/runs/run-stale/accept")) return new Response('{"detail":"storyboard output changed"}', { status: 409 });
    if (url.endsWith("/storyboard/runs/run-stale")) {
      reads++;
      return { run_id: "run-stale", status: "succeeded", phase: "completed_needs_review", review_required: true, sources: [{ id: "brief", locator: "사용자 요청", text: "brief" }], storyboard: story, output_sha256: reads === 1 ? "a".repeat(64) : "b".repeat(64), error: null };
    }
    return { id: "plan" };
  });
  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "brief" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await screen.findByText("구성 요약");
  fireEvent.click(screen.getByRole("checkbox", { name: /출력 SHA/ }));
  fireEvent.click(screen.getByRole("button", { name: "이 출력으로 미승인 계획 만들기" }));
  expect((await screen.findByRole("status")).textContent).toMatch(/최신 서버 응답/);
  await waitFor(() => expect(screen.getByText(`검토 대기 · SHA-256 ${"b".repeat(64)}`)).toBeTruthy());
  expect((screen.getByRole("checkbox", { name: /출력 SHA/ }) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button", { name: "이 출력으로 미승인 계획 만들기" }) as HTMLButtonElement).disabled).toBe(true);
  expect(calls.filter((call) => call.url.endsWith("/accept"))).toHaveLength(1);
});
