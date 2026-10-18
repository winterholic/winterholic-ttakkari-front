import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { FEATURES } from "../shell/features";

const h = vi.hoisted(() => ({ overview: vi.fn() }));
vi.mock("../api/client", () => ({ listStocksProviders: h.overview }));
vi.mock("../shell/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("../hooks/useForegroundResync", () => ({ useForegroundResync: () => {} }));

afterEach(cleanup);

function mount(entry = "/stocks") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/stocks" element={<StocksPage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>);
}

import { StocksPage } from "./StocksPage";

it("부가 기능에 주식 투자로 등록된다", () => {
  expect(FEATURES.find((f) => f.root === "stocks")).toMatchObject({ to: "/stocks", label: "주식 투자" });
});

it("연결 카드를 보여주고 토스증권 하위 페이지로 연결한다", async () => {
  h.overview.mockResolvedValue([{ id: "tossinvest", name: "토스증권", state: "login_required", checked_at: null, detail: "/stocks/tossinvest" }]);
  mount();
  expect(await screen.findByText("토스증권 연결")).toBeTruthy();
  expect(screen.getByText("로그인이 필요해요 · 자세히 보기")).toBeTruthy();
  expect(screen.getByRole("link", { name: /토스증권 연결/ }).getAttribute("href")).toBe("/stocks/tossinvest");
});
