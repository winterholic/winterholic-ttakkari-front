import { useCallback, useEffect, useReducer, useRef } from "react";
import { cancelTtsJob, createTtsJob, getTtsJob } from "../../api/client";
import type { TtsJob, TtsSynthesisIn } from "../../api/ttsTypes";
import { TtsJobError, toJobError, waitForJob } from "./ttsJob";

export type GenState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "running"; jobId: string; done: number; total: number; cached: number }
  | { phase: "succeeded"; jobId: string; job: TtsJob }
  | { phase: "failed"; code: string; message: string; retryable: boolean }
  | { phase: "cancelled" };

export type GenEvent =
  | { type: "submit" }
  | { type: "accepted"; jobId: string; total: number; cached: number }
  | { type: "progress"; done: number; total: number }
  | { type: "succeeded"; jobId: string; job: TtsJob }
  | { type: "failed"; code: string; message: string; retryable: boolean }
  | { type: "cancel" }
  | { type: "reset" };

export function genReducer(s: GenState, e: GenEvent): GenState {
  switch (e.type) {
    case "submit":
      return { phase: "submitting" };
    case "accepted":
      return { phase: "running", jobId: e.jobId, done: e.cached, total: e.total, cached: e.cached };
    case "progress":
      return s.phase === "running" ? { ...s, done: e.done, total: e.total || s.total } : s;
    case "succeeded":
      return s.phase === "submitting" || s.phase === "running" ? { phase: "succeeded", jobId: e.jobId, job: e.job } : s;
    case "failed":
      return s.phase === "submitting" || s.phase === "running" ? { phase: "failed", code: e.code, message: e.message, retryable: e.retryable } : s;
    case "cancel":
      return s.phase === "submitting" || s.phase === "running" ? { phase: "cancelled" } : s;
    case "reset":
      return { phase: "idle" };
  }
}

export interface Generation {
  state: GenState;
  /** reuseJobId 가 있으면 먼저 그 job 을 보고, 끝났으면 그대로, 아직 도는 중이면 이어서, 없어졌으면 새로 요청한다. */
  start: (body: TtsSynthesisIn, reuseJobId?: string) => void;
  cancel: () => void;
  reset: () => void;
}

export function useTtsGeneration(): Generation {
  const [state, dispatch] = useReducer(genReducer, { phase: "idle" } as GenState);
  const run = useRef<{ token: number; abort: AbortController | null; jobId: string | null }>({ token: 0, abort: null, jobId: null });
  const live = useRef(false);
  useEffect(() => {
    live.current = state.phase === "submitting" || state.phase === "running";
  });

  const halt = useCallback((cancelServer: boolean) => {
    const r = run.current;
    r.token += 1;
    r.abort?.abort();
    r.abort = null;
    if (cancelServer && r.jobId) void cancelTtsJob(r.jobId).catch(() => undefined);
    r.jobId = null;
  }, []);

  const start = useCallback(
    (body: TtsSynthesisIn, reuseJobId?: string) => {
      halt(true);
      const r = run.current;
      const my = r.token;
      const abort = new AbortController();
      r.abort = abort;
      dispatch({ type: "submit" });
      void (async () => {
        try {
          let jobId: string | null = null;
          let known: TtsJob | null = null;
          if (reuseJobId) {
            try {
              const j = await getTtsJob(reuseJobId, abort.signal);
              if (j.status === "succeeded" || j.status === "queued" || j.status === "running") {
                jobId = reuseJobId;
                known = j.status === "succeeded" ? j : null;
              }
            } catch (e) {
              if (e instanceof DOMException && e.name === "AbortError") throw e;
              // 만료·삭제·네트워크 문제면 새로 요청한다. 캐시에 소리가 남아 있어 대개 바로 끝난다.
            }
          }
          if (my !== r.token) return;
          if (known && jobId) {
            dispatch({ type: "succeeded", jobId, job: known });
            return;
          }
          if (!jobId) {
            const created = await createTtsJob(body, abort.signal);
            if (my !== r.token) return;
            jobId = created.job_id;
            dispatch({ type: "accepted", jobId, total: created.chunks, cached: created.cached_chunks });
          } else {
            dispatch({ type: "accepted", jobId, total: 0, cached: 0 });
          }
          r.jobId = jobId;
          const job = await waitForJob(jobId, {
            signal: abort.signal,
            onProgress: (j) => {
              if (my === r.token && j.progress) dispatch({ type: "progress", done: j.progress.done, total: j.progress.total });
            },
          });
          if (my !== r.token) return;
          r.jobId = null;
          dispatch({ type: "succeeded", jobId, job });
        } catch (e) {
          if (my !== r.token || (e instanceof DOMException && e.name === "AbortError")) return;
          r.jobId = null;
          const err = e instanceof TtsJobError ? e : toJobError(e);
          dispatch({ type: "failed", code: err.code, message: err.message, retryable: err.retryable });
        }
      })();
    },
    [halt],
  );

  const cancel = useCallback(() => {
    halt(true);
    dispatch({ type: "cancel" });
  }, [halt]);

  const reset = useCallback(() => {
    halt(true);
    dispatch({ type: "reset" });
  }, [halt]);

  // 화면을 떠나면 폴링을 멈추고, 아직 도는 job 은 서버 직렬 큐를 막지 않게 취소한다.
  useEffect(
    () => () => {
      if (live.current) halt(true);
      else halt(false);
    },
    [halt],
  );

  return { state, start, cancel, reset };
}
