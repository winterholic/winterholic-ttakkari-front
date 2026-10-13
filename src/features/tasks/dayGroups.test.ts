import { describe, expect, it } from "vitest";
import { dayGroup, groupByDay, splitMatch } from "./dayGroups";

const now = new Date(2026, 9, 13, 21, 0);
const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h).toISOString();

describe("dayGroup", () => {
  it("오늘·어제·이번 주·월로 나눈다", () => {
    expect(dayGroup(at(10, 13, 1), now)).toBe("오늘");
    expect(dayGroup(at(10, 12, 23), now)).toBe("어제");
    expect(dayGroup(at(10, 8), now)).toBe("이번 주");
    expect(dayGroup(at(10, 6), now)).toBe("2026년 10월");
    expect(dayGroup(at(9, 30), now)).toBe("2026년 9월");
    expect(dayGroup(at(10, 14), now)).toBe("오늘");
  });

  it("순서를 지키며 이웃한 같은 묶음만 합친다", () => {
    const g = groupByDay([at(10, 13), at(10, 13, 2), at(10, 12), at(9, 1)], (x) => x, now);
    expect(g.map((x) => [x.label, x.items.length])).toEqual([["오늘", 2], ["어제", 1], ["2026년 9월", 1]]);
  });
});

describe("splitMatch", () => {
  it("대소문자 없이 모든 일치를 표시한다", () => {
    expect(splitMatch("Report and report.", "REPORT")).toEqual([
      { text: "Report", hit: true },
      { text: " and ", hit: false },
      { text: "report", hit: true },
      { text: ".", hit: false },
    ]);
  });
  it("정규식 특수문자도 글자로 찾는다", () => {
    expect(splitMatch("a.*b", ".*").map((p) => p.hit)).toEqual([false, true, false]);
    expect(splitMatch("abc", " ")).toEqual([{ text: "abc", hit: false }]);
  });
});
