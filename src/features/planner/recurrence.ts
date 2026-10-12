/**
 * 반복 규칙(RRULE)을 화면의 몇 가지 선택으로 바꾸고 되돌린다. 해석과 전개는 서버가 한다(ADR 0008).
 * 화면이 만들 수 없는 규칙(BYDAY 등)은 `custom` 으로 원문 그대로 보존한다.
 */
export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type RepeatEnd = "never" | "until" | "count";

export interface Repeat {
  freq: Freq | "none" | "custom";
  end: RepeatEnd;
  /** YYYY-MM-DD, end === "until" 일 때 */
  until: string;
  count: number;
  /** freq === "custom" 일 때 서버에 그대로 돌려보낼 원문 */
  raw: string;
}

export const NO_REPEAT: Repeat = { freq: "none", end: "never", until: "", count: 10, raw: "" };

const PRESET = /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(?:;COUNT=(\d+)|;UNTIL=(\d{4})(\d{2})(\d{2})(?:T235959)?)?$/;

export function parseRrule(rule: string | null): Repeat {
  if (!rule) return NO_REPEAT;
  const m = PRESET.exec(rule.replace(/^RRULE:/i, "").trim().toUpperCase());
  if (!m) return { ...NO_REPEAT, freq: "custom", raw: rule };
  const freq = m[1] as Freq;
  if (m[2]) return { ...NO_REPEAT, freq, end: "count", count: Number(m[2]) };
  if (m[3]) return { ...NO_REPEAT, freq, end: "until", until: `${m[3]}-${m[4]}-${m[5]}` };
  return { ...NO_REPEAT, freq };
}

/** 서버로 보낼 값. 반복 없음은 빈 문자열(PATCH 에서 반복 해제), 새 일정에서는 null 로 바꿔 쓴다. */
export function buildRrule(r: Repeat): string {
  if (r.freq === "none") return "";
  if (r.freq === "custom") return r.raw;
  if (r.end === "count") return `FREQ=${r.freq};COUNT=${Math.max(1, Math.min(999, Math.floor(r.count) || 1))}`;
  if (r.end === "until" && r.until) return `FREQ=${r.freq};UNTIL=${r.until.replaceAll("-", "")}`;
  return `FREQ=${r.freq}`;
}

export const FREQ_LABEL: Record<Freq, string> = { DAILY: "매일", WEEKLY: "매주", MONTHLY: "매월", YEARLY: "매년" };
