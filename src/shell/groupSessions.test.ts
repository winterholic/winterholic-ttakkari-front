import { describe, expect, it } from "vitest";
import type { SessionOut } from "../api/types";
import { groupSessions, sessionStatus, sessionTime } from "./groupSessions";

const NOW = new Date(2026, 9, 9, 15, 0, 0); // 2026-10-09 15:00 로컬

const at = (daysBack: number, h = 10, m = 5) => new Date(2026, 9, 9 - daysBack, h, m).toISOString();
const sess = (id: string, updated_at: string, last_run_status: string | null = null, active_run_id: string | null = null) =>
  ({ id, title: id, updated_at, last_run_status, active_run_id }) as unknown as SessionOut;

describe("groupSessions", () => {
  it("오늘 / 이번 주 / 이전으로 나누고 최근 순으로 정렬한다", () => {
    const groups = groupSessions(
      [sess("old", at(30)), sess("week", at(3)), sess("t-early", at(0, 8)), sess("t-late", at(0, 14)), sess("edge6", at(6)), sess("edge7", at(7))],
      NOW,
    );
    expect(groups.map((g) => [g.label, g.sessions.map((s) => s.id)])).toEqual([
      ["오늘", ["t-late", "t-early"]],
      ["이번 주", ["week", "edge6"]],
      ["이전", ["edge7", "old"]],
    ]);
  });

  it("비어 있는 그룹은 내지 않는다", () => {
    expect(groupSessions([sess("a", at(0))], NOW).map((g) => g.key)).toEqual(["today"]);
    expect(groupSessions([], NOW)).toEqual([]);
  });

  it("자정 직전과 직후는 다른 날로 본다", () => {
    const late = new Date(2026, 9, 8, 23, 59).toISOString();
    expect(groupSessions([sess("a", late)], new Date(2026, 9, 9, 0, 1))[0].key).toBe("week");
  });
});

describe("sessionStatus", () => {
  it("last_run_status 를 단어로 바꾼다", () => {
    const l = (s: string | null, run: string | null = null) => sessionStatus({ last_run_status: s, active_run_id: run });
    expect(l("running")).toEqual({ label: "실행 중", running: true });
    expect(l("queued").running).toBe(true);
    expect(l("succeeded").label).toBe("완료");
    expect(l("failed").label).toBe("실패");
    expect(l("cancelled").label).toBe("취소됨");
    expect(l("interrupted").label).toBe("중단됨");
    expect(l("succeeded", "run-1").running).toBe(true);
    expect(l(null).running).toBe(false);
  });
});

describe("sessionTime", () => {
  it("오늘은 시각, 이번 주는 요일, 이전은 날짜", () => {
    expect(sessionTime(at(0, 9, 7), NOW)).toBe("09:07");
    expect(sessionTime(at(3), NOW)).toBe("화"); // 2026-10-06 은 화요일
    expect(sessionTime(at(30), NOW)).toBe("2026.09.09");
  });
});
