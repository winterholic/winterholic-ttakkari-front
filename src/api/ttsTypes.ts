// 로컬 TTS API 계약. back/docs/design/local-tts.md §7, ADR 0062.

export interface TtsStatus {
  enabled: boolean;
  ready: boolean;
  /** ready 가 아닐 때 이유 코드. 사용자 문구로 옮기는 곳은 features/tts/ttsText.ts. */
  reason?: string | null;
  engine?: string | null;
  model?: string | null;
  voice_count?: number;
}

export interface TtsVoice {
  id: string;
  name: string;
  lang?: string;
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

/** 서버가 받는 입력 한도(설계서 §14). status 가 알려 주지 않으므로 상수로 둔다. */
export const TTS_MAX_TEXT_CHARS = 5000;
export const TTS_SPEAK_MAX_CHARS = 500;
