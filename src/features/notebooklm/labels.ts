import { ApiError } from "../../api/client";
import type { NlmCapability, NlmJob, NlmLoginState, NlmSource, NlmSourceKind, NlmSourceStatus, NlmState } from "../../api/notebooklmTypes";

type Tone = "info" | "success" | "warning" | "danger";

const KST = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
export const when = (iso: string | null | undefined): string => {
  if (!iso) return "기록 없음";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? KST.format(new Date(t)) : "기록 없음";
};

export const STATE_LABEL: Record<NlmState, { label: string; tone?: Tone }> = {
  login_required: { label: "로그인 필요", tone: "warning" },
  session_saved: { label: "접속 확인 전", tone: "info" },
  ready: { label: "연결됨", tone: "success" },
  reauth_required: { label: "다시 로그인 필요", tone: "warning" },
  cooldown: { label: "사용 제한 대기", tone: "warning" },
  blocked: { label: "보안 확인 필요", tone: "danger" },
  disabled: { label: "꺼짐" },
};

/** 상태를 사람이 이해할 문장으로. 백엔드 message 는 보조로만 쓰고 의미는 여기서 정한다. */
export const STATE_SENTENCE: Record<NlmState, string> = {
  login_required: "아직 Google 로그인을 하지 않았어요. 로그인 창을 열면 Mac Studio 화면에 전용 Chrome 창이 떠요. 그 창에서 한 번만 로그인하면 돼요.",
  session_saved: "로그인 세션은 저장돼 있지만 NotebookLM에 실제로 접속되는지는 아직 확인하지 않았어요. 접속 확인을 누르면 Google에 한 번 요청해요.",
  ready: "NotebookLM에 연결돼 있어요. 노트북을 보고 소스를 넣고 질문할 수 있어요.",
  reauth_required: "저장된 로그인이 만료됐거나 거부됐어요. 로그인 창을 다시 열어 로그인해 주세요.",
  cooldown: "Google이 사용 제한을 알려서 잠시 요청을 멈췄어요. 시간이 지나면 저절로 풀려요. 그동안은 Google에 아무것도 보내지 않아요.",
  blocked: "Google이 CAPTCHA나 보안 확인 같은 신호를 보냈어요. 자동 요청은 멈춘 상태예요. Google에서 직접 확인을 마친 뒤에 재개를 눌러 주세요.",
  disabled: "백엔드에서 NotebookLM 연결을 꺼 둔 상태예요. 이 화면에서는 켤 수 없어요.",
};

export const LOGIN_LABEL: Record<NlmLoginState, string> = {
  idle: "",
  starting: "로그인 창을 여는 중이에요.",
  waiting: "Mac Studio 화면의 Chrome 창에서 Google 로그인을 마쳐 주세요. 폰 화면에는 창이 뜨지 않아요.",
  protection: "로그인 창에 Google 보안 확인이 떴어요. Mac Studio 화면에서 직접 처리해 주세요. 따까리는 대신 넘기지 않아요.",
  saving: "로그인을 마쳤어요. 세션을 저장하는 중이에요.",
  done: "로그인 세션을 저장했어요.",
  timeout: "로그인 창이 시간 안에 끝나지 않아 닫혔어요. 다시 열어 주세요.",
  cancelled: "로그인을 취소했어요.",
  failed: "로그인 창이 실패했어요. 다시 열어 주세요.",
};

const CAPABILITY_LABEL: Record<string, string> = {
  notebooks: "노트북 관리",
  "sources.url": "웹 URL 소스",
  "sources.youtube": "YouTube 소스",
  "sources.text": "텍스트 소스",
  "sources.file": "파일 업로드",
  "query.citations": "인용이 있는 질의",
  audio_overview: "오디오 개요",
  video_overview: "비디오 개요",
  research: "리서치",
  drive_sources: "Google Drive 소스",
  sharing: "공유",
};
export const capabilityLabel = (c: NlmCapability): string => CAPABILITY_LABEL[c.name] ?? c.name;

export const SOURCE_KIND_LABEL: Record<NlmSourceKind, string> = {
  web_page: "웹페이지",
  youtube: "YouTube",
  pasted_text: "텍스트",
  pdf: "PDF",
  document: "문서",
  media: "미디어",
  other: "기타",
};
export const sourceKindLabel = (k: string): string => SOURCE_KIND_LABEL[k as NlmSourceKind] ?? "기타";

export const SOURCE_STATUS: Record<NlmSourceStatus, { label: string; tone?: Tone }> = {
  processing: { label: "처리 중", tone: "info" },
  ready: { label: "준비됨", tone: "success" },
  error: { label: "오류", tone: "danger" },
  unknown: { label: "확인 필요", tone: "warning" },
};

export const sourceTitle = (s: Pick<NlmSource, "title" | "url">): string => s.title?.trim() || s.url || "제목 없음";

export const JOB_ACTIVE = new Set(["queued", "running"]);
export const jobActive = (j: Pick<NlmJob, "status">): boolean => JOB_ACTIVE.has(j.status);

/** 작업이 무엇을 등록하는지 한 줄로. 파일 경로는 서버에서 이름만 오고 URL 은 정규화된 값이다. */
export function jobTarget(j: NlmJob): string {
  const p = j.params ?? {};
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
  return str("title") ?? str("file_name") ?? str("url") ?? "소스";
}

export function jobStatusText(j: NlmJob): { text: string; tone?: Tone } {
  switch (j.status) {
    case "queued": return { text: "대기 중", tone: "info" };
    case "running": return { text: "등록하고 처리하는 중", tone: "info" };
    case "succeeded":
      return j.result?.ready === false
        ? { text: j.result.note ?? "등록은 됐지만 아직 처리 중이에요. 소스 목록에서 상태를 확인해 주세요.", tone: "warning" }
        : { text: "등록 완료", tone: "success" };
    case "failed": return { text: j.error ?? "등록하지 못했어요.", tone: "danger" };
    case "cancelled": return { text: "취소했어요." };
    case "unknown":
      return { text: "결과를 알 수 없어요. 같은 소스를 다시 보내기 전에 소스 목록부터 확인해 주세요.", tone: "warning" };
  }
}

export type ErrorKind = "network" | "cooldown" | "auth" | "blocked" | "disabled" | "unknown_outcome" | "too_large" | "other";
export interface DescribedError {
  kind: ErrorKind;
  title: string;
  detail: string;
  retryAfter?: number;
}

/** 오류를 화면이 분기하는 종류와 사람 문장으로. 백엔드 메시지는 쿠키·토큰이 마스킹된 문장이라 그대로 보여 줄 수 있다. */
export function describeError(e: unknown): DescribedError {
  if (!(e instanceof ApiError)) {
    return { kind: "network", title: "서버에 연결하지 못했어요", detail: "네트워크 상태를 확인하고 다시 시도해 주세요. 요청이 서버에 닿지 않았을 수 있어요." };
  }
  const detail = e.message || "";
  if (e.status === 429) {
    return { kind: "cooldown", title: "Google 사용 제한 중이에요", detail: "잠시 쉬었다가 다시 시도해 주세요. 그동안은 Google에 요청하지 않아요.", retryAfter: e.retryAfter };
  }
  if (e.code === "auth_required") {
    return { kind: "auth", title: "다시 로그인해야 해요", detail: "저장된 로그인이 없거나 만료됐어요. 위 연결 상태에서 로그인 창을 열어 주세요." };
  }
  if (e.status === 423 || e.code === "protection_signal") {
    return { kind: "blocked", title: "Google 보안 확인 신호로 멈췄어요", detail: "Google에서 직접 확인한 뒤 연결 상태에서 재개해 주세요." };
  }
  if (e.code === "disabled") {
    return { kind: "disabled", title: "NotebookLM 연결이 꺼져 있어요", detail: "백엔드 설정에서 꺼 둔 상태예요." };
  }
  if (e.outcomeUnknown) {
    return { kind: "unknown_outcome", title: "요청이 Google에 닿았는지 알 수 없어요", detail: "같은 요청을 바로 다시 보내지 말고 목록부터 확인해 주세요." };
  }
  if (e.status === 413 || e.code === "too_large") {
    return { kind: "too_large", title: "파일이 너무 커요", detail: detail || "더 작은 파일을 골라 주세요." };
  }
  return { kind: "other", title: detail || "요청하지 못했어요", detail: e.status >= 500 ? "잠시 후 다시 시도해 주세요." : "" };
}

export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}분 ${String(r).padStart(2, "0")}초` : `${r}초`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
