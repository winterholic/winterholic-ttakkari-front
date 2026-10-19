import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const h = vi.hoisted(() => ({ listMemos: vi.fn(), listMemoTags: vi.fn(), listMemoCategories: vi.fn() }));
vi.mock("../api/client", () => ({
  ApiError: class extends Error {},
  CATEGORY_COLORS: ["blue", "green", "amber", "violet", "red", "gray"],
  listMemos: (...a: unknown[]) => h.listMemos(...a),
  listMemoTags: (...a: unknown[]) => h.listMemoTags(...a),
  listMemoCategories: (...a: unknown[]) => h.listMemoCategories(...a),
  createMemoCategory: vi.fn(),
  patchMemoCategory: vi.fn(),
  orderMemoCategories: vi.fn(),
  deleteMemoCategory: vi.fn(),
  createMemo: vi.fn(),
  patchMemo: vi.fn(),
  getMemo: vi.fn(),
  deleteMemo: vi.fn(),
}));
vi.mock("../shell/PageHeader", () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));

import { MemosPage } from "./MemosPage";

const CATS = {
  categories: [{ id: "c1", name: "회사", color: "blue", position: 1, count: 1 }],
  total: 2,
  uncategorized: 1,
};
const MEMOS = [
  { id: "m1", title: "주간 보고", tags: ["업무"], category_id: "c1", pinned: false, source: "user", rev: 1, excerpt: "", created_at: "", updated_at: "2026-10-12T09:00:00+09:00" },
  { id: "m2", title: "아이디어", tags: [], category_id: null, pinned: false, source: "user", rev: 1, excerpt: "", created_at: "", updated_at: "2026-10-12T09:00:00+09:00" },
];

function mount(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/memos" element={<MemosPage />} />
          <Route path="/memos/:memoId" element={<MemosPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  h.listMemos.mockReset().mockResolvedValue({ memos: MEMOS });
  h.listMemoTags.mockReset().mockResolvedValue({ tags: [{ name: "업무", count: 1 }, { name: "생활", count: 1 }] });
  h.listMemoCategories.mockReset().mockResolvedValue(CATS);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("메모 목록 거르기", () => {
  it("검색어는 디바운스한 뒤 목록 요청에 포함한다", async () => {
    mount("/memos");
    const search = await screen.findByLabelText("메모 검색");
    fireEvent.change(search, { target: { value: "주간" } });
    await waitFor(() => expect(h.listMemos).toHaveBeenLastCalledWith({ q: "주간", tags: [], category: undefined }));
  });

  it("주소의 카테고리·태그로 묻고, 목록에 카테고리와 태그를 보인다", async () => {
    mount("/memos?c=c1&t=업무");
    await waitFor(() => expect(h.listMemos).toHaveBeenLastCalledWith({ q: undefined, tags: ["업무"], category: "c1" }));
    expect(h.listMemoTags).toHaveBeenLastCalledWith("c1");
    expect(await screen.findByRole("heading", { name: "회사" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "새 메모" }).getAttribute("href")).toBe("/memos/new?c=c1&t=%EC%97%85%EB%AC%B4");
  });

  it("카테고리를 바꾸면 태그 거르기를 풀고, 태그 칩으로 다시 좁힌다", async () => {
    mount("/memos?t=생활");
    const cats = await screen.findByRole("group", { name: "카테고리" });
    await screen.findByText("회사", { selector: ".memo-item__cat" });
    fireEvent.click(within(cats).getByRole("button", { name: /회사/ }));
    await waitFor(() => expect(h.listMemos).toHaveBeenLastCalledWith({ q: undefined, tags: [], category: "c1" }));
    const tagGroup = await screen.findByRole("group", { name: "태그로 좁히기" });
    fireEvent.click(tagGroup.querySelector("button")!);
    await waitFor(() => expect(h.listMemos).toHaveBeenLastCalledWith({ q: undefined, tags: ["업무"], category: "c1" }));
  });
});

describe("메모 범위 표시", () => {
  it("회사 메모에만 배지를 붙이고, scope 가 없는 옛 응답과 개인은 표시가 없다", async () => {
    h.listMemos.mockResolvedValue({
      memos: [
        { ...MEMOS[0], id: "w1", title: "분기 계획", scope: "work" },
        { ...MEMOS[1], id: "p1", title: "개인 메모", scope: "personal" },
        { ...MEMOS[1], id: "o1", title: "옛 메모" },
      ],
    });
    mount("/memos");
    const work = (await screen.findByText("분기 계획")).closest("a")!;
    expect(within(work).getByText("회사", { selector: ".tk-badge span" })).toBeTruthy();
    expect(screen.getAllByText("회사", { selector: ".tk-badge span" })).toHaveLength(1);
  });
});

describe("메모 편집 화면", () => {
  it("모바일에서는 목록과 모달 대신 편집 페이지를 열고 목록으로 돌아간다", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    mount("/memos/new?c=c1&t=업무");
    expect(await screen.findByRole("textbox", { name: "본문" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "새 메모" })).toBeNull();
    expect(screen.queryByRole("region", { name: "메모 목록" })).toBeNull();
    const back = screen.getByRole("link", { name: "메모 목록으로" });
    expect(back.getAttribute("href")).toBe("/memos?c=c1&t=%EC%97%85%EB%AC%B4");
    fireEvent.click(back);
    expect(await screen.findByRole("region", { name: "메모 목록" })).toBeTruthy();
  });

  it("작성 도중 화면을 회전해도 편집기를 새로 만들지 않는다", async () => {
    const listeners = new Set<() => void>();
    const media = { matches: true, addEventListener: (_: string, f: () => void) => listeners.add(f), removeEventListener: (_: string, f: () => void) => listeners.delete(f) };
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    mount("/memos/new");
    const body = await screen.findByRole("textbox", { name: "본문" });
    fireEvent.change(body, { target: { value: "회전해도 남아야 하는 초안" } });
    act(() => { media.matches = false; listeners.forEach(f => f()); });
    expect((screen.getByRole("textbox", { name: "본문" }) as HTMLTextAreaElement).value).toBe("회전해도 남아야 하는 초안");
    expect(screen.queryByRole("dialog", { name: "새 메모" })).toBeNull();
  });

  it("데스크톱에서는 기존 메모 모달을 유지한다", async () => {
    mount("/memos/new");
    expect(await screen.findByRole("dialog", { name: "새 메모" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "메모 목록" })).toBeTruthy();
  });
});
