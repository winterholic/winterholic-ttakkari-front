import { toLunar } from "kor-lunar";

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeapMonth: boolean;
}

/** YYYY-MM-DD 서울 벽시계 날짜를 KASI 자료 기반 음력 날짜로 바꾼다. 지원 범위 밖이면 null. */
export function lunarDate(solarDate: string): LunarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(solarDate);
  if (!match) return null;
  const [, year, month, day] = match;
  try {
    const result = toLunar(Number(year), Number(month), Number(day));
    return { year: result.year, month: result.month, day: result.day, isLeapMonth: result.isLeapMonth };
  } catch {
    return null;
  }
}

export function formatLunarDate(date: LunarDate): string {
  return `${date.year}년 음력 ${date.isLeapMonth ? "윤" : ""}${date.month}월 ${date.day}일`;
}

/** 월간 칸은 음력 초하루·보름만 짧게 표시한다. */
export function formatLunarDateCompact(date: LunarDate | null): string | null {
  if (!date || (date.day !== 1 && date.day !== 15)) return null;
  return `${date.isLeapMonth ? "윤" : "음 "}${date.month}.${date.day}`;
}
