import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
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
  analysis_status: "succeeded", failure: null, scheduled_at: "2026-10-15T21:30:00Z", generated_at: "2026-10-15T21:32:00Z", push_sent_at: null, push_error: null,
  created_at: "2026-10-15T21:30:00Z", updated_at: "2026-10-15T21:32:00Z",
};

vi.mock("../../api/client", () => ({
  listWeatherBriefings: vi.fn(async () => [item]),
  getWeatherBriefing: vi.fn(async () => item),
  generateWeatherBriefing: vi.fn(async () => item),
}));

afterEach(() => vi.clearAllMocks());

it("shows the compact briefing, sourced weather charts, regional commute and week in the More route", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/weather"]}><WeatherPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText("수원은 흐리고 17도까지 오릅니다.")).toBeTruthy();
  expect(screen.getByText("수원 현재 날씨")).toBeTruthy();
  expect(screen.getByText("출퇴근 지역 비교")).toBeTruthy();
  expect(screen.getByText("수원 7일 전망")).toBeTruthy();
  expect(screen.getByText(/Open-Meteo.com/)).toBeTruthy();
  expect(screen.queryByText(/자전거/)).toBeNull();
  client.clear();
});

it("makes the feature available from the existing More menu", () => {
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/more"]}><MorePage /></MemoryRouter></QueryClientProvider>);
  expect(screen.getByRole("link", { name: "날씨 브리핑" })).toBeTruthy();
  client.clear();
});
