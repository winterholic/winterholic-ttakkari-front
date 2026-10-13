import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { CalendarPage } from "./CalendarPage";

vi.mock("../api/client", async (orig) => ({
  ...(await orig<object>()),
  listEvents: vi.fn().mockResolvedValue({ events: [] }),
  listHolidays: vi.fn().mockResolvedValue({ holidays: [] }),
}));
vi.mock("../shell/PageHeader", () => ({ PageHeader: () => <header>캘린더</header> }));
vi.mock("../features/planner/EventDialog", () => ({ EventDialog: () => null }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("실제 FullCalendar에서 음력을 끄면 기존 날짜의 음력 DOM도 즉시 사라진다", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/calendar?date=2026-10-13"]}><CalendarPage /></MemoryRouter></QueryClientProvider>);
  const toggle = screen.getByRole("switch", { name: "음력" });
  await waitFor(() => expect(document.querySelectorAll(".planner-cal__lunar").length).toBeGreaterThan(0));
  fireEvent.click(toggle);
  expect((toggle as HTMLInputElement).checked).toBe(false);
  await waitFor(() => expect(document.querySelectorAll(".planner-cal__lunar")).toHaveLength(0));
  expect(localStorage.getItem("tk-calendar-lunar-display")).toBe("false");
  fireEvent.click(toggle);
  await waitFor(() => expect(document.querySelectorAll(".planner-cal__lunar").length).toBeGreaterThan(0));
});
