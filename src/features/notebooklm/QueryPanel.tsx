import { useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryNotebook } from "../../api/client";
import type { NlmCitation, NlmNotebookDetail, NlmQueryResult } from "../../api/notebooklmTypes";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { CitationViewer } from "./CitationViewer";
import { ErrorNotice } from "./ErrorNotice";
import { sourceKindLabel, sourceTitle } from "./labels";
import { splitAnswer } from "./citations";

interface Open {
  result: NlmQueryResult;
  items: NlmCitation[];
  label: string;
}

function Answer({ result, onOpen }: { result: NlmQueryResult; onOpen: (o: Open) => void }) {
  const parts = splitAnswer(result.answer, result.citations);
  const open = (n: number) => onOpen({ result, items: result.citations.filter((c) => c.number === n), label: `[${n}]` });
  const numbered = new Set(result.citations.map((c) => c.number).filter((n): n is number => n !== null));
  const loose = result.citations.filter((c) => c.number === null);
  return (
    <article className="nlm-answer" data-testid="answer">
      <section aria-label="NotebookLM 분석">
        <h3 className="nlm-subtitle"><Icon name="sparkles" />NotebookLM 분석</h3>
        <p className="nlm-answer__text">
          {parts.map((p, i) => p.type === "text" ? <span key={i}>{p.text}</span> : (
            <span key={i} className="nlm-cites">
              {p.numbers.map((n) => (
                <button key={n} type="button" className="nlm-cite" aria-label={`인용 ${n}번 보기`} onClick={() => open(n)}>{n}</button>
              ))}
            </span>
          ))}
        </p>
        <p className="nlm-note">NotebookLM이 소스를 읽고 만든 해석이에요. 근거는 아래 인용과 출처에서 확인해 주세요.</p>
      </section>

      <section aria-label="인용과 출처" className="nlm-evidence">
        <h3 className="nlm-subtitle"><Icon name="paperclip" />인용 {result.citations.length}개 · 출처 {result.sources.length}개</h3>
        {result.citations.length === 0 && <p className="nlm-missing">이 답변에는 인용이 없어요.</p>}
        {result.sources.length > 0 && (
          <ul className="nlm-evidence__list">
            {result.sources.map((s) => (
              <li key={s.id}>
                <span className="nlm-evidence__title">{sourceTitle(s)}</span>
                <small>{sourceKindLabel(s.kind)}</small>
                <span className="nlm-cites">
                  {s.citation_numbers.filter((n) => numbered.has(n)).map((n) => (
                    <button key={n} type="button" className="nlm-cite" aria-label={`${sourceTitle(s)} 인용 ${n}번 보기`} onClick={() => open(n)}>{n}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {loose.length > 0 && (
          <ul className="nlm-evidence__list">
            {loose.map((c, i) => (
              <li key={`${c.source_id}-${i}`}>
                <span className="nlm-evidence__title">번호 없는 인용</span>
                <Button size="xs" variant="ghost" onClick={() => onOpen({ result, items: [c], label: "(번호 없음)" })}>보기</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

interface Turn {
  id: number;
  question: string;
  result?: NlmQueryResult;
  error?: unknown;
}

/** 질문 → 답변(분석)과 인용을 분리해 보여 준다. 대화 기록 조회 API 는 없어서 이 화면 안에서만 이어진다. */
export function QueryPanel({ notebook, active }: { notebook: NlmNotebookDetail; active: boolean }) {
  const id = useId();
  const seq = useRef(0);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [scope, setScope] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<Open | null>(null);

  const ask = useMutation({
    mutationFn: ({ q }: { q: string; turn: number }) =>
      queryNotebook(notebook.id, { question: q, conversation_id: conversationId, source_ids: scope.size ? [...scope] : null }),
    onSuccess: (result, { turn }) => {
      setConversationId(result.conversation_id);
      setTurns((ts) => ts.map((t) => (t.id === turn ? { ...t, result } : t)));
    },
    onError: (error, { turn }) => setTurns((ts) => ts.map((t) => (t.id === turn ? { ...t, error } : t))),
  });

  const send = (q: string, reuse?: number) => {
    const turn = reuse ?? ++seq.current;
    setTurns((ts) => (reuse ? ts.map((t) => (t.id === turn ? { ...t, error: undefined } : t)) : [...ts, { id: turn, question: q }]));
    ask.mutate({ q, turn });
  };
  const submit = () => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setQuestion("");
    send(q);
  };
  const toggle = (sid: string) => setScope((s) => { const n = new Set(s); if (!n.delete(sid)) n.add(sid); return n; });
  const noSources = notebook.sources.length === 0;

  return (
    <section className="nlm-panel" data-active={active} aria-label="질의" id="nlm-panel-query">
      <div className="tk-section__head">
        <h2 className="tk-section__title">질의</h2>
        {turns.length > 0 && (
          <Button size="sm" variant="ghost" disabled={ask.isPending} onClick={() => { setTurns([]); setConversationId(null); }}>새 대화</Button>
        )}
      </div>

      {noSources && <p className="nlm-note">소스를 먼저 추가하면 그 내용으로 질문할 수 있어요.</p>}
      {turns.length === 0 && !noSources && <p className="nlm-note">소스 내용을 근거로 답하고 인용을 붙여요. 대화 기록은 이 화면에만 남고 새로고침하면 사라져요.</p>}

      <ol className="nlm-turns">
        {turns.map((t) => (
          <li key={t.id} className="nlm-turn">
            <p className="nlm-q"><span className="tk-sr-only">질문: </span>{t.question}</p>
            {t.result && <Answer result={t.result} onOpen={setViewer} />}
            {!t.result && !t.error && (
              <p className="tk-status" role="status" aria-busy="true"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />NotebookLM이 소스를 읽고 답을 만드는 중이에요. 길게는 몇 분 걸려요.</p>
            )}
            {t.error != null && <ErrorNotice error={t.error} onRetry={() => send(t.question, t.id)} retryLabel="이 질문 다시 보내기" />}
          </li>
        ))}
      </ol>

      <form className="nlm-ask" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {notebook.sources.length > 1 && (
          <details className="nlm-scope">
            <summary>질문할 소스 {scope.size ? `${scope.size}개 선택` : "전체"}</summary>
            <ul>
              {notebook.sources.map((s) => (
                <li key={s.id}>
                  <label className="tk-checkbox">
                    <input type="checkbox" checked={scope.has(s.id)} onChange={() => toggle(s.id)} />
                    <span>{sourceTitle(s)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="nlm-note">아무것도 고르지 않으면 모든 소스를 써요.</p>
          </details>
        )}
        <label className="tk-sr-only" htmlFor={`${id}-q`}>질문</label>
        <textarea
          id={`${id}-q`}
          className="tk-input nlm-textarea"
          rows={3}
          maxLength={8000}
          value={question}
          placeholder="이 노트북의 소스에 대해 물어보세요"
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Button variant="primary" type="submit" busy={ask.isPending} disabled={!question.trim() || noSources}><Icon name="send" />질문하기</Button>
      </form>

      <CitationViewer
        result={viewer?.result ?? turns.find((t) => t.result)?.result ?? EMPTY}
        items={viewer?.items ?? null}
        label={viewer?.label ?? ""}
        onClose={() => setViewer(null)}
      />
    </section>
  );
}

const EMPTY: NlmQueryResult = { notebook_id: "", query: "", answer: "", conversation_id: null, turn_number: null, citations: [], sources: [], created_at: "" };
