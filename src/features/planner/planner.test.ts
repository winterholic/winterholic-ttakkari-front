import { describe, expect, it } from "vitest";
import type { EventOut } from "../../api/client";
import { seoulToday, shiftDate, toFcEvent, toFcHoliday, visibleRange } from "./dates";
import { blankForm, formFromEvent, formToPayload, reminderFor, validateForm } from "./eventForm";

const ev = (p: Partial<EventOut>): EventOut => ({
  id: "e1", title: "회의", description: "", location: "", all_day: false, start: "2026-10-14T09:30", end: "2026-10-14T10:30",
  rrule: null, recurring: false, reminder: null, remind_at: null, reminder_sent: false, source: "user", created_at: "", updated_at: "", ...p,
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

describe("일정 폼", () => {
  it("새 일정 기본값은 누른 날 한 시간이고, 23시 시작은 끝이 00:30 이 되어 검증이 막는다", () => {
    expect(blankForm("2026-10-14")).toMatchObject({ startTime: "09:00", endTime: "10:00", allDay: false });
    expect(blankForm("2026-10-14", "23:30")).toMatchObject({ endTime: "00:30" });
    // 자정 넘김은 검증이 막으므로 사용자가 끝 날짜를 고쳐야 한다(조용히 틀린 값을 만들지 않는다).
    expect(validateForm({ ...blankForm("2026-10-14", "23:30"), title: "야식" })).toBe("끝이 시작보다 빠를 수 없어요.");
  });

  it("검증: 제목, 끝이 시작보다 빠른 경우", () => {
    const f = { ...blankForm("2026-10-14"), title: "" };
    expect(validateForm(f)).toBe("제목을 입력해 주세요.");
    expect(validateForm({ ...f, title: "x", endTime: "08:00" })).toBe("끝이 시작보다 빠를 수 없어요.");
    expect(validateForm({ ...f, title: "x" })).toBeNull();
  });

  it("종일 일정은 날짜만 보내고, 시간 일정은 날짜+시각을 보낸다", () => {
    const base = { ...blankForm("2026-10-14"), title: " 출장 " };
    expect(formToPayload({ ...base, allDay: true, endDate: "2026-10-16" })).toMatchObject({ title: "출장", all_day: true, start: "2026-10-14", end: "2026-10-16", reminder: null });
    expect(formToPayload(base)).toMatchObject({ all_day: false, start: "2026-10-14T09:00", end: "2026-10-14T10:00" });
  });

  it("서버 일정에서 폼을 만들고 다시 보내면 같은 값이고, 반복(rrule)은 보내지 않는다", () => {
    const e = ev({ rrule: "FREQ=WEEKLY;COUNT=3", recurring: true, location: "강남", reminder: "30m" });
    const f = formFromEvent(e);
    const body = formToPayload(f);
    expect(body).toMatchObject({ start: e.start, end: e.end, location: "강남", reminder: "30m" });
    expect(body).not.toHaveProperty("rrule");
    const allDay = formFromEvent(ev({ all_day: true, start: "2026-10-20", end: "2026-10-22" }));
    expect(formToPayload(allDay)).toMatchObject({ all_day: true, start: "2026-10-20", end: "2026-10-22" });
  });
});

describe("일정 알림", () => {
  it("기본은 꺼짐이고, 끄면 null 을 보낸다", () => {
    expect(blankForm("2026-10-14").reminder).toBeNull();
    expect(formToPayload({ ...blankForm("2026-10-14"), title: "x" }).reminder).toBeNull();
  });

  it("종일 여부를 바꾸면 켜 둔 알림을 가까운 옵션으로 옮긴다", () => {
    expect(reminderFor(true, "1d")).toBe("prev_day_9am");
    expect(reminderFor(true, "10m")).toBe("day_9am");
    expect(reminderFor(false, "prev_day_9am")).toBe("1d");
    expect(reminderFor(false, "day_9am")).toBe("10m");
    expect(reminderFor(false, "30m")).toBe("30m");
    expect(reminderFor(true, null)).toBeNull();
  });
});
