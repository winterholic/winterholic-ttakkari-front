import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { FailedRunsPage } from "../api/types";

const h = vi.hoisted(() => ({ listFailedRuns: vi.fn() }));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  listFailedRuns: (...args: unknown[]) => h.listFailedRuns(...args),
}));

import { FailedTasksPage } from "./FailedTasksPage";

afterEach(() => cleanup());

const page: FailedRunsPage = {
  items: [{
    id: "r1", session_id: "s1", workspace_id: "w1", prompt: "결제 흐름 정리", context_artifact_ids: [],
    engine: "claude", model: "opus", effort: "high", status: "failed", exit_code: 1,
    error: "시간 초과: 응답을 받지 못했습니다", result_text: null, cost_usd: null, usage: {}, checkpoint_ref: null,
    origin: "user", profile: "개인 Claude", last_seq: 1, created_at: "2026-10-13T04:00:00Z",
    started_at: "2026-10-13T04:00:01Z", finished_at: "2026-10-13T04:02:00Z", failed_at: "2026-10-13T04:02:00Z",
    session_title: "결제 개선", session_kind: "orchestrator", session_parent_id: null, pool: "personal", workspace_name: "storefront",
  }],
  next_before: null,
  next_before_id: null,
};

it("실패 원인과 실행 환경을 보여 주고 원래 세션으로 연결한다", async () => {
  h.listFailedRuns.mockResolvedValue(page);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><FailedTasksPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText("결제 흐름 정리")).toBeTruthy();
  expect(screen.getByText("시간 초과: 응답을 받지 못했습니다")).toBeTruthy();
  expect(screen.getByText("claude · 개인 Claude · opus")).toBeTruthy();
  expect(screen.getByRole("link", { name: /원래 대화 열기/ }).getAttribute("href")).toBe("/chat/s1");
  expect(screen.queryByRole("heading", { name: "백그라운드 작업" })).toBeNull();
  await waitFor(() => expect(h.listFailedRuns).toHaveBeenCalled());
});
