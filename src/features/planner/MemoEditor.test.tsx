import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  return { FakeApiError, createMemo: vi.fn(), patchMemo: vi.fn(), getMemo: vi.fn(), deleteMemo: vi.fn() };
});
const { FakeApiError, createMemo, patchMemo, getMemo, deleteMemo } = h;
vi.mock("../../api/client", () => ({
  ApiError: h.FakeApiError,
  createMemo: (...a: unknown[]) => h.createMemo(...a),
  patchMemo: (...a: unknown[]) => h.patchMemo(...a),
  getMemo: (...a: unknown[]) => h.getMemo(...a),
  deleteMemo: (...a: unknown[]) => h.deleteMemo(...a),
}));

import { MemoEditor } from "./MemoEditor";

const memo = (p: Record<string, unknown> = {}) => ({
  id: "m1", title: "장보기", body: "- 우유", tags: ["집"], pinned: false, source: "user", rev: 1, excerpt: "", created_at: "", updated_at: "", ...p,
});

function mount(memoId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MemoEditor memoId={memoId} />
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
});
