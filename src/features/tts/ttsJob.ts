import { ApiError, cancelTtsJob, createTtsJob, fetchTtsAudio, getTtsJob, speakTts } from "../../api/client";
import { TTS_SPEAK_MAX_CHARS } from "../../api/ttsTypes";
import type { TtsJob, TtsSynthesisIn } from "../../api/ttsTypes";
import type { ChunkSource } from "./ttsPlayer";
import { defaultRetryable, failureText } from "./ttsText";

/** 서버가 failed 로 확정했거나 요청 자체가 거절된 경우. retryable 이면 브라우저에 남은 텍스트로 다시 요청하면 된다. */
export class TtsJobError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "TtsJobError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** 조회 간격(ms). 테스트가 줄여 쓴다. */
export const pollTiming = { ms: 1000 };
/** 연달아 이만큼 실패해야 연결이 끊긴 것으로 본다. 모바일 네트워크의 한두 번 끊김은 넘긴다. */
const MAX_POLL_FAILURES = 4;

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 요청 거절(HTTP 오류)을 TtsJobError 로. 503 은 배포 중이라 잠시 뒤 다시 하면 된다. */
export function toJobError(e: unknown): TtsJobError {
  if (e instanceof TtsJobError) return e;
  if (e instanceof ApiError) {
    if (e.status === 503) return new TtsJobError(e.code, e.code === "busy" ? failureText("busy") : failureText(e.code === "generation_not_active" ? e.code : "deploying"), true);
    if (e.status === 404) return new TtsJobError("not_found", failureText("not_found"), true);
    if (e.status >= 400 && e.status < 500) return new TtsJobError(e.code, e.message, false);
    return new TtsJobError(e.code, e.message, true);
  }
  return new TtsJobError("network", "서버와 연결하지 못했어요.", true);
}

/**
 * job 이 끝날 때까지 기다려 succeeded 인 job 을 돌려준다. 첫 조회는 바로 한다(전부 캐시 히트면 이미 끝나 있다).
 * failed·cancelled 는 TtsJobError 로 던진다. 중단하면 AbortError.
 */
export async function waitForJob(
  jobId: string,
  { signal, onProgress, pollMs = pollTiming.ms }: { signal?: AbortSignal; onProgress?: (job: TtsJob) => void; pollMs?: number } = {},
): Promise<TtsJob> {
  let failures = 0;
  for (let first = true; ; first = false) {
    if (!first) await sleep(pollMs, signal);
    let job: TtsJob;
    try {
      job = await getTtsJob(jobId, signal);
      failures = 0;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) throw toJobError(e);
      if (++failures >= MAX_POLL_FAILURES) throw toJobError(e);
      continue;
    }
    if (job.status === "succeeded") return job;
    if (job.status === "cancelled") throw new TtsJobError("cancelled", "작업이 취소됐어요.", true);
    if (job.status === "failed") {
      throw new TtsJobError(job.error_code ?? "failed", failureText(job.error_code), job.retryable ?? defaultRetryable(job.error_code));
    }
    onProgress?.(job);
  }
}

/** 끝난 job 의 문장 소리들. 문장 목록이 없으면 전체 파일 하나로 대신한다. */
export function chunkSourcesFromJob(job: TtsJob): ChunkSource[] {
  const urls = (job.chunks ?? [])
    .filter((c) => c.audio_url)
    .sort((a, b) => a.index - b.index)
    .map((c) => c.audio_url as string);
  if (urls.length === 0 && job.audio_full_url) urls.push(job.audio_full_url);
  return urls.map((url) => ({ load: (signal) => fetchTtsAudio(url, signal) }));
}

/**
 * 채팅 재생용. speak_max_chars 이하는 /speak 로 한 번에, 넘으면 job 으로 만든 뒤 문장 단위로 재생한다(설계서 §10.2).
 * 캐시 미스 job 은 워커가 끝나야 문장이 보이므로(설계서 §7.1) 긴 글의 첫 소리는 전체 합성이 끝난 뒤에 난다.
 * 취소 시 서버에 작업이 남지 않도록 late acceptance 및 waitForJob 중단 시 cancelTtsJob 을 보장한다.
 */
export async function synthesizeSources(
  body: TtsSynthesisIn,
  signal: AbortSignal,
  speakLimit: number = TTS_SPEAK_MAX_CHARS,
): Promise<ChunkSource[]> {
  const limit = typeof speakLimit === "number" && Number.isFinite(speakLimit) && speakLimit > 0
    ? Math.floor(speakLimit)
    : TTS_SPEAK_MAX_CHARS;

  if (signal.aborted) throw new DOMException("aborted", "AbortError");

  if (body.text.length <= limit) {
    try {
      const blob = await speakTts(body, signal);
      return [{ load: async () => blob }];
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw toJobError(e);
    }
  }

  let cancelledBeforeAccept = false;
  let acceptedJobId: string | null = null;

  const onAbort = () => {
    cancelledBeforeAccept = true;
    if (acceptedJobId) {
      void cancelTtsJob(acceptedJobId).catch(() => undefined);
    }
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const created = await createTtsJob(body);
    acceptedJobId = created.job_id;

    if (signal.aborted || cancelledBeforeAccept) {
      void cancelTtsJob(acceptedJobId).catch(() => undefined);
      throw new DOMException("aborted", "AbortError");
    }

    const job = await waitForJob(acceptedJobId, { signal });
    return chunkSourcesFromJob(job);
  } catch (e) {
    if (acceptedJobId && (signal.aborted || (e instanceof DOMException && e.name === "AbortError"))) {
      void cancelTtsJob(acceptedJobId).catch(() => undefined);
    }
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw toJobError(e);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
