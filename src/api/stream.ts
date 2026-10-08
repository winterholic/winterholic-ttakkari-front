import { fetchEventSource } from "@microsoft/fetch-event-source";
import { apiUrl, getAccessToken, refreshOrLose, toApiError } from "./client";
import type { RunEvent, UUID } from "./types";

export interface RunStreamHandlers {
  /** 이 seq 보다 큰 이벤트부터 받는다. 기본 0. */
  after?: number;
  onEvent: (e: RunEvent) => void;
  onEnd?: () => void;
  /** 재시도 불가능한 오류(4xx, 인증 상실)일 때만 불린다. 일시 오류는 내부에서 재연결한다. */
  onError?: (e: unknown) => void;
}

class Retriable extends Error {}
class Fatal extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) {
    super("fatal");
    this.cause = cause;
  }
}

const MAX_BACKOFF_MS = 10_000;

export function subscribeRun(runId: UUID, h: RunStreamHandlers): () => void {
  const ctrl = new AbortController();
  let lastSeq = h.after ?? 0;
  let ended = false;
  let attempt = 0;

  // 재연결마다 최신 토큰과 마지막 seq 를 헤더에 싣기 위해 fetch 를 감싼다.
  const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (lastSeq > 0) headers.set("Last-Event-ID", String(lastSeq));
    return fetch(input, { ...init, headers, credentials: "include" });
  };

  const finish = () => {
    ended = true;
    ctrl.abort();
  };

  void fetchEventSource(apiUrl(`/api/runs/${runId}/stream?after=${lastSeq}`), {
    signal: ctrl.signal,
    fetch: authedFetch,
    openWhenHidden: true, // 백그라운드 탭에서도 끊지 않는다.
    async onopen(res) {
      if (res.ok) {
        attempt = 0;
        return;
      }
      if (res.status === 401) {
        try {
          await refreshOrLose();
        } catch (e) {
          throw new Fatal(e);
        }
        throw new Retriable("refreshed");
      }
      const err = await toApiError(res);
      if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new Fatal(err);
      throw new Retriable(err.message);
    },
    onmessage(ev) {
      if (ev.event === "end") {
        finish();
        h.onEnd?.();
        return;
      }
      if (ev.event && ev.event !== "run_event") return;
      if (!ev.data) return;
      const parsed = JSON.parse(ev.data) as RunEvent;
      if (parsed.seq <= lastSeq) return;
      lastSeq = parsed.seq;
      h.onEvent(parsed);
    },
    onclose() {
      // end 없이 닫혔으면 서버 재시작·네트워크 문제이므로 이어받는다.
      if (!ended) throw new Retriable("closed before end");
    },
    onerror(err) {
      if (err instanceof Fatal) {
        ended = true;
        h.onError?.(err.cause);
        throw err.cause; // 라이브러리의 재시도 루프를 끝낸다.
      }
      attempt += 1;
      return Math.min(MAX_BACKOFF_MS, 500 * 2 ** (attempt - 1));
    },
  }).catch(() => {
    // Fatal 은 onError 로 이미 전달했다.
  });

  return () => {
    ended = true;
    ctrl.abort();
  };
}
