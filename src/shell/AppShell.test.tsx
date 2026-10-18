import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const auth = { state: "in" as "in" | "out" | "loading", login: vi.fn(), logout: vi.fn() };
vi.mock("../auth", () => ({ useAuth: () => auth }));

const activeTasks = vi.fn();
const taskTree = vi.fn();
vi.mock("../api/client", () => ({
  activeTasks: (...a: unknown[]) => activeTasks(...a),
  taskTree: (...a: unknown[]) => taskTree(...a),
  apiUrl: (p: string) => `http://test${p}`,
}));

import { AppShell } from "./AppShell";
import { MorePage } from "../pages/MorePage";
import { PageHeader } from "./PageHeader";

function LoginDestination() {
  const location = useLocation();
  return <p>로그인 화면{location.search}</p>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginDestination />} />
          <Route element={<AppShell />}>
            <Route path="/chat" element={<><PageHeader title="따까리 · 개인" /><p>채팅 본문</p></>} />
            <Route path="/chat/:sessionId" element={<p>세션 본문</p>} />
            <Route path="/work" element={<><PageHeader title="따까리 · 회사" /><p>회사 모드 본문</p></>} />
            <Route path="/tasks" element={<p>작업 본문</p>} />
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
  activeTasks.mockReset();
  activeTasks.mockResolvedValue({ roots: [], nodes: [] });
  taskTree.mockReset();
  taskTree.mockRejectedValue(new Error("없음"));
  // 첫 실행 소개는 Onboarding.test.tsx 가 따로 본다. 여기서는 본 것으로 둔다.
  localStorage.setItem("tk-onboarded", "1");
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
  it("데스크톱과 드로어가 함께 있어도 다이얼로그 ID는 중복되지 않는다", () => {
    renderAt("/chat");
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("로그아웃 상태면 /login 으로 보낸다", () => {
    auth.state = "out";
    renderAt("/chat");
    expect(screen.getByText(/로그인 화면/)).toBeTruthy();
    expect(screen.queryByText("채팅 본문")).toBeNull();
  });

  it("로그인으로 보낼 때 알림 경로·쿼리·해시를 보존한다", () => {
    auth.state = "out";
    renderAt("/chat/session-1?artifact=file-2#run-3");
    const text = screen.getByText(/로그인 화면/).textContent!;
    expect(new URLSearchParams(text.replace("로그인 화면", "")).get("next")).toBe("/chat/session-1?artifact=file-2#run-3");
  });

  it("loading 이면 리다이렉트하지 않고 로딩 상태만 보인다", () => {
    auth.state = "loading";
    renderAt("/chat");
    expect(screen.queryByText("로그인 화면")).toBeNull();
    expect(screen.queryByText("채팅 본문")).toBeNull();
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeTruthy();
  });

  it("데스크톱 사이드바는 개인·회사 대화와 작업·부가 기능을 나누고, 지금 기능을 아래 줄에 켠다", () => {
    renderAt("/library");
    expect(screen.getByText("보관함 본문")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "영역과 진행 중인 일" });
    const top = nav.querySelector(".tk-nav")!;
    expect([...top.querySelectorAll(".tk-nav__link")].map((l) => l.textContent)).toEqual(["개인 대화", "회사 대화", "작업", "부가 기능", "보관함"]);
    expect(within(nav).getByRole("button", { name: "부가 기능" }).hasAttribute("data-active")).toBe(true);
    const current = within(nav).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([["보관함", "/library"]]);
  });

  it("개인 대화 홈에서는 개인 대화가 켜지고 부가 기능은 꺼져 있다", () => {
    renderAt("/chat");
    const nav = screen.getByRole("navigation", { name: "영역과 진행 중인 일" });
    expect(within(nav).getByRole("link", { name: "개인 대화" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("button", { name: "부가 기능" }).hasAttribute("data-active")).toBe(false);
  });

  it("부가 기능 모달은 사용자 메뉴의 서버 리소스를 제외하고, 지금 기능을 표시한다", async () => {
    renderAt("/memos");
    const nav = screen.getByRole("navigation", { name: "영역과 진행 중인 일" });
    within(nav).getByRole("button", { name: "부가 기능" }).click();
    const dialog = await screen.findByRole("dialog", { name: "부가 기능" });
    const links = within(dialog).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/remote-desktop", "/notifications", "/weather", "/workspace", "/library", "/context-library", "/files", "/memos", "/calendar", "/checklists", "/meetings", "/pms", "/wbs", "/logs", "/design-systems", "/artcraft", "/github", "/reverse"]);
    expect(links.filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.getAttribute("href"))).toEqual(["/memos"]);
  });

  it("하단 탭은 채팅·작업·메모·캘린더·더보기 다섯이고, 더보기로 옮긴 화면에서는 더보기가 켜진다", () => {
    renderAt("/library");
    const tabbar = screen.getByRole("navigation", { name: "영역" });
    const tabs = within(tabbar).getAllByRole("link");
    expect(tabs.map((l) => l.textContent)).toEqual(["채팅", "작업", "메모", "캘린더", "더보기"]);
    expect(tabs.map((l) => l.getAttribute("href"))).toEqual(["/chat", "/tasks", "/memos", "/calendar", "/more"]);
    expect(tabs.filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.textContent)).toEqual(["더보기"]);
  });

  it("메모 화면에서는 메모 탭이 켜진다", () => {
    renderAt("/memos");
    const tabbar = screen.getByRole("navigation", { name: "영역" });
    expect(within(tabbar).getByRole("link", { name: "메모" }).getAttribute("aria-current")).toBe("page");
  });

  it("모바일 드로어에는 메모·캘린더 링크를 두지 않는다", () => {
    renderAt("/library");
    const drawer = screen.getByRole("navigation", { name: "진행 중인 일", hidden: true });
    expect(within(drawer).queryByRole("link", { name: "메모", hidden: true })).toBeNull();
    expect(within(drawer).queryByRole("link", { name: "캘린더", hidden: true })).toBeNull();
  });

  it("더보기 화면은 사용자 메뉴의 서버 리소스를 제외하고, 작업 공간은 마지막 세션이 아니라 개요로 간다", async () => {
    renderAt("/chat/s9");
    // 세션 화면을 거쳐 와도 더보기의 작업 공간은 개요다.
    within(screen.getByRole("navigation", { name: "영역" })).getByRole("link", { name: "더보기" }).click();
    const more = await screen.findByRole("navigation", { name: "더보기 메뉴" });
    const links = within(more).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["원격 데스크톱", "/remote-desktop"],
      ["알림", "/notifications"],
      ["날씨 브리핑", "/weather"],
      ["작업 공간", "/workspace"],
      ["보관함", "/library"],
      ["맥락 도서관", "/context-library"],
      ["파일", "/files"],
      ["체크리스트", "/checklists"],
      ["회의록", "/meetings"],
      ["PMS", "/pms"],
      ["WBS", "/wbs"],
      ["로그·이슈", "/logs"],
      ["디자인시스템", "/design-systems"],
      ["ArtCraft", "/artcraft"],
      ["GitHub", "/github"],
      ["리버스 엔지니어링", "/reverse"],
    ]);
  });

  it("회사 모드(/work)에서도 채팅이 켜진다", () => {
    renderAt("/work");
    const tabbar = screen.getByRole("navigation", { name: "영역" });
    expect(within(tabbar).getByRole("link", { name: "채팅" }).getAttribute("aria-current")).toBe("page");
  });

  it("사이드바는 세션 목록 대신 진행 중인 일의 트리를 보여 주고 지금 세션을 켠다", async () => {
    const at = new Date().toISOString();
    const n = (id: string, parent: string | null, title: string, status: string) => ({
      id, parent_id: parent, kind: parent === "desk" ? "orchestrator" : "worker", title, pool: "personal",
      created_at: at, updated_at: at, archived_at: null, status, profile: null, model: null, last_result: null,
    });
    const nodes = [n("lead", "desk", "보고서 정리", "succeeded"), n("w1", "lead", "표 만들기", "running"), n("w2", "lead", "요약", "succeeded")];
    activeTasks.mockResolvedValue({ roots: ["lead"], nodes });
    taskTree.mockResolvedValue({ root_id: "lead", path: [nodes[0], nodes[1]], nodes });
    renderAt("/chat/w1");
    const nav = screen.getByRole("navigation", { name: "영역과 진행 중인 일" });
    const row = await within(nav).findByRole("link", { name: /표 만들기/ });
    expect(row.getAttribute("href")).toBe("/chat/w1");
    expect(row.getAttribute("aria-current")).toBe("page");
    expect(row.textContent).toContain("실행 중");
    // 일이 도는 가지는 펼쳐져 있고, 접기 버튼이 하위 수를 말한다
    expect(within(nav).getByRole("button", { name: "보고서 정리 하위 2개 접기" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(nav).getByRole("link", { name: /지난 작업 모두 보기/ }).getAttribute("href")).toBe("/tasks");
  });

  it("도는 일이 없으면 빈 상태 안내를 보여 준다", async () => {
    renderAt("/library");
    const nav = screen.getByRole("navigation", { name: "영역과 진행 중인 일" });
    expect(await within(nav).findByText(/지금 도는 일이 없어요/)).toBeTruthy();
  });

  it("캔버스 홈(/chat)은 판 자체가 트리라 사이드바 트리를 숨긴다", () => {
    renderAt("/chat");
    const nav = screen.getByRole("navigation", { name: "영역과 진행 중인 일" });
    expect(within(nav).queryByText("진행 중")).toBeNull();
  });
});

describe("작업 내비게이션", () => {
  it.each([
    ["/chat", "회사 대화", "회사 모드 본문"],
    ["/work", "개인 대화", "채팅 본문"],
  ])("%s에서 메뉴로 다른 대화 공간을 고르면 이동하고 메뉴가 닫힌다", async (path, label, destination) => {
    renderAt(path);
    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    const drawer = await screen.findByRole("dialog", { name: "탐색 메뉴" });
    fireEvent.click(within(drawer).getByRole("link", { name: label }));
    expect(await screen.findByText(destination)).toBeTruthy();
    await waitFor(() => expect(drawer.hasAttribute("open")).toBe(false));
    const nav = screen.getByRole("navigation", { name: "영역과 진행 중인 일" });
    expect(within(nav).getByRole("link", { name: label }).getAttribute("aria-current")).toBe("page");
  });

  it("회사 대화에서 현재 채팅 탭을 눌러도 개인 대화로 바뀌지 않는다", () => {
    renderAt("/work");
    const tabbar = screen.getByRole("navigation", { name: "영역" });
    fireEvent.click(within(tabbar).getByRole("link", { name: "채팅" }));
    expect(screen.getByText("회사 모드 본문")).toBeTruthy();
    expect(screen.queryByText("채팅 본문")).toBeNull();
  });

  it("작업 화면에서 실패한 작업 목록으로 바로 이동할 수 있다", () => {
    renderAt("/tasks");
    const link = screen.getAllByRole("link", { name: "실패한 작업" }).find((item) => item.getAttribute("href") === "/tasks/failed");
    expect(link).toBeTruthy();
  });
});
