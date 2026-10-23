import { ApiError } from "../../api/client";

export const KIND_LABEL: Record<string, string> = { upload: "직접 등록", file: "파일", url: "웹 문서", web: "웹 문서" };

/** 서버가 돌려주는 짧은 코드(kb_* 와 검증 코드)를 사용자 문장으로 바꾼다. 모르는 코드는 서버 메시지를 그대로 쓴다. */
const ERROR_TEXT: Record<string, string> = {
  source_version_conflict: "다른 곳에서 출처를 바꿨어요. 다시 읽은 뒤 수정해 주세요.",
  source_key_exists: "같은 출처가 이미 등록돼 있어요.",
  knowledge_permission_missing: "이 자료를 도서관에 적재할 권리를 확인해 주세요.",
  utility_review_required: "원문을 확인하고 유용성 검토를 먼저 남겨 주세요.",
  kb_import_requires_unlimited_retention_policy: "보관 만료 기한이 있는 자료는 아직 도서관에 적재할 수 없어요.",
  "need 20..2000 reviewed, training-permitted examples": "학습이 허용된 검토 자료가 20~2,000건 필요해요.",
  "at least five independent source groups are required": "서로 다른 출처 5곳 이상의 검토 자료가 필요해요.",
  "both utility classes are required": "유용한 자료와 유용하지 않은 자료의 검토가 모두 필요해요.",
  "both classes must occur in training and source-heldout validation": "출처별 자료가 부족해 학습과 검증을 나눌 수 없어요. 여러 출처의 검토를 추가해 주세요.",

  kb_semantic_temporarily_unavailable: "의미 검색을 잠시 사용할 수 없어요. 단어 검색으로 바꾸거나 잠시 뒤 다시 시도해 주세요.",
  text_too_long: "본문이 너무 길어요. 200만 자 이하로 줄여 주세요.",
  kb_register_conflict: "같은 내용을 동시에 등록하고 있어요. 잠시 뒤 다시 시도해 주세요.",
  kb_register_rejected: "저장소가 이 입력을 받아들이지 않았어요. 특수 문자를 확인해 주세요.",
  kb_document_not_found: "문서를 찾을 수 없어요.",
  kb_revision_not_found: "이 문서의 해당 버전을 찾을 수 없어요.",
  kb_passage_not_found: "패시지를 찾을 수 없어요.",
};

export function failure(e: unknown): string {
  if (e instanceof ApiError) return ERROR_TEXT[e.message] ?? ERROR_TEXT[e.code] ?? (e.message || "불러오지 못했어요.");
  return e instanceof Error ? e.message : "불러오지 못했어요.";
}

export const COLLECT_REASON: Record<string, string> = {
  l0_too_short: "본문이 짧아 검토 대기", l0_symbol_heavy: "기호 비율이 높아 검토 대기",
  l0_low_alpha_ratio: "본문 비율이 낮아 검토 대기", l0_repeated_lines: "같은 줄 반복",
  l0_repetitive: "내용 반복이 많음", l0_link_heavy: "링크 비율이 높음", l0_mostly_short_lines: "짧은 줄이 많음",
  exact_duplicate: "동일한 본문이 이미 있음", source_policy_missing: "출처 정책을 확인해 주세요",
  store_not_permitted: "원문 보관 권리가 허용되지 않음", storage_cap_reached: "원문 저장 공간 한도에 도달함",
  unknown: "확인되지 않음",
};

export function formatTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatChars(n: number): string {
  return `${n.toLocaleString("ko-KR")}자`;
}

export const shortHash = (h: string) => h.slice(0, 12);

/** 발췌 문자열을 강조 구간 기준으로 쪼갠다. 서버 좌표는 코드포인트 기준이라 Array.from 으로 센다. 겹치거나 범위를 벗어난 구간은 건너뛴다. */
export function splitHighlights(text: string, ranges: [number, number][]): { text: string; hit: boolean }[] {
  const out: { text: string; hit: boolean }[] = [];
  const chars = Array.from(text);
  let cursor = 0;
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (start < cursor || end > chars.length || end <= start) continue;
    if (start > cursor) out.push({ text: chars.slice(cursor, start).join(""), hit: false });
    out.push({ text: chars.slice(start, end).join(""), hit: true });
    cursor = end;
  }
  if (cursor < chars.length) out.push({ text: chars.slice(cursor).join(""), hit: false });
  return out;
}
