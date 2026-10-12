import { describe, expect, it } from "vitest";
import type { EventOut } from "../../api/client";
import { seoulToday, shiftDate, toFcEvent, toFcHoliday, visibleRange } from "./dates";
import { blankForm, formFromEvent, formToPayload, validateForm } from "./eventForm";
import { buildRrule, NO_REPEAT, parseRrule } from "./recurrence";

const ev = (p: Partial<EventOut>): EventOut => ({
  id: "e1", title: "회의", description: "", location: "", all_day: false, start: "2026-10-14T09:30", end: "2026-10-14T10:30",
  rrule: null, recurring: false, source: "user", created_at: "", updated_at: "", ...p,
});

describe("날짜 헬퍼", () => {
  it("종일 일정의 끝 날짜는 FullCalendar 용으로 하루 더한다, 시간 일정은 그대로", () => {
    const allDay = toFcEvent(ev({ all_day: true, start: "2026-10-20", end: "2026-10-22" }));
    expect(allDay).toMatchObject({ allDay: true, start: "2026-10-20", end: "2026-10-23" });
    const timed = toFcEvent(ev({}));
    expect(timed).toMatchObject({ allDay: false, start: "2026-10-14T09:30", end: "2026-10-14T10:30" });
    expect(timed.extendedProps).toMatchObject({ eventId: "e1" });
  });

  it("반복 발생분은 같은 id 라도 시작이 달라 FullCalendar id 가 겹치지 않는다", () => {
    const a = toFcEvent(ev({ start: "2026-10-05T10:00" }));
    const b = toFcEvent(ev({ start: "2026-10-12T10:00" }));
    expect(a.id).not.toBe(b.id);
  });

  it("공휴일은 읽기 전용 종일 일정이고 holiday 클래스를 단다", () => {
    expect(toFcHoliday({ date: "2026-10-09", name: "한글날", substitute: false })).toMatchObject({
      title: "한글날", start: "2026-10-09", allDay: true, editable: false, classNames: ["tk-cal-holiday"],
    });
  });

  it("보이는 구간(끝 제외)을 from/to(끝 포함)로 바꾼다, 월 경계도 맞다", () => {
    expect(visibleRange(new Date("2026-09-27T00:00:00Z"), new Date("2026-11-08T00:00:00Z"))).toEqual({ from: "2026-09-27", to: "2026-11-07" });
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("오늘은 서울 날짜다 (YYYY-MM-DD)", () => {
    expect(seoulToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("반복 규칙", () => {
  it("화면의 선택을 RRULE 로 만들고 되돌린다", () => {
    const weeklyCount = { ...NO_REPEAT, freq: "WEEKLY" as const, end: "count" as const, count: 4 };
    expect(buildRrule(weeklyCount)).toBe("FREQ=WEEKLY;COUNT=4");
    expect(parseRrule("FREQ=WEEKLY;COUNT=4")).toMatchObject({ freq: "WEEKLY", end: "count", count: 4 });
    const until = { ...NO_REPEAT, freq: "DAILY" as const, end: "until" as const, until: "2026-12-31" };
    expect(buildRrule(until)).toBe("FREQ=DAILY;UNTIL=20261231");
    expect(parseRrule("FREQ=DAILY;UNTIL=20261231")).toMatchObject({ freq: "DAILY", end: "until", until: "2026-12-31" });
    expect(parseRrule("RRULE:FREQ=YEARLY")).toMatchObject({ freq: "YEARLY", end: "never" });
    expect(buildRrule(NO_REPEAT)).toBe("");
    expect(parseRrule(null)).toEqual(NO_REPEAT);
  });

  it("화면이 만들 수 없는 규칙은 custom 으로 원문을 보존한다", () => {
    const r = parseRrule("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10");
    expect(r.freq).toBe("custom");
    expect(buildRrule(r)).toBe("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10");
  });

  it("횟수는 1~999 로 맞춘다", () => {
    expect(buildRrule({ ...NO_REPEAT, freq: "DAILY", end: "count", count: 0 })).toBe("FREQ=DAILY;COUNT=1");
    expect(buildRrule({ ...NO_REPEAT, freq: "DAILY", end: "count", count: 5000 })).toBe("FREQ=DAILY;COUNT=999");
  });
});

describe("일정 폼", () => {
  it("새 일정 기본값은 누른 날 한 시간이고, 23시 시작은 끝이 00:30 이 되어 검증이 막는다", () => {
    expect(blankForm("2026-10-14")).toMatchObject({ startTime: "09:00", endTime: "10:00", allDay: false });
    expect(blankForm("2026-10-14", "23:30")).toMatchObject({ endTime: "00:30" });
    // 자정 넘김은 검증이 막으므로 사용자가 끝 날짜를 고쳐야 한다(조용히 틀린 값을 만들지 않는다).
    expect(validateForm({ ...blankForm("2026-10-14", "23:30"), title: "야식" })).toBe("끝이 시작보다 빠를 수 없어요.");
  });

  it("검증: 제목, 끝이 시작보다 빠른 경우, 반복 종료일", () => {
    const f = { ...blankForm("2026-10-14"), title: "" };
    expect(validateForm(f)).toBe("제목을 입력해 주세요.");
    expect(validateForm({ ...f, title: "x", endTime: "08:00" })).toBe("끝이 시작보다 빠를 수 없어요.");
    expect(validateForm({ ...f, title: "x", repeat: { ...NO_REPEAT, freq: "DAILY", end: "until", until: "" } })).toBe("반복이 끝나는 날짜를 입력해 주세요.");
    expect(validateForm({ ...f, title: "x", repeat: { ...NO_REPEAT, freq: "DAILY", end: "until", until: "2026-10-01" } })).toBe("반복 종료일이 시작일보다 빠를 수 없어요.");
    expect(validateForm({ ...f, title: "x" })).toBeNull();
  });

  it("종일 일정은 날짜만 보내고, 시간 일정은 날짜+시각을 보낸다", () => {
    const base = { ...blankForm("2026-10-14"), title: " 출장 " };
    expect(formToPayload({ ...base, allDay: true, endDate: "2026-10-16" })).toMatchObject({ title: "출장", all_day: true, start: "2026-10-14", end: "2026-10-16", rrule: null });
    expect(formToPayload(base)).toMatchObject({ all_day: false, start: "2026-10-14T09:00", end: "2026-10-14T10:00" });
  });

  it("서버 일정에서 폼을 만들고 다시 보내면 같은 값이다", () => {
    const e = ev({ rrule: "FREQ=WEEKLY;COUNT=3", recurring: true, location: "강남" });
    const f = formFromEvent(e);
    expect(f.repeat).toMatchObject({ freq: "WEEKLY", count: 3 });
    expect(formToPayload(f)).toMatchObject({ start: e.start, end: e.end, location: "강남", rrule: "FREQ=WEEKLY;COUNT=3" });
    const allDay = formFromEvent(ev({ all_day: true, start: "2026-10-20", end: "2026-10-22" }));
    expect(formToPayload(allDay)).toMatchObject({ all_day: true, start: "2026-10-20", end: "2026-10-22" });
  });
});
