import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateWeatherBriefing, getWeatherBriefing } from "../../api/client";
import { MorePage } from "../../pages/MorePage";
import type { WeatherBriefing } from "../../api/weatherTypes";
import { WeatherPage } from "../../pages/WeatherPage";

const suwon = {
  provider: "Open-Meteo", timezone: "Asia/Seoul", fetched_at: "2026-10-15T21:30:00Z", forecast_time: "2026-10-16T06:00",
  location: { name: "수원", latitude: 37.26, longitude: 127.03 },
  units: { temperature: "°C", precipitation: "mm", wind_speed: "km/h", visibility: "m" },
  current: { time: "2026-10-16T06:00", temperature_c: 11, apparent_temperature_c: 9, humidity_percent: 45, wind_speed_kmh: 3, weather_code: 3 },
  hourly: [
    { time: "2026-10-16T08:00", temperature_c: 10, apparent_temperature_c: 9, precipitation_probability_percent: 20, precipitation_mm: 0, weather_code: 3, wind_speed_kmh: 2, visibility_m: null },
    { time: "2026-10-16T13:00", temperature_c: 17, apparent_temperature_c: 16, precipitation_probability_percent: 60, precipitation_mm: 0.6, weather_code: 61, wind_speed_kmh: 4, visibility_m: null },
    { time: "2026-10-16T19:00", temperature_c: 12, apparent_temperature_c: 10, precipitation_probability_percent: 10, precipitation_mm: 0, weather_code: 3, wind_speed_kmh: 3, visibility_m: null },
  ],
  daily: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${String(16 + i).padStart(2, "0")}`, temperature_min_c: 8 + i, temperature_max_c: 17 + i, precipitation_probability_max_percent: i === 0 ? 60 : 10, precipitation_sum_mm: i === 0 ? 0.6 : 0, weather_code: 3 })),
  missing_fields: [],
};
const seoul = { ...suwon, location: { name: "서울", latitude: 37.56, longitude: 126.97 } };
const item: WeatherBriefing = {
  id: "wx-1", day: "2026-10-16", status: "ready", request_source: "scheduled", raw_forecasts: {},
  forecast: { suwon, seoul }, source_errors: {},
  briefing: { summary: ["수원은 흐리고 17도까지 오릅니다.", "오후 강수 가능성이 있어 우산을 챙기세요."], umbrella: "오후 비 가능성이 있어 우산을 준비하세요.", outfit: "아침에는 겉옷을 챙기세요.", commute: "출퇴근 시간은 08~09시와 18~19시로 가정합니다.", daypart: "오후 강수 가능성이 높습니다.", week: "주말은 대체로 건조합니다." },
  analysis_status: "succeeded", analysis_engine: "codex", analysis_model: "gpt-6-luna", failure: null, scheduled_at: "2026-10-15T21:30:00Z", generated_at: "2026-10-15T21:32:00Z", push_sent_at: null, push_error: null,
  created_at: "2026-10-15T21:30:00Z", updated_at: "2026-10-15T21:32:00Z",
};

vi.mock("../../api/client", () => ({
  listWeatherBriefings: vi.fn(async () => [item]),
  getWeatherBriefing: vi.fn(async () => item),
  generateWeatherBriefing: vi.fn(async () => item),
}));

beforeEach(() => {
  // 화면의 "오늘"은 KST 기준 시계로 정해지므로 Date만 고정한다. 타이머까지 가짜로 만들면 react-query 대기가 멈춘다.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-16T09:00:00+09:00") });
  vi.mocked(getWeatherBriefing).mockImplementation(async (day: string) => ({ ...item, day }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}</output>; }
function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><WeatherPage /><Where /></MemoryRouter></QueryClientProvider>);
  return { client, ...view };
}
const notFound = () => Object.assign(new Error("not found"), { status: 404 });

it("shows the compact briefing, sourced weather charts, regional commute and week in the More route", async () => {
  const { client } = renderAt("/weather");
  expect(await screen.findByText("수원은 흐리고 17도까지 오릅니다.")).toBeTruthy();
  expect(getWeatherBriefing).toHaveBeenCalledWith("2026-10-16");
  expect(screen.getByRole("button", { name: /오늘 브리핑 다시 확인/ })).toBeTruthy();
  expect(screen.getByText("gpt-6-luna")).toBeTruthy();
  expect(screen.getByText("수원 현재 날씨")).toBeTruthy();
  expect(screen.getByText("출퇴근 지역 비교")).toBeTruthy();
  expect(screen.getByText("수원 7일 전망")).toBeTruthy();
  expect(screen.getByText(/Open-Meteo.com/)).toBeTruthy();
  expect(screen.queryByText(/자전거/)).toBeNull();
  client.clear();
});

it("opens the day from ?date= (notification link) without offering today-only actions", async () => {
  const { client } = renderAt("/weather?date=2026-10-12");
  expect(await screen.findByText("수원은 흐리고 17도까지 오릅니다.")).toBeTruthy();
  expect(getWeatherBriefing).toHaveBeenCalledWith("2026-10-12");
  expect(screen.getByRole("heading", { level: 1, name: /10월 12일/ })).toBeTruthy();
  expect(screen.getByText("수원 브리핑 당시 날씨")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /다시 확인|만들기/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "오늘 브리핑으로" }));
  await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/weather?date=2026-10-16"));
  expect(generateWeatherBriefing).not.toHaveBeenCalled();
  client.clear();
});

it("moves between dates with the arrows and the date picker and keeps the choice in the URL", async () => {
  const { client } = renderAt("/weather");
  await screen.findByText("수원은 흐리고 17도까지 오릅니다.");
  expect((screen.getByRole("button", { name: "다음 날짜" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "이전 날짜" }));
  await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/weather?date=2026-10-15"));
  await waitFor(() => expect(getWeatherBriefing).toHaveBeenCalledWith("2026-10-15"));
  fireEvent.change(screen.getByLabelText("브리핑 날짜"), { target: { value: "2026-09-30" } });
  await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/weather?date=2026-09-30"));
  fireEvent.click(screen.getByRole("button", { name: "다음 날짜" }));
  await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/weather?date=2026-10-01"));
  client.clear();
});

it("tells apart a date without a briefing, and only offers to create one for today", async () => {
  vi.mocked(getWeatherBriefing).mockRejectedValue(notFound());
  const past = renderAt("/weather?date=2026-10-01");
  expect(await screen.findByText("이 날짜에는 만들어진 브리핑이 없어요.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "지금 만들기" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /가장 최근 브리핑 보기/ }));
  await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/weather?date=2026-10-16"));
  past.client.clear();
  past.unmount();

  const today = renderAt("/weather");
  expect(await screen.findByText("아직 오늘 날씨 브리핑이 없어요.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "지금 만들기" }));
  await waitFor(() => expect(generateWeatherBriefing).toHaveBeenCalledTimes(1));
  today.client.clear();
});

it("separates generating, degraded and failed states", async () => {
  vi.mocked(getWeatherBriefing).mockResolvedValue({ ...item, day: "2026-10-14", status: "degraded", analysis_status: "failed", analysis_engine: null, analysis_model: null });
  const degraded = renderAt("/weather?date=2026-10-14");
  expect(await screen.findByText(/간이 브리핑/)).toBeTruthy();
  expect(screen.queryByText("분석 엔진")).toBeNull();
  degraded.client.clear();
  degraded.unmount();

  vi.mocked(getWeatherBriefing).mockResolvedValue({ ...item, day: "2026-10-13", status: "failed", forecast: null, briefing: null, failure: "Open-Meteo 응답 없음" });
  const failed = renderAt("/weather?date=2026-10-13");
  expect(await screen.findByText("Open-Meteo 응답 없음")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  failed.client.clear();
  failed.unmount();

  vi.mocked(getWeatherBriefing).mockResolvedValue({ ...item, status: "generating", briefing: null, analysis_engine: null, analysis_model: null });
  const generating = renderAt("/weather");
  expect(await screen.findByText(/브리핑을 정리하고 있어요/)).toBeTruthy();
  generating.client.clear();
});

it("falls back to today when the date in the URL is not a real calendar date", async () => {
  const { client } = renderAt("/weather?date=2026-02-30");
  expect(await screen.findByText(/읽을 수 없어 오늘 브리핑/)).toBeTruthy();
  expect(getWeatherBriefing).toHaveBeenCalledWith("2026-10-16");
  client.clear();
});

it("makes the feature available from the existing More menu", () => {
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/more"]}><MorePage /></MemoryRouter></QueryClientProvider>);
  expect(screen.getByRole("link", { name: "날씨 브리핑" })).toBeTruthy();
  client.clear();
});
