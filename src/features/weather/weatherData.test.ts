import { describe, expect, it } from "vitest";
import { daypartRows, isInProgress, isNotFound, parseDayParam, sevenDayRows, shiftDay, statusLabel } from "./weatherData";

describe("briefing day navigation helpers", () => {
  it("accepts only real calendar dates from the URL", () => {
    expect(parseDayParam("2026-10-16")).toBe("2026-10-16");
    expect(parseDayParam("2028-02-29")).toBe("2028-02-29");
    for (const bad of [null, "", "2026-2-3", "2026-02-30", "2026-13-01", "20261016", "2026-10-16T00:00"]) expect(parseDayParam(bad)).toBeNull();
  });

  it("shifts across month and year boundaries", () => {
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("labels statuses and detects in-progress and 404", () => {
    expect([statusLabel("ready"), statusLabel("degraded"), statusLabel("failed"), statusLabel("generating")]).toEqual(["완료", "간이", "실패", "진행 중"]);
    expect([isInProgress("collecting"), isInProgress("starting"), isInProgress("generating"), isInProgress("ready"), isInProgress(undefined)]).toEqual([true, true, true, false, false]);
    expect(isNotFound({ status: 404 })).toBe(true);
    expect(isNotFound({ status: 500 })).toBe(false);
    expect(isNotFound(new Error("x"))).toBe(false);
  });
});

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
