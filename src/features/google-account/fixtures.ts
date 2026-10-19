import type { GaAccount, GaFeature } from "../../api/googleAccountTypes";

/** 테스트와 화면 확인용 합성 데이터. 실제 Google 데이터가 아니다. */
export function gaFeature(over: Partial<GaFeature> = {}): GaFeature {
  return {
    id: "notebooklm",
    label: "NotebookLM",
    description: "노트북·소스 관리와 출처 기반 질의",
    path: "/notebooklm",
    enabled: true,
    covered: true,
    can_verify: true,
    can_resume: true,
    state: "ready",
    message: null,
    cooldown_until: null,
    retry_after: null,
    last_ok_at: null,
    ...over,
  };
}

export function gaAccount(over: Partial<GaAccount> = {}): GaAccount {
  return {
    account_id: "primary",
    label: null,
    state: "login_required",
    message: "로그인한 적이 없습니다. 로그인 창을 열어 한 번 로그인해 주세요.",
    logged_in: false,
    reauth_required: false,
    last_login_at: null,
    last_ok_at: null,
    last_checked_at: null,
    last_error_code: null,
    session: { stored: false, cookie_names: [], permissions_ok: null, encrypted: false, protection: "소유자 전용 파일 권한(0600/0700)만 사용합니다. 암호화하지 않습니다." },
    login: { state: "idle", message: null, active: false, feature: null, started_at: null, finished_at: null },
    browser_available: true,
    features: [gaFeature({ state: "login_required" })],
    ...over,
  };
}
