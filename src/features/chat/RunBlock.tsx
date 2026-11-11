import "./thread.css";
import { memo, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { runEvents } from "../../api/client";
import type { RunEvent, RunOut } from "../../api/types";
import { useRunStream } from "../../hooks/useRunStream";
import { useNearViewport } from "../../hooks/useNearViewport";
import { DeskFeedback, deskDecision } from "./DeskFeedback";
import { TaskTreeCard } from "../tasks/TaskTreeCard";
import { AgentMessage, ReportMessage, UserMessage } from "./Messages";
import { actualEngine, buildRunView } from "./runView";
import { Icon } from "../../ui/Icon";
import { AccountBadge, EngineBadge } from "../../ui/EngineBadge";

const ACTIVE = ["queued", "running"];
const EMPTY_EVENTS: RunEvent[] = [];

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
  isLast: boolean;
  onOpen: (id: string) => void;
  onStop: (runId: string) => void;
  onRetry: (prompt: string) => void;
  onSuggest: (text: string) => void;
  /** 스트림이 끝났을 때 목록을 다시 읽게 한다. */
  onSettled: () => void;
  /** 따까리 대화에서만 준다. 넘긴 일의 트리 카드를 답 아래에 붙이고, 줄을 누르면 옆 서랍을 연다(ADR 0014). */
  onOpenNode?: (id: string) => void;
  selectedNode?: string | null;
  /** chip: 트리 카드 대신 여는 버튼만(캔버스 옆 패널처럼 트리가 이미 보이는 곳). */
  leadAs?: "card" | "chip";
}

/** 이 Run 이 일을 넘긴 기획 세션. 접수 메시지는 desk.delegated 이벤트, 기획 보고는 프롬프트의 lead_id 로 안다. */
export function leadOf(run: RunOut, events: RunEvent[]): string | null {
  if (run.origin === "report") return /lead_id=([0-9a-f-]{36})/.exec(run.prompt)?.[1] ?? null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "desk.delegated") return e.payload.lead_id;
  }
  return null;
}

function RunBlockImpl({ run, isLast, onOpen, onStop, onRetry, onSuggest, onSettled, onOpenNode, selectedNode, leadAs = "card" }: RunBlockProps) {
  const active = ACTIVE.includes(run.status);
  const stream = useRunStream(active ? run.id : null);
  // 끝난 Run 은 이벤트가 더 생기지 않는다. 한 번 읽고 캐시한다.
  // 위로 한참 올라가야 보이는 오래된 Run 의 이벤트까지 열자마자 전부 받지 않는다. 화면 근처에 오면 받는다(받은 뒤 모양은 같다).
  const articleRef = useRef<HTMLElement>(null);
  const near = useNearViewport(articleRef);
  const past = useQuery({ queryKey: ["runEvents", run.id], queryFn: () => allEvents(run.id), enabled: !active && near, staleTime: Infinity });
  // desk.route 는 접수 세션의 사용자 메시지에만 생긴다. 그래서 세션 종류를 따로 받지 않는다.
  const events = active ? stream.events : (past.data ?? EMPTY_EVENTS);
  const view = useMemo(() => buildRunView(run, events), [run, events]);
  const decided = !active && run.origin === "user" ? deskDecision(run, events) : null;
  const lead = onOpenNode ? leadOf(run, events) : null;
  const engine = actualEngine(run);
  const engineMatchesRun = engine === run.engine;
  const fallbacks = useMemo(() => events.filter((event) => event.type === "engine.fallback"), [events]);
  const fallbackTitle = fallbacks.length > 0
    ? fallbacks.map((event) => event.type === "engine.fallback" ? `${event.payload.from} → ${event.payload.to}` : "").join(", ")
    : null;
  // 같은 기획 세션의 보고는 매 턴 붙는다. 트리는 처음 넘긴 자리의 카드가 보여 주므로 보고에는 여는 버튼만 둔다.
  const attached =
    lead && onOpenNode ? (
      run.origin === "report" || leadAs === "chip" ? (
        <button className="tk-chip lead-chip" type="button" aria-pressed={selectedNode === lead} onClick={() => onOpenNode(lead)}>
          <Icon name="tasks" />
          {run.origin === "report" ? "맡긴 일 열기" : "판에서 보기"}
        </button>
      ) : (
        <TaskTreeCard rootId={lead} selectedId={selectedNode} onSelect={onOpenNode} />
      )
    ) : undefined;

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
      {(run.engine || run.profile) && (
        <div className="run-attribution" aria-label="실행 엔진과 계정">
          {engine && <EngineBadge engine={engine} />}
          {run.profile && engineMatchesRun && <AccountBadge account={run.profile} />}
          {fallbackTitle && (
            <span className="run-attribution__fallback" title={`엔진/계정 폴백: ${fallbackTitle}`}>
              계정 전환 · {fallbacks.map((event, index) => event.type === "engine.fallback" ? (
                <span key={`${event.seq}-${index}`} className="run-attribution__switch">
                  <AccountBadge account={event.payload.from} /> → <AccountBadge account={event.payload.to} />
                </span>
              ) : null)}
            </span>
          )}
        </div>
      )}
      {run.origin === "report" ? <ReportMessage run={run} /> : <UserMessage run={run} onOpen={onOpen} />}
      <AgentMessage
        run={run}
        view={view}
        onOpen={onOpen}
        onStop={active ? () => onStop(run.id) : undefined}
        onRetry={isLast ? () => onRetry(run.prompt) : undefined}
        suggestions={suggestions}
        onSuggest={onSuggest}
        footer={decided ? <DeskFeedback run={run} decided={decided} /> : undefined}
        attached={attached}
        articleRef={articleRef}
        hideCard={!!onOpenNode && run.status === "succeeded"}
      />
    </>
  );
}

// 목록이 다시 읽혀도 run 객체가 그대로(structural sharing)면 이 블록은 다시 그리지 않는다. 호출하는 쪽이 콜백 참조를 안정시켜야 효과가 난다.
export const RunBlock = memo(RunBlockImpl);
