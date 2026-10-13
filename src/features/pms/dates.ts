/**
 * PMS 날짜 도우미. 작업 날짜는 시간대 없는 "YYYY-MM-DD" 문자열이라 Date 로 바꾸면 하루가 밀리기 쉽다.
 * 모든 계산은 UTC 자정으로 맞춰서 서머타임·시간대와 무관하게 한다.
 */
export const DAY_MS = 86_400_000;

const utc = (s: string): number => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const isDay = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 기기(한국) 시간 기준 오늘. 서버도 한국 시간으로 같은 날을 센다. */
export function todayStr(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function addDays(s: string, n: number): string {
  return new Date(utc(s) + n * DAY_MS).toISOString().slice(0, 10);
}

/** b - a (일). */
export const diffDays = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / DAY_MS);

/** 0=일 … 6=토 */
export const weekday = (s: string): number => new Date(utc(s)).getUTCDay();

export const monthOf = (s: string): string => s.slice(0, 7);

/** "10/13" */
export function shortDate(s: string | null | undefined): string {
  return isDay(s) ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : "";
}

/** 같은 해면 월/일, 다르면 연도를 붙인다. */
export function longDate(s: string | null | undefined, today = todayStr()): string {
  if (!isDay(s)) return "";
  return s.slice(0, 4) === today.slice(0, 4) ? shortDate(s) : `${s.slice(2, 4)}/${shortDate(s)}`;
}

/** "10/1 – 10/13", 한쪽만 있으면 그 날만. 둘 다 없으면 빈 문자열. */
export function rangeText(start: string | null, end: string | null): string {
  if (start && end) return start === end ? longDate(start) : `${longDate(start)} – ${longDate(end)}`;
  return longDate(start ?? end);
}

/** 마감까지 남은 일수를 사람 말로. 음수는 지남. */
export function dueText(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "오늘 마감";
  return days > 0 ? `D-${days}` : `${-days}일 지남`;
}

/** 종료일 − 시작일 + 1 (양 끝 포함). 날짜가 없으면 null. */
export function spanDays(start: string | null, end: string | null): number | null {
  return isDay(start) && isDay(end) ? diffDays(start, end) + 1 : null;
}
