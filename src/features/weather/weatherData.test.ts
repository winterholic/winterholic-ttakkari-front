import { describe, expect, it } from "vitest";
import { daypartRows, sevenDayRows } from "./weatherData";

describe("weather chart projections", () => {
  it("selects the selected KST date and groups hours as morning, afternoon and evening", () => {
    const rows = [
      { time: "2026-10-16T06:00", temperature_c: 9, precipitation_probability_percent: 0 },
      { time: "2026-10-16T08:00", temperature_c: 11, precipitation_probability_percent: 40 },
      { time: "2026-10-16T13:00", temperature_c: 17, precipitation_probability_percent: 20 },
      { time: "2026-10-16T19:00", temperature_c: 13, precipitation_probability_percent: 10 },
      { time: "2026-10-17T08:00", temperature_c: 8, precipitation_probability_percent: 90 },
    ];
    expect(daypartRows(rows, "2026-10-16")).toEqual([
      { label: "오전", temperature: 11, probability: 40 },
      { label: "오후", temperature: 17, probability: 20 },
      { label: "저녁", temperature: 13, probability: 10 },
    ]);
  });

  it("marks rainy days and weekend dates without replacing missing temperatures with zero", () => {
    const rows = [
      { date: "2026-10-16", temperature_min_c: null, temperature_max_c: 17, precipitation_probability_max_percent: 45 },
      { date: "2026-10-17", temperature_min_c: 7, temperature_max_c: 15, precipitation_probability_max_percent: null },
    ];
    expect(sevenDayRows(rows)).toEqual([
      { date: "2026-10-16", low: null, high: 17, rain: true, weekend: false },
      { date: "2026-10-17", low: 7, high: 15, rain: false, weekend: true },
    ]);
  });
});
