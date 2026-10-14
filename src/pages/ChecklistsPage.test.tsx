import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { moreFeatures } from "../shell/features";

const h = vi.hoisted(() => ({ list: vi.fn(), templates: vi.fn(), create: vi.fn(), patch: vi.fn(), remove: vi.fn(), createFixed: vi.fn(), patchFixed: vi.fn(), removeFixed: vi.fn() }));
vi.mock("../api/client", () => ({
  listChecklist: h.list, listChecklistTemplates: h.templates,
  createChecklistItem: h.create, patchChecklistItem: h.patch, deleteChecklistItem: h.remove,
  createChecklistTemplate: h.createFixed, patchChecklistTemplate: h.patchFixed, deleteChecklistTemplate: h.removeFixed,
}));
vi.mock("../shell/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));

beforeEach(() => {
  vi.clearAllMocks();
  h.list.mockResolvedValue({ day: "2026-10-14", total: 1, completed: 0, items: [{ id: "a", day: "2026-10-14", title: "물 마시기", checked: false, template_id: "t" }] });
  h.templates.mockResolvedValue({ templates: [{ id: "t", title: "물 마시기" }] });
  for (const fn of [h.create, h.patch, h.remove, h.createFixed, h.patchFixed, h.removeFixed]) fn.mockResolvedValue({});
  HTMLDialogElement.prototype.showModal ??= function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);
async function mount() {
  const { ChecklistsPage } = await import(/* @vite-ignore */ "./" + "ChecklistsPage");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/checklists?date=2026-10-14"]}><ChecklistsPage /></MemoryRouter></QueryClientProvider>);
}

it("부가기능과 더보기 메뉴에 체크리스트를 표시한다", () => {
  expect(moreFeatures().find(f => f.to === "/checklists")?.label).toBe("체크리스트");
});
it("날짜별 목록을 읽고 체크·추가한다", async () => {
  await mount();
  const check = await screen.findByRole("checkbox", { name: "물 마시기" });
  fireEvent.click(check);
  await waitFor(() => expect(h.patch).toHaveBeenCalledWith("a", { checked: true }));
  fireEvent.change(screen.getByLabelText("새 항목"), { target: { value: "산책" } });
  fireEvent.click(screen.getByRole("button", { name: "추가" }));
  await waitFor(() => expect(h.create).toHaveBeenCalledWith({ title: "산책", day: "2026-10-14" }));
  expect(h.list).toHaveBeenCalledWith("2026-10-14");
});
it("고정 항목과 오늘 항목을 각각 수정·삭제한다", async () => {
  await mount();
  await screen.findByText("물 마시기");
  fireEvent.click(screen.getByRole("button", { name: "물 마시기 수정" }));
  fireEvent.change(screen.getByLabelText("항목 이름"), { target: { value: "물 두 잔" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(h.patch).toHaveBeenCalledWith("a", { title: "물 두 잔" }));
  fireEvent.click(screen.getByRole("tab", { name: "고정 항목" }));
  fireEvent.change(await screen.findByLabelText("새 항목"), { target: { value: "걷기" } });
  fireEvent.click(screen.getByRole("button", { name: "추가" }));
  await waitFor(() => expect(h.createFixed).toHaveBeenCalledWith("걷기"));
  fireEvent.click(screen.getByRole("button", { name: "물 마시기 수정" }));
  fireEvent.change(screen.getByLabelText("항목 이름"), { target: { value: "물 세 잔" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(h.patchFixed).toHaveBeenCalledWith("t", "물 세 잔"));
  fireEvent.click(screen.getByRole("button", { name: "물 마시기 삭제" }));
  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  await waitFor(() => expect(h.removeFixed).toHaveBeenCalledWith("t"));
});
it("수정 실패를 알리고 입력을 유지한다", async () => {
  h.create.mockRejectedValue(new Error("연결 끊김"));
  await mount();
  await screen.findByRole("checkbox");
  fireEvent.change(screen.getByLabelText("새 항목"), { target: { value: "산책" } });
  fireEvent.click(screen.getByRole("button", { name: "추가" }));
  expect((await screen.findByRole("alert")).textContent).toContain("연결 끊김");
  expect((screen.getByLabelText("새 항목") as HTMLInputElement).value).toBe("산책");
});
it("폰 화면 복귀 시 MCP에서 바꾼 목록을 다시 읽는다", async () => {
  await mount();
  await screen.findByRole("checkbox");
  h.list.mockClear();
  fireEvent(window, new Event("pageshow"));
  await waitFor(() => expect(h.list).toHaveBeenCalled());
});
it("키보드 화살표로 고정 항목 탭을 선택한다", async () => {
  await mount();
  await screen.findByRole("checkbox");
  const tab = screen.getByRole("tab", { name: "매일 체크" });
  tab.focus();
  fireEvent.keyDown(tab, { key: "ArrowRight" });
  await waitFor(() => expect(screen.getByRole("tab", { name: "고정 항목" }).getAttribute("aria-selected")).toBe("true"));
});
