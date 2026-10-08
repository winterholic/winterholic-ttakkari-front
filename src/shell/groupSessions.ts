import type { SessionOut } from "../api/types";

export type SessionGroupKey = "today" | "week" | "earlier";
export interface SessionGroup {
  key: SessionGroupKey;
  label: string;
  sessions: SessionOut[];
}

const LABEL: Record<SessionGroupKey, string> = { today: "오늘", week: "이번 주", earlier: "이전" };
const DAY_MS = 86_400_000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** 오늘과의 달력상 날짜 차이. 미래 시각(시계 어긋남)은 0 으로 본다. */
function daysAgo(updatedAt: string, now: Date): number {
  const diff = Math.round((startOfDay(now).getTime() - startOfDay(new Date(updatedAt)).getTime()) / DAY_MS);
  return Math.max(0, diff);
}

export function groupKey(updatedAt: string, now: Date): SessionGroupKey {
  const d = daysAgo(updatedAt, now);
  return d === 0 ? "today" : d < 7 ? "week" : "earlier";
}

/** 최근 갱신 순으로 정렬해 오늘 / 이번 주(최근 7일) / 이전으로 묶는다. 빈 그룹은 낸다. */
export function groupSessions(sessions: SessionOut[], now: Date = new Date()): SessionGroup[] {
  const sorted = [...sessions].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const buckets: Record<SessionGroupKey, SessionOut[]> = { today: [], week: [], earlier: [] };
  for (const s of sorted) buckets[groupKey(s.updated_at, now)].push(s);
  return (["today", "week", "earlier"] as const)
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({ key: k, label: LABEL[k], sessions: buckets[k] }));
}

export interface SessionStatus {
  label: string;
  running: boolean;
}

/** last_run_status → 세션 목록의 상태 단어. 색만으로 말하지 않는다(docs/10 §3). */
export function sessionStatus(s: Pick<SessionOut, "last_run_status" | "active_run_id">): SessionStatus {
  const st = s.last_run_status;
  if (st === "running" || st === "queued" || s.active_run_id) return { label: "실행 중", running: true };
  switch (st) {
    case "succeeded":
      return { label: "완료", running: false };
    case "failed":
      return { label: "실패", running: false };
    case "cancelled":
      return { label: "취소됨", running: false };
    case "interrupted":
      return { label: "중단됨", running: false };
    default:
      return { label: "지시 전", running: false };
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 오늘은 시각, 이번 주는 요일, 이전은 2026.10.09 (docs/10 §7). */
export function sessionTime(updatedAt: string, now: Date = new Date()): string {
  const d = new Date(updatedAt);
  switch (groupKey(updatedAt, now)) {
    case "today":
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case "week":
      return d.toLocaleDateString("ko-KR", { weekday: "short" });
    default:
      return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  }
}

export const hasRunning = (sessions: SessionOut[] | undefined): boolean =>
  !!sessions?.some((s) => sessionStatus(s).running);
