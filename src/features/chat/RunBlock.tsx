import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { runEvents } from "../../api/client";
import type { RunEvent, RunOut } from "../../api/types";
import { useRunStream } from "../../hooks/useRunStream";
import { AgentMessage, UserMessage } from "./Messages";
import { buildRunView } from "./runView";

const ACTIVE = ["queued", "running"];

async function allEvents(runId: string): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  let after = 0;
  for (;;) {
    const page = await runEvents(runId, after, 500);
    out.push(...page);
    if (page.length < 500) return out;
    after = page[page.length - 1].seq;
  }
}

export interface RunBlockProps {
  run: RunOut;
  contextNames: string[];
  isLast: boolean;
  onOpen: (id: string) => void;
  onStop: (runId: string) => void;
  onRetry: (prompt: string) => void;
  onSuggest: (text: string) => void;
  /** 스트림이 끝났을 때 목록을 다시 읽게 한다. */
  onSettled: () => void;
}

export function RunBlock({ run, contextNames, isLast, onOpen, onStop, onRetry, onSuggest, onSettled }: RunBlockProps) {
  const active = ACTIVE.includes(run.status);
  const stream = useRunStream(active ? run.id : null);
  // 끝난 Run 은 이벤트가 더 생기지 않는다. 한 번 읽고 캐시한다.
  const past = useQuery({ queryKey: ["runEvents", run.id], queryFn: () => allEvents(run.id), enabled: !active, staleTime: Infinity });
  const view = useMemo(() => buildRunView(run, active ? stream.events : (past.data ?? [])), [run, active, stream.events, past.data]);

  useEffect(() => {
    if (active && stream.finished) onSettled();
  }, [active, stream.finished, onSettled]);

  const suggestions =
    isLast && view.state === "succeeded" && view.artifacts.length > 0
      ? [
          { label: "결과물 요약해 줘", text: `방금 만든 결과물(${view.artifacts.map((a) => a.filename).join(", ")})을 세 줄로 요약해 줘` },
          { label: "다르게 한 번 더", text: "같은 작업을 다른 방식으로 한 번 더 해 줘" },
        ]
      : undefined;

  return (
    <>
      <UserMessage run={run} contextNames={contextNames} />
      <AgentMessage
        run={run}
        view={view}
        onOpen={onOpen}
        onStop={active ? () => onStop(run.id) : undefined}
        onRetry={isLast ? () => onRetry(run.prompt) : undefined}
        suggestions={suggestions}
        onSuggest={onSuggest}
      />
    </>
  );
}
