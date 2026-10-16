import { afterEach, expect, it } from "vitest";
import type { MeetingDocument } from "../../api/sharingTypes";
import { buildMeetingHtml, escapeJsonForHtml } from "./meetingHtml";

const EVIL = '</script><img src=x onerror="window.__pwned=1"><b>굵게</b>';
const base: MeetingDocument = {
  schema_version: 1, kind: "meeting", title: "주간 회의", held_at: "2026-10-16T01:00:00Z",
  included_sections: ["summary", "decisions", "actions", "transcript"],
  section_states: { summary: "available", decisions: "available", actions: "available", discussions: "not_selected", open_issues: "not_selected", transcript: "available" },
  analysis_state: "available", participants: [],
  summary: "## 요약\n- **핵심** 항목 [링크](https://example.com/secret)\n- `코드` 항목\n\n둘째 문단",
  decisions: [{ item_id: "d1", position: 1, text: "배포는 금요일", detail: null, status: "done", evidence_quote: "금요일에 하죠", evidence_start: 75, evidence_utterance_id: "u1" }],
  actions: [{ item_id: "a1", position: 1, text: "문서 정리", detail: "초안까지", status: "open", evidence_quote: null, evidence_start: null, evidence_utterance_id: null, owner: null, due_text: "다음 주" }],
  discussions: [], open_issues: [],
  transcript: { text: "", timed: true, review: { status: "unverified", review_utterance_count: 1, unknown_speaker_count: 0 }, utterances: [
    { utterance_id: "u1", start: 75, end: 80, speaker_id: "S1", speaker_label: "화자 1", speaker_name: null, text: "금요일에 하죠", verification_status: "needs_review", overlap: false },
    { utterance_id: "u2", start: 81, end: 84, speaker_id: "S1", speaker_label: "화자 1", speaker_name: null, text: "괜찮아요", verification_status: "unverified", overlap: null },
  ] },
};
const NOW = new Date("2026-10-16T05:00:00Z");

/** 파일을 열 때처럼 body를 옮기고 스크립트를 실행한다. */
function open(html: string) {
  document.body.replaceChildren();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.body.replaceChildren(...Array.from(parsed.body.childNodes).map((n) => document.importNode(n, true)));
  const scripts = Array.from(document.body.querySelectorAll("script")).filter((s) => s.type !== "application/json");
  scripts.forEach((s) => new Function(s.textContent ?? "")());
  return parsed;
}
/** 데이터 블록(script)을 뺀 화면 글자 */
function visible() { return document.querySelector("main")!.textContent ?? ""; }
function dataOf(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return JSON.parse(parsed.getElementById("meeting-data")!.textContent!);
}
afterEach(() => { document.body.replaceChildren(); delete (window as unknown as Record<string, unknown>).__pwned; });

it("fills the template with the meeting JSON and renders the shared page structure", async () => {
  const html = await buildMeetingHtml(base, NOW);
  expect(html).not.toMatch(/@@(CSS|DATA)@@/);
  expect(dataOf(html).document.title).toBe("주간 회의");
  open(html);
  expect(document.querySelector("h1")!.textContent).toBe("주간 회의");
  expect(Array.from(document.querySelectorAll(".mt-document__nav button")).map((b) => b.textContent)).toEqual(["요약", "결정", "할 일", "전사"]);
  expect(Array.from(document.querySelectorAll(".mt-document__section > h2")).map((h) => h.textContent)).toEqual(["요약", "결정", "할 일", "전사"]);
  expect(document.querySelector(".tk-prose strong")!.textContent).toBe("핵심");
  expect(document.querySelector(".tk-prose a")).toBeNull();
  expect(visible()).toContain("링크");
  expect(visible()).not.toContain("example.com");
  expect(document.querySelector(".mt-document__items blockquote")!.textContent).toBe("01:15 · 금요일에 하죠");
  expect(document.querySelectorAll(".mt-document__turn").length).toBe(1);
  expect(document.querySelector(".mt-para")!.textContent).toBe("금요일에 하죠 괜찮아요");
  expect(visible()).toContain("검토할 발화 1개");
});

it("reflects the include options already applied to the document, without adding hidden fields", async () => {
  const hidden = dataOf(await buildMeetingHtml(base, NOW));
  expect(hidden.document.participants).toEqual([]);
  expect(hidden.document.actions[0].owner).toBeNull();
  expect(JSON.stringify(hidden)).not.toContain("홍길동");
  const shown = await buildMeetingHtml({ ...base, included_sections: ["summary"], participants: ["홍길동"], transcript: null }, NOW);
  open(shown);
  expect(visible()).toContain("참석자 홍길동");
  expect(document.querySelectorAll(".mt-document__section").length).toBe(1);
  expect(visible()).not.toContain("금요일에 하죠");
});

it("escapes the JSON so meeting text can never close the script tag or inject markup", async () => {
  const evil: MeetingDocument = { ...base, title: EVIL, summary: `${EVIL}\n\n@@DATA@@ $& $1`, participants: [EVIL], included_sections: ["summary"] };
  const html = await buildMeetingHtml(evil, NOW);
  const block = html.slice(html.indexOf('id="meeting-data">') + 18, html.indexOf("</script>", html.indexOf('id="meeting-data">')));
  expect(block).not.toContain("<");
  expect(block).toContain("\\u003c/script\\u003e");
  expect(html.match(/<\/script>/g)!.length).toBe(2);
  expect(html).not.toContain("<img");
  expect(dataOf(html).document.title).toBe(EVIL);
  open(html);
  expect(document.querySelector("h1")!.textContent).toBe(EVIL);
  expect(document.querySelector("img")).toBeNull();
  expect(document.querySelector("b")).toBeNull();
  expect(document.querySelectorAll("script").length).toBe(2);
  expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
  expect(visible()).toContain("@@DATA@@ $& $1");
});

it("escapeJsonForHtml keeps the JSON valid and neutralises <, >, & and line separators", () => {
  const raw = JSON.stringify({ a: "<!--</script> & > \u2028\u2029" });
  const out = escapeJsonForHtml(raw);
  expect(out).not.toMatch(/[<>&\u2028\u2029]/);
  expect(JSON.parse(out)).toEqual(JSON.parse(raw));
});

it("is a single offline file: shared CSS inlined, CSP blocks network, no external references or HTML-string DOM APIs", async () => {
  const html = await buildMeetingHtml(base, NOW);
  expect(html).toContain(".mt-document__nav");
  expect(html).toContain(".mt-public__paper");
  expect(html).toContain("--tk-color-text-primary");
  expect(html).toContain("default-src 'none'");
  expect(html).not.toMatch(/<link\b|<img\b|<iframe\b|<script[^>]*\ssrc=/i);
  expect(html).not.toMatch(/(?:src|href)=["']https?:/i);
  const code = html.slice(html.lastIndexOf("<script>"));
  expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
});
