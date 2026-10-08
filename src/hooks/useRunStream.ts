import { useEffect, useReducer } from "react";
import { runEvents } from "../api/client";
import { subscribeRun } from "../api/stream";
import { TERMINAL_RUN_STATUSES } from "../api/types";
import type { RunEvent, RunStatus, UUID } from "../api/types";

interface State {
  events: RunEvent[];
  status: RunStatus | null;
  ended: boolean;
  error: unknown;
}

type Action = { type: "reset" } | { type: "events"; events: RunEvent[] } | { type: "end" } | { type: "error"; error: unknown };

const initial: State = { events: [], status: null, ended: false, error: null };

/** seq 로 중복을 제거하고 정렬한다. 같은 배열이면 참조를 유지한다. */
export function mergeEvents(prev: RunEvent[], incoming: RunEvent[]): RunEvent[] {
  const bySeq = new Map<number, RunEvent>(prev.map((e) => [e.seq, e]));
  let changed = false;
  for (const e of incoming) {
    if (!bySeq.has(e.seq)) {
      bySeq.set(e.seq, e);
      changed = true;
    }
  }
  return changed ? [...bySeq.values()].sort((a, b) => a.seq - b.seq) : prev;
}

export function deriveStatus(events: RunEvent[]): RunStatus | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "run.finished" || e.type === "run.status") return e.payload.status;
  }
  return null;
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "reset":
      return initial;
    case "events": {
      const events = mergeEvents(s.events, a.events);
      return events === s.events ? s : { ...s, events, status: deriveStatus(events) };
    }
    case "end":
      return { ...s, ended: true };
    case "error":
      return { ...s, error: a.error };
  }
}

export function useRunStream(runId: UUID | null | undefined) {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    dispatch({ type: "reset" });
    if (!runId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      let after = 0;
      try {
        // 백필: 500개씩 끝까지 읽는다.
        for (;;) {
          const page = await runEvents(runId, after, 500);
          if (cancelled) return;
          dispatch({ type: "events", events: page });
          if (page.length > 0) after = Math.max(after, page[page.length - 1].seq);
          if (page.length < 500) break;
        }
      } catch (error) {
        if (!cancelled) dispatch({ type: "error", error });
        return;
      }
      if (cancelled) return;
      unsubscribe = subscribeRun(runId, {
        after,
        onEvent: (e) => dispatch({ type: "events", events: [e] }),
        onEnd: () => dispatch({ type: "end" }),
        onError: (error) => dispatch({ type: "error", error }),
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [runId]);

  const finished = state.ended || (state.status !== null && TERMINAL_RUN_STATUSES.includes(state.status));
  return { events: state.events, status: state.status, finished, error: state.error };
}
