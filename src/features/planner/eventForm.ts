import type { EventIn, EventOut } from "../../api/client";
import { buildRrule, NO_REPEAT, parseRrule } from "./recurrence";
import type { Repeat } from "./recurrence";

/** 일정 편집 폼의 값. 날짜와 시각을 따로 둬 날짜·시간 입력 칸에 바로 연결한다. */
export interface EventForm {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  description: string;
  repeat: Repeat;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 새 일정의 기본값: 누른 날 한 시간(시간 일정). 시각이 정해지지 않으면 오전 9시. */
export function blankForm(date: string, time = "09:00"): EventForm {
  const [h, m] = time.split(":").map(Number);
  const end = `${pad((h + 1) % 24)}:${pad(m)}`;
  return { title: "", allDay: false, startDate: date, startTime: time, endDate: date, endTime: end, location: "", description: "", repeat: NO_REPEAT };
}

export function formFromEvent(e: EventOut): EventForm {
  const [startDate, startTime = "09:00"] = e.start.split("T");
  const [endDate, endTime = "10:00"] = e.end.split("T");
  return {
    title: e.title, allDay: e.all_day, startDate, startTime, endDate, endTime,
    location: e.location, description: e.description, repeat: parseRrule(e.rrule),
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
  if (f.repeat.freq !== "none" && f.repeat.freq !== "custom" && f.repeat.end === "until" && !f.repeat.until) return "반복이 끝나는 날짜를 입력해 주세요.";
  if (f.repeat.freq !== "none" && f.repeat.freq !== "custom" && f.repeat.end === "until" && f.repeat.until < f.startDate) return "반복 종료일이 시작일보다 빠를 수 없어요.";
  return null;
}

export function formToPayload(f: EventForm): EventIn {
  const rrule = buildRrule(f.repeat);
  return {
    title: f.title.trim(),
    all_day: f.allDay,
    start: f.allDay ? f.startDate : `${f.startDate}T${f.startTime}`,
    end: f.allDay ? f.endDate : `${f.endDate}T${f.endTime}`,
    location: f.location.trim(),
    description: f.description,
    rrule: rrule || null,
  };
}
