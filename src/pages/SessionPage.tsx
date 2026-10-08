import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelRun, createRun, getSession, listRuns } from "../api/client";
import { useRunStream } from "../hooks/useRunStream";
import type { RunEvent, RunOut } from "../api/types";

function EventView({ e }: { e: RunEvent }) {
  switch (e.type) {
    case "message":
    case "thinking":
      return <pre>{`[${e.type}] ${e.payload.text}`}</pre>;
    case "tool.call":
      return <pre>{`[tool.call] ${e.payload.name} ${JSON.stringify(e.payload.input)}`}</pre>;
    case "tool.result":
      return <pre>{`[tool.result${e.payload.is_error ? " error" : ""}] ${e.payload.output}`}</pre>;
    case "artifact.created":
      return (
        <p>
          [artifact] <Link to={`/a/${e.payload.artifact.id}`}>{e.payload.artifact.filename}</Link>
        </p>
      );
    case "error":
      return <pre>{`[error] ${e.payload.message}`}</pre>;
    default:
      return <pre>{`[${e.type}] ${JSON.stringify(e.payload)}`}</pre>;
  }
}

export function SessionPage() {
  const { sessionId = "" } = useParams();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [viewRunId, setViewRunId] = useState<string | null>(null);

  const session = useQuery({ queryKey: ["session", sessionId], queryFn: () => getSession(sessionId) });
  const runs = useQuery({ queryKey: ["runs", sessionId], queryFn: () => listRuns(sessionId) });

  // 기본은 실행 중인 Run, 없으면 마지막 Run.
  const latest: RunOut | undefined = runs.data?.[runs.data.length - 1];
  const currentRunId = viewRunId ?? session.data?.active_run_id ?? latest?.id ?? null;
  const stream = useRunStream(currentRunId);

  const send = useMutation({
    mutationFn: (p: string) => createRun(sessionId, { prompt: p }),
    onSuccess: (run) => {
      setPrompt("");
      setViewRunId(run.id);
      void qc.invalidateQueries({ queryKey: ["runs", sessionId] });
      void qc.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelRun(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["runs", sessionId] });
      void qc.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) send.mutate(prompt);
  };
  const running = stream.status === "queued" || stream.status === "running";

  return (
    <main>
      <h2>{session.data?.title || sessionId}</h2>
      {(session.error ?? runs.error) && <p role="alert">{(session.error ?? runs.error)?.message}</p>}

      <h3>Run 목록</h3>
      <ul>
        {runs.data?.map((r) => (
          <li key={r.id}>
            <button onClick={() => setViewRunId(r.id)}>{r.id.slice(0, 8)}</button> {r.status} - {r.prompt.slice(0, 60)}
          </li>
        ))}
      </ul>

      <h3>이벤트 ({stream.status ?? "-"})</h3>
      {stream.error != null && <p role="alert">{String((stream.error as Error).message ?? stream.error)}</p>}
      {stream.events.map((e) => (
        <EventView key={e.seq} e={e} />
      ))}

      <form onSubmit={submit}>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
        <button type="submit" disabled={send.isPending || !prompt.trim()}>
          보내기
        </button>
        <button type="button" disabled={!running || !currentRunId} onClick={() => currentRunId && cancel.mutate(currentRunId)}>
          취소
        </button>
      </form>
      {send.error && <p role="alert">{send.error.message}</p>}
    </main>
  );
}
