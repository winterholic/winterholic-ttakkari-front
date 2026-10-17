import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { AccountUsage } from "../../api/client";
import { UsageDialog } from "./UsageDialog";

const api = vi.hoisted(() => ({ accountUsage: vi.fn(), qwenUsage: vi.fn(), qwenFlashUsage: vi.fn() }));
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
  api.qwenFlashUsage.mockResolvedValue({ model: "Qwen3.8-Flash-Next Q2_K", scope: "server_lifetime", observed_at: "2026-10-17T03:00:00Z", server: { status: "running", detail: null }, metrics_status: "available", input_tokens: 6732, cached_input_tokens: 26609, output_tokens: 1804, requests_processing: 0, requests_deferred: 1 });
  api.qwenUsage.mockResolvedValue({
    model: "Qwen3.5-4B Q4_K_M", timezone: "Asia/Seoul", collection_started_at: "2026-10-16T00:00:00+00:00",
    server: { enabled: true, status: "running", detail: null },
    today: { starts_at: "2026-10-15T15:00:00+00:00", ends_at: "2026-10-16T00:30:00+00:00", calls: 4, metered_calls: 4, usage_missing_calls: 0, failed_calls: 0, unmetered_calls: 0, input_tokens: 1234, output_tokens: 321, total_tokens: 1555, last_used_at: "2026-10-16T00:25:00+00:00" },
    week: { starts_at: "2026-10-11T15:00:00+00:00", ends_at: "2026-10-16T00:30:00+00:00", calls: 9, metered_calls: 8, usage_missing_calls: 1, failed_calls: 0, unmetered_calls: 1, input_tokens: 2000, output_tokens: 500, total_tokens: 2500, last_used_at: "2026-10-16T00:25:00+00:00" },
  });
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

describe("UsageDialog 한도 화면", () => {
  const limited: AccountUsage = { ...account, engine: "codex", windows: [{ key: "5h", label: "5시간", percent: 100, remaining_percent: 0, resets_at: 1792088498 }], login: "ok" };

  it("켜진 계정이 모두 한도에 걸리면 일러스트(장식)와 안내를 보여 준다", async () => {
    renderUsage(limited);
    expect(await screen.findByText("켜진 계정이 모두 한도에 걸렸어요")).toBeTruthy();
    const art = document.querySelector('figure[data-art="state-usage-limit"]');
    expect(art).toBeTruthy();
    expect(art?.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("한도에 걸리지 않았거나 계정이 꺼져 있으면 한도 화면을 띄우지 않는다", async () => {
    renderUsage({ ...limited, windows: [{ ...limited.windows[0], percent: 10 }] });
    expect(await screen.findByText("지금 사용")).toBeTruthy();
    expect(screen.queryByText("켜진 계정이 모두 한도에 걸렸어요")).toBeNull();
  });
});

describe("UsageDialog Qwen token usage", () => {
  it("운영 접수 토큰의 일간·주간 입력/출력/합계와 미계측 수를 보여 준다", async () => {
    renderUsage();
    expect(await screen.findByText("Qwen 접수 · 경량 모델")).toBeTruthy();
    expect(await screen.findByText("1,234")).toBeTruthy();
    expect(screen.getByText("321")).toBeTruthy();
    expect(screen.getByText("1,555")).toBeTruthy();
    expect(screen.getByText(/토큰 누락 오늘 0회 \/ 실패 0회 · 이번 주 누락 1회 \/ 실패 0회/)).toBeTruthy();
    expect(screen.getByText(/이번 주 월요일 00:00부터 KST/)).toBeTruthy();
  });

  it("미수집 상태는 0 사용량으로 꾸미지 않는다", async () => {
    api.qwenUsage.mockResolvedValueOnce({
      model: "Qwen3.5-4B Q4_K_M", timezone: "Asia/Seoul", collection_started_at: null,
      server: { enabled: true, status: "not_started", detail: null },
      today: { starts_at: "2026-10-15T15:00:00+00:00", ends_at: "2026-10-16T00:30:00+00:00", calls: 0, metered_calls: 0, usage_missing_calls: 0, failed_calls: 0, unmetered_calls: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, last_used_at: null },
      week: { starts_at: "2026-10-11T15:00:00+00:00", ends_at: "2026-10-16T00:30:00+00:00", calls: 0, metered_calls: 0, usage_missing_calls: 0, failed_calls: 0, unmetered_calls: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, last_used_at: null },
    });
    renderUsage();
    expect(await screen.findAllByText("—")).toHaveLength(6);
    expect(screen.getByText("이력 없음 · 토큰 수집 시작 후부터 집계돼요.")).toBeTruthy();
  });

  it("Qwen 접수가 중지된 상태를 토큰 0회와 구분해 보여 준다", async () => {
    api.qwenUsage.mockResolvedValueOnce({
      model: "Qwen3.5-4B Q4_K_M", timezone: "Asia/Seoul", collection_started_at: null,
      server: { enabled: false, status: "disabled", detail: null }, today: {}, week: {},
    });
    renderUsage();
    expect(await screen.findByText("사용 중지")).toBeTruthy();
    expect(screen.getByText("Qwen 접수가 사용 중지되어 있어요.")).toBeTruthy();
    expect(screen.queryByText("0회 호출")).toBeNull();
  });

  it("Qwen usage API 오류는 오류 상태로 표시한다", async () => {
    api.qwenUsage.mockRejectedValueOnce(new Error("usage API unavailable"));
    renderUsage();
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("usage 가 없는 호출만 있으면 토큰을 0으로 표시하지 않는다", async () => {
    const period = { starts_at: "2026-10-15T15:00:00+00:00", ends_at: "2026-10-16T00:30:00+00:00", calls: 1, metered_calls: 0, usage_missing_calls: 1, failed_calls: 0, unmetered_calls: 1, input_tokens: 0, output_tokens: 0, total_tokens: 0, last_used_at: "2026-10-16T00:25:00+00:00" };
    api.qwenUsage.mockResolvedValueOnce({ model: "Qwen3.5-4B Q4_K_M", timezone: "Asia/Seoul", collection_started_at: "2026-10-16T00:25:00+00:00", server: { enabled: true, status: "running", detail: null }, today: period, week: period });
    renderUsage();
    expect(await screen.findAllByText("—")).toHaveLength(6);
    expect(screen.getAllByText(/1회 호출 · 마지막 호출/)).toHaveLength(2);
  });
});


describe("Flash Next usage", () => {
  it("Flash Next 토큰과 접수 토큰을 별도 카드에서 보여 준다", async () => {
    renderUsage();
    const flash = await screen.findByRole("region", { name: "Qwen Flash Next 사용량" });
    expect(await within(flash).findByText("6,732")).toBeTruthy();
    expect(within(flash).getByText("26,609")).toBeTruthy();
    expect(within(flash).getByText("1,804")).toBeTruthy();
    expect(within(flash).getByText(/서버를 재시작하면 초기화/)).toBeTruthy();
    const intake = screen.getByRole("region", { name: "Qwen 로컬 모델 토큰 사용량" });
    expect(within(intake).getByText("1,234")).toBeTruthy();
    expect(within(intake).queryByText("6,732")).toBeNull();
  });

  it("Flash 서버 중지·계측 누락은 0으로 표시하지 않는다", async () => {
    api.qwenFlashUsage.mockResolvedValue({ model: "Qwen3.8-Flash-Next Q2_K", scope: "server_lifetime", observed_at: "2026-10-17T03:00:00Z", server: { status: "unavailable", detail: null }, metrics_status: "unavailable", input_tokens: null, cached_input_tokens: null, output_tokens: null, requests_processing: null, requests_deferred: null });
    renderUsage();
    const flash = await screen.findByRole("region", { name: "Qwen Flash Next 사용량" });
    expect(await within(flash).findByText("서버 미연결")).toBeTruthy();
    expect(within(flash).queryByText("0")).toBeNull();
    expect(within(flash).getAllByText("—")).toHaveLength(3);
  });
});
