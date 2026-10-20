import type { GameBuild, GameFeedbackSummary, GameVersion } from "../../api/gameTypes";

/** 빌드 목록은 항상 있고, 요청·피드백 정보(GameVersion)는 서버가 /versions 를 알 때만 덧붙는다. */
export type VersionItem = GameBuild & Partial<Pick<GameVersion, "is_active" | "produced_by" | "requests_on" | "feedback_requests_on">>;

export const kb = (n: number | null) => (n === null ? "?" : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : n >= 1024 ? `${Math.round(n / 1024)}KB` : `${n}B`);

/** 두 빌드의 변경 요약. 서버에 변경 설명이 없어 빌드 기록(커밋·번들 크기·파일 수·잠금 검증)에서만 만든다. */
export function summarizeChange(prev: GameBuild, next: GameBuild): string[] {
  const out: string[] = [];
  if (prev.source_commit && next.source_commit) {
    out.push(prev.source_commit === next.source_commit ? "소스 커밋이 같아요" : `소스 커밋 ${prev.source_commit.slice(0, 7)} → ${next.source_commit.slice(0, 7)}`);
  }
  if (prev.bundle_bytes !== null && next.bundle_bytes !== null) {
    const d = next.bundle_bytes - prev.bundle_bytes;
    out.push(d === 0 ? "번들 크기 변화 없음" : `번들 ${d > 0 ? "+" : "-"}${kb(Math.abs(d))} (${kb(prev.bundle_bytes)} → ${kb(next.bundle_bytes)})`);
  }
  if (prev.bundle_files !== null && next.bundle_files !== null && prev.bundle_files !== next.bundle_files) out.push(`파일 ${prev.bundle_files}개 → ${next.bundle_files}개`);
  if (prev.bundle_sha256 && prev.bundle_sha256 === next.bundle_sha256) out.push("번들 내용이 완전히 같아요");
  if (prev.lock_verified !== next.lock_verified) out.push(next.lock_verified ? "새 빌드는 잠긴 결정 검증을 통과했어요" : "새 빌드는 잠긴 결정 검증이 없어요");
  return out;
}

export const REQUEST_KIND: Record<string, string> = { develop: "개발 요청", modify: "수정 요청", verify: "검증 요청" };

/** 시각 피드백 종류를 사람 말로. 담긴 것만 나온다. */
export function feedbackParts(fb: GameFeedbackSummary | null | undefined): string[] {
  if (!fb) return [];
  const out: string[] = [];
  if (fb.annotations > 0) out.push(`화면 표시 ${fb.annotations}`);
  if (fb.picked > 0) out.push(`오브젝트 ${fb.picked}`);
  if (fb.clip_frames > 0) out.push(`영상 화면 ${fb.clip_frames}장`);
  if (out.length === 0 && fb.has_screenshot) out.push("스크린샷");
  return out;
}

/** 이 버전이 어떤 경위로 생겼는지 한 줄. 요청 정보가 없으면 빌드 기록으로만 말한다. */
export function originOf(v: VersionItem): string {
  if (v.restored_from_id) return "되돌리기로 만든 복구 빌드";
  const r = v.produced_by;
  if (!r) return v.run_id ? "AI 요청에서 만든 빌드" : "직접 시작한 빌드";
  const base = r.base_build_seq ? ` · v${r.base_build_seq} 기준` : "";
  return `${REQUEST_KIND[r.kind] ?? "요청"}${r.repair_attempt ? "(자동 수리)" : ""}${base}`;
}

export type StatusFilter = "all" | "succeeded" | "failed" | "building";
export type PeriodFilter = "all" | "today" | "7d" | "30d";
/** applied: 시각 피드백을 반영해 만든 버전. received: 이 버전을 보고 피드백 요청이 나간 적 있는 버전. */
export type FeedbackFilter = "all" | "applied" | "received" | "none";

export interface VersionFilter {
  text: string;
  status: StatusFilter;
  period: PeriodFilter;
  feedback: FeedbackFilter;
}

export const EMPTY_FILTER: VersionFilter = { text: "", status: "all", period: "all", feedback: "all" };

export const activeFilterCount = (f: VersionFilter): number => (f.text.trim() ? 1 : 0) + (f.status !== "all" ? 1 : 0) + (f.period !== "all" ? 1 : 0) + (f.feedback !== "all" ? 1 : 0);

const DAY_MS = 24 * 60 * 60 * 1000;

function inPeriod(created: string, period: PeriodFilter, now: number): boolean {
  if (period === "all") return true;
  const t = new Date(created).getTime();
  if (Number.isNaN(t)) return false;
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return t >= start.getTime();
  }
  return t >= now - (period === "7d" ? 7 : 30) * DAY_MS;
}

export function matchesVersion(v: VersionItem, f: VersionFilter, now: number): boolean {
  if (f.status !== "all" && v.status !== f.status) return false;
  if (!inPeriod(v.created_at, f.period, now)) return false;
  const applied = !!v.produced_by?.feedback;
  const received = (v.feedback_requests_on ?? 0) > 0;
  if (f.feedback === "applied" && !applied) return false;
  if (f.feedback === "received" && !received) return false;
  if (f.feedback === "none" && (applied || received)) return false;
  const q = f.text.trim().toLowerCase();
  if (!q) return true;
  const exact = /^v(\d+)$/.exec(q); // "v3" 는 버전 번호만 가리킨다
  if (exact) return `${v.seq}` === exact[1];
  if (q === `${v.seq}`) return true;
  return [v.produced_by?.instruction ?? "", v.source_commit ?? "", v.error ?? ""].join("\n").toLowerCase().includes(q);
}

export const filterVersions = (list: VersionItem[], f: VersionFilter, now: number): VersionItem[] => list.filter((v) => matchesVersion(v, f, now));

/** 두 버전 사이에 만들어진 버전(작은 쪽 제외, 큰 쪽 포함). 비교하는 두 버전 사이에 어떤 요청들이 있었는지 보여 주는 데 쓴다. */
export function versionsBetween(all: VersionItem[], a: VersionItem, b: VersionItem): VersionItem[] {
  const [lo, hi] = a.seq <= b.seq ? [a.seq, b.seq] : [b.seq, a.seq];
  return all.filter((v) => v.seq > lo && v.seq <= hi).sort((x, y) => x.seq - y.seq);
}
