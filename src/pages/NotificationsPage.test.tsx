import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const h = vi.hoisted(() => ({ listNotifications: vi.fn(), readNotification: vi.fn(), readAllNotifications: vi.fn() }));
vi.mock("../api/client", async (orig) => ({ ...(await orig<typeof import("../api/client")>()), ...h }));
import { NotificationsPage } from "./NotificationsPage";

const items = [
  { id: 3, kind: "push.agent", category: "assistant", title: "분석을 확인해 주세요", body: "긴 분석 내용", url: "/chat/s1", created_at: "2026-10-16T02:00:00Z", read_at: null },
  { id: 2, kind: "push.meeting", category: "meetings", title: "회의록 분석 완료", body: "주간 회의", url: "/meetings/m1", created_at: "2026-10-16T01:00:00Z", read_at: null },
];
const counts = { all: 2, tasks: 0, assistant: 1, planner: 0, meetings: 1, system: 0 };

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/notifications"]}>
    <Routes><Route path="/notifications" element={<NotificationsPage />} /><Route path="/chat/s1" element={<p>원래 대화</p>} /></Routes>
  </MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  h.listNotifications.mockReset().mockImplementation(async (params) => ({
    items: params?.category ? items.filter(x => x.category === params.category) : items,
    unread_counts: counts, next_before: null,
  }));
  h.readNotification.mockReset().mockResolvedValue({ ...items[0], read_at: "2026-10-16T03:00:00Z" });
  h.readAllNotifications.mockReset().mockResolvedValue({ updated: 2 });
});
afterEach(cleanup);

it("유형 탭과 안 읽은 개수를 보여 주고 탭·키보드·미확인 필터로 목록을 조회한다", async () => {
  mount();
  expect(await screen.findByText("분석을 확인해 주세요")).toBeTruthy();
  expect(screen.getAllByRole("tab")).toHaveLength(6);
  fireEvent.click(screen.getByRole("tab", { name: /회의록/ }));
  await waitFor(() => expect(screen.queryByText("분석을 확인해 주세요")).toBeNull());
  expect(screen.getByRole("tab", { name: /회의록/ }).getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(screen.getByRole("tab", { name: /회의록/ }), { key: "ArrowRight" });
  await waitFor(() => expect(screen.getByRole("tab", { name: /시스템/ }).getAttribute("aria-selected")).toBe("true"));
  fireEvent.click(screen.getByRole("checkbox", { name: "안 읽은 알림만" }));
  await waitFor(() => expect(h.listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ category: "system", unread_only: true })));
});

it("원래 화면을 열 때 읽음 처리를 하고 이동한다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("link", { name: /분석을 확인해 주세요/ }));
  expect(await screen.findByText("원래 대화")).toBeTruthy();
  expect(h.readNotification).toHaveBeenCalledWith(3);
});

it("현재 유형의 최신 조회 범위까지만 모두 읽음 처리한다", async () => {
  mount();
  await screen.findByText("분석을 확인해 주세요");
  fireEvent.click(screen.getByRole("tab", { name: /회의록/ }));
  await waitFor(() => expect((screen.getByRole("button", { name: "모두 읽음" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "모두 읽음" }));
  await waitFor(() => expect(h.readAllNotifications).toHaveBeenCalledWith({ category: "meetings", through_id: 2 }));
});

it("읽음 처리 실패 시 목록과 다시 시도할 오류를 남긴다", async () => {
  h.readNotification.mockRejectedValue(new Error("네트워크 오류"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "분석을 확인해 주세요 읽음 처리" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByText("분석을 확인해 주세요")).toBeTruthy();
});

it("다음 페이지 실패 시 기존 목록을 보존하고 재시도할 수 있다", async () => {
  h.listNotifications.mockImplementation(async (params) => {
    if (params?.before) throw new Error("일시 실패");
    return { items, unread_counts: counts, next_before: 2 };
  });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "더 보기" }));
  expect(await screen.findByText("알림을 불러오지 못했어요")).toBeTruthy();
  expect(screen.getByText("분석을 확인해 주세요")).toBeTruthy();
  expect(screen.getByRole("button", { name: "더 보기" })).toBeTruthy();
});

it("빈 목록에 보관 시작 안내를 표시한다", async () => {
  h.listNotifications.mockResolvedValue({ items: [], unread_counts: { ...counts, all: 0 }, next_before: null });
  mount();
  expect(await screen.findByText("아직 알림이 없어요")).toBeTruthy();
});
