import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
afterEach(cleanup);

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
