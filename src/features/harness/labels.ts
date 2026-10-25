import type {
  HarnessCategory, HarnessEngine, HarnessGroupId, HarnessLayer, HarnessRow, HarnessScope, HarnessSession, HarnessWarningKind, LayerEngine, LayerPhase,
} from "../../api/harnessTypes";
import type { IconName } from "../../ui/Icon";

export const ENGINE_LABEL: Record<HarnessEngine, string> = {
  claude: "Claude", codex: "Codex", antigravity: "Antigravity", muse: "Muse", "qwen-local": "Qwen", shared: "공용(.agents)", ttakkari: "따까리",
  opencode: "OpenCode", copilot: "GitHub Copilot",
};
export const SCOPE_LABEL: Record<HarnessScope, string> = { global: "글로벌", project: "프로젝트", account: "계정", ttakkari: "따까리" };
export const SESSION_LABEL: Record<HarnessSession, string> = { desk: "접수", lead: "기획", worker: "작업자", orchestrator: "메인(옛)" };
export const SESSION_HINT: Record<HarnessSession, string> = {
  desk: "사용자 메시지를 받아 바로 답하거나 기획으로 넘긴다",
  lead: "접수가 넘긴 요청을 맡아 작업자를 부린다",
  worker: "실제로 코드·파일 작업을 하는 세션",
  orchestrator: "부모 없는 옛 메인 오케스트레이터 경로",
};
export const LAYER_ENGINE_LABEL: Record<LayerEngine, string> = {
  claude: "Claude", codex: "Codex", antigravity: "Antigravity", muse: "Muse", "qwen-local": "Qwen",
  opencode: "OpenCode", copilot: "GitHub Copilot",
};
export const SOURCE_LABEL: Record<HarnessRow["source"], string> = {
  file: "파일", code: "코드 상수", db: "DB", config: "설정(config)", generated: "실행 시 생성",
};
export const PHASE_LABEL: Record<LayerPhase, string> = {
  prompt: "프롬프트", delivery: "전달 방식", load: "엔진이 읽는 파일", tool: "도구", guard: "안전 가드",
};
export const ORIGIN_LABEL: Record<HarnessLayer["origin"], string> = {
  code: "코드", file: "파일", db: "DB", generated: "생성", engine: "엔진 실행 옵션", cli: "엔진 CLI 로드",
};
export const WARNING_LABEL: Record<HarnessWarningKind, string> = {
  broken_ref: "깨진 참조", duplicate: "중복 이름", too_long: "너무 긴 문서", other: "기타",
};
export const CATEGORY_HINT: Partial<Record<HarnessCategory, string>> = {
  prompt: "세션에 주입되는 문구", guard: "차단 규칙", policy: "모델·라우팅·Qwen", capability: "엔진별 측정 결과",
};

export function activeLabel(row: Pick<HarnessRow, "present" | "active">): { text: string; tone?: "success" | "warning" | "danger" | "info" } {
  if (!row.present) return { text: "없음", tone: "warning" };
  if (row.active === false) return { text: "비활성" };
  if (row.active === true) return { text: "활성", tone: "success" };
  return { text: "상태 모름" };
}

const pad = (n: number) => String(n).padStart(2, "0");
export function formatTime(epochSeconds: number | null): string {
  if (epochSeconds == null) return "-";
  const d = new Date(epochSeconds * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function formatAge(epochSeconds: number | null, now = Date.now()): string {
  if (epochSeconds == null) return "";
  const days = Math.floor((now - epochSeconds * 1000) / 86_400_000);
  if (days <= 0) return "오늘";
  if (days < 31) return `${days}일 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}
export const formatSize = (chars: number, lines: number) => (chars ? `${chars.toLocaleString()}자 · ${lines.toLocaleString()}줄` : "빈 항목");

/** 검색어와 겹치는 부분을 <mark> 로 감싸 보여 줄 조각들. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!tokens.length || !text) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const marks: [number, number][] = [];
  for (const t of tokens) {
    let at = lower.indexOf(t);
    while (at >= 0 && marks.length < 40) {
      marks.push([at, at + t.length]);
      at = lower.indexOf(t, at + t.length);
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
    else merged.push([m[0], m[1]]);
  }
  const out: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [a, b] of merged) {
    if (a > cursor) out.push({ text: text.slice(cursor, a), hit: false });
    out.push({ text: text.slice(a, b), hit: true });
    cursor = b;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
  return out;
}

export const GROUP_ICON: Record<HarnessGroupId, IconName> = {
  claude: "terminal", codex: "code", muse: "palette", qwen: "gauge", antigravity: "sparkles", ttakkari: "shield", projects: "folder-open",
  opencode: "terminal", copilot: "sparkles",
};
export const PHASE_ORDER = ["prompt", "delivery", "guard", "tool"] as const;
