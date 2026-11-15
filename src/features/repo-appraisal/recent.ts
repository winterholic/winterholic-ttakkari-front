// 최근 본 평가. 이력 API 는 저장소별이라 저장소 무관 목록은 이 기기에서만 기억한다.
// 브라우저에는 id·이름·점수만 둔다. 토큰·응답 본문·비공개 내용은 저장하지 않는다.
const RECENT_KEY = "ttakkari.repo-appraisal.recent";
const MAX_RECENT = 8;

export interface RecentAppraisal {
  id: string;
  owner: string;
  repo: string;
  mode: string;
  grade: string | null;
  weighted_score: number | null;
  created_at: string | null;
}

function read(): RecentAppraisal[] {
  try {
    const v = window.localStorage.getItem(RECENT_KEY);
    const list = v ? (JSON.parse(v) as RecentAppraisal[]) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((t) => t && typeof t.id === "string" && typeof t.owner === "string" && typeof t.repo === "string");
  } catch {
    return [];
  }
}

export const getRecentAppraisals = (): RecentAppraisal[] => read();

export function pushRecentAppraisal(t: RecentAppraisal): void {
  try {
    const rest = read().filter((x) => x.id !== t.id);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([
      { id: t.id, owner: t.owner, repo: t.repo, mode: t.mode, grade: t.grade, weighted_score: t.weighted_score, created_at: t.created_at },
      ...rest,
    ].slice(0, MAX_RECENT)));
  } catch {
    // 저장소가 막힌 환경(사생활 보호 모드 등)에서는 기억만 포기한다.
  }
}
