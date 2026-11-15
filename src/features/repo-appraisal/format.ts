import type {
  AppraisalAxis, AppraisalItem, AppraisalItemStatus, AppraisalMode, AppraisalRepoType, AppraisalResult, AppraisalStage, AppraisalStatus,
} from "../../api/repoAppraisalTypes";

export const AXIS_LABEL: Record<AppraisalAxis, string> = {
  code_quality: "코드 품질",
  architecture: "아키텍처",
  maintainability: "유지보수성",
  ai_harness: "AI 하네스",
  originality: "독창성",
};

export const REPO_TYPE_LABEL: Record<AppraisalRepoType, string> = {
  library: "라이브러리",
  app: "앱",
  docs: "문서",
  experiment: "실험",
  unknown: "미분류",
};

export const MODE_LABEL: Record<AppraisalMode, string> = { quick: "빠른", deep: "정밀" };

export const STATUS_LABEL: Record<AppraisalStatus, string> = {
  queued: "대기 중",
  running: "진행 중",
  done: "완료",
  failed: "실패",
};

export const ITEM_STATUS_LABEL: Record<AppraisalItemStatus, string> = {
  scored: "채점",
  unavailable: "미수집",
  unverified: "미검증",
  skipped: "제외",
  na: "해당 없음",
  pending: "대기 중",
};

export const STAGE_LABEL: Record<AppraisalStage, string> = { collect: "수집", score: "채점", llm: "AI 판정" };

export const isActive = (s: AppraisalStatus): boolean => s === "queued" || s === "running";

/** 점수는 소수 첫째 자리까지만. 서버 가중합도 같은 자리수다. */
export const fmtScore = (v: number): string => v.toFixed(1);

/** delta 표시. null(첫 평가)은 빈 문자열이라 호출한 쪽에서 통째로 숨긴다. */
export function fmtDelta(delta: number | null): string {
  if (delta === null) return "";
  if (delta === 0) return "변동 없음";
  const v = Math.abs(delta).toFixed(1);
  return delta > 0 ? `▲ ${v}` : `▼ ${v}`;
}

export type AxisState = { kind: "scored"; value: number } | { kind: "na" } | { kind: "unverified" } | { kind: "missing" };

/**
 * 축 막대의 상태. 축 값이 null 이면 항목 상태를 뜯어 이유를 가른다.
 * 전부 na(하네스 파일 없음 같은 감점 제외)면 "해당 없음", 미검증이 하나라도 있으면 "미검증", 나머지는 "미채점"이다.
 */
export function axisState(axis: AppraisalAxis, result: AppraisalResult): AxisState {
  const value = result.axes[axis];
  if (value !== null && value !== undefined) return { kind: "scored", value };
  const items = result.items.filter((i) => i.item === axis || i.item.startsWith(axis + "."));
  if (items.length > 0 && items.every((i) => i.status === "na")) return { kind: "na" };
  if (items.some((i) => i.status === "unverified")) return { kind: "unverified" };
  return { kind: "missing" };
}

export const AXIS_STATE_LABEL: Record<Exclude<AxisState, { kind: "scored" }>["kind"], string> = {
  na: "해당 없음",
  unverified: "미검증",
  missing: "미채점",
};

/** 항목 키 "축.항목"에서 항목 이름만. */
export const itemName = (key: string): string => {
  const i = key.indexOf(".");
  return i >= 0 ? key.slice(i + 1) : key;
};

const CONFIDENCE_LABEL: Record<string, string> = { high: "높음", medium: "중간", low: "낮음" };

/** 근거(evidence) 객체를 사람이 읽을 한 줄들로 푼다. 키 순서는 인용·신뢰도·사유 우선이다. */
export function evidenceLines(evidence: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const citations = evidence.citations;
  if (Array.isArray(citations) && citations.length > 0) {
    lines.push(`인용 ${citations.filter((c): c is string => typeof c === "string").join(", ")}`);
  }
  const confidence = evidence.confidence;
  if (typeof confidence === "string") lines.push(`신뢰도 ${CONFIDENCE_LABEL[confidence] ?? confidence}`);
  const reason = evidence.reason;
  if (typeof reason === "string" && reason) lines.push(reason);
  for (const [k, v] of Object.entries(evidence)) {
    if (k === "citations" || k === "confidence" || k === "reason" || k === "low_reliability") continue;
    if (v === null || v === undefined) continue;
    const shown = typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
    lines.push(`${k} ${shown}`);
  }
  return lines;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "시각 미확인";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "시각 미확인"
    : new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

/** 스파크라인 점. 점수 있는 완료 항목만 오래된 순으로 쓴다. */
export function sparkPoints(scores: (number | null)[], width: number, height: number): string {
  const vals = scores.filter((s): s is number => typeof s === "number");
  if (vals.length === 0) return "";
  if (vals.length === 1) return `0,${height / 2} ${width},${height / 2}`;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  return vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * width;
    const y = height - ((v - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function axisItems(axis: AppraisalAxis, items: AppraisalItem[]): AppraisalItem[] {
  return items.filter((i) => i.item === axis || i.item.startsWith(axis + "."));
}
