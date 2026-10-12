import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const h = vi.hoisted(() => ({ listArtifacts: vi.fn(), listSessions: vi.fn() }));
vi.mock("../api/client", () => ({
  listArtifacts: (...a: unknown[]) => h.listArtifacts(...a),
  listSessions: (...a: unknown[]) => h.listSessions(...a),
  getSession: vi.fn(),
}));
vi.mock("../shell/PageHeader", () => ({
  PageHeader: ({ title, meta }: { title: string; meta?: string }) => (
    <header>
      <h1>{title}</h1>
      {meta && <p>{meta}</p>}
    </header>
  ),
}));

import { WorkspacePage } from "./WorkspacePage";

const art = (id: string, session_id: string | null, created_at: string) => ({ id, session_id, created_at, filename: `${id}.md`, kind: "markdown" });

function mount(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/workspace/:sessionId" element={<p>세션 작업 공간</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.listArtifacts.mockReset();
  h.listSessions.mockReset();
  h.listSessions.mockResolvedValue([
    { id: "s1", title: "분기 보고서" },
    { id: "s2", title: "여행 사진" },
  ]);
});
afterEach(cleanup);

describe("작업 공간 개요(/workspace)", () => {
  it("최근 세션으로 보내지 않고, 설명과 함께 결과물이 있는 세션을 최근 결과물 순으로 보여 준다", async () => {
    h.listArtifacts.mockResolvedValue([
      art("a1", "s2", "2026-10-12T10:00:00+09:00"),
      art("a2", "s1", "2026-10-12T09:00:00+09:00"),
      art("a3", "s2", "2026-10-11T09:00:00+09:00"),
      art("a4", null, "2026-10-10T09:00:00+09:00"),
      art("a5", "gone", "2026-10-09T09:00:00+09:00"),
    ]);
    mount("/workspace");
    const list = await screen.findByRole("navigation", { name: "결과물이 있는 세션" });
    expect(screen.getByRole("heading", { name: "작업 공간" })).toBeTruthy();
    expect(screen.getByText(/세션별로 모아 봐요/)).toBeTruthy();
    const rows = within(list).getAllByRole("link");
    expect(rows.map((r) => r.getAttribute("href"))).toEqual(["/workspace/s2", "/workspace/s1", "/workspace/gone"]);
    expect(rows[0].textContent).toContain("여행 사진");
    expect(rows[0].textContent).toContain("결과물 2");
    expect(rows[2].textContent).toContain("제목 없는 세션");
    expect(screen.queryByText("세션 작업 공간")).toBeNull();
  });

  it("결과물이 없으면 무엇이 모이는지와 채팅 시작하기를 안내한다", async () => {
    h.listArtifacts.mockResolvedValue([]);
    mount("/workspace");
    expect(await screen.findByText("아직 결과물이 없어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "채팅 시작하기" }).getAttribute("href")).toBe("/chat");
  });
});
