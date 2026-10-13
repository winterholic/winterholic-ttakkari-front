import type { PmsMilestone, PmsProject, PmsTask } from "../../api/types";
import { addDays, diffDays, isDay, monthOf, weekday } from "./dates";

export type Zoom = "day" | "week" | "month";

/** 하루 폭(px). 일은 날짜 숫자가 읽히는 폭, 월은 전체 흐름을 보는 폭. */
export const DAY_W: Record<Zoom, number> = { day: 36, week: 16, month: 6 };
export const ZOOM_LABEL: Record<Zoom, string> = { day: "일", week: "주", month: "월" };

export interface Range {
  start: string;
  end: string;
  /** 시작~종료 양 끝 포함 일수 */
  days: number;
}

/**
 * 간트가 보여 줄 날짜 범위: 작업·마일스톤·프로젝트 기간·오늘을 모두 담고 앞뒤로 여유를 둔다.
 * 날짜가 하나도 없으면 오늘 기준 4주.
 */
export function chartRange(tasks: PmsTask[], milestones: PmsMilestone[], project: Pick<PmsProject, "start_date" | "end_date"> | null, today: string): Range {
  const days: string[] = [today];
  for (const t of tasks) {
    if (isDay(t.start_date)) days.push(t.start_date);
    if (isDay(t.end_date)) days.push(t.end_date);
  }
  for (const m of milestones) days.push(m.due_date);
  if (project) {
    if (isDay(project.start_date)) days.push(project.start_date);
    if (isDay(project.end_date)) days.push(project.end_date);
  }
  days.sort();
  let start = addDays(days[0], -3);
  let end = addDays(days[days.length - 1], 7);
  if (diffDays(start, end) < 27) end = addDays(start, 27);
  // 월요일부터 시작해야 주 눈금이 깔끔하다.
  const w = weekday(start);
  start = addDays(start, -((w + 6) % 7));
  return { start, end, days: diffDays(start, end) + 1 };
}

export interface Bar {
  left: number;
  width: number;
}

/** 작업 막대 위치. 시작만 있거나 종료만 있으면 하루짜리 막대. 날짜가 없으면 null. */
export function barOf(t: Pick<PmsTask, "start_date" | "end_date">, r: Range, dayW: number): Bar | null {
  const s = isDay(t.start_date) ? t.start_date : t.end_date;
  const e = isDay(t.end_date) ? t.end_date : t.start_date;
  if (!isDay(s) || !isDay(e)) return null;
  const from = diffDays(r.start, s);
  const len = Math.max(1, diffDays(s, e) + 1);
  return { left: from * dayW, width: len * dayW };
}

export const xOfDay = (day: string, r: Range, dayW: number): number => diffDays(r.start, day) * dayW;

export interface MonthMark {
  key: string;
  label: string;
  left: number;
  width: number;
}

export function monthMarks(r: Range, dayW: number): MonthMark[] {
  const out: MonthMark[] = [];
  let cur = r.start;
  while (diffDays(cur, r.end) >= 0) {
    const m = monthOf(cur);
    let next = cur;
    while (diffDays(next, r.end) >= 0 && monthOf(next) === m) next = addDays(next, 1);
    const n = diffDays(cur, next);
    out.push({ key: m, label: `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`, left: diffDays(r.start, cur) * dayW, width: n * dayW });
    cur = next;
  }
  return out;
}

export interface DayMark {
  day: string;
  left: number;
  width: number;
  /** 헤더에 쓸 글자(일 보기는 날짜 숫자, 주·월 보기는 월요일에만 "10/13") */
  label: string;
  weekend: boolean;
  /** 주 눈금(월요일) */
  weekStart: boolean;
}

export function dayMarks(r: Range, zoom: Zoom): DayMark[] {
  const dayW = DAY_W[zoom];
  const out: DayMark[] = [];
  for (let i = 0; i < r.days; i++) {
    const day = addDays(r.start, i);
    const w = weekday(day);
    const weekStart = w === 1;
    const label = zoom === "day" ? String(Number(day.slice(8))) : zoom === "week" && weekStart ? `${Number(day.slice(5, 7))}/${Number(day.slice(8))}` : "";
    out.push({ day, left: i * dayW, width: dayW, label, weekend: w === 0 || w === 6, weekStart });
  }
  return out;
}

/** 막대를 끌어 옮긴 거리(px)를 일수로. 반 칸 이상 움직여야 한 칸으로 친다. */
export const snapDays = (dx: number, dayW: number): number => Math.round(dx / dayW);

/** 막대를 끈 결과 날짜. mode 는 통째로 이동 / 시작만 / 종료만. 종료가 시작보다 앞서면 하루로 눌러 둔다. */
export function dragDates(start: string, end: string, mode: "move" | "start" | "end", delta: number): { start: string; end: string } {
  if (mode === "move") return { start: addDays(start, delta), end: addDays(end, delta) };
  if (mode === "start") {
    const s = addDays(start, delta);
    return { start: diffDays(s, end) < 0 ? end : s, end };
  }
  const e = addDays(end, delta);
  return { start, end: diffDays(start, e) < 0 ? start : e };
}
