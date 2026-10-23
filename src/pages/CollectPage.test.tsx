import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

vi.mock("../features/collector/Overview", () => ({ Overview: ({ scope }: { scope: string }) => <p>현황 {scope}</p>, BudgetCard: () => <p>한도 카드</p> }));
vi.mock("../features/collector/Review", () => ({ Review: ({ scope }: { scope: string }) => <p>검토 {scope}</p> }));
vi.mock("../features/collector/Deliveries", () => ({ Deliveries: () => <p>전달 결과 목록</p> }));
vi.mock("../features/kb/Collection", () => ({ SourcesPanel: () => <p>출처 패널</p>, RunsPanel: () => <p>실행 패널</p> }));
vi.mock("../features/kb/Quality", () => ({ QualityPanel: () => <p>품질 패널</p> }));
vi.mock("../api/collector", () => ({ collectBudgets: vi.fn().mockResolvedValue({}) }));
import { CollectPage } from "./CollectPage";

afterEach(cleanup);
const mount = (url: string) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[url]}><CollectPage /></MemoryRouter></QueryClientProvider>);

it("기본은 현황이고 탭과 범위가 URL로 바뀐다", () => {
  mount("/collect");
  expect(screen.getByText("현황 personal")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "검토" }));
  expect(screen.getByText("검토 personal")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "회사" }));
  expect(screen.getByText("검토 work")).toBeTruthy();
  expect(screen.getByRole("button", { name: "회사" }).getAttribute("aria-pressed")).toBe("true");
});

it("실행 탭은 이력과 전달 결과를 함께 보이고, 모르는 view 는 현황으로 돌아간다", () => {
  mount("/collect?view=runs");
  expect(screen.getByText("실행 패널")).toBeTruthy();
  expect(screen.getByText("전달 결과 목록")).toBeTruthy();
  cleanup();
  mount("/collect?view=bogus");
  expect(screen.getByText("현황 personal")).toBeTruthy();
});
