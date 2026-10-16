import type { WeatherDay, WeatherHour } from "../../api/weatherTypes";

export function daypartRows(rows: Pick<WeatherHour, "time" | "temperature_c" | "precipitation_probability_percent">[], day: string) {
  const periods = [
    { label: "오전", start: 7, end: 11 },
    { label: "오후", start: 12, end: 17 },
    { label: "저녁", start: 18, end: 23 },
  ];
  return periods.map(period => {
    const matches = rows.filter(row => {
      if (!row.time.startsWith(day)) return false;
      const hour = Number(row.time.slice(11, 13));
      return hour >= period.start && hour <= period.end;
    });
    const temperatures = matches.flatMap(row => row.temperature_c === null ? [] : [row.temperature_c]);
    const probabilities = matches.flatMap(row => row.precipitation_probability_percent === null ? [] : [row.precipitation_probability_percent]);
    return {
      label: period.label,
      temperature: temperatures.length ? Math.round(temperatures.reduce((a, b) => a + b, 0) / temperatures.length) : null,
      probability: probabilities.length ? Math.max(...probabilities) : null,
    };
  }).filter(row => row.temperature !== null || row.probability !== null);
}

export function sevenDayRows(rows: Pick<WeatherDay, "date" | "temperature_min_c" | "temperature_max_c" | "precipitation_probability_max_percent">[]) {
  return rows.slice(0, 7).map(row => {
    const weekday = new Date(`${row.date}T12:00:00+09:00`).getUTCDay();
    return {
      date: row.date,
      low: row.temperature_min_c,
      high: row.temperature_max_c,
      rain: row.precipitation_probability_max_percent !== null && row.precipitation_probability_max_percent >= 40,
      weekend: weekday === 0 || weekday === 6,
    };
  });
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `?date=` 값이 실제 달력 날짜일 때만 돌려준다. 형식만 맞고 존재하지 않는 날(2026-02-30)도 걸러낸다. */
export function parseDayParam(value: string | null): string | null {
  if (!value || !DAY_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

const IN_PROGRESS = ["collecting", "starting", "generating"];
export const isInProgress = (status: string | undefined): boolean => status !== undefined && IN_PROGRESS.includes(status);

export function statusLabel(status: string): string {
  if (status === "ready") return "완료";
  if (status === "degraded") return "간이";
  if (status === "failed") return "실패";
  return "진행 중";
}

/** 선택한 날짜에 브리핑 행이 없으면 백엔드가 404를 준다. 다른 오류와 구분한다. */
export const isNotFound = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { status?: unknown }).status === 404;

export function weatherLabel(code: number | null): string {
  if (code === null) return "상태 자료 없음";
  if (code === 0) return "맑음";
  if (code === 1 || code === 2) return "대체로 맑음";
  if (code === 3) return "흐림";
  if (code === 45 || code === 48) return "안개";
  if ([51, 53, 55, 56, 57].includes(code)) return "이슬비";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "비";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "눈";
  if ([95, 96, 99].includes(code)) return "뇌우";
  return `날씨 코드 ${code}`;
}
