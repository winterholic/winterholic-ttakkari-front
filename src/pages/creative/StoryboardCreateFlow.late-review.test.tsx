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

test("a removed document cannot return after a late read, and the latest brief stays in the review draft", async () => {
  let finishRead!: (value: string) => void;
  const delayed = new File(["unused"], "delayed.txt", { type: "text/plain" });
  delayed.text = () => new Promise<string>((resolve) => { finishRead = resolve; });
  const calls = stub((url, init) => url.endsWith("/storyboard/runs") && init?.method === "POST"
    ? { run_id: "run-stale-read", status: "queued", engine: "codex", model: null, session_id: "session" }
    : { run_id: "run-stale-read", status: "succeeded", phase: "completed_needs_review", review_required: true,
      sources: [{ id: "brief", locator: "사용자 요청", text: "최신 brief" }], storyboard: story, output_sha256: "a".repeat(64), error: null });
  mount();
  const brief = screen.getByLabelText("만들고 싶은 콘텐츠");
  fireEvent.change(brief, { target: { value: "이전 brief" } });
  const input = screen.getByLabelText("텍스트 참고 문서 (.txt, .md)");
  fireEvent.change(input, { target: { files: [delayed] } });
  fireEvent.change(brief, { target: { value: "최신 brief" } });
  fireEvent.click(await screen.findByRole("button", { name: "delayed.txt 제거" }));
  finishRead("늦게 도착한 본문");
  await waitFor(() => expect(screen.queryByText("delayed.txt")).toBeNull());

  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await screen.findByText("구성 요약");
  const start = calls.find((call) => call.method === "POST" && call.url.endsWith("/storyboard/runs"));
  expect((brief as HTMLTextAreaElement).value).toBe("최신 brief");
  expect((start?.body as { brief: string; sources: Array<{ text: string }> }).brief).toBe("최신 brief");
  expect((start?.body as { sources: Array<{ text: string }> }).sources).toEqual([
    { id: "brief", locator: "사용자 요청", text: "최신 brief" },
  ]);
  expect(screen.getByText(`검토 대기 · SHA-256 ${"a".repeat(64)}`)).toBeTruthy();
  expect((screen.getByRole("checkbox", { name: /출력 SHA/ }) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button", { name: "이 출력으로 미승인 계획 만들기" }) as HTMLButtonElement).disabled).toBe(true);
});

test("a stale accept clears review of the previous output and requires review of the latest hash", async () => {
  let reads = 0;
  const calls = stub((url, init) => {
    if (url.endsWith("/storyboard/runs") && init?.method === "POST") return { run_id: "run-stale", status: "queued", engine: "codex", model: null, session_id: "session" };
    if (url.endsWith("/storyboard/runs/run-stale/accept")) return new Response('{"detail":"storyboard output changed"}', { status: 409 });
    if (url.endsWith("/storyboard/runs/run-stale")) {
      reads++;
      return { run_id: "run-stale", status: "succeeded", phase: "completed_needs_review", review_required: true,
        sources: [{ id: "brief", locator: "사용자 요청", text: "brief" }], storyboard: story,
        output_sha256: reads === 1 ? "a".repeat(64) : "b".repeat(64), error: null };
    }
    return { id: "plan" };
  });
  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "brief" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await screen.findByText("구성 요약");

  const accept = screen.getByRole("button", { name: "이 출력으로 미승인 계획 만들기" }) as HTMLButtonElement;
  expect((screen.getByRole("checkbox", { name: /출력 SHA/ }) as HTMLInputElement).checked).toBe(false);
  expect(accept.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /출력 SHA/ }));
  expect(accept.disabled).toBe(false);
  fireEvent.click(accept);

  expect((await screen.findByRole("status")).textContent).toMatch(/최신 서버 응답/);
  await waitFor(() => expect(screen.getByText(`검토 대기 · SHA-256 ${"b".repeat(64)}`)).toBeTruthy());
  expect((screen.getByRole("checkbox", { name: /출력 SHA/ }) as HTMLInputElement).checked).toBe(false);
  expect(accept.disabled).toBe(true);
  expect(calls.filter((call) => call.url.endsWith("/accept"))).toHaveLength(1);
});
