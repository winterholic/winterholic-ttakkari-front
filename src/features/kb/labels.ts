import { ApiError } from "../../api/client";

export const KIND_LABEL: Record<string, string> = { upload: "직접 등록", file: "파일", url: "웹 문서" };

/** 서버가 돌려주는 짧은 코드(kb_* 와 검증 코드)를 사용자 문장으로 바꾼다. 모르는 코드는 서버 메시지를 그대로 쓴다. */
const ERROR_TEXT: Record<string, string> = {
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
