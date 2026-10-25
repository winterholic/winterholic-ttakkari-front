import type { KbJobStatus, KbPipelineStage, KbStageStatus } from "../../api/kbTypes";

// ---- v3: 자동 처리 파이프라인(설계 §2.3)
export const STAGE_LABEL: Record<KbPipelineStage, string> = {
  parsing: "파싱", chunking: "구조 청킹", extracting: "지식 추출", linking: "개념 연결", indexing: "색인", canonicalizing: "정본 요약",
};
export const JOB_STATUS_LABEL: Record<KbJobStatus, string> = {
  registered: "등록됨", parsing: "파싱 중", chunking: "청킹 중", extracting: "지식 추출 중", linking: "개념 연결 중", indexing: "색인 중",
  canonicalizing: "정본 요약 중", ready: "완료", degraded: "부분 완료", held: "보류", failed: "실패",
};
export const STAGE_STATUS_LABEL: Record<KbStageStatus, string> = {
  pending: "대기", running: "진행 중", succeeded: "완료", degraded: "일부 생략", held: "보류", failed: "실패", skipped: "건너뜀",
};
export type Tone = "info" | "success" | "warning" | "danger" | undefined;
export function jobTone(status: string): Tone {
  if (status === "ready") return "success";
  if (status === "failed") return "danger";
  if (status === "held" || status === "degraded") return "warning";
  return "info";
}
/** 아직 워커가 움직이고 있는 상태. 폴링은 이런 작업이 있을 때만 한다. */
export const isActiveJob = (status: string) => status !== "ready" && status !== "degraded" && status !== "held" && status !== "failed";
export const jobStatusLabel = (status: string) => JOB_STATUS_LABEL[status as KbJobStatus] ?? status;

/** 보류·실패 사유 코드. 모르는 코드는 코드를 그대로 보여 준다(사유를 지어내지 않는다). */
export const HOLD_REASON: Record<string, string> = {
  ocr_required: "글자 층이 없는 스캔 문서예요. 아직 OCR 을 지원하지 않아 읽지 못했어요.",
  unsupported_legacy_office: "구형 오피스 파일(.doc·.ppt·.xls·.hwp)은 지원하지 않아요. docx·pptx·xlsx 로 저장해 다시 올려 주세요.",
  parse_error: "파일을 읽는 중 오류가 났어요. 파일이 손상되지 않았는지 확인해 주세요.",
};
export const reasonText = (code: string | null | undefined) => (code ? HOLD_REASON[code] ?? code : null);

/** 주제 값은 계약에 허용 목록이 없어 설계 §5.2 의 분류 이름을 임시 slug 로 썼다. */
export const DOMAINS: { value: string; label: string }[] = [
  { value: "dev-infra", label: "개발·인프라" }, { value: "ai", label: "AI" }, { value: "security", label: "보안" }, { value: "business", label: "비즈니스" },
];
export const domainLabel = (d: string | null | undefined) => (d ? (DOMAINS.find((x) => x.value === d)?.label ?? d) : "");

export const ENTITY_KIND_LABEL: Record<string, string> = {
  concept: "개념", technology: "기술", api: "API", symbol: "심볼", standard: "표준",
};
export const kindLabel = (k: string | undefined) => (k ? (ENTITY_KIND_LABEL[k] ?? k) : "개념");
export const ENTITY_KIND_COLOR: Record<string, string> = {
  concept: "var(--tk-color-chart-categorical-4)", technology: "var(--tk-color-chart-categorical-1)", api: "var(--tk-color-chart-categorical-2)",
  symbol: "var(--tk-color-chart-categorical-5)", standard: "var(--tk-color-chart-categorical-3)",
};
export const kindColor = (k: string | undefined) => (k ? ENTITY_KIND_COLOR[k] : undefined) ?? "var(--tk-color-chart-categorical-6)";

/** 절 경로는 배열일 수도 "A > B" 문자열일 수도 있다(계약 미확정). 화면에는 항상 조각 배열로 쓴다. */
export function crumbs(path: string | string[] | null | undefined): string[] {
  if (!path) return [];
  const parts = Array.isArray(path) ? path : path.split(/\s*>\s*/);
  return parts.map((x) => x.trim()).filter(Boolean);
}

export function timecode(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}초`;
}

export const SOURCE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "모든 유형" }, { value: "upload", label: "직접 등록" }, { value: "file", label: "파일" }, { value: "web", label: "웹 문서" },
];
/** 서버가 url·web 을 섞어 쓰므로 같은 유형으로 본다. */
export const sourceType = (kind: string | null | undefined) => (kind === "url" ? "web" : (kind ?? ""));

export const WHEN_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체 기간" }, { value: "1", label: "최근 24시간" }, { value: "7", label: "최근 7일" }, { value: "30", label: "최근 30일" },
];
export function withinDays(iso: string | null | undefined, days: number, now = Date.now()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && now - t <= days * 86_400_000;
}
