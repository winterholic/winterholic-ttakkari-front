import { describe, expect, it } from "vitest";
import { formatLunarDate, formatLunarDateCompact, lunarDate } from "./lunar";

// 기대값 출처: 우주항공청 2026 월력요항의 설날·추석 연휴 날짜와 KASI 음양력 공개 데이터.
// https://www.kasa.go.kr/prog/bbsArticle/BBSMSTR_000000000010/view.do?bbsId=BBSMSTR_000000000010&nttId=B000000001860Pe2zT3
// https://www.data.go.kr/data/15012679/openapi.do
describe("Korean lunar calendar", () => {
  it("converts 2026 Seollal and Chuseok from official solar dates", () => {
    expect(lunarDate("2026-02-17")).toMatchObject({ year: 2026, month: 1, day: 1, isLeapMonth: false });
    expect(lunarDate("2026-09-25")).toMatchObject({ year: 2026, month: 8, day: 15, isLeapMonth: false });
  });

  it("preserves leap-month status and labels it in full and compact dates", () => {
    const date = lunarDate("2025-07-25");
    if (!date) throw new Error("Expected a supported lunar date");
    expect(date).toMatchObject({ year: 2025, month: 6, day: 1, isLeapMonth: true });
    expect(formatLunarDate(date)).toBe("2025년 음력 윤6월 1일");
    expect(formatLunarDateCompact(date)).toBe("윤6.1");
  });

  it("keeps monthly cells compact and labels only lunar day 1 and 15", () => {
    expect(formatLunarDateCompact(lunarDate("2026-02-17"))).toBe("음 1.1");
    expect(formatLunarDateCompact(lunarDate("2026-09-25"))).toBe("음 8.15");
    expect(formatLunarDateCompact(lunarDate("2026-02-18"))).toBeNull();
  });
});
