const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "3분 전"·"2일 전"·"2026-10-01". 시각이 없거나 깨졌으면 빈 문자열. */
export function ago(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = nowMs - t;
  if (d < MIN) return "방금";
  if (d < HOUR) return Math.floor(d / MIN) + "분 전";
  if (d < DAY) return Math.floor(d / HOUR) + "시간 전";
  if (d < 30 * DAY) return Math.floor(d / DAY) + "일 전";
  return iso.slice(0, 10);
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "" : t.toLocaleString("ko-KR");
}

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

/** 1200 → "1.2k". 별·포크 수처럼 좁은 칸용. */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "k";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

/** 남은 초를 "12분 34초"로. */
export function remaining(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  if (s < 60) return s + "초";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "분 " + String(s % 60).padStart(2, "0") + "초";
  return Math.floor(m / 60) + "시간 " + (m % 60) + "분";
}

/** 마지막 마디(파일명)와 그 앞 디렉터리로 가른다. 디렉터리는 말줄임, 파일명은 전체를 보여 주려고 따로 둔다. */
export function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", name: path } : { dir: path.slice(0, i + 1), name: path.slice(i + 1) };
}

/** 두 시각 사이를 "2분 05초"로. 끝이 없으면 진행 중이라 빈 문자열. */
export function duration(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso || !endIso) return "";
  const ms = Date.parse(endIso) - Date.parse(startIso);
  return Number.isNaN(ms) || ms < 0 ? "" : remaining(ms / 1000);
}

/** 앞 7자리. SHA 는 짧게 보이고 전체는 title 로 준다. */
export const shortSha = (sha: string | null | undefined): string => (sha ?? "").slice(0, 7);
