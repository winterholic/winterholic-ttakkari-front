import type { NlmCitation, NlmQueryResult, NlmSourceRef } from "../../api/notebooklmTypes";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { sourceKindLabel } from "./labels";

const NO_POSITION = "원문 위치 정보 없음";

/** 값이 없으면 없다고 쓴다. 위치·원문을 추정하거나 답변 글에서 찾아 채우지 않는다. */
function CitationBlock({ citation, source }: { citation: NlmCitation; source: NlmSourceRef | undefined }) {
  const span = citation.source_span;
  return (
    <article className="nlm-cite-card" data-testid="citation-detail">
      <header className="nlm-cite-card__head">
        <strong>{source?.title?.trim() || "제목 없는 출처"}</strong>
        <small>{source ? sourceKindLabel(source.kind) : "출처 정보 없음"}</small>
      </header>
      {source?.url && <a className="tk-link nlm-cite-card__url" href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a>}
      {citation.quoted_text ? (
        <blockquote className="nlm-quote">{citation.quoted_text}</blockquote>
      ) : (
        <p className="nlm-missing">인용 원문 텍스트 없음</p>
      )}
      <dl className="nlm-cite-card__facts">
        <div>
          <dt>원문 위치</dt>
          <dd>{span ? `${span.start}–${span.end} (UTF-16 코드 단위)` : NO_POSITION}</dd>
        </div>
        <div>
          <dt>답변 속 범위</dt>
          <dd>{citation.answer_span ? `${citation.answer_span.start}–${citation.answer_span.end} (단위 미확인)` : "정보 없음"}</dd>
        </div>
      </dl>
    </article>
  );
}

/** 답변의 [n] 마커를 눌렀을 때 그 번호에 해당하는 출처와 인용 원문을 보여 준다. */
export function CitationViewer({ result, items, label, onClose }: { result: NlmQueryResult; items: NlmCitation[] | null; label: string; onClose: () => void }) {
  return (
    <Dialog
      open={items !== null}
      onClose={onClose}
      size="lg"
      title={`인용 ${label}`}
      footer={<div className="tk-button-group tk-button-group--end"><Button variant="ghost" onClick={onClose}>닫기</Button></div>}
    >
      <p className="nlm-note">출처 문서의 인용 부분이에요. 아래 글은 NotebookLM이 돌려준 인용 원문 그대로예요.</p>
      <div className="nlm-cite-list">
        {(items ?? []).map((c, i) => (
          <CitationBlock key={`${c.source_id}-${c.chunk_id ?? i}`} citation={c} source={result.sources.find((s) => s.id === c.source_id)} />
        ))}
      </div>
    </Dialog>
  );
}
