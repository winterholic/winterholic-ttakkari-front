import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { AccountPool, TaskNode } from "../api/types";

const h = vi.hoisted(() => ({
  desktop: false, ensureDesk: vi.fn(), activeTasks: vi.fn(), listRuns: vi.fn(), searchTasks: vi.fn(), taskTree: vi.fn(),
}));
vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  ensureDesk: (...args: unknown[]) => h.ensureDesk(...args),
  activeTasks: (...args: unknown[]) => h.activeTasks(...args),
  listRuns: (...args: unknown[]) => h.listRuns(...args),
  searchTasks: (...args: unknown[]) => h.searchTasks(...args),
  taskTree: (...args: unknown[]) => h.taskTree(...args),
}));
vi.mock("../features/viewer/hooks", () => ({ useIsDesktop: () => h.desktop }));
vi.mock("../features/viewer", () => ({
  ArtifactViewerHost: ({ children }: { children: ReactNode }) => children,
  useArtifactViewer: () => ({ open: vi.fn() }),
}));
vi.mock("../shell/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("../features/chat/SessionComposer", () => ({ SessionComposer: () => null }));
vi.mock("../features/canvas/TaskCanvas", () => ({ TaskCanvas: ({ overlay }: { overlay: ReactNode }) => overlay }));
vi.mock("../features/tasks/NodePanel", () => ({ NodePanel: ({ nodeId }: { nodeId: string }) => <p>세션 상세 {nodeId}</p> }));

import { DeskHome } from "./DeskHome";

const node = (pool: AccountPool, onBoard: boolean): TaskNode => ({
  id: "session-result", parent_id: "desk", kind: "orchestrator", pool,
  title: "검색한 작업", status: onBoard ? "running" : "succeeded",
  created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z",
  archived_at: null, profile: null, model: null, last_result: null,
});

function Where() {
  const l = useLocation();
  return <output data-testid="location">{l.pathname + l.search}</output>;
}

function mount(pool: AccountPool, onBoard: boolean) {
  const n = node(pool, onBoard);
  h.ensureDesk.mockResolvedValue({ id: "desk" });
  h.activeTasks.mockResolvedValue({ roots: onBoard ? [n.id] : [], nodes: onBoard ? [n] : [] });
  h.searchTasks.mockResolvedValue([{ node: n, root_id: n.id, path: [n], field: "title", snippet: n.title }]);
  h.taskTree.mockResolvedValue({ root_id: n.id, path: [n], nodes: [n] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const base = pool === "work" ? "/work" : "/chat";
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[base]}>
        <Routes>
          <Route path={base} element={<DeskHome pool={pool} />} />
          <Route path={`${base}/:sessionId`} element={<p>작업 대화 화면</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return base;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.desktop = false;
  h.listRuns.mockResolvedValue([]);
});
afterEach(cleanup);

describe.each(["personal", "work"] as const)("홈 검색 이동: %s", (pool) => {
  it.each([false, true])("모바일 검색 결과를 누르면 작업 대화로 이동한다 (판에 있음=%s)", async (onBoard) => {
    const base = mount(pool, onBoard);
    fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "검색" } });
    fireEvent.click(await screen.findByRole("button", { name: /검색한 작업/ }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(`${base}/session-result`));
    expect(screen.getByText("작업 대화 화면")).toBeTruthy();
    expect(h.searchTasks).toHaveBeenCalledWith("검색", pool);
  });

  it("모바일에서 Enter로 지난 일을 골라도 작업 대화로 이동한다", async () => {
    const base = mount(pool, false);
    const input = await screen.findByRole("searchbox");
    fireEvent.change(input, { target: { value: "검색" } });
    await screen.findByRole("button", { name: /검색한 작업/ });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(`${base}/session-result`));
  });

  it.each([false, true])("데스크톱 검색 결과는 옆 패널을 연다 (판에 있음=%s)", async (onBoard) => {
    h.desktop = true;
    const base = mount(pool, onBoard);
    fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "검색" } });
    fireEvent.click(await screen.findByRole("button", { name: /검색한 작업/ }));
    expect(await screen.findByText("세션 상세 session-result")).toBeTruthy();
    const url = new URL(screen.getByTestId("location").textContent!, "http://localhost");
    expect(url.pathname).toBe(base);
    expect(url.searchParams.get("node")).toBe("session-result");
    expect(url.searchParams.getAll("pin")).toEqual(onBoard ? [] : ["session-result"]);
  });
});
