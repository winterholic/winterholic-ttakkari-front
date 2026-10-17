import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { setAccessToken } from "../../api/client";
import type { AccountUsage } from "../../api/client";
import { UsageDialog } from "./UsageDialog";

// 구버전 백엔드(새 엔드포인트 없음)에서도 모달이 예전처럼 카드를 채우는지, 실제 클라이언트로 확인한다.
const account: AccountUsage = {
  id: "agy", name: "Antigravity", engine: "antigravity", pool: "personal", enabled: true, rank: 1,
  max_used_percent: 100, remaining_to_limit_percent: null, stale: false, work_enabled: true, work_rank: null,
  login: "unknown", cooldown_seconds: 0,
  windows: [{ key: "agy_gemini_models_weekly", label: "Gemini Models · 주간", percent: 1, remaining_percent: 99.3, resets_at: 1792675298 }],
  credits_balance: 0, credits_error: null, source: "antigravity_cli", plan: null, error: null, updated_at: 1792088498,
};
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("fetch", fetchMock);
  setAccessToken("t");
  fetchMock.mockImplementation(async (url) => {
    const p = new URL(String(url)).pathname;
    if (p === "/api/accounts/usage") return res([account]);
    if (p.startsWith("/api/accounts/qwen-flash-usage") || p.startsWith("/api/accounts/qwen-usage")) return res({ detail: "x" }, 503);
    return res({ code: "not_found", message: "Not Found" }, 404);
  });
});
afterEach(() => { cleanup(); fetchMock.mockReset(); vi.unstubAllGlobals(); });

it("새 엔드포인트가 404여도 일괄 API 결과로 카드를 채우고 Not Found 를 보이지 않는다", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={qc}><UsageDialog open onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);
  expect(await screen.findByText("99.3% 남음")).toBeTruthy();
  expect(screen.queryByText("Not Found")).toBeNull();
});
