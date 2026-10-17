import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { OpsIssueDetail, OpsIssueList, OpsTrend } from "../api/opsLogTypes";

const h = vi.hoisted(() => ({
  listOpsIssues: vi.fn(), getOpsIssue: vi.fn(), patchOpsIssue: vi.fn(), opsTrend: vi.fn(), listOpsDeploys: vi.fn(), getOpsDeployLog: vi.fn(),
}));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  listOpsIssues: (...a: unknown[]) => h.listOpsIssues(...a),
  getOpsIssue: (...a: unknown[]) => h.getOpsIssue(...a),
  patchOpsIssue: (...a: unknown[]) => h.patchOpsIssue(...a),
  opsTrend: (...a: unknown[]) => h.opsTrend(...a),
  listOpsDeploys: (...a: unknown[]) => h.listOpsDeploys(...a),
  getOpsDeployLog: (...a: unknown[]) => h.getOpsDeployLog(...a),
}));

import { OpsIssuePage } from "./OpsIssuePage";
import { OpsLogsPage } from "./OpsLogsPage";

const trend: OpsTrend = { unit: "day", hours: 168, total: 5, points: [{ at: "2026-10-16T00:00:00+00:00", count: 2 }, { at: "2026-10-17T00:00:00+00:00", count: 3 }] };
const page: OpsIssueList = {
  total: 25,
  next_cursor: 20,
  items: [{
    id: "LOG-7", title: "deploy pytest failed: FAILED tests/test_x.py::test_dep", source: "deploy", level: "error", status: "unresolved",
    count: 3, first_seen: "2026-10-16T01:00:00+00:00", last_seen: "2026-10-17T01:00:00+00:00", release: "b808e353", culprit: "deploy:pytest",
  }],
};
const detail: OpsIssueDetail = {
  issue: { ...page.items[0], first_release: "0123abcd", resolved_at: null, resolved_release: null, last_regressed_at: null, tags: {}, notes: [] },
  latest_event: {
    event_id: 1, at: "2026-10-17T01:00:00+00:00", level: "error", release: "b808e353", message: "AssertionError: assert 2 == 1", ref: "deploy_job:x",
    tags: { stage: "pytest" }, excerpt: "E   AssertionError: assert 2 == 1\npassword=[REDACTED]", breadcrumbs: [{ message: "status failed" }],
  },
  earlier_events: [], releases: [{ release: "b808e353", events: 3 }], recent_hours: [{ hour: "2026-10-17T01:00:00+00:00", count: 3 }],
};

function wrap(ui: React.ReactNode, path = "/logs") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/logs" element={ui} />
          <Route path="/logs/issues/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.opsTrend.mockResolvedValue(trend);
  h.listOpsIssues.mockResolvedValue(page);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("이슈 목록에 횟수·최근 발생·배포 SHA를 보이고 상세로 연결한다", async () => {
  wrap(<OpsLogsPage />);
  expect(await screen.findByText(/deploy pytest failed/)).toBeTruthy();
  expect(screen.getByText("3회")).toBeTruthy();
  expect(screen.getByText("b808e353")).toBeTruthy();
  expect(screen.getByRole("link", { name: /deploy pytest failed/ }).getAttribute("href")).toBe("/logs/issues/LOG-7");
  expect(screen.getByRole("img", { name: "최근 168시간 오류 5건" })).toBeTruthy();
  expect(screen.getByText("25건 중 1건")).toBeTruthy();
});

it("상태·출처 필터가 목록 요청에 반영되고 다음 쪽 커서를 쓴다", async () => {
  wrap(<OpsLogsPage />);
  await screen.findByText(/deploy pytest failed/);
  fireEvent.click(screen.getByRole("button", { name: "해결됨" }));
  await waitFor(() => expect(h.listOpsIssues).toHaveBeenLastCalledWith(expect.objectContaining({ status: "resolved", cursor: 0 })));
  fireEvent.click(screen.getByRole("button", { name: "배포" }));
  await waitFor(() => expect(h.listOpsIssues).toHaveBeenLastCalledWith(expect.objectContaining({ source: "deploy" })));
  fireEvent.click(await screen.findByRole("button", { name: "더 보기" }));
  await waitFor(() => expect(h.listOpsIssues).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 20 })));
});

it("미해결 이슈가 없으면 빈 상태를 안내한다", async () => {
  h.listOpsIssues.mockResolvedValue({ total: 0, items: [], next_cursor: null });
  wrap(<OpsLogsPage />);
  expect(await screen.findByText("미해결 이슈가 없어요.")).toBeTruthy();
});

it("배포별 오류 탭에서 실패 배포의 로그 원인 구간을 펼친다", async () => {
  h.listOpsDeploys.mockResolvedValue({ items: [
    { job_id: "j1", revision: "b808e353", status: "failed", created_at: "2026-10-17T00:00:00+00:00", updated_at: "2026-10-17T00:05:00+00:00", strategy: "generations", issue: "LOG-7", cause: "deploy pytest failed: test_dep", stage: "pytest" },
    { job_id: "j2", revision: "0123abcd", status: "succeeded", created_at: "2026-10-16T00:00:00+00:00", updated_at: "2026-10-16T00:05:00+00:00", strategy: "generations" },
  ] });
  h.getOpsDeployLog.mockResolvedValue({ job_id: "j1", revision: "b808e353", status: "failed", stage: "pytest", cause: "FAILED tests/test_x.py::test_dep", error: null,
    log: { exists: true, bytes: 100, lines: 40 }, sections: [{ from_line: 5, to_line: 9, text: "5| E   AssertionError" }] });
  wrap(<OpsLogsPage />);
  fireEvent.click(await screen.findByRole("tab", { name: "배포별 오류" }));
  expect(await screen.findByText("deploy pytest failed: test_dep")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /로그 원인 보기/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "로그 원인 보기" }));
  expect(await screen.findByText(/5\| E\s+AssertionError/)).toBeTruthy();
  expect(h.getOpsDeployLog).toHaveBeenCalledWith("j1");
  expect(screen.getByRole("link", { name: /이슈 LOG-7/ }).getAttribute("href")).toBe("/logs/issues/LOG-7");
});

it("이슈 상세에 스택·직전 맥락·마스킹된 발췌를 보이고 해결 처리한다", async () => {
  h.getOpsIssue.mockResolvedValue(detail);
  h.patchOpsIssue.mockResolvedValue({ issue: { ...detail.issue, status: "resolved" } });
  wrap(<OpsIssuePage />, "/logs/issues/LOG-7");
  expect(await screen.findByText(/password=\[REDACTED\]/)).toBeTruthy();
  expect(screen.getByText(/status failed/)).toBeTruthy();
  expect(screen.getByText("b808e353", { selector: "dt" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "해결 처리" }));
  await waitFor(() => expect(h.patchOpsIssue).toHaveBeenCalledWith("LOG-7", { status: "resolved" }));
});

it("메모를 남긴다", async () => {
  h.getOpsIssue.mockResolvedValue(detail);
  h.patchOpsIssue.mockResolvedValue({ issue: detail.issue });
  wrap(<OpsIssuePage />, "/logs/issues/LOG-7");
  const input = await screen.findByLabelText("메모");
  expect((screen.getByRole("button", { name: "남기기" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(input, { target: { value: "캐시 비움" } });
  fireEvent.click(screen.getByRole("button", { name: "남기기" }));
  await waitFor(() => expect(h.patchOpsIssue).toHaveBeenCalledWith("LOG-7", { note: "캐시 비움" }));
});
