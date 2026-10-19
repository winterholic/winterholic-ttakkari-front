import type { NlmCitation } from "../../api/notebooklmTypes";

export type AnswerPart = { type: "text"; text: string } | { type: "cite"; numbers: number[]; raw: string };

// [3], [1, 2] 형태의 마커만 인용으로 본다. 범위([1-3])나 다른 모양은 상류 표기를 모르므로 건드리지 않는다.
const MARKER = /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g;

/**
 * 답변 본문을 글자와 인용 마커로 나눈다. 인용 목록에 없는 번호의 마커는 글자 그대로 둔다(없는 출처를 있는 것처럼 만들지 않는다).
 */
export function splitAnswer(answer: string, citations: NlmCitation[]): AnswerPart[] {
  const known = new Set(citations.map((c) => c.number).filter((n): n is number => n !== null));
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const m of answer.matchAll(MARKER)) {
    const numbers = m[1].split(",").map((x) => Number(x.trim()));
    if (!numbers.every((n) => known.has(n))) continue;
    const at = m.index ?? 0;
    if (at > last) parts.push({ type: "text", text: answer.slice(last, at) });
    parts.push({ type: "cite", numbers, raw: m[0] });
    last = at + m[0].length;
  }
  if (last < answer.length) parts.push({ type: "text", text: answer.slice(last) });
  return parts;
}
