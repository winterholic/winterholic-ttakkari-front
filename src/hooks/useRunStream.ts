import { useEffect, useReducer, useRef, useState } from "react";
import { useForegroundResync } from "./useForegroundResync";
import { ApiError, runEvents } from "../api/client";
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

// 라이브 이벤트는 이 간격으로 모아 한 번에 반영한다. 토큰 단위로 쏟아지는 이벤트마다 화면 전체를 다시 그리지 않는다.
const LIVE_FLUSH_MS = 60;

const initial: State = { events: [], status: null, ended: false, error: null };

/** seq 로 중복을 제거하고 정렬한다. 같은 배열이면 참조를 유지한다. */
export function mergeEvents(prev: RunEvent[], incoming: RunEvent[]): RunEvent[] {
  // 대부분은 뒤에 이어 붙는 이벤트다. 그때는 Map 재구성과 정렬 없이 이어 붙인다(이벤트마다 O(n log n) 이던 비용).
  let tail = prev.length ? prev[prev.length - 1].seq : 0;
  let appendOnly = true;
  for (const e of incoming) {
    if (e.seq <= tail) {
      appendOnly = false;
      break;
    }
    tail = e.seq;
  }
  if (appendOnly) return incoming.length ? [...prev, ...incoming] : prev;
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

/** 404 같은 확정 오류는 다시 시도해도 같다. 네트워크 오류·5xx·429 만 다시 시도한다. */
export function isRetriable(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500 || error.status === 429 || error.status === 0;
  return true;
}

export function useRunStream(runId: UUID | null | undefined) {
  const [state, dispatch] = useReducer(reducer, initial);
  // 복귀 시 연결을 새로 맺고 백필부터 다시 한다. iOS 는 백그라운드 SSE 를 소리 없이 죽여 onclose 도 안 불릴 수 있다.
  const [epoch, setEpoch] = useState(0);
  const lastRunId = useRef(runId);
  useForegroundResync(() => setEpoch((n) => n + 1));

  useEffect(() => {
    if (lastRunId.current !== runId) {
      lastRunId.current = runId;
      dispatch({ type: "reset" });
    }
    if (!runId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      let after = 0;
      // 백필: 500개씩 끝까지 읽는다. 모바일 네트워크가 잠깐 끊겨도 포기하지 않고 다시 시도한다.
      for (let attempt = 0; ; attempt++) {
        try {
          for (;;) {
            const page = await runEvents(runId, after, 500);
            if (cancelled) return;
            dispatch({ type: "events", events: page });
            if (page.length > 0) after = Math.max(after, page[page.length - 1].seq);
            if (page.length < 500) break;
          }
          break;
        } catch (error) {
          if (cancelled) return;
          dispatch({ type: "error", error });
          if (!isRetriable(error)) return;
          await new Promise((r) => setTimeout(r, Math.min(15_000, 1000 * 2 ** attempt)));
          if (cancelled) return;
        }
      }
      if (cancelled) return;
      let buffer: RunEvent[] = [];
      let timer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        if (!buffer.length) return;
        const events = buffer;
        buffer = [];
        dispatch({ type: "events", events });
      };
      const sub = subscribeRun(runId, {
        after,
        onEvent: (e) => {
          buffer.push(e);
          timer ??= setTimeout(flush, LIVE_FLUSH_MS);
        },
        onEnd: () => {
          flush();
          dispatch({ type: "end" });
        },
        onError: (error) => {
          flush();
          dispatch({ type: "error", error });
        },
      });
      unsubscribe = () => {
        sub();
        // 구독을 닫을 때 남은 이벤트를 버리면 화면에 안 보인 채 사라진다. 복귀 재구독은 백필로 다시 받지만 한 번 더 반영해 둔다.
        flush();
      };
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [runId, epoch]);

  const finished = state.ended || (state.status !== null && TERMINAL_RUN_STATUSES.includes(state.status));
  return { events: state.events, status: state.status, finished, error: state.error };
}
