import { useId } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MeetingDocument, MeetingSection } from "../../api/sharingTypes";
import { buildTurns, formatClock } from "./transcript";

export const SECTION_LABELS: Record<MeetingSection, string> = { summary: "요약", decisions: "결정", actions: "할 일", discussions: "논의", open_issues: "미해결", transcript: "전사" };
export const PART_LABELS: Record<string, string> = { document: "문서 전체", utterances: "전사 발화", decisions: "결정", actions: "할 일", discussions: "논의", open_issues: "미해결" };
export const FORMAT_LABELS: Record<string, string> = { txt: "텍스트 (.txt)", md: "Markdown (.md)", json: "JSON (.json)", csv: "엑셀용 CSV (.csv)" };

/** 공개 전용 DTO만 받는다. 이미지·HTML·앱 내부 링크로 비공개 자료를 추가 조회하지 않는다. */
export function MeetingDocumentView({ document: doc }: { document: MeetingDocument }) {
  const prefix = useId();
  const transcript = doc.transcript;
  const turns = buildTurns((transcript?.utterances ?? []).map((u) => ({
    id: u.utterance_id, start: u.start, end: u.end, speaker: u.speaker_id,
    person: u.speaker_name ?? u.speaker_label, text: u.text,
    overlap: u.overlap === true, uncertain: u.verification_status === "needs_review", review: false, folded: 0, breakBefore: false,
  })));
  return (
    <div className="mt-document">
      {doc.participants.length > 0 && <p className="tk-help">참석자 {doc.participants.join(", ")}</p>}
      <nav className="mt-document__nav" aria-label="문서 목차">
        {doc.included_sections.map((section) => <button type="button" key={section} onClick={() => document.getElementById(`${prefix}-${section}`)?.scrollIntoView({ block: "start" })}>{SECTION_LABELS[section]}</button>)}
      </nav>
      {doc.included_sections.map((section) => (
        <section className="mt-document__section" key={section} id={`${prefix}-${section}`}>
          <h2>{SECTION_LABELS[section]}</h2>
          {doc.section_states[section] === "not_generated" ? <p className="tk-help">아직 분석되지 않은 항목이에요.</p>
            : section === "summary" ? (doc.summary ? <div className="tk-prose"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children }) => <span>{children}</span>, img: ({ alt }) => <span>{alt}</span> }}>{doc.summary}</Markdown></div> : <p className="tk-help">요약이 없어요.</p>)
            : section === "transcript" ? (
              transcript ? <>
                <p className="tk-help">자동 전사 · 미검수{transcript.review.review_utterance_count > 0 ? ` · 검토할 발화 ${transcript.review.review_utterance_count}개` : ""}</p>
                {turns.length ? <div className="mt-document__transcript">{turns.map((turn) => <article key={turn.id} className="mt-document__turn">
                  <header><strong>{turn.person ?? "화자 미상"}</strong><span className="mt-time">{formatClock(turn.start)}</span>{turn.overlap && <span className="tk-help">겹침</span>}</header>
                  {turn.paragraphs.map((para) => <p className="mt-para" key={para.id}>{para.utterances.map((u) => <span key={u.id}>{u.text}{" "}</span>)}</p>)}
                </article>)}</div> : <p className="mt-document__plain">{transcript.text || "전사가 없어요."}</p>}
              </> : <p className="tk-help">전사가 없어요.</p>
            ) : (
              doc[section].length ? <ol className="mt-document__items">{doc[section].map((item) => <li key={item.item_id}>
                <p><strong>{item.text}</strong>{item.status === "done" && <span className="tk-help"> · 완료</span>}{item.status === "cancelled" && <span className="tk-help"> · 취소</span>}</p>
                {item.detail && <p>{item.detail}</p>}
                {(item.owner || item.due_text) && <p className="tk-help">{[item.owner, item.due_text].filter(Boolean).join(" · ")}</p>}
                {item.evidence_quote && <blockquote>{item.evidence_start != null && `${formatClock(item.evidence_start)} · `}{item.evidence_quote}</blockquote>}
              </li>)}</ol> : <p className="tk-help">등록된 항목이 없어요.</p>
            )}
        </section>
      ))}
    </div>
  );
}
