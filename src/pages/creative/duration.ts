import type { DurationRequest } from "../../api/creativeV2";

export const MIN_SECONDS = 1;
export const MAX_SECONDS = 900;
export const PRESETS = [15, 30, 60, 120, 180, 300, 600, 900] as const;
export const YOUTUBE_SHORTS_CAP = 180;

export type Choice = "auto" | "custom" | `${(typeof PRESETS)[number]}`;
export type Strictness = "soft" | "exact" | "cap";
export type CapKind = "youtube_shorts" | "custom";

export interface DurationState {
  choice: Choice;
  custom: string;
  strictness: Strictness;
  capKind: CapKind;
  capSource: string;
}

export const INITIAL_DURATION: DurationState = {
  choice: "auto",
  custom: "",
  strictness: "soft",
  capKind: "youtube_shorts",
  capSource: "",
};

/** 15초·1분·2분 30초처럼 사람이 읽는 길이. 소수 초는 한 자리까지 쓴다. */
export function formatSeconds(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const total = Math.round(value * 10) / 10;
  const minutes = Math.floor(total / 60);
  const rest = Math.round((total - minutes * 60) * 10) / 10;
  if (minutes === 0) return `${rest}초`;
  return rest === 0 ? `${minutes}분` : `${minutes}분 ${rest}초`;
}

export const clock = (value: number) =>
  `${Math.floor(value / 60)}:${Math.floor(value % 60)
    .toString()
    .padStart(2, "0")}`;

/** 직접 입력 문자열을 검사한다. 빈 값·NaN·Infinity·범위 밖은 모두 오류 문장을 돌려준다. */
export function parseCustom(
  text: string,
  max = MAX_SECONDS,
): { seconds: number | null; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { seconds: null, error: "길이를 초 단위로 입력해 주세요." };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { seconds: null, error: "숫자만 입력해 주세요. 예: 45" };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { seconds: null, error: "올바른 숫자가 아닙니다." };
  if (n < MIN_SECONDS) return { seconds: null, error: `${MIN_SECONDS}초 이상 입력해 주세요.` };
  if (n > max) {
    return {
      seconds: null,
      error:
        max < MAX_SECONDS
          ? `이 화면에서는 ${formatSeconds(max)}까지 만들 수 있어요.`
          : `${MAX_SECONDS}초(15분) 이하로 입력해 주세요.`,
    };
  }
  return { seconds: n, error: null };
}

export interface Resolved {
  request: DurationRequest | null;
  error: string | null;
}

export function toRequest(state: DurationState, today: string, max = MAX_SECONDS): Resolved {
  if (state.choice === "auto") return { request: { mode: "auto" }, error: null };
  let seconds: number;
  if (state.choice === "custom") {
    const parsed = parseCustom(state.custom, max);
    if (parsed.seconds === null) return { request: null, error: parsed.error };
    seconds = parsed.seconds;
  } else {
    seconds = Number(state.choice);
    if (seconds > max) {
      return { request: null, error: `이 화면에서는 ${formatSeconds(max)}까지 만들 수 있어요.` };
    }
  }
  if (state.strictness === "soft") return { request: { mode: "preferred", seconds }, error: null };
  if (state.strictness === "exact") return { request: { mode: "exact", seconds }, error: null };
  if (state.capKind === "youtube_shorts") {
    return { request: { mode: "platform_cap", platform: "youtube_shorts" }, error: null };
  }
  const source = state.capSource.trim();
  if (!source) return { request: null, error: "상한의 근거를 적어 주세요. 예: 클라이언트 요청서" };
  return { request: { mode: "platform_cap", seconds, source, as_of: today }, error: null };
}

export const describeRequest = (r: DurationRequest): string => {
  if (r.mode === "auto" || r.seconds == null) return "자동";
  const t = formatSeconds(r.seconds);
  if (r.mode === "preferred") return `희망 ${t}`;
  if (r.mode === "exact") return `정확히 ${t}`;
  const platform = r.platform === "youtube_shorts" ? "YouTube Shorts" : r.platform;
  return `상한 ${t}${platform ? ` (${platform})` : ""}`;
};
