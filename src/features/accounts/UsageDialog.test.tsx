import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { AccountUsage } from "../../api/client";
import { UsageDialog } from "./UsageDialog";

const api = vi.hoisted(() => ({ accountUsage: vi.fn() }));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));

const account: AccountUsage = {
  id: "agy", name: "Antigravity", engine: "antigravity", pool: "personal", enabled: true, rank: 1,
  max_used_percent: 100, remaining_to_limit_percent: null, stale: false, work_enabled: true, work_rank: null,
  login: "unknown", cooldown_seconds: 0,
  windows: [
    { key: "agy_gemini_models_5h", label: "Gemini Models · 5시간", percent: 1, remaining_percent: 98.9, resets_at: 1792088498 },
    { key: "agy_gemini_models_weekly", label: "Gemini Models · 주간", percent: 1, remaining_percent: 99.3, resets_at: 1792675298 },
    { key: "agy_claude_and_gpt_models_weekly", label: "Claude and GPT models · 주간", percent: 100, remaining_percent: 0, resets_at: 1792679175 },
  ],
  credits_balance: 0, credits_error: null, source: "antigravity_cli", plan: null, error: null, updated_at: 1792088498,
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  api.accountUsage.mockResolvedValue([account]);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function renderUsage(value: AccountUsage = account) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.accountUsage.mockResolvedValue([value]);
  render(<MemoryRouter><QueryClientProvider client={qc}><UsageDialog open onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);
}

describe("UsageDialog Antigravity quota", () => {
  it("모델 그룹별 잔여 quota 와 AI 크레딧을 단위를 나눠 보여 준다", async () => {
    renderUsage();
    expect(await screen.findByText("Gemini Models · 주간 99.3% 남음")).toBeTruthy();
    expect(screen.getByText("AI 크레딧 잔액: 0 크레딧")).toBeTruthy();
    expect(screen.getByText("지금 사용")).toBeTruthy();
    expect(screen.queryByText(/계정 상한/)).toBeNull();
    expect(screen.getByText(/Antigravity 공식 CLI 기준/)).toBeTruthy();
  });

  it("quota 가 오래됐으면 상태 배지에 오래된 측정이라고 표시한다", async () => {
    renderUsage({ ...account, stale: true });
    expect(await screen.findByText("오래된 측정")).toBeTruthy();
  });

  it("CLI 조회 실패는 0 잔액으로 바꾸지 않는다", async () => {
    renderUsage({ ...account, windows: [], credits_balance: null, error: "Antigravity CLI 조회 실패" });
    expect(await screen.findByText("조회 실패")).toBeTruthy();
    expect(screen.getByText(/AI 크레딧 잔액: 조회 실패/)).toBeTruthy();
  });
});
