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

/** 보류·실패 사유 코드. 모르는 코드는 코드를 그대로 보여 준다(사유를 지어내지 않는다). 서버 문구(hold_message)가 있으면 그쪽이 우선이다. */
export const HOLD_REASON: Record<string, string> = {
  ocr_required: "글자 층이 없는 스캔 문서예요. 아직 OCR 을 지원하지 않아 읽지 못했어요.",
  unsupported_legacy_office: "구형 오피스 파일(.doc·.ppt·.xls·.hwp)은 지원하지 않아요. docx·pptx·xlsx 로 저장해 다시 올려 주세요.",
  unsupported_format: "이 파일 형식은 아직 지원하지 않아요.",
  stt_runtime_unavailable: "음성·영상을 글로 옮기는 STT 런타임이 이 서버에 없어요. 런타임이 준비되기 전에는 읽지 못해요.",
  collector_html_structure_revision_required: "수집기가 받은 예전 HTML 이라 제목 구조를 살리려면 새 버전으로 다시 만들어야 해요.",
  parse_error: "파일을 읽는 중 오류가 났어요. 파일이 손상되지 않았는지 확인해 주세요.",
};
export const reasonText = (code: string | null | undefined) => (code ? HOLD_REASON[code] ?? code : null);

/**
 * 다시 시도해도 같은 결과가 나오는 보류 사유. 실서버에서 확인했다: 이런 보류 작업을 재시도하면 서버가 받아 주지만(requeued=true)
 * 파싱 단계에서 같은 사유로 다시 보류되고 패시지는 0개 그대로다. 결과가 같은 버튼을 주면 사용자가 헛수고를 하므로
 * 재시도 버튼을 빼고 안내만 보여 준다.
 */
export const PERMANENT_HOLD = new Set(["ocr_required", "unsupported_legacy_office", "unsupported_format", "stt_runtime_unavailable"]);

/** 단계의 저하·보류 사유(detail 안의 코드). 모르는 값은 그대로 보여 준다. */
export const DEGRADE_REASON: Record<string, string> = {
  l2_disabled: "AI 심층 추출이 꺼져 있어 규칙·사전 기반 결과만 만들었어요.",
  daily_budget_exhausted: "오늘 AI 호출 예산을 다 써서 규칙·사전 기반 결과만 만들었어요.",
};
/** 보류·부분 완료 사유 코드를 문장으로. 실서버는 부분 완료(degraded) 작업에도 hold_reason 에 l2_disabled 같은 코드를 담는다. */
export const codeText = (code: string | null | undefined) => (code ? (DEGRADE_REASON[code] ?? HOLD_REASON[code] ?? code) : null);

export function stageNote(detail: Record<string, unknown> | undefined): string | null {
  if (!detail) return null;
  const l2 = typeof detail.l2 === "object" && detail.l2 !== null ? (detail.l2 as Record<string, unknown>) : undefined;
  const code = [detail.degradation_reason, l2?.degradation_reason, detail.reason, detail.missing_capability].find((v): v is string => typeof v === "string" && v.length > 0);
  return code ? (DEGRADE_REASON[code] ?? HOLD_REASON[code] ?? code) : null;
}

/** POST /ingest 항목별 error 코드. url_rejected:<코드> 처럼 세부 코드가 뒤에 붙는 것은 앞부분으로 찾는다. 모르는 코드는 그대로 보여 준다. */
const INGEST_ERROR: Record<string, string> = {
  empty_content: "내용이 비어 있어요.",
  file_too_large: "파일이 너무 커요(최대 100MiB).",
  text_too_long: "본문이 너무 길어요(200만 자 이하).",
  unsupported_nul: "본문에 처리할 수 없는 제어 문자가 있어요.",
  invalid_source_kind: "출처 종류 값이 올바르지 않아요.",
  parse_empty_extraction: "웹 문서에서 본문을 뽑지 못했어요.",
  parse_empty_text: "파일에서 글자를 뽑지 못했어요.",
  conflict_retry_later: "같은 내용을 동시에 올리고 있어요. 잠시 뒤 다시 올려 주세요.",
  url_rejected: "이 주소는 가져올 수 없어요(공개 웹 주소만 가능해요).",
  url_fetch_failed: "주소에서 내용을 가져오지 못했어요.",
};
export function ingestErrorText(code: string | null | undefined): string {
  if (!code) return "알 수 없는 오류";
  const head = code.split(":")[0];
  const known = INGEST_ERROR[code] ?? INGEST_ERROR[head];
  if (!known) {
    if (code.startsWith("internal_")) return "서버 내부 오류로 접수하지 못했어요(" + code + ").";
    if (code.startsWith("parse_")) return "파일을 읽지 못했어요(" + code.slice(6) + ").";
    return code;
  }
  return code.includes(":") ? known + " (" + code.slice(code.indexOf(":") + 1) + ")" : known;
}

/** 주제 slug. 서버 kb_domains.ENTITY_DOMAINS_BY_TOPIC 와 같다(dev-infra 는 엔터티 domain dev·infra 묶음). */
export const DOMAINS: { value: string; label: string }[] = [
  { value: "dev-infra", label: "개발·인프라" }, { value: "ai", label: "AI" }, { value: "security", label: "보안" },
  { value: "business", label: "비즈니스" }, { value: "science", label: "과학" },
];
/** 엔터티 자체의 domain 값(dev·infra·ai·security·business·science·general). 문서 주제 slug 와 다르다. */
const ENTITY_DOMAIN_LABEL: Record<string, string> = { dev: "개발", infra: "인프라", ai: "AI", security: "보안", business: "비즈니스", science: "과학", general: "일반" };
export const domainLabel = (d: string | null | undefined) => (d ? (DOMAINS.find((x) => x.value === d)?.label ?? ENTITY_DOMAIN_LABEL[d] ?? d) : "");

/** 서버가 정본 핵심 사실에 정의 문장을 다시 넣어 주기 때문에, 요약과 같은 문장이면 한 번만 보여 준다. */
export function distinctFacts(canon: { summary: string; key_facts: string[] } | null | undefined): string[] {
  if (!canon) return [];
  return canon.key_facts.filter((f) => f.replace(/^definition:\s*/, "") !== canon.summary && f !== canon.summary);
}

export const ENTITY_KIND_LABEL: Record<string, string> = {
  concept: "개념", technology: "기술", api: "API", symbol: "심볼", standard: "표준",
};
export const kindLabel = (k: string | undefined) => (k ? (ENTITY_KIND_LABEL[k] ?? k) : "개념");
export const ENTITY_KIND_COLOR: Record<string, string> = {
  concept: "var(--tk-color-chart-categorical-4)", technology: "var(--tk-color-chart-categorical-1)", api: "var(--tk-color-chart-categorical-2)",
  symbol: "var(--tk-color-chart-categorical-5)", standard: "var(--tk-color-chart-categorical-3)",
};
export const kindColor = (k: string | undefined) => (k ? ENTITY_KIND_COLOR[k] : undefined) ?? "var(--tk-color-chart-categorical-6)";

/** 절 경로는 서버가 배열로 주지만 "A > B" 문자열도 받는다. 화면에는 항상 조각 배열로 쓴다. */
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

export const CHUNK_KIND_LABEL: Record<string, string> = { code: "코드", table: "표", list: "목록", heading: "제목", transcript: "전사" };
/** 일반 본문(prose)은 배지를 달지 않는다. */
export const chunkKindLabel = (k: string | null | undefined) => (k && k !== "prose" && k !== "text" ? (CHUNK_KIND_LABEL[k] ?? k) : null);

export const SUMMARY_SOURCE_LABEL: Record<string, string> = {
  canonical_definition: "정본 정의",
  extractive_first_passage: "본문 앞부분 발췌",
};

// ---- 충돌 상태. kept_separate 는 모호 개념에서는 "서로 다른 개념으로 분리 확정"이지만, 상충 주장에서는 "어느 쪽도 채택하지 않고 종결"이다.
// 새 버전이 양쪽 주장을 모두 대체해 시스템이 닫은 경우(resolved_by = system:revision_supersession)도 kept_separate 로 오는데, 양쪽이 옳다는 뜻이 아니다.
export const SUPERSESSION_RESOLVER = "system:revision_supersession";
export const isSystemResolution = (resolvedBy: string | null | undefined) => resolvedBy === SUPERSESSION_RESOLVER;

export const CONFLICT_KIND_TEXT: Record<string, string> = {
  value_contradiction: "값이 다른 주장", polarity_contradiction: "서로 반대되는 주장", version_divergence: "버전에 따라 달라진 주장", ambiguous_entity: "같은 개념인지 불확실",
};

export function conflictStatusText(c: { kind: string; status: string; resolved_by?: string | null }): { label: string; detail?: string; tone: "warning" | "success" | "info" | undefined } {
  const system = isSystemResolution(c.resolved_by);
  switch (c.status) {
    case "open": return { label: "열림", tone: "warning" };
    case "resolved_a": return system
      ? { label: "새 버전이 B를 대체해 종결", detail: "자동 종결: B 주장이 새 버전에서 대체돼 A 주장이 남았어요.", tone: "info" }
      : { label: "A를 정본으로 채택", tone: "success" };
    case "resolved_b": return system
      ? { label: "새 버전이 A를 대체해 종결", detail: "자동 종결: A 주장이 새 버전에서 대체돼 B 주장이 남았어요.", tone: "info" }
      : { label: "B를 정본으로 채택", tone: "success" };
    case "resolved_both_valid": return { label: "둘 다 유효(적용 조건 차이)", detail: "사람이 두 주장이 서로 다른 조건에서 모두 맞다고 기록했어요.", tone: "success" };
    case "merged": return { label: "하나의 개념으로 병합", tone: "success" };
    case "kept_separate":
      if (c.kind === "ambiguous_entity") return { label: "서로 다른 개념으로 분리 확정", tone: "success" };
      return system
        ? { label: "새 버전이 양쪽 주장을 대체해 종결", detail: "자동 종결: 두 주장 모두 새 버전에서 대체됐어요. 어느 쪽도 채택하지 않았고, 양쪽이 옳다는 뜻도 아니에요.", tone: "info" }
        : { label: "어느 쪽도 채택하지 않고 종결", detail: "양쪽이 옳다는 뜻은 아니에요.", tone: "info" };
    default: return { label: c.status, tone: undefined };
  }
}
