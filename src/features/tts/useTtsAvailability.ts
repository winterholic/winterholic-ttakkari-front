import { useQuery } from "@tanstack/react-query";
import { ApiError, getTtsStatus, listTtsVoices } from "../../api/client";
import type { TtsStatus, TtsVoice } from "../../api/ttsTypes";

/**
 * 로컬 TTS 를 지금 쓸 수 있는가.
 * - unavailable: 서버에 TTS 가 없다(엔드포인트 404 등, 아직 배포 전) 또는 꺼져 있다. 화면은 '준비 중'으로 숨거나 막힌다.
 * - preparing: 엔드포인트는 있지만 엔진·음성이 아직 준비되지 않았다.
 * - ready: 음성 목록까지 받았다.
 */
export type TtsAvailability =
  | { state: "unavailable"; reason: "not_deployed" | "disabled" }
  | { state: "preparing"; reason: string | null; status: TtsStatus }
  | { state: "ready"; status: TtsStatus; voices: TtsVoice[] };

/** 배포 전 서버가 주는 응답. 이 셋이면 기능 자체가 없는 것으로 읽는다. */
const isMissing = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501);

export async function probeTts(): Promise<TtsAvailability> {
  let status: TtsStatus;
  try {
    status = await getTtsStatus();
  } catch (e) {
    if (isMissing(e)) return { state: "unavailable", reason: "not_deployed" };
    throw e;
  }
  if (!status.enabled) return { state: "unavailable", reason: "disabled" };
  let voices: TtsVoice[];
  try {
    voices = await listTtsVoices();
  } catch (e) {
    if (isMissing(e)) return { state: "unavailable", reason: "not_deployed" };
    throw e;
  }
  if (!status.ready || voices.length === 0) return { state: "preparing", reason: status.reason ?? null, status };
  return { state: "ready", status, voices };
}

export const TTS_AVAILABILITY_KEY = ["tts", "availability"] as const;

export function useTtsAvailability(enabled = true) {
  return useQuery({
    queryKey: TTS_AVAILABILITY_KEY,
    queryFn: probeTts,
    enabled,
    retry: false,
    // 배포 직후나 엔진 준비가 끝난 뒤에도 곧 따라오게 한다. 매번 다시 묻지는 않는다.
    staleTime: 60_000,
  });
}

/** 설정이 가리키는 음성이 목록에 있으면 그것, 없으면 undefined(서버 기본 음성). */
export function pickVoice(voices: TtsVoice[], pref: string | null): string | undefined {
  return pref && voices.some((v) => v.id === pref) ? pref : undefined;
}
