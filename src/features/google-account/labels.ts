import type { GaAccountState, GaLoginState } from "../../api/googleAccountTypes";

export type Tone = "info" | "success" | "warning" | "danger";

const KST = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
export const when = (iso: string | null | undefined): string => {
  if (!iso) return "기록 없음";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? KST.format(new Date(t)) : "기록 없음";
};

/** 계정 수준 상태. 쿨다운·보안 확인은 기능 상태라 여기에 없다. */
export const ACCOUNT_STATE_LABEL: Record<GaAccountState, { label: string; tone?: Tone }> = {
  login_required: { label: "로그인 필요", tone: "warning" },
  session_saved: { label: "접속 확인 전", tone: "info" },
  ready: { label: "연결됨", tone: "success" },
  reauth_required: { label: "다시 로그인 필요", tone: "warning" },
  disabled: { label: "꺼짐" },
};

export const ACCOUNT_STATE_SENTENCE: Record<GaAccountState, string> = {
  login_required: "아직 이 Google 계정으로 로그인하지 않았어요. 로그인 창을 열면 Mac Studio 화면에 전용 Chrome 창이 떠요. 그 창에서 한 번만 로그인하면 이 계정을 쓰는 모든 기능이 같은 로그인을 함께 써요.",
  session_saved: "로그인 세션은 저장돼 있어요. 기능별 접속 확인은 각 기능 화면에서 해요. 확인되기 전까지 Google에는 아무것도 보내지 않아요.",
  ready: "로그인이 유효해요. 아래 기능들이 이 계정의 로그인을 함께 써요.",
  reauth_required: "저장된 로그인이 만료됐거나 거부됐어요. 로그인 창을 다시 열어 로그인하면 아래 모든 기능이 다시 쓸 수 있어요.",
  disabled: "백엔드에서 Google 계정 연결을 꺼 둔 상태예요. 이 화면에서는 켤 수 없어요.",
};

/** 기능이 정한 상태 문자열. 모르는 값은 그대로 보여 준다(새 기능이 새 상태를 만들어도 화면이 깨지지 않게). */
export const FEATURE_STATE_LABEL: Record<string, { label: string; tone?: Tone }> = {
  ...ACCOUNT_STATE_LABEL,
  cooldown: { label: "사용 제한 대기", tone: "warning" },
  blocked: { label: "보안 확인 필요", tone: "danger" },
  unknown: { label: "상태 확인 못 함", tone: "warning" },
};
export const featureStateLabel = (state: string): { label: string; tone?: Tone } => FEATURE_STATE_LABEL[state] ?? { label: state };

export const LOGIN_LABEL: Record<GaLoginState, string> = {
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
