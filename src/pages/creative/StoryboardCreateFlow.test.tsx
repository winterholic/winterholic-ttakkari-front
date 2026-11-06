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

test("submits selected text documents and an explicit optional quality goal through supported fields", async () => {
  const calls = stub((url, init) => {
    if (url.endsWith("/storyboard/runs") && init?.method === "POST") return { run_id: "run-doc", status: "queued", engine: "codex", model: null, session_id: "session" };
    if (url.endsWith("/storyboard/runs/run-doc")) return { run_id: "run-doc", status: "running", phase: "running", review_required: true, sources: [], storyboard: null, error: null };
    return [];
  });
  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "제품 소개 영상" } });
  fireEvent.change(screen.getByLabelText("품질 목표 (선택)"), { target: { value: "초보자도 핵심 기능을 바로 이해하도록" } });
  const document = new File(["첫 장면은 제품 사용 전의 불편을 보여 줍니다."], "기획 메모.md", { type: "text/markdown" });
  fireEvent.change(screen.getByLabelText("텍스트 참고 문서 (.txt, .md)"), { target: { files: [document] } });
  await screen.findByText(/읽기 완료/);
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await screen.findByText(/실행 상태/);

  const start = calls.find((call) => call.url.endsWith("/storyboard/runs") && call.method === "POST");
  expect(start?.body).toEqual({
    brief: "사용자 요청:\n제품 소개 영상\n\n사용자 품질 목표 (보장 아님):\n초보자도 핵심 기능을 바로 이해하도록",
    engine: "codex",
    sources: [
      { id: "brief", locator: "사용자 요청", text: "사용자 요청:\n제품 소개 영상\n\n사용자 품질 목표 (보장 아님):\n초보자도 핵심 기능을 바로 이해하도록" },
      { id: expect.stringMatching(/^file-/), locator: "기획 메모.md", text: "첫 장면은 제품 사용 전의 불편을 보여 줍니다." },
    ],
  });
  expect(Object.keys(start?.body as object).sort()).toEqual(["brief", "engine", "sources"].sort());
  expect(start?.key).toBeTruthy();
});

test("reports unsupported, empty and oversized reference documents and prevents submission", async () => {
  const calls = stub((url, init) => url.endsWith("/storyboard/runs") && init?.method === "POST"
    ? { run_id: "run-invalid", status: "queued", engine: "codex", model: null, session_id: "session" }
    : []);
  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "brief" } });
  const input = screen.getByLabelText("텍스트 참고 문서 (.txt, .md)");

  fireEvent.change(input, { target: { files: [new File(["pdf bytes"], "scan.pdf", { type: "application/pdf" })] } });
  expect(await screen.findByText(/지원하지 않는 형식/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "scan.pdf 제거" }));

  fireEvent.change(input, { target: { files: [new File([" \n  "], "empty.txt", { type: "text/plain" })] } });
  expect(await screen.findByText(/문서가 비어 있습니다/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "empty.txt 제거" }));

  fireEvent.change(input, { target: { files: [new File(["x".repeat(12001)], "long.txt", { type: "text/plain" })] } });
  expect(await screen.findByText(/12,000자 한도/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "AI 장면 구성 만들기" }) as HTMLButtonElement).disabled).toBe(true);
  expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/storyboard/runs"))).toBe(false);
});

test("applies combined brief, source locator and ten-source limits without truncating", async () => {
  const calls = stub((url, init) => url.endsWith("/storyboard/runs") && init?.method === "POST"
    ? { run_id: "run-limits", status: "queued", engine: "codex", model: null, session_id: "session" }
    : { run_id: "run-limits", status: "running", phase: "running", review_required: true, sources: [], storyboard: null, error: null });
  mount();
  const brief = screen.getByLabelText("만들고 싶은 콘텐츠");
  fireEvent.change(brief, { target: { value: "x".repeat(6001) } });
  expect(await screen.findByText(/brief는 6,000자 이하/)).toBeTruthy();
  expect((brief as HTMLTextAreaElement).value).toHaveLength(6001);
  fireEvent.change(brief, { target: { value: "x".repeat(6000) } });
  fireEvent.change(screen.getByLabelText("품질 목표 (선택)"), { target: { value: "목표" } });
  expect(await screen.findByText(/brief는 6,000자 이하/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "AI 장면 구성 만들기" }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(screen.getByLabelText("품질 목표 (선택)"), { target: { value: "" } });
  fireEvent.click(screen.getByText("추가 출처 본문 (선택)"));
  fireEvent.change(screen.getByPlaceholderText("자료명 또는 URL"), { target: { value: "x".repeat(501) } });
  fireEvent.change(screen.getByLabelText("출처 본문"), { target: { value: "출처 본문" } });
  expect(await screen.findByText(/출처 위치는 500자 이하/)).toBeTruthy();

  fireEvent.change(screen.getByPlaceholderText("자료명 또는 URL"), { target: { value: "x".repeat(500) } });
  const input = screen.getByLabelText("텍스트 참고 문서 (.txt, .md)");
  fireEvent.change(input, { target: { files: Array.from({ length: 9 }, (_, index) => new File([`본문 ${index}`], `doc-${index}.txt`, { type: "text/plain" })) } });
  expect(await screen.findByText(/10개 이하여야/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "AI 장면 구성 만들기" }) as HTMLButtonElement).disabled).toBe(true);
  expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/storyboard/runs"))).toBe(false);
});

test("freezes the brief, quality goal and file selector while the request is starting", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "brief" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await waitFor(() => expect((screen.getByLabelText("만들고 싶은 콘텐츠") as HTMLTextAreaElement).disabled).toBe(true));
  expect((screen.getByLabelText("품질 목표 (선택)") as HTMLTextAreaElement).disabled).toBe(true);
  expect((screen.getByLabelText("텍스트 참고 문서 (.txt, .md)") as HTMLInputElement).disabled).toBe(true);
  finish(new Response(JSON.stringify({ run_id: "run-freeze", status: "queued", engine: "codex", model: null, session_id: "session" }), { status: 200 }));
  await screen.findByText(/실행 상태/);
});

test("removing a document while its read is pending prevents a stale read from returning", async () => {
  let finishRead!: (value: string) => void;
  const delayed = new File(["unused"], "delayed.txt", { type: "text/plain" });
  delayed.text = () => new Promise<string>((resolve) => { finishRead = resolve; });
  const calls = stub((url, init) => url.endsWith("/storyboard/runs") && init?.method === "POST"
    ? { run_id: "run-stale-read", status: "queued", engine: "codex", model: null, session_id: "session" }
    : { run_id: "run-stale-read", status: "running", phase: "running", review_required: true, sources: [], storyboard: null, error: null });
  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "brief" } });
  const input = screen.getByLabelText("텍스트 참고 문서 (.txt, .md)");
  fireEvent.change(input, { target: { files: [delayed] } });
  fireEvent.click(await screen.findByRole("button", { name: "delayed.txt 제거" }));
  finishRead("늦게 도착한 본문");
  await waitFor(() => expect(screen.queryByText("delayed.txt")).toBeNull());
  expect((screen.getByRole("button", { name: "AI 장면 구성 만들기" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await screen.findByText(/실행 상태/);
  expect((calls.find((call) => call.method === "POST")?.body as { sources: unknown[] }).sources).toEqual([
    { id: "brief", locator: "사용자 요청", text: "brief" },
  ]);
});

test("shows a read failure and preserves selected inputs and key for a failed request retry", async () => {
  let starts = 0;
  const calls = stub((url, init) => {
    if (url.endsWith("/storyboard/runs") && init?.method === "POST") {
      starts++;
      return starts === 1
        ? new Response('{"detail":"engine unavailable"}', { status: 503 })
        : { run_id: "run-input-retry", status: "queued", engine: "codex", model: null, session_id: "session" };
    }
    return { run_id: "run-input-retry", status: "running", phase: "running", review_required: true, sources: [], storyboard: null, error: null };
  });
  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "brief" } });
  const failedRead = new File(["unreadable"], "failed.txt", { type: "text/plain" });
  failedRead.text = () => Promise.reject(new Error("read denied"));
  fireEvent.change(screen.getByLabelText("텍스트 참고 문서 (.txt, .md)"), { target: { files: [failedRead] } });
  expect(await screen.findByText(/파일을 읽지 못했습니다/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "failed.txt 제거" }));
  fireEvent.change(screen.getByLabelText("텍스트 참고 문서 (.txt, .md)"), {
    target: { files: [new File(["실제 문서 본문"], "notes.txt", { type: "text/plain" })] },
  });
  await screen.findByText(/읽기 완료/);
  fireEvent.change(screen.getByLabelText("품질 목표 (선택)"), { target: { value: "한 가지 핵심을 명확히 전달" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/503/);
  const first = calls.find((call) => call.method === "POST" && call.url.endsWith("/storyboard/runs"));
  expect((screen.getByLabelText("품질 목표 (선택)") as HTMLTextAreaElement).value).toBe("한 가지 핵심을 명확히 전달");
  expect(screen.getByText("notes.txt")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await screen.findByText(/실행 상태/);
  const retries = calls.filter((call) => call.method === "POST" && call.url.endsWith("/storyboard/runs"));
  expect(retries).toHaveLength(2);
  expect(retries[1].key).toBe(first?.key);
  expect(retries[1].body).toEqual(first?.body);
});

test("rotates the idempotency key when a failed request is edited with a goal and reference document", async () => {
  let starts = 0;
  const calls = stub((url, init) => {
    if (url.endsWith("/storyboard/runs") && init?.method === "POST") {
      starts++;
      return starts === 1
        ? new Response('{"detail":"engine unavailable"}', { status: 503 })
        : { run_id: "run-edited-retry", status: "queued", engine: "codex", model: null, session_id: "session" };
    }
    return { run_id: "run-edited-retry", status: "running", phase: "running", review_required: true, sources: [], storyboard: null, error: null };
  });
  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "brief" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/503/);
  const originalKey = calls.find((call) => call.method === "POST")?.key;

  fireEvent.change(screen.getByLabelText("품질 목표 (선택)"), { target: { value: "첫 화면에서 핵심을 보여 주기" } });
  fireEvent.change(screen.getByLabelText("텍스트 참고 문서 (.txt, .md)"), {
    target: { files: [new File(["출처 본문"], "source.txt", { type: "text/plain" })] },
  });
  await screen.findByText(/읽기 완료/);
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await screen.findByText(/실행 상태/);

  const requests = calls.filter((call) => call.method === "POST" && call.url.endsWith("/storyboard/runs"));
  expect(requests).toHaveLength(2);
  expect(requests[1].key).not.toBe(originalKey);
  expect(requests[1].body).toMatchObject({ brief: expect.stringContaining("사용자 품질 목표"), sources: [
    { id: "brief" }, { locator: "source.txt", text: "출처 본문" },
  ] });
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
  const startRequests = calls.filter((call) => call.url.endsWith("/storyboard/runs") && call.method === "POST");
  expect(startRequests).toHaveLength(2);
  expect(startRequests[1].key).toBe(startRequests[0].key);
  expect(startRequests[1].body).toEqual(startRequests[0].body);
  expect(calls.some((call) => call.url.endsWith("/plans") && call.method === "POST")).toBe(false);
});

test("starting another request rotates the idempotency key even when the brief is unchanged", async () => {
  let starts = 0;
  const calls = stub((url, init) => {
    if (url.endsWith("/storyboard/runs") && init?.method === "POST") {
      starts++;
      return { run_id: `run-${starts}`, status: "queued", engine: "codex", model: null, session_id: "session" };
    }
    if (url.endsWith("/storyboard/runs/run-1")) return { run_id: "run-1", status: "failed", phase: "failed", review_required: true, sources: [], storyboard: null, error: "temporary failure" };
    if (url.endsWith("/storyboard/runs/run-2")) return { run_id: "run-2", status: "running", phase: "running", review_required: true, sources: [], storyboard: null, error: null };
    return [];
  });

  mount();
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), { target: { value: "같은 brief를 새로 제출" } });
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  fireEvent.click(await screen.findByRole("button", { name: "다른 요청 작성" }));
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await screen.findByText(/실행 상태/);

  const requestStarts = calls.filter((call) => call.url.endsWith("/storyboard/runs") && call.method === "POST");
  expect(requestStarts).toHaveLength(2);
  expect(requestStarts[1].body).toEqual(requestStarts[0].body);
  expect(requestStarts[1].key).not.toBe(requestStarts[0].key);
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
