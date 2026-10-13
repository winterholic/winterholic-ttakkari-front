import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RunEvent, RunOut } from "../../api/types";
import { RunBlock } from "./RunBlock";

const events = vi.fn<() => Promise<RunEvent[]>>();
vi.mock("../../api/client", () => ({
  runEvents: () => events(),
  putDeskFeedback: vi.fn(),
  downloadLink: vi.fn(),
}));
vi.mock("../../hooks/useRunStream", () => ({ useRunStream: () => ({ events: [], finished: false }) }));

const run: RunOut = {
  id: "r1", session_id: "s1", workspace_id: "w1", prompt: "안녕", context_artifact_ids: [],
  engine: "codex", model: null, effort: null, status: "succeeded", exit_code: null, error: null,
  result_text: "안녕하세요", cost_usd: null, usage: {}, checkpoint_ref: null, origin: "user", profile: null,
  last_seq: 2, created_at: "2026-10-13T00:00:00Z", started_at: "2026-10-13T00:00:01Z", finished_at: "2026-10-13T00:00:02Z",
};
const msg = { seq: 1, type: "message", payload: { text: "안녕하세요" }, created_at: run.created_at } as RunEvent;
const route = { seq: 2, type: "desk.route", payload: { action: "answer", account: "c", engine: "codex", ms: 1 }, created_at: run.created_at } as RunEvent;

function renderRun(r: RunOut) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const noop = () => undefined;
  render(
    <QueryClientProvider client={qc}>
      <RunBlock run={r} isLast onOpen={noop} onStop={noop} onRetry={noop} onSuggest={noop} onSettled={noop} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("RunBlock 접수 판정 칩", () => {
  it("접수가 분류한 사용자 메시지 답 아래에만 보인다", async () => {
    events.mockResolvedValueOnce([msg, route]);
    renderRun(run);
    expect(await screen.findByRole("group", { name: "접수 판단 평가" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "넘겼어야 해" })).toBeTruthy();
  });

  it("desk.route 가 없는 Run(일반 대화·기획)에는 없다", async () => {
    events.mockResolvedValueOnce([msg]);
    renderRun({ ...run, id: "r2" });
    await waitFor(() => expect(events).toHaveBeenCalled());
    // 이벤트를 읽고 다시 그린 뒤에 본다(읽기 전이라 없는 것과 구분).
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("group", { name: "접수 판단 평가" })).toBeNull();
  });
});
