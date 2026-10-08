import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const auth = { state: "in" as "in" | "out" | "loading", login: vi.fn(), logout: vi.fn() };
vi.mock("../auth", () => ({ useAuth: () => auth }));

const listSessions = vi.fn();
vi.mock("../api/client", () => ({
  listSessions: (...a: unknown[]) => listSessions(...a),
  apiUrl: (p: string) => `http://test${p}`,
}));

import { AppShell } from "./AppShell";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<p>로그인 화면</p>} />
          <Route element={<AppShell />}>
            <Route path="/chat" element={<p>채팅 본문</p>} />
            <Route path="/chat/:sessionId" element={<p>세션 본문</p>} />
            <Route path="/workspace/:sessionId" element={<p>작업 공간 본문</p>} />
            <Route path="/library" element={<p>보관함 본문</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.state = "in";
  listSessions.mockReset();
  listSessions.mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })));
  // jsdom 에는 dialog.showModal 이 없을 수 있다. 계약(open 속성)만 흉내 낸다.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppShell 인증 가드", () => {
  it("로그아웃 상태면 /login 으로 보낸다", () => {
    auth.state = "out";
    renderAt("/chat");
    expect(screen.getByText("로그인 화면")).toBeTruthy();
    expect(screen.queryByText("채팅 본문")).toBeNull();
  });

  it("loading 이면 리다이렉트하지 않고 로딩 상태만 보인다", () => {
    auth.state = "loading";
    renderAt("/chat");
    expect(screen.queryByText("로그인 화면")).toBeNull();
    expect(screen.queryByText("채팅 본문")).toBeNull();
    expect(screen.getByText("불러오는 중")).toBeTruthy();
  });

  it("로그인 상태면 본문과 영역 nav 를 그리고 현재 영역에 aria-current 를 단다", async () => {
    renderAt("/library");
    expect(screen.getByText("보관함 본문")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "영역과 세션" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(expect.arrayContaining(["채팅", "작업 공간", "보관함", "파일 찾기"]));
    const current = links.filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual(["보관함"]);
  });

  it("세션 화면에서 작업 공간 링크는 그 세션으로 가고, 세션 행은 /chat/:id 를 가리킨다", async () => {
    listSessions.mockResolvedValue([
      { id: "s1", title: "첫 세션", updated_at: new Date().toISOString(), last_run_status: "running", active_run_id: "r1" },
    ]);
    renderAt("/chat/s1");
    const nav = screen.getByRole("navigation", { name: "영역과 세션" });
    expect(within(nav).getByRole("link", { name: "작업 공간" }).getAttribute("href")).toBe("/workspace/s1");
    const row = await within(nav).findByRole("link", { name: /첫 세션/ });
    expect(row.getAttribute("href")).toBe("/chat/s1");
    expect(row.getAttribute("aria-current")).toBe("page");
    expect(row.textContent).toContain("실행 중");
  });
});
