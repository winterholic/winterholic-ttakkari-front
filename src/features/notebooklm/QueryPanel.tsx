import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, cancelNotebookJob, startNotebookQuery } from "../../api/client";
import type { NlmCitation, NlmJob, NlmNotebookDetail, NlmQueryResult } from "../../api/notebooklmTypes";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { CitationViewer } from "./CitationViewer";
import { ErrorNotice } from "./ErrorNotice";
import { describeError, jobActive, jobErrorToApiError, sourceKindLabel, sourceTitle } from "./labels";
import { nlmKeys } from "./queries";
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
  /** 서버 job id. 질문 시작 요청(POST)이 끝나야 생긴다. */
  jobId: string | null;
  sending?: boolean;
  result?: NlmQueryResult;
  error?: unknown;
}

const MAX_STORED_TURNS = 20;
const storeKey = (notebookId: string) => `ttakkari:nlm:turns:${notebookId}`;

interface StoredTurn {
  question: string;
  jobId: string | null;
  result: NlmQueryResult | null;
}

function loadStored(notebookId: string): { turns: Turn[]; conversationId: string | null } {
  const empty = { turns: [], conversationId: null };
  try {
    const raw = localStorage.getItem(storeKey(notebookId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as { turns?: StoredTurn[]; conversationId?: string | null };
    if (!Array.isArray(parsed.turns)) return empty;
    const turns = parsed.turns.slice(-MAX_STORED_TURNS).map((t, i) => ({
      id: i + 1,
      question: typeof t.question === "string" ? t.question : "",
      jobId: typeof t.jobId === "string" ? t.jobId : null,
      ...(t.result
        ? { result: t.result }
        : typeof t.jobId === "string"
          ? {}
          : { error: new ApiError(0, { code: "interrupted", message: "보내기 전에 화면을 나갔어요. 다시 보내 주세요." }) }),
    }));
    return { turns, conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : null };
  } catch {
    return empty;
  }
}

function saveStored(notebookId: string, turns: Turn[], conversationId: string | null): void {
  try {
    const stored = {
      turns: turns.slice(-MAX_STORED_TURNS).map((t) => ({ question: t.question, jobId: t.jobId, result: t.result ?? null })),
      conversationId,
    };
    localStorage.setItem(storeKey(notebookId), JSON.stringify(stored));
  } catch {
    // 저장 실패는 화면 동작과 무관하게 무시한다.
  }
}

/** 질문 → job 시작 → job 조회로 답변을 받는다. 페이지를 벗어나도 서버에서 이어지고, 돌아오면 저장된 턴과 job 목록으로 복구한다. */
export function QueryPanel({ notebook, jobs, active }: { notebook: NlmNotebookDetail; jobs: NlmJob[] | undefined; active: boolean }) {
  const id = useId();
  const qc = useQueryClient();
  const [initial] = useState(() => loadStored(notebook.id));
  const seq = useRef(initial.turns.length);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>(initial.turns);
  const [conversationId, setConversationId] = useState<string | null>(initial.conversationId);
  const [scope, setScope] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<Open | null>(null);
  // 저장소에서 복원한 job id. 목록에 없는 복원 job 은 오래돼 사라진 것으로 보고 다시 질문을 안내한다.
  const [restoredJobIds] = useState(() => new Set(
    initial.turns.map((t) => t.jobId).filter((v): v is string => v !== null)));

  const jobsById = useMemo(() => new Map((jobs ?? []).map((j) => [j.id, j])), [jobs]);

  // 끝난 job 을 턴에 반영한 보기 상태. jobs 가 undefined(목록 로딩 전)이면 복원 판단을 하지 않는다.
  const viewTurns = useMemo(() => {
    if (jobs === undefined) return turns;
    return turns.map((t) => {
      if (t.result || t.error || !t.jobId) return t;
      const job = jobsById.get(t.jobId);
      if (!job) {
        if (!restoredJobIds.has(t.jobId)) return t;
        return { ...t, error: new ApiError(0, { code: "job_missing", message: "이 질의의 진행 정보를 찾지 못했어요. 다시 질문해 주세요." }) };
      }
      if (jobActive(job)) return t;
      if (job.status === "succeeded") {
        const result = job.result?.query;
        return result
          ? { ...t, result }
          : { ...t, error: new ApiError(500, { code: "integration_error", message: "답변 형식이 달라 결과를 읽지 못했어요." }) };
      }
      return { ...t, error: jobErrorToApiError(job) };
    });
  }, [turns, jobs, jobsById, restoredJobIds]);

  // 이어지는 질문에 쓸 대화 id. 최근 답변에서 찾고, 없으면 저장된 값을 쓴다.
  const conv = useMemo(() => {
    for (let i = viewTurns.length - 1; i >= 0; i--) {
      const c = viewTurns[i].result?.conversation_id;
      if (c) return c;
    }
    return conversationId;
  }, [viewTurns, conversationId]);

  useEffect(() => {
    saveStored(notebook.id, viewTurns, conv);
  }, [viewTurns, conv, notebook.id]);

  const start = useMutation({
    mutationFn: ({ q }: { q: string; turn: number }) =>
      startNotebookQuery(notebook.id, { question: q, conversation_id: conv, source_ids: scope.size ? [...scope] : null }),
    onSuccess: (res, { turn }) => {
      // 목록 다시 읽기가 끝나기 전에도 폴링·취소가 잡히게 캐시에 먼저 넣는다.
      qc.setQueryData<NlmJob[]>(nlmKeys.jobs, (old) => (old ? [res.job, ...old.filter((j) => j.id !== res.job.id)] : [res.job]));
      setTurns((ts) => ts.map((t) => (t.id === turn ? { ...t, jobId: res.job.id, sending: false } : t)));
      void qc.invalidateQueries({ queryKey: nlmKeys.jobs });
    },
    onError: (error, { turn }) => setTurns((ts) => ts.map((t) => (t.id === turn ? { ...t, error, sending: false } : t))),
  });

  const cancel = useMutation({
    mutationFn: (jobId: string) => cancelNotebookJob(jobId),
    onSettled: () => { void qc.invalidateQueries({ queryKey: nlmKeys.jobs }); },
    onError: (e) => toast({ message: describeError(e).title, tone: "danger" }),
  });

  const send = (q: string, reuse?: number) => {
    const turn = reuse ?? ++seq.current;
    setTurns((ts) => (reuse
      ? ts.map((t) => (t.id === turn ? { ...t, jobId: null, sending: true, result: undefined, error: undefined } : t))
      : [...ts, { id: turn, question: q, jobId: null, sending: true }]));
    start.mutate({ q, turn });
  };
  const submit = () => {
    const q = question.trim();
    if (!q || start.isPending) return;
    setQuestion("");
    send(q);
  };
  const reset = () => {
    setTurns([]);
    setConversationId(null);
    try {
      localStorage.removeItem(storeKey(notebook.id));
    } catch {
      // 무시
    }
  };
  const toggle = (sid: string) => setScope((s) => { const n = new Set(s); if (!n.delete(sid)) n.add(sid); return n; });
  const noSources = notebook.sources.length === 0;
  const turnJob = (t: Turn): NlmJob | undefined => (t.jobId ? jobsById.get(t.jobId) : undefined);

  return (
    <section className="nlm-panel" data-active={active} aria-label="질의" id="nlm-panel-query">
      <div className="tk-section__head">
        <h2 className="tk-section__title">질의</h2>
        {viewTurns.length > 0 && (
          <Button size="sm" variant="ghost" disabled={start.isPending} onClick={reset}>새 대화</Button>
        )}
      </div>

      {noSources && <p className="nlm-note">소스를 먼저 추가하면 그 내용으로 질문할 수 있어요.</p>}
      {viewTurns.length === 0 && !noSources && <p className="nlm-note">소스 내용을 근거로 답하고 인용을 붙여요. 질문은 서버에서 끝까지 진행되고, 다른 화면에 갔다 와도 결과는 여기 남아요.</p>}

      <ol className="nlm-turns">
        {viewTurns.map((t) => {
          const job = turnJob(t);
          const cancellable = !t.result && !t.error && job !== undefined && jobActive(job) && !job.cancel_requested;
          return (
            <li key={t.id} className="nlm-turn">
              <p className="nlm-q"><span className="tk-sr-only">질문: </span>{t.question}</p>
              {t.result && <Answer result={t.result} onOpen={setViewer} />}
              {!t.result && !t.error && (
                <p className="tk-status" role="status" aria-busy="true">
                  <span className="tk-spinner tk-spinner--sm" aria-hidden="true" />
                  NotebookLM이 소스를 읽고 답을 만드는 중이에요. 길게는 몇 분 걸려요.
                  {cancellable && job && (
                    <Button
                      size="xs"
                      variant="ghost"
                      busy={cancel.isPending && cancel.variables === job.id}
                      aria-label="이 질문 취소"
                      onClick={() => cancel.mutate(job.id)}
                    >
                      취소
                    </Button>
                  )}
                </p>
              )}
              {t.error != null && <ErrorNotice error={t.error} onRetry={() => send(t.question, t.id)} retryLabel="이 질문 다시 보내기" />}
            </li>
          );
        })}
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
        <Button variant="primary" type="submit" busy={start.isPending} disabled={!question.trim() || noSources}><Icon name="send" />질문하기</Button>
      </form>

      <CitationViewer
        result={viewer?.result ?? viewTurns.find((t) => t.result)?.result ?? EMPTY}
        items={viewer?.items ?? null}
        label={viewer?.label ?? ""}
        onClose={() => setViewer(null)}
      />
    </section>
  );
}

const EMPTY: NlmQueryResult = { notebook_id: "", query: "", answer: "", conversation_id: null, turn_number: null, citations: [], sources: [], created_at: "" };
