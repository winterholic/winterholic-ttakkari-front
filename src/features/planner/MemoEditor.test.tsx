import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

const h = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    code = "x";
    constructor(status: number, message = "x") {
      super(message);
      this.status = status;
    }
  }
  return {
    FakeApiError, createMemo: vi.fn(), patchMemo: vi.fn(), getMemo: vi.fn(), deleteMemo: vi.fn(),
    listMemoTags: vi.fn(), listMemoCategories: vi.fn(),
  };
});
const { FakeApiError, createMemo, patchMemo, getMemo, deleteMemo, listMemoTags, listMemoCategories } = h;
vi.mock("../../api/client", () => ({
  ApiError: h.FakeApiError,
  CATEGORY_COLORS: ["blue", "green", "amber", "violet", "red", "gray"],
  createMemo: (...a: unknown[]) => h.createMemo(...a),
  patchMemo: (...a: unknown[]) => h.patchMemo(...a),
  getMemo: (...a: unknown[]) => h.getMemo(...a),
  deleteMemo: (...a: unknown[]) => h.deleteMemo(...a),
  listMemoTags: (...a: unknown[]) => h.listMemoTags(...a),
  listMemoCategories: (...a: unknown[]) => h.listMemoCategories(...a),
  createMemoCategory: vi.fn(),
  patchMemoCategory: vi.fn(),
  orderMemoCategories: vi.fn(),
  deleteMemoCategory: vi.fn(),
}));

import { MemoEditor } from "./MemoEditor";

const memo = (p: Record<string, unknown> = {}) => ({
  id: "m1", title: "장보기", body: "- 우유", tags: ["집"], category_id: null, pinned: false, source: "user", rev: 1, excerpt: "", created_at: "", updated_at: "", ...p,
});

const CATS = {
  categories: [
    { id: "c1", name: "회사", color: "blue", position: 1, count: 2 },
    { id: "c2", name: "집", color: null, position: 2, count: 1 },
  ],
  total: 4,
  uncategorized: 1,
};

function mount(memoId: string, defaultCategory: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MemoEditor memoId={memoId} defaultCategory={defaultCategory} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  createMemo.mockReset();
  patchMemo.mockReset();
  getMemo.mockReset();
  deleteMemo.mockReset();
  listMemoTags.mockReset().mockResolvedValue({ tags: [{ name: "장보기", count: 3 }, { name: "Work", count: 2 }, { name: "집", count: 1 }] });
  listMemoCategories.mockReset().mockResolvedValue(CATS);
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
  vi.useRealTimers();
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("메모 편집기 자동 저장", () => {
  it("새 메모는 비어 있는 동안 저장하지 않고, 글자가 들어가고 잠시 뒤에 한 번 만든다", async () => {
    createMemo.mockResolvedValue(memo({ id: "new1", title: "", body: "첫 줄", rev: 1 }));
    patchMemo.mockResolvedValue(memo({ id: "new1", body: "첫 줄 둘째", rev: 2 }));
    mount("new");
    await wait(2000);
    expect(createMemo).not.toHaveBeenCalled();
    type("본문", "첫 줄");
    await wait(500);
    expect(createMemo).not.toHaveBeenCalled(); // 입력이 멈출 때까지 기다린다
    await wait(600);
    expect(createMemo).toHaveBeenCalledTimes(1);
    expect(createMemo.mock.calls[0][0]).toMatchObject({ body: "첫 줄" });
    expect(screen.getByRole("status", { name: "" }).textContent).toBe("저장됨");
    // 두 번째 저장은 만든 메모의 rev 를 실어 PATCH 한다.
    type("본문", "첫 줄 둘째");
    await wait(900);
    expect(patchMemo).toHaveBeenCalledWith("new1", expect.objectContaining({ body: "첫 줄 둘째", rev: 1 }));
    expect(createMemo).toHaveBeenCalledTimes(1);
  });

  it("기존 메모를 고치면 읽은 rev 로 PATCH 하고 다음 저장은 새 rev 를 쓴다", async () => {
    getMemo.mockResolvedValue(memo());
    patchMemo.mockResolvedValueOnce(memo({ body: "- 우유\n- 계란", rev: 2 })).mockResolvedValueOnce(memo({ rev: 3 }));
    mount("m1");
    await screen.findByLabelText("본문");
    type("본문", "- 우유\n- 계란");
    await wait(900);
    expect(patchMemo).toHaveBeenLastCalledWith("m1", expect.objectContaining({ rev: 1, body: "- 우유\n- 계란", tags: ["집"] }));
    type("제목", "장보기 목록");
    await wait(900);
    expect(patchMemo).toHaveBeenLastCalledWith("m1", expect.objectContaining({ rev: 2, title: "장보기 목록" }));
  });

  it("409 이면 저장을 멈추고 충돌 안내를 보인다, '내 내용으로 덮어쓰기'는 새 rev 로 다시 저장한다", async () => {
    getMemo.mockResolvedValueOnce(memo());
    patchMemo.mockRejectedValueOnce(new FakeApiError(409, "conflict"));
    mount("m1");
    await screen.findByLabelText("본문");
    type("본문", "내가 쓴 글");
    await wait(900);
    expect(screen.getByRole("alert").textContent).toContain("먼저 고쳤어요");
    // 충돌 중에는 더 쓰거나 기다려도 서버를 두드리지 않는다.
    type("본문", "내가 쓴 글 더");
    await wait(3000);
    expect(patchMemo).toHaveBeenCalledTimes(1);

    getMemo.mockResolvedValueOnce(memo({ body: "따까리가 덧붙임", rev: 5 }));
    patchMemo.mockResolvedValueOnce(memo({ body: "내가 쓴 글 더", rev: 6 }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "내 내용으로 덮어쓰기" })); });
    await wait(100);
    expect(patchMemo).toHaveBeenLastCalledWith("m1", expect.objectContaining({ rev: 5, body: "내가 쓴 글 더" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("미리보기는 마크다운을 그린다", async () => {
    getMemo.mockResolvedValue(memo({ body: "# 큰 제목\n\n**굵게**" }));
    mount("m1");
    await screen.findByLabelText("본문");
    fireEvent.click(screen.getByLabelText("미리보기"));
    expect(screen.getByRole("heading", { name: "큰 제목" })).toBeTruthy();
    expect(document.querySelector("strong")?.textContent).toBe("굵게");
  });

  it("고정을 누르면 pinned 가 저장된다", async () => {
    getMemo.mockResolvedValue(memo());
    patchMemo.mockResolvedValue(memo({ pinned: true, rev: 2 }));
    mount("m1");
    await screen.findByLabelText("본문");
    fireEvent.click(screen.getByRole("button", { name: "맨 위에 고정" }));
    await wait(900);
    expect(patchMemo).toHaveBeenCalledWith("m1", expect.objectContaining({ pinned: true, rev: 1 }));
  });

  it("삭제를 확인하기 전에는 보존하고, 확인한 뒤에만 지운다", async () => {
    getMemo.mockResolvedValue(memo());
    deleteMemo.mockResolvedValue(undefined);
    mount("m1");
    await screen.findByLabelText("본문");

    fireEvent.click(screen.getByRole("button", { name: "메모 지우기" }));
    const confirm = await screen.findByRole("dialog", { name: "메모를 지울까요?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "취소" }));
    expect(deleteMemo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "메모 지우기" }));
    const reopened = await screen.findByRole("dialog", { name: "메모를 지울까요?" });
    fireEvent.click(within(reopened).getByRole("button", { name: "지우기" }));
    await waitFor(() => expect(deleteMemo).toHaveBeenCalledWith("m1"));
  });
});

describe("메모 편집기 카테고리·태그", () => {
  it("태그 입력은 공통 16px 입력 스타일을 사용해 iOS 자동 확대를 막는다", async () => {
    mount("new");
    const tagInput = await screen.findByLabelText("태그 추가");
    expect(tagInput.classList.contains("tk-input")).toBe(true);
  });

  it("새 메모는 목록에서 고른 카테고리로 만들어진다", async () => {
    createMemo.mockResolvedValue(memo({ id: "new1", category_id: "c1" }));
    mount("new", "c1");
    await screen.findByRole("radio", { name: "회사" });
    expect((screen.getByRole("radio", { name: "회사" }) as HTMLInputElement).checked).toBe(true);
    type("본문", "주간 보고");
    await wait(900);
    expect(createMemo).toHaveBeenCalledWith(expect.objectContaining({ body: "주간 보고", category_id: "c1" }));
  });

  it("카테고리 칩 하나로 옮기고, 미분류로 되돌릴 수 있다", async () => {
    getMemo.mockResolvedValue(memo());
    patchMemo.mockResolvedValueOnce(memo({ category_id: "c2", rev: 2 })).mockResolvedValueOnce(memo({ rev: 3 }));
    mount("m1");
    fireEvent.click(await screen.findByRole("radio", { name: "집" }));
    await wait(900);
    expect(patchMemo).toHaveBeenLastCalledWith("m1", expect.objectContaining({ category_id: "c2", rev: 1 }));
    fireEvent.click(screen.getByRole("radio", { name: "미분류" }));
    await wait(900);
    expect(patchMemo).toHaveBeenLastCalledWith("m1", expect.objectContaining({ category_id: null, rev: 2 }));
  });

  it("태그 칸에 쓰면 기존 태그를 제안하고, 누르면 붙는다(대소문자만 다르면 기존 태그를 다시 쓴다)", async () => {
    getMemo.mockResolvedValue(memo({ tags: [] }));
    patchMemo.mockResolvedValue(memo({ rev: 2 }));
    mount("m1");
    await screen.findByLabelText("본문");
    await wait(10);
    const input = screen.getByLabelText("태그 추가");
    fireEvent.focus(input);
    expect(screen.queryByRole("group", { name: "태그 제안" })).toBeNull(); // 포커스만으로는 제안을 열지 않는다
    type("태그 추가", "wo");
    expect(screen.getByRole("group", { name: "태그 제안" }).textContent).toContain("#Work");
    expect(screen.getByRole("group", { name: "태그 제안" }).textContent).not.toContain("#장보기");
    fireEvent.click(screen.getByRole("button", { name: "#Work" }));
    expect((input as HTMLInputElement).value).toBe("");
    type("태그 추가", "새태그");
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    await wait(900);
    expect(patchMemo).toHaveBeenLastCalledWith("m1", expect.objectContaining({ tags: ["Work", "새태그"] }));
  });

  describe("태그는 명시할 때만 붙는다", () => {
    const tagsShown = () => [...document.querySelectorAll(".memo-editor__tag > span")].map((e) => e.textContent);

    it("쓰다가 입력칸을 떠나도(blur) 태그가 붙지 않고, 쓰던 글자는 남는다", async () => {
      getMemo.mockResolvedValue(memo({ tags: [] }));
      mount("m1");
      await screen.findByLabelText("본문");
      const input = screen.getByLabelText("태그 추가") as HTMLInputElement;
      input.focus();
      type("태그 추가", "우연히");
      // 본문을 눌러 포커스를 옮기는 상황
      fireEvent.blur(input);
      screen.getByLabelText("본문").focus();
      await wait(2000);
      expect(tagsShown()).toEqual([]);
      expect(input.value).toBe("우연히");
      expect(patchMemo).not.toHaveBeenCalled();
    });

    it("추가 버튼은 쓴 글자가 있을 때만 켜지고, 누르면 붙은 뒤 입력칸이 비워진다", async () => {
      getMemo.mockResolvedValue(memo({ tags: [] }));
      patchMemo.mockResolvedValue(memo({ tags: ["#새"], rev: 2 }));
      mount("m1");
      await screen.findByLabelText("본문");
      const add = screen.getByRole("button", { name: "추가" }) as HTMLButtonElement;
      expect(add.disabled).toBe(true);
      type("태그 추가", "  ##새  ");
      expect(add.disabled).toBe(false);
      fireEvent.click(add);
      expect(tagsShown()).toEqual(["새"]);
      expect((screen.getByLabelText("태그 추가") as HTMLInputElement).value).toBe("");
      expect(add.disabled).toBe(true);
    });

    it("Enter 로 붙고, 한글 조합 중의 Enter 는 붙이지 않는다", async () => {
      getMemo.mockResolvedValue(memo({ tags: [] }));
      mount("m1");
      await screen.findByLabelText("본문");
      const input = screen.getByLabelText("태그 추가");
      type("태그 추가", "가나");
      fireEvent.keyDown(input, { key: "Enter", isComposing: true });
      expect(tagsShown()).toEqual([]);
      fireEvent.keyDown(input, { key: "Enter" });
      expect(tagsShown()).toEqual(["가나"]);
    });

    it("이미 있는 태그는 안내하고 붙이지 않는다. 빈 입력칸에서 Backspace 로 태그를 지우지도 않는다", async () => {
      getMemo.mockResolvedValue(memo({ tags: ["집"] }));
      mount("m1");
      await screen.findByLabelText("본문");
      const input = screen.getByLabelText("태그 추가");
      fireEvent.keyDown(input, { key: "Backspace" });
      expect(tagsShown()).toEqual(["집"]);
      type("태그 추가", "집");
      expect(screen.getByText("이미 붙어 있는 태그예요.")).toBeTruthy();
      expect((screen.getByRole("button", { name: "추가" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.keyDown(input, { key: "Enter" });
      expect(tagsShown()).toEqual(["집"]);
    });

    it("붙인 태그는 x 버튼으로만 뺀다", async () => {
      getMemo.mockResolvedValue(memo({ tags: ["집", "장보기"] }));
      mount("m1");
      await screen.findByLabelText("본문");
      fireEvent.click(screen.getByRole("button", { name: "태그 집 빼기" }));
      expect(tagsShown()).toEqual(["장보기"]);
    });
  });
});
