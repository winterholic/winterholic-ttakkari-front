// 로컬 TTS API 계약. back/docs/design/local-tts.md §7, ADR 0062.

export interface TtsStatus {
  enabled: boolean;
  ready: boolean;
  /** ready 가 아닐 때 이유 코드. 사용자 문구로 옮기는 곳은 features/tts/ttsText.ts. */
  reason?: string | null;
  engine?: string | null;
  model?: string | null;
  voice_count?: number;
  default_voice?: string | null;
  default_speed?: number | null;
  speed_range?: number[];
  sample_rate?: number;
  output_format?: string;
  max_text_chars?: number;
  speak_max_chars?: number;
  accepting?: boolean;
}

export interface TtsVoice {
  id: string;
  name: string;
  /** 백엔드 응답은 list(v.lang) 형태의 문자열 배열이다. */
  lang?: string[];
  gender?: string | null;
  sample_url?: string | null;
}

export type TtsJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface TtsJobChunk {
  index: number;
  text_hash?: string;
  audio_url?: string | null;
  duration?: number | null;
}

export interface TtsJob {
  status: TtsJobStatus;
  error_code?: string | null;
  /** failed 일 때만. 같은 입력으로 다시 요청하면 풀릴 수 있는가. */
  retryable?: boolean | null;
  progress?: { done: number; total: number };
  chunks?: TtsJobChunk[];
  audio_full_url?: string | null;
}

export interface TtsJobCreated {
  job_id: string;
  chunks: number;
  cached_chunks: number;
}

export interface TtsSynthesisIn {
  text: string;
  voice?: string;
  speed?: number;
}

export interface TtsCacheStats {
  entries: number;
  bytes: number;
  hits: number;
  misses: number;
  max_bytes: number;
}

/** 서버 기본 입력 한도(설계서 §14, status 기본값). */
export const TTS_MAX_TEXT_CHARS = 5000;
export const TTS_SPEAK_MAX_CHARS = 500;

/** status.max_text_chars 가 유효한 양의 정수면 그것을 쓰고, 아니면 기본값(5000)을 쓴다. */
export function resolveMaxTextChars(status?: TtsStatus | null): number {
  const v = status?.max_text_chars;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : TTS_MAX_TEXT_CHARS;
}

/** status.speak_max_chars 가 유효한 양의 정수면 그것을 쓰고, 아니면 기본값(500)을 쓴다. */
export function resolveSpeakMaxChars(status?: TtsStatus | null): number {
  const v = status?.speak_max_chars;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : TTS_SPEAK_MAX_CHARS;
}
