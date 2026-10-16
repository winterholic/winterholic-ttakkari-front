import type { MeetingDocument } from "../../api/sharingTypes";
import template from "./meetingHtml.template.html?raw";
import { documentTurns } from "./documentTurns";
import { SECTION_LABELS } from "./MeetingDocumentView";
import { formatClock } from "./transcript";

/** <script type="application/json"> 안에서 태그가 닫히지 않도록 <, >, &와 줄 구분 문자를 \uXXXX로 이스케이프한다. */
export function escapeJsonForHtml(json: string): string {
  return json.replace(/[<>&\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

// .tk-help는 앱에서 components.css(150KB+)에 있어 통째로 넣지 않고 같은 토큰으로 이 한 규칙만 둔다.
const EXTRA_CSS = ".tk-help { margin: 0; font: var(--tk-font-weight-regular) var(--tk-font-size-xs) / var(--tk-font-line-height-normal) var(--tk-font-family-sans); color: var(--tk-color-text-tertiary); }";

/** 공유 페이지가 쓰는 CSS 원본을 그대로 이어 붙여 두 화면의 디자인이 갈라지지 않게 한다. 쓸 때만 불러온다. */
async function pageCss(): Promise<string> {
  const parts = await Promise.all([
    import("../../vendor/ttakkari/tokens.css?raw"), import("../../vendor/ttakkari/typography.css?raw"), import("../../vendor/ttakkari/prose.css?raw"),
    import("./meetings.css?raw"), import("./sharing.css?raw"),
  ]);
  return [...parts.map((m) => m.default), EXTRA_CSS].join("\n");
}

/** 회의록 DTO를 JSON으로 템플릿에 넣어 파일 하나짜리 HTML을 만든다. 포함 범위(참석자·근거 등)는 doc에 이미 반영돼 있다. */
export async function buildMeetingHtml(doc: MeetingDocument, exportedAt: Date = new Date()): Promise<string> {
  const turns = documentTurns(doc).map((t) => ({
    person: t.person, clock: formatClock(t.start), overlap: t.overlap,
    paragraphs: t.paragraphs.map((p) => p.utterances.map((u) => u.text).join(" ")),
  }));
  const evidenceClocks: Record<string, string> = {};
  for (const section of ["decisions", "actions", "discussions", "open_issues"] as const) {
    for (const item of doc[section]) if (item.evidence_start != null) evidenceClocks[item.item_id] = formatClock(item.evidence_start);
  }
  const data = escapeJsonForHtml(JSON.stringify({ version: 1, exportedAt: exportedAt.toISOString(), labels: SECTION_LABELS, document: doc, turns, evidenceClocks }));
  const css = await pageCss();
  // 한 번의 치환으로 끝내야 회의 내용 속 자리표시자 문자열이 다시 치환되지 않는다.
  return template.replace(/@@(CSS|DATA)@@/g, (_m, key: string) => (key === "CSS" ? css : data));
}

export async function meetingHtmlBlob(doc: MeetingDocument): Promise<Blob> {
  return new Blob([await buildMeetingHtml(doc)], { type: "text/html;charset=utf-8" });
}
