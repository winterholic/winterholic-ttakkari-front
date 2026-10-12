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
import { MorePage } from "../pages/MorePage";

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
            <Route path="/memos" element={<p>메모 본문</p>} />
            <Route path="/more" element={<MorePage />} />
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
    expect(links.map((l) => l.textContent)).toEqual(expect.arrayContaining(["채팅", "작업 공간", "보관함", "파일", "메모", "캘린더"]));
    const current = links.filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual(["보관함"]);
  });

  it("하단 탭은 채팅·회사·메모·캘린더·더보기 다섯이고, 더보기로 옮긴 화면에서는 더보기가 켜진다", () => {
    renderAt("/library");
    const tabbar = screen.getByRole("navigation", { name: "영역" });
    const tabs = within(tabbar).getAllByRole("link");
    expect(tabs.map((l) => l.textContent)).toEqual(["채팅", "회사", "메모", "캘린더", "더보기"]);
    expect(tabs.map((l) => l.getAttribute("href"))).toEqual(["/chat", "/work", "/memos", "/calendar", "/more"]);
    expect(tabs.filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.textContent)).toEqual(["더보기"]);
  });

  it("메모 화면에서는 메모 탭이 켜지고, 데스크톱 사이드바에는 메모·캘린더 링크가 그대로 있다", () => {
    renderAt("/memos");
    const tabbar = screen.getByRole("navigation", { name: "영역" });
    expect(within(tabbar).getByRole("link", { name: "메모" }).getAttribute("aria-current")).toBe("page");
    const nav = screen.getByRole("navigation", { name: "영역과 세션" });
    expect(within(nav).getByRole("link", { name: "메모" }).getAttribute("href")).toBe("/memos");
    expect(within(nav).getByRole("link", { name: "캘린더" }).getAttribute("href")).toBe("/calendar");
  });

  it("모바일 드로어에는 메모·캘린더 링크를 두지 않는다", () => {
    renderAt("/library");
    const drawer = screen.getByRole("navigation", { name: "세션", hidden: true });
    expect(within(drawer).queryByRole("link", { name: "메모", hidden: true })).toBeNull();
    expect(within(drawer).queryByRole("link", { name: "캘린더", hidden: true })).toBeNull();
  });

  it("더보기 화면은 작업 공간·보관함·파일을 모으고, 작업 공간은 마지막 세션이 아니라 개요로 간다", async () => {
    renderAt("/chat/s9");
    // 세션 화면을 거쳐 와도(사이드바는 그 세션을 기억한다) 더보기의 작업 공간은 개요다.
    within(screen.getByRole("navigation", { name: "영역" })).getByRole("link", { name: "더보기" }).click();
    const more = await screen.findByRole("navigation", { name: "더보기 메뉴" });
    const links = within(more).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["작업 공간", "/workspace"],
      ["보관함", "/library"],
      ["파일", "/files"],
    ]);
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
