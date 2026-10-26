import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { AccountUsage } from "../../api/client";
import { UsageDialog } from "./UsageDialog";

const api = vi.hoisted(() => ({ accountUsageCached: vi.fn(), accountUsageOne: vi.fn(), qwenUsage: vi.fn(), qwenFlashUsage: vi.fn() }));
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

/** 목록은 사용량 없이 오고(캐시 비어 있음), 계정별 조회가 값을 채운다. */
function mockAccounts(rows: AccountUsage[]) {
  api.accountUsageCached.mockResolvedValue(rows.map((r) => ({ ...r, windows: [], updated_at: null, stale: true, source: null, plan: null, error: null })));
  api.accountUsageOne.mockImplementation((id: string) => Promise.resolve(rows.find((r) => r.id === id)));
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  mockAccounts([account]);
  api.qwenFlashUsage.mockResolvedValue({ model: "Qwen3.8-Flash-Next Q2_K", scope: "server_lifetime", observed_at: "2026-10-17T03:00:00Z", server: { status: "running", detail: null }, metrics_status: "available", input_tokens: 6732, cached_input_tokens: 26609, output_tokens: 1804, requests_processing: 0, requests_deferred: 1 });
  api.qwenUsage.mockResolvedValue({
    model: "Qwen3.5-4B Q4_K_M", timezone: "Asia/Seoul", collection_started_at: "2026-10-16T00:00:00+00:00",
    server: { enabled: true, status: "running", detail: null },
    today: { starts_at: "2026-10-15T15:00:00+00:00", ends_at: "2026-10-16T00:30:00+00:00", calls: 4, metered_calls: 4, usage_missing_calls: 0, failed_calls: 0, unmetered_calls: 0, input_tokens: 1234, output_tokens: 321, total_tokens: 1555, last_used_at: "2026-10-16T00:25:00+00:00" },
    week: { starts_at: "2026-10-11T15:00:00+00:00", ends_at: "2026-10-16T00:30:00+00:00", calls: 9, metered_calls: 8, usage_missing_calls: 1, failed_calls: 0, unmetered_calls: 1, input_tokens: 2000, output_tokens: 500, total_tokens: 2500, last_used_at: "2026-10-16T00:25:00+00:00" },
  });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear(); });

function renderUsage(value: AccountUsage = account) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockAccounts([value]);
  render(<MemoryRouter><QueryClientProvider client={qc}><UsageDialog open onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);
}

describe("Muse Code preparation state", () => {
  it("운영 검증 전인 엔진을 사용 가능 계정으로 표시하지 않는다", async () => {
    renderUsage({ ...account, engine: "muse", name: "Muse", windows: [], source: null,
      execution_enabled: false, error: "Muse 실행은 운영 검증 전까지 비활성 상태예요" } as AccountUsage);
    expect(await screen.findByText("실행 검증 전")).toBeTruthy();
    expect(screen.queryByText("지금 사용")).toBeNull();
  });
});

describe("Muse 구독 측정과 실행 상태 분리", () => {
  it("실행 검증 전이어도 공급자가 관측한 사용량과 로그인 상태를 보여 준다", async () => {
    renderUsage({ ...account, engine: "muse", name: "Muse 구독", login: "ok", execution_enabled: false,
      source: "muse_cli", windows: [{ key: "five_hour", label: "5시간", percent: 17, resets_at: null }] });
    expect(await screen.findByText("17%")).toBeTruthy();
    expect(screen.getByText("로그인 확인")).toBeTruthy();
    expect(screen.getByText("실행 검증 전")).toBeTruthy();
    expect(screen.queryByText("지금 사용")).toBeNull();
  });
});

describe("Muse 조회 실패와 낡은 관측값", () => {
  it("초기화가 지난 5시간 창은 사라지지 않고 확인 불가로, 주간은 오래된 값으로 표시한다", async () => {
    const nowSec = Date.now() / 1000;
    renderUsage({ ...account, engine: "muse", name: "Muse 구독", login: "ok", source: "muse_cli", stale: true,
      remaining_to_limit_percent: null, updated_at: nowSec - 3 * 3600,
      error: "Muse 로그인 확인 · /usage 구독 사용량 미관측: unavailable",
      windows: [
        { key: "five_hour", label: "5시간", percent: 0, resets_at: Math.floor(nowSec - 600), state: "unavailable" },
        { key: "seven_day", label: "주간", percent: 33, resets_at: Math.floor(nowSec + 86400), state: "stale" },
      ] });
    expect(await screen.findByText("5시간")).toBeTruthy();
    expect(screen.getByText("확인 불가")).toBeTruthy();
    expect(screen.getByText(/초기화 시각이 지났고 새 관측이 없어요/)).toBeTruthy();
    expect(screen.getByText("33%")).toBeTruthy();
    expect(screen.getByText(/오래된 값 · 3시간 전 관측/)).toBeTruthy();
    expect(screen.getByText("오래된 값", { selector: ".tk-badge" })).toBeTruthy();
    expect(screen.getByText(/상한까지 여유 확인 불가/)).toBeTruthy();
    expect(screen.queryByText("지금 사용")).toBeNull();
  });

  it("두 창 모두 관측이 없으면 배지가 확인 불가이고 0%를 만들지 않는다", async () => {
    renderUsage({ ...account, engine: "muse", name: "Muse 구독", login: "ok", source: null, stale: true,
      remaining_to_limit_percent: null, updated_at: null, error: "Muse 구독 사용량 미관측",
      windows: [
        { key: "five_hour", label: "5시간", percent: 0, resets_at: null, state: "unavailable" },
        { key: "seven_day", label: "주간", percent: 0, resets_at: null, state: "unavailable" },
      ] });
    expect(await screen.findAllByText("확인 불가")).toHaveLength(3);
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.queryByText("지금 사용")).toBeNull();
  });
});

describe("UsageDialog Antigravity quota", () => {
  it("모델 그룹별 잔여 quota 와 AI 크레딧을 단위를 나눠 보여 준다", async () => {
    renderUsage();
    expect(await screen.findByText("99.3% 남음")).toBeTruthy();
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

describe("UsageDialog Antigravity 창별 state", () => {
  const nowSec = Math.floor(Date.now() / 1000);

  it("초기화가 지난 창은 100% 남음이 아니라 확인 불가로 보이고 다른 창은 그대로다", async () => {
    renderUsage({
      ...account, stale: true,
      windows: [
        { key: "agy_gemini_models_5h", label: "Gemini Models · 5시간", percent: 0, remaining_percent: null, resets_at: nowSec - 600, state: "unavailable" },
        { key: "agy_gemini_models_weekly", label: "Gemini Models · 주간", percent: 20, remaining_percent: 80, resets_at: nowSec + 86400, state: "current" },
      ],
    });
    expect(await screen.findAllByText("확인 불가")).not.toHaveLength(0);
    expect(screen.queryByText("100.0% 남음")).toBeNull();
    expect(screen.queryByText("100% 남음")).toBeNull();
    expect(screen.getAllByText("80.0% 남음").length).toBeGreaterThan(0);
  });

  it("조회 실패 뒤 유지한 값은 오래된 값으로 표시한다", async () => {
    renderUsage({
      ...account, stale: true, error: "Antigravity quota 조회 실패(TimeoutError) · 마지막 관측값",
      windows: [{ key: "agy_gemini_models_weekly", label: "Gemini Models · 주간", percent: 40, remaining_percent: 60, resets_at: nowSec + 86400, state: "stale" }],
    });
    expect(await screen.findByText(/현재 잔여량이 아니에요/)).toBeTruthy();
    expect(screen.getByText("오래된 측정")).toBeTruthy();
  });

  it("초기화 시각이 없는 창은 숨기지 않고 이유를 알린다", async () => {
    renderUsage({
      ...account,
      windows: [{ key: "agy_gemini_models_5h", label: "Gemini Models · 5시간", percent: 3, remaining_percent: 97, resets_at: null, state: "current" }],
    });
    expect(await screen.findByText("초기화 시각을 공급자가 주지 않았어요")).toBeTruthy();
  });

  it("모든 창을 못 읽으면 상태가 확인 불가다", async () => {
    renderUsage({
      ...account, stale: true,
      windows: [{ key: "agy_gemini_models_weekly", label: "Gemini Models · 주간", percent: 0, remaining_percent: null, resets_at: nowSec - 5, state: "unavailable" }],
    });
    expect(await screen.findByText("확인 불가", { selector: ".tk-badge" })).toBeTruthy();
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

  it("Flash Next의 일일 및 주간 영속 집계 윈도우를 분리해 보여 준다", async () => {
    api.qwenFlashUsage.mockResolvedValue({
      model: "Qwen3.8-Flash-Next Q2_K",
      scope: "server_lifetime",
      timezone: "Asia/Seoul",
      observed_at: "2026-10-17T03:00:00Z",
      collection_started_at: "2026-10-17T00:00:00Z",
      server: { status: "running", detail: null },
      metrics_status: "available",
      input_tokens: 1500,
      cached_input_tokens: 500,
      output_tokens: 250,
      requests_processing: 0,
      requests_deferred: 0,
      today: {
        starts_at: "2026-10-16T15:00:00Z",
        ends_at: "2026-10-17T03:00:00Z",
        input_tokens: 1500,
        cached_input_tokens: 500,
        output_tokens: 250,
        total_tokens: 1750,
        last_used_at: "2026-10-17T02:50:00Z",
      },
      week: {
        starts_at: "2026-10-11T15:00:00Z",
        ends_at: "2026-10-17T03:00:00Z",
        input_tokens: 3000,
        cached_input_tokens: 1000,
        output_tokens: 500,
        total_tokens: 3500,
        last_used_at: "2026-10-17T02:50:00Z",
      },
    });
    renderUsage();
    const flash = await screen.findByRole("region", { name: "Qwen Flash Next 사용량" });
    expect(await within(flash).findByText("1,500")).toBeTruthy();
    expect(within(flash).getByText("1,750")).toBeTruthy();
    expect(within(flash).getByText("3,000")).toBeTruthy();
    expect(within(flash).getByText("3,500")).toBeTruthy();
    expect(within(flash).getByText(/영속 집계\(서버 재시작 후에도 유지\)/)).toBeTruthy();
  });

  it("상단 탭으로 계정·Flash Next·접수 Qwen 섹션을 전환하고 로컬스토리지에 저장한다", async () => {
    renderUsage();
    const flashTab = screen.getByRole("tab", { name: "Flash Next" });
    expect(flashTab.getAttribute("aria-selected")).toBe("false");
    const { act } = await import("@testing-library/react");
    await act(async () => { flashTab.click(); });
    expect(flashTab.getAttribute("aria-selected")).toBe("true");
    expect(localStorage.getItem("ttakkari:usage-tab")).toBe("flash");
  });
});


describe("전체 계정 사용량 비교", () => {
  it("계정 선택 없이 모든 계정의 사용량과 엔진 구분을 함께 표시한다", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockAccounts([
      { ...account, id: "first", engine: "codex", name: "개인 Codex", login: "ok", rank: 1,
        windows: [{ key: "five_hour", label: "5시간", percent: 24, resets_at: null }] },
      { ...account, id: "second", engine: "codex", name: "회사 Codex", login: "ok", rank: 2, work_rank: 1,
        windows: [{ key: "five_hour", label: "5시간", percent: 73, resets_at: null }] },
      { ...account, id: "muse", engine: "muse", name: "내 Muse", rank: 3, login: "ok", execution_enabled: false,
        windows: [], error: "Muse 로그인 확인 · 공식 CLI에서 구독 사용량 미관측" },
    ]);
    render(<MemoryRouter><QueryClientProvider client={qc}><UsageDialog open onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);
    const personal = await screen.findByRole("region", { name: "개인 계정" });
    const list = within(personal).getByRole("list", { name: "개인 계정 사용량" });
    expect(within(list).getByText("24%")).toBeTruthy();
    expect(within(list).getByText("73%")).toBeTruthy();
    expect(within(list).getByText("내 Muse")).toBeTruthy();
    expect(within(list).getAllByLabelText("Codex 엔진")).toHaveLength(2);
    expect(within(list).getByLabelText("Muse Code 엔진")).toBeTruthy();
    expect(screen.getByRole("region", { name: "회사 계정" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "개인 계정 선택" })).toBeNull();
  });
});


describe("카드별 독립 로딩", () => {
  const rows: AccountUsage[] = [
    { ...account, id: "fast", engine: "codex", name: "빠른 Codex", login: "ok", rank: 1,
      windows: [{ key: "five_hour", label: "5시간", percent: 24, resets_at: null }] },
    { ...account, id: "slow", engine: "codex", name: "느린 Codex", login: "ok", rank: 2,
      windows: [{ key: "five_hour", label: "5시간", percent: 61, resets_at: null }] },
  ];

  function renderRows() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={qc}><UsageDialog open onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);
  }

  it("느린 계정이 끝나지 않아도 준비된 카드는 먼저 보이고 느린 카드는 로딩 표시를 둔다", async () => {
    mockAccounts(rows);
    let release: (v: AccountUsage) => void = () => {};
    api.accountUsageOne.mockImplementation((id: string) => id === "slow"
      ? new Promise<AccountUsage>((resolve) => { release = resolve; })
      : Promise.resolve(rows[0]));
    renderRows();
    expect(await screen.findByText("24%")).toBeTruthy();
    expect(screen.getByRole("status", { name: "느린 Codex 사용량을 불러오는 중" })).toBeTruthy();
    expect(screen.getByText("확인 중")).toBeTruthy();
    release(rows[1]);
    expect(await screen.findByText("61%")).toBeTruthy();
    expect(screen.queryByText("확인 중")).toBeNull();
  });

  it("한 계정 조회가 실패하면 그 카드에만 오류와 다시 시도를 보이고 재시도로 복구한다", async () => {
    mockAccounts(rows);
    api.accountUsageOne.mockImplementation((id: string) => id === "slow"
      ? Promise.reject(new Error("조회 실패 사유"))
      : Promise.resolve(rows[0]));
    renderRows();
    expect(await screen.findByText("24%")).toBeTruthy();
    expect(await screen.findByText("조회 실패 사유")).toBeTruthy();
    api.accountUsageOne.mockImplementation((id: string) => Promise.resolve(rows.find((r) => r.id === id)));
    const { act } = await import("@testing-library/react");
    await act(async () => { screen.getByRole("button", { name: "다시 시도" }).click(); });
    expect(await screen.findByText("61%")).toBeTruthy();
    expect(screen.queryByText("조회 실패 사유")).toBeNull();
    expect(api.accountUsageOne).toHaveBeenLastCalledWith("slow", true);
  });

  it("목록의 캐시 값은 계정별 조회가 끝나기 전에도 마지막 관측값으로 보인다", async () => {
    const cachedRows = rows.map((r) => ({ ...r }));
    api.accountUsageCached.mockResolvedValue(cachedRows);
    api.accountUsageOne.mockImplementation(() => new Promise<AccountUsage>(() => {}));
    renderRows();
    expect(await screen.findByText("24%")).toBeTruthy();
    expect(screen.getByText("61%")).toBeTruthy();
  });
});


describe("계정별 사용량 새로고침", () => {
  it("갱신으로 해제된 쿨다운을 카드에 반영한다", async () => {
    renderUsage({ ...account, cooldown_seconds: 300 });
    await screen.findByText("한도 대기 5분");
    api.accountUsageOne.mockResolvedValueOnce({ ...account, cooldown_seconds: 0, updated_at: Date.now()/1000 });
    fireEvent.click(screen.getByRole("button", {name:`${account.name} 사용량 새로고침`}));
    await waitFor(() => expect(screen.queryByText("한도 대기 5분")).toBeNull());
  });

  it("선택한 계정만 강제 조회하고 카드 값을 갱신한다", async () => {
    renderUsage();
    await screen.findByText("Gemini Models · 주간 99.3% 남음");
    api.accountUsageOne.mockClear();
    api.accountUsageCached.mockClear();
    api.accountUsageOne.mockResolvedValueOnce({ ...account, windows: [{key:"agy_gemini_models_5h",label:"Gemini Models · 5시간",percent:22,remaining_percent:78,resets_at:Date.now()/1000+3600}], updated_at:Date.now()/1000 });
    fireEvent.click(screen.getByRole("button", {name:`${account.name} 사용량 새로고침`}));
    await waitFor(() => expect(within(screen.getByRole("listitem", {name:`${account.name} 사용량`})).getByRole("progressbar", {name:"Gemini Models · 5시간 사용량"}).getAttribute("aria-valuenow")).toBe("22"));
    expect(api.accountUsageOne).toHaveBeenCalledExactlyOnceWith(account.id, true);
    expect(api.accountUsageCached).not.toHaveBeenCalled();
  });

  it("동시 조회 중에는 각 계정의 버튼이 따로 비활성화된다", async () => {
    const other = {...account,id:"other",name:"다른 계정",rank:2};
    mockAccounts([account,other]);
    const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
    render(<MemoryRouter><QueryClientProvider client={qc}><UsageDialog open onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);
    await waitFor(()=>expect(api.accountUsageOne).toHaveBeenCalledTimes(2));
    await waitFor(()=>expect(qc.isFetching()).toBe(0));
    const pending=new Map<string,(value:AccountUsage)=>void>();
    api.accountUsageOne.mockImplementation((id:string)=>new Promise<AccountUsage>(resolve=>pending.set(id,resolve)));
    const first=screen.getByRole<HTMLButtonElement>("button",{name:`${account.name} 사용량 새로고침`});
    const second=screen.getByRole<HTMLButtonElement>("button",{name:`${other.name} 사용량 새로고침`});
    fireEvent.click(first);fireEvent.click(second);
    await waitFor(()=>{expect(first.disabled).toBe(true);expect(second.disabled).toBe(true);});
    await act(async()=>{pending.get(account.id)!(account);});
    await waitFor(()=>{expect(first.disabled).toBe(false);expect(second.disabled).toBe(true);});
    await act(async()=>{pending.get(other.id)!(other);});
    await waitFor(()=>expect(second.disabled).toBe(false));
  });
});

describe("측정 실패·오래된 값 (2026-10-19 x3: 20시간 전 값이 0% 로 보였다)", () => {
  const nowSec = () => Math.round(Date.now() / 1000);
  const claude: AccountUsage = {
    ...account, id: "x3", name: "회사 클로드 x3", engine: "claude", login: "ok", source: "api", stale: false, remaining_to_limit_percent: 100, credits_balance: null,
    windows: [{ key: "five_hour", label: "5시간", percent: 0, resets_at: null }, { key: "seven_day", label: "주간", percent: 0, resets_at: 1792933199 }],
    updated_at: nowSec() - 20 * 3600,
  };
  const failure = "사용량 API 401: OAuth token has expired. · 로그인 토큰이 20시간 전 만료됐고 갱신하지 못했어요";

  it("목록의 낡은 값 위에 계정별 조회 실패가 오면 실패 사유와 오래된 값 표시가 보인다", async () => {
    api.accountUsageCached.mockResolvedValue([claude]);
    api.accountUsageOne.mockResolvedValue({ ...claude, windows: [], error: failure, updated_at: null, stale: true, source: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={qc}><UsageDialog open onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByText("측정 실패")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("사용량 API 401: OAuth token has expired.");
    expect(screen.getAllByText(/오래된 값 · 20시간 전 관측/).length).toBe(2);
    expect(screen.getByText(/마지막 측정 20시간 전 · 현재 값이 아니에요/)).toBeTruthy();
    expect(screen.queryByText("지금 사용")).toBeNull();
    expect(screen.queryByText("대기")).toBeNull();
  });

  it("조회가 실패해 창이 없으면 오류 원문을 그대로 보인다", async () => {
    renderUsage({ ...claude, windows: [], error: failure, updated_at: null, stale: true, source: null });
    expect(await screen.findByText("측정 실패")).toBeTruthy();
    expect(screen.getByText(failure)).toBeTruthy();
  });

  it("최신 측정 성공은 오류·오래됨 표시 없이 보인다", async () => {
    renderUsage({ ...claude, updated_at: nowSec(), windows: [{ key: "five_hour", label: "5시간", percent: 14, resets_at: null, state: "current" }] });
    expect(await screen.findByText("14%")).toBeTruthy();
    expect(screen.queryByText("측정 실패")).toBeNull();
    expect(screen.queryByText(/오래된/)).toBeNull();
  });
});


describe("UsageDialog Copilot 계정 잔여량", () => {
  it("OpenCode 구독 잔여율과 공급자 출처를 표시한다", async () => {
    renderUsage({
      ...account, id: "oc", name: "OpenCode 구독", engine: "opencode", source: "copilot_sdk",
      windows: [{ key: "copilot_premium_interactions", label: "Copilot 월간 프리미엄", percent: 28,
        remaining_percent: 72.5, resets_at: Math.floor(Date.now() / 1000) + 86400, state: "current" }],
    });
    expect(await screen.findByText("72.5% 남음")).toBeTruthy();
    expect(screen.getByText(/Copilot 계정 사용량 기준/)).toBeTruthy();
  });

  it("무제한은 퍼센트 막대 없이 표시한다", async () => {
    renderUsage({
      ...account, id: "cp", name: "Copilot 구독", engine: "copilot", source: "copilot_sdk", windows: [],
      quota_unlimited: { copilot_chat: "Copilot 채팅" },
    });
    expect(await screen.findByText("Copilot 채팅 · 무제한")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("아직 사용량 기록이 없어요.")).toBeNull();
  });
});
