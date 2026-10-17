import type { OpsLevel, OpsSource, OpsStatus } from "../../api/opsLogTypes";

export const SOURCE_LABEL: Record<OpsSource, string> = {
  deploy: "배포",
  run: "작업 실패",
  api: "API",
  process: "프로세스 로그",
  worker: "엔진 라우팅",
  code: "코드",
};

export const STATUS_LABEL: Record<OpsStatus, string> = { unresolved: "미해결", resolved: "해결됨", ignored: "무시" };
export const LEVEL_TONE: Record<OpsLevel, "warning" | "danger"> = { warning: "warning", error: "danger", fatal: "danger" };
export const LEVEL_LABEL: Record<OpsLevel, string> = { warning: "경고", error: "오류", fatal: "치명" };

const time = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function when(value: string | null | undefined): string {
  return value ? time.format(new Date(value)) : "-";
}

/** 방금·N분 전처럼 짧게. 하루가 넘으면 날짜로 보인다. */
export function ago(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "-";
  const sec = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (sec < 60) return "방금";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return when(value);
}
