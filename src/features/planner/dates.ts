import { addDays, format, parseISO } from "date-fns";
import type { EventInput } from "@fullcalendar/core";
import type { EventOut, HolidayOut } from "../../api/client";

/**
 * 날짜는 문자열(YYYY-MM-DD, 시각은 YYYY-MM-DDTHH:MM)로만 다루고 항상 Asia/Seoul 벽시계다(ADR 0008).
 * 기기 시간대가 달라도 화면과 서버가 같은 값을 보게 하려는 것이다.
 */
export const DATE_FMT = "yyyy-MM-dd";

/** 값의 UTC 필드가 서울 벽시계인 Date. FullCalendar 를 timeZone="UTC" 로 두고 이 값을 now 로 쓴다. */
export function seoulNow(): Date {
  return new Date(Date.now() + 9 * 3_600_000);
}

export function seoulToday(): string {
  return seoulNow().toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number): string {
  return format(addDays(parseISO(date), days), DATE_FMT);
}

/** 종일 일정의 끝은 API 에서 그날 포함이고, FullCalendar 는 끝 제외라 하루를 더한다. */
export function toFcEvent(e: EventOut): EventInput {
  return {
    id: `${e.id}@${e.start}`,
    title: e.title,
    start: e.start,
    end: e.all_day ? shiftDate(e.end, 1) : e.end,
    allDay: e.all_day,
    extendedProps: { eventId: e.id, recurring: e.recurring, location: e.location },
  };
}

/** 공휴일은 읽기 전용 종일 일정으로 그린다. 빨강은 CSS(.tk-cal-holiday)가 입힌다. */
export function toFcHoliday(h: HolidayOut): EventInput {
  return {
    id: `holiday-${h.date}`,
    title: h.name,
    start: h.date,
    allDay: true,
    editable: false,
    classNames: ["tk-cal-holiday"],
    extendedProps: { holiday: true },
  };
}

/** FullCalendar 가 알려 준 보이는 구간(끝 제외)을 API 의 from/to(끝 포함)로 바꾼다. */
export function visibleRange(start: Date, end: Date): { from: string; to: string } {
  const from = start.toISOString().slice(0, 10);
  return { from, to: shiftDate(end.toISOString().slice(0, 10), -1) };
}
