// Google 계정 공통 모듈(백엔드 ADR 0051). 필드·상태값은 back/src/ttakkari/google_account/service.py 기준이다.

/** 계정 수준 상태. 쿨다운·blocked 같은 기능별 상태는 GaFeature.state 에만 있다. */
export type GaAccountState = "login_required" | "session_saved" | "ready" | "reauth_required" | "disabled";
export type GaLoginState = "idle" | "starting" | "waiting" | "protection" | "saving" | "done" | "timeout" | "cancelled" | "failed";

export interface GaLogin {
  state: GaLoginState;
  message: string | null;
  active: boolean;
  /** 로그인을 시작한 기능 ID. 계정 화면에서 시작했으면 null. */
  feature?: string | null;
  started_at: number | string | null;
  finished_at: number | string | null;
}

export interface GaSession {
  stored: boolean;
  cookie_names: string[];
  permissions_ok: boolean | null;
  encrypted: boolean;
  protection: string;
}

/** 이 계정을 쓰는 기능 하나의 상태. state 는 계정이 막으면 계정 상태, 아니면 기능이 정한 값이다. */
export interface GaFeature {
  id: string;
  label: string;
  description: string;
  path: string;
  enabled: boolean;
  /** 저장된 세션에 이 기능의 쿠키 도메인이 들어 있는가. 세션이 없으면 null. false 면 그 기능 화면에서 로그인을 한 번 더 한다. */
  covered: boolean | null;
  can_verify: boolean;
  can_resume: boolean;
  state: string;
  message: string | null;
  cooldown_until?: string | null;
  retry_after?: number | null;
  last_ok_at?: string | null;
}

export interface GaAccount {
  account_id: string;
  label: string | null;
  state: GaAccountState;
  message: string | null;
  logged_in: boolean | null;
  reauth_required: boolean;
  last_login_at: string | null;
  last_ok_at: string | null;
  last_checked_at: string | null;
  last_error_code: string | null;
  session: GaSession;
  login: GaLogin;
  browser_available: boolean;
  features: GaFeature[];
}

export interface GaAccountList {
  accounts: GaAccount[];
}
