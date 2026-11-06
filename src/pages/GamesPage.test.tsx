import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { GamesPage } from "./GamesPage";

const api = vi.hoisted(() => ({ listGames: vi.fn(), discoverGames: vi.fn(), registerGame: vi.fn() }));
vi.mock("../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/games"]}><Routes>
    <Route path="/games" element={<GamesPage />} />
    <Route path="/games/g1" element={<p>게임 작업 공간</p>} />
  </Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { api.listGames.mockResolvedValue([]); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("내 게임을 먼저 보여주고 생성과 기존 게임 연결을 별도로 연다", async () => {
  show();
  expect(await screen.findByRole("heading", { name: "내 게임 이어하기" })).toBeTruthy();
  expect(api.discoverGames).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("새 게임 만들기")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "새 게임 만들기" }));
  expect(screen.getByRole("form", { name: "새 게임 만들기" })).toBeTruthy();
});

it("폴더를 선택해 연결하면 바로 해당 게임 작업 공간으로 간다", async () => {
  api.discoverGames.mockResolvedValue({ candidates: [{ slug: "ceopark", name: "CeoPark", engine_id: "web-phaser", game_id: null, can_register: true, issues: ["플레이 호환성은 연결 후 확인해 주세요."] }], has_more: false });
  api.registerGame.mockResolvedValue({ id: "g1", name: "CeoPark" });
  show();
  fireEvent.click(screen.getByRole("button", { name: "기존 게임 연결" }));
  expect(await screen.findByText("CeoPark")).toBeTruthy();
  expect(screen.getByText(/플레이 호환성/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "CeoPark 연결" }));
  expect(await screen.findByText("게임 작업 공간")).toBeTruthy();
  expect(api.registerGame).toHaveBeenCalledWith("ceopark");
});

it("진단 실패를 빈 목록으로 숨기지 않고 다시 조회할 수 있다", async () => {
  api.discoverGames.mockRejectedValueOnce(new Error("진단 연결 실패"));
  show();
  fireEvent.click(screen.getByRole("button", { name: "기존 게임 연결" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  api.discoverGames.mockResolvedValue({ candidates: [], has_more: false });
  fireEvent.click(screen.getByRole("button", { name: "다시 찾기" }));
  await waitFor(() => expect(api.discoverGames).toHaveBeenCalledTimes(2));
  expect(await screen.findByText(/연결할 게임 폴더를 찾지 못했어요/)).toBeTruthy();
});
