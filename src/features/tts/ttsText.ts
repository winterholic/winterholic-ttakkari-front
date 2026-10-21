import { TTS_MAX_TEXT_CHARS } from "../../api/ttsTypes";

/** job 의 error_code(설계서 §7.2)를 사용자 문구로. 서버가 모르는 코드를 주면 일반 문구로 떨어진다. */
const FAILURE_TEXT: Record<string, string> = {
  input_ttl_expired: "대기가 길어져 요청이 만료됐어요.",
  generation_draining: "서버가 새 버전으로 바뀌는 중이라 작업이 멈췄어요.",
  owner_shutdown: "서버가 꺼지면서 작업이 멈췄어요.",
  owner_gone: "작업을 맡은 서버 프로세스가 사라졌어요.",
  server_restarted: "서버가 다시 시작돼 작업이 멈췄어요.",
  worker_failed: "음성을 만드는 중 오류가 났어요. 텍스트를 바꿔 다시 시도해 보세요.",
  worker_timeout: "음성을 만드는 시간이 너무 오래 걸렸어요.",
  input_missing: "서버가 요청 원문을 잃어버렸어요.",
  not_found: "작업을 찾지 못했어요.",
  generation_not_active: "서버가 새 버전으로 바뀌는 중이에요.",
  deploying: "서버가 배포 중이에요.",
  busy: "다른 음성을 만드는 중이에요.",
};

export function failureText(code: string | null | undefined): string {
  return (code && FAILURE_TEXT[code]) || "음성을 만들지 못했어요.";
}

/** 설계서 §7.2: retryable 는 앞 여섯 코드와 worker_timeout 이 true, worker_failed 는 false. 서버가 값을 안 주면 코드로 추정한다. */
export function defaultRetryable(code: string | null | undefined): boolean {
  return code !== "worker_failed" && code !== "input_missing";
}

const REASON_TEXT: Record<string, string> = {
  disabled: "서버에서 꺼져 있어요.",
  engine_missing: "음성 엔진이 아직 설치되지 않았어요.",
  model_missing: "음성 모델이 아직 준비되지 않았어요.",
  no_voices: "쓸 수 있는 음성이 아직 없어요.",
  loading: "음성 엔진을 준비하는 중이에요.",
};

export function reasonText(reason: string | null | undefined): string {
  return (reason && REASON_TEXT[reason]) || "음성 엔진을 준비하는 중이에요.";
}

export const PREPARING_TITLE = "음성 기능을 준비하고 있어요";
export const NOT_DEPLOYED_TEXT = "서버에 로컬 음성 엔진이 아직 올라오지 않았어요. 준비가 끝나면 이 화면에서 바로 쓸 수 있어요.";

/**
 * 채팅 응답을 읽어 줄 글로 다듬는다. 마크다운 제거와 숫자 읽기는 서버가 맡으므로(설계서 §9) 여기서는 한도만 맞춘다.
 * 5000자를 넘으면 문장 끝에서 자른다. 뒷부분은 읽지 않으므로 호출하는 쪽이 알린다.
 */
export function prepareSpeechText(raw: string, max = TTS_MAX_TEXT_CHARS): { text: string; truncated: boolean } {
  const text = raw.trim();
  if (text.length <= max) return { text, truncated: false };
  const head = text.slice(0, max);
  const floor = Math.floor(max * 0.8);
  const stops = [...head.matchAll(/[.!?。！？]\s|\n/g)].map((m) => (m.index ?? 0) + 1).filter((i) => i >= floor);
  const cut = stops.length ? stops[stops.length - 1] : max;
  return { text: head.slice(0, cut).trim(), truncated: true };
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
