import { expect, test } from "vitest";
import {
  INITIAL_DURATION,
  PRESETS,
  clock,
  describeRequest,
  formatSeconds,
  parseCustom,
  toRequest,
} from "./duration";

const TODAY = "2026-10-22";

test("presets are exactly the final policy list", () => {
  expect([...PRESETS]).toEqual([15, 30, 60, 120, 180, 300, 600, 900]);
});

test("auto is the default and sends no seconds", () => {
  expect(toRequest(INITIAL_DURATION, TODAY)).toEqual({ request: { mode: "auto" }, error: null });
});

test.each([
  ["", "입력"],
  ["   ", "입력"],
  ["abc", "숫자"],
  ["NaN", "숫자"],
  ["Infinity", "숫자"],
  ["-5", "숫자"],
  ["1e3", "숫자"],
  ["0", "1초 이상"],
  ["0.999", "1초 이상"],
  ["900.001", "900초"],
  ["1000", "900초"],
])("custom %j is rejected", (text, hint) => {
  const parsed = parseCustom(text);
  expect(parsed.seconds).toBeNull();
  expect(parsed.error).toContain(hint);
});

test.each([
  ["1", 1],
  ["45", 45],
  ["90", 90],
  ["900", 900],
  ["12.5", 12.5],
])("custom %j is accepted", (text, expected) => {
  expect(parseCustom(text)).toEqual({ seconds: expected, error: null });
});

test("a smaller max (v1 renderer) rejects longer values with an explanation", () => {
  expect(parseCustom("300", 240).error).toContain("4분");
  expect(toRequest({ ...INITIAL_DURATION, choice: "600" }, TODAY, 240).error).toContain("4분");
  expect(toRequest({ ...INITIAL_DURATION, choice: "120" }, TODAY, 240).error).toBeNull();
});

test("soft preference becomes preferred, exact stays exact", () => {
  const base = { ...INITIAL_DURATION, choice: "180" as const };
  expect(toRequest(base, TODAY).request).toEqual({ mode: "preferred", seconds: 180 });
  expect(toRequest({ ...base, strictness: "exact" }, TODAY).request).toEqual({ mode: "exact", seconds: 180 });
});

test("custom value with 45 seconds is possible", () => {
  expect(toRequest({ ...INITIAL_DURATION, choice: "custom", custom: "45" }, TODAY).request).toEqual({
    mode: "preferred",
    seconds: 45,
  });
});

test("platform cap uses server-side source for YouTube Shorts and demands a source for custom caps", () => {
  const cap = { ...INITIAL_DURATION, choice: "60" as const, strictness: "cap" as const };
  expect(toRequest(cap, TODAY).request).toEqual({ mode: "platform_cap", platform: "youtube_shorts" });
  const custom = { ...cap, capKind: "custom" as const };
  expect(toRequest(custom, TODAY).error).toContain("근거");
  expect(toRequest({ ...custom, capSource: "클라이언트 요청서" }, TODAY).request).toEqual({
    mode: "platform_cap",
    seconds: 60,
    source: "클라이언트 요청서",
    as_of: TODAY,
  });
});

test("formatting", () => {
  expect(formatSeconds(15)).toBe("15초");
  expect(formatSeconds(60)).toBe("1분");
  expect(formatSeconds(90)).toBe("1분 30초");
  expect(formatSeconds(900)).toBe("15분");
  expect(formatSeconds(Number.NaN)).toBe("—");
  expect(clock(184)).toBe("3:04");
  expect(describeRequest({ mode: "preferred", seconds: 180 })).toBe("희망 3분");
  expect(describeRequest({ mode: "platform_cap", platform: "youtube_shorts", seconds: 180 })).toContain("YouTube Shorts");
  expect(describeRequest({ mode: "auto" })).toBe("자동");
});
