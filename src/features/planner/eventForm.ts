import type { EventIn, EventOut, Reminder } from "../../api/client";

/** 일정 편집 폼의 값. 날짜와 시각을 따로 둬 날짜·시간 입력 칸에 바로 연결한다. 반복은 보류(ADR 0008)라 없다. */
export interface EventForm {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  description: string;
  /** null 이면 알림 없음(기본). */
  reminder: Reminder | null;
}

export const TIMED_REMINDERS: { value: Reminder; label: string }[] = [
  { value: "at_start", label: "정시" },
  { value: "10m", label: "10분 전" },
  { value: "30m", label: "30분 전" },
  { value: "1h", label: "1시간 전" },
  { value: "1d", label: "하루 전" },
];
export const ALL_DAY_REMINDERS: { value: Reminder; label: string }[] = [
  { value: "day_9am", label: "당일 오전 9시" },
  { value: "prev_day_9am", label: "전날 오전 9시" },
];

/** 종일 여부를 바꿀 때 켜 둔 알림을 가까운 옵션으로 옮긴다(조용히 꺼지지 않게). */
export function reminderFor(allDay: boolean, r: Reminder | null): Reminder | null {
  if (!r) return null;
  const list = allDay ? ALL_DAY_REMINDERS : TIMED_REMINDERS;
  if (list.some((o) => o.value === r)) return r;
  if (allDay) return r === "1d" ? "prev_day_9am" : "day_9am";
  return r === "prev_day_9am" ? "1d" : "10m";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 새 일정의 기본값: 누른 날 한 시간(시간 일정). 시각이 정해지지 않으면 오전 9시. */
export function blankForm(date: string, time = "09:00"): EventForm {
  const [h, m] = time.split(":").map(Number);
  const end = `${pad((h + 1) % 24)}:${pad(m)}`;
  return { title: "", allDay: false, startDate: date, startTime: time, endDate: date, endTime: end, location: "", description: "", reminder: null };
}

export function formFromEvent(e: EventOut): EventForm {
  const [startDate, startTime = "09:00"] = e.start.split("T");
  const [endDate, endTime = "10:00"] = e.end.split("T");
  return {
    title: e.title, allDay: e.all_day, startDate, startTime, endDate, endTime,
    location: e.location, description: e.description, reminder: e.reminder,
  };
}

/** 오류 문구(없으면 null). 서버도 검사하지만 입력 칸 옆에서 먼저 알려 준다. */
export function validateForm(f: EventForm): string | null {
  if (!f.title.trim()) return "제목을 입력해 주세요.";
  if (!f.startDate || !f.endDate) return "날짜를 입력해 주세요.";
  if (!f.allDay && (!f.startTime || !f.endTime)) return "시간을 입력해 주세요.";
  const s = f.allDay ? f.startDate : `${f.startDate}T${f.startTime}`;
  const e = f.allDay ? f.endDate : `${f.endDate}T${f.endTime}`;
  if (e < s) return "끝이 시작보다 빠를 수 없어요.";
  return null;
}

export function formToPayload(f: EventForm): EventIn {
  return {
    title: f.title.trim(),
    all_day: f.allDay,
    start: f.allDay ? f.startDate : `${f.startDate}T${f.startTime}`,
    end: f.allDay ? f.endDate : `${f.endDate}T${f.endTime}`,
    location: f.location.trim(),
    description: f.description,
    reminder: f.reminder,
  };
}
