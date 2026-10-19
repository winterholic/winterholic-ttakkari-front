import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, cancelGoogleLogin, completeGoogleLogin, startGoogleLogin } from "../../api/client";
import type { GaLogin, GaSession } from "../../api/googleAccountTypes";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { LOGIN_LABEL } from "./labels";
import { gaKeys } from "./queries";
import "./googleAccount.css";

export interface LoginActions {
  start: () => Promise<unknown>;
  complete: () => Promise<unknown>;
  cancel: () => Promise<unknown>;
}

/** 공통 계정 REST 로 로그인 창을 다루는 기본 동작. 기능 화면이 자기 호환 경로를 쓰려면 actions 로 바꿔 끼운다. */
export const accountLoginActions = (accountId: string, feature?: string): LoginActions => ({
  start: () => startGoogleLogin(accountId, feature),
  complete: () => completeGoogleLogin(accountId),
  cancel: () => cancelGoogleLogin(accountId),
});

const LOGIN_NEEDED = new Set(["login_required", "reauth_required"]);

const failText = (e: unknown): string => (e instanceof ApiError ? e.message : "요청을 보내지 못했어요. 연결을 확인해 주세요.");

export interface GoogleLoginPanelProps {
  /** 화면이 기준으로 삼는 상태. 계정 화면은 계정 상태, 기능 화면은 그 기능의 상태를 넘긴다. */
  state: string;
  login: Pick<GaLogin, "state" | "message" | "active">;
  browserAvailable: boolean;
  actions: LoginActions;
  /** 로그인·완료·취소 뒤에 호출자가 자기 쿼리를 다시 읽게 한다. 계정 쿼리는 여기서 이미 새로 읽는다. */
  onChanged?: () => void;
  /** 연결된 상태에서도 "다시 로그인" 을 보인다(계정 화면). 기능 화면은 만료되면 버튼이 나타나게 둔다. */
  allowRelogin?: boolean;
  /** 호출자의 다른 동작이 진행 중이면 버튼을 잠근다. */
  disabled?: boolean;
  /** 같은 줄에 놓을 기능 고유 버튼(접속 확인, 재개 등). */
  extraActions?: ReactNode;
  /** 실패 토스트 문구. 기능 화면이 자기 오류 해석을 쓰려면 넘긴다. */
  errorText?: (e: unknown) => string;
}

/**
 * 로그인 창 흐름(열기 → 완료/취소) 공통 패널. 1단계는 사람이 Mac Studio 의 일반 Chrome 창에서 직접 로그인하고,
 * 따까리는 창 안에서 아무것도 입력하지 않는다. 쿠키·비밀번호는 화면에 오지 않는다.
 */
export function GoogleLoginPanel({ state, login, browserAvailable, actions, onChanged, allowRelogin, disabled, extraActions, errorText }: GoogleLoginPanelProps) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: gaKeys.all });
    onChanged?.();
  };
  const fail = (e: unknown) => toast({ message: (errorText ?? failText)(e), tone: "danger" });
  const settle = { onSuccess: refresh, onError: (e: unknown) => { fail(e); refresh(); } };
  const start = useMutation({ mutationFn: actions.start, ...settle });
  const complete = useMutation({ mutationFn: actions.complete, ...settle });
  const cancel = useMutation({ mutationFn: actions.cancel, ...settle });

  const active = login.active;
  const needsLogin = LOGIN_NEEDED.has(state);
  const canLogin = !active && state !== "disabled" && (allowRelogin || !["blocked", "ready", "cooldown"].includes(state));
  const finished = !active && ["timeout", "cancelled", "failed"].includes(login.state);
  const busy = Boolean(disabled) || start.isPending || complete.isPending || cancel.isPending;

  return (
    <>
      {active && (
        <div className="tk-callout tk-callout--note ga-login" role="status" data-login={login.state}>
          <Icon name="info" className="tk-callout__icon" />
          <div className="tk-callout__body">
            <strong className="tk-callout__title">로그인 창 진행 중</strong>
            <p>{LOGIN_LABEL[login.state] || login.message}</p>
            <p className="ga-note">로그인을 마친 뒤 창을 닫거나 아래 <strong>로그인 완료</strong>를 눌러 주세요.</p>
          </div>
        </div>
      )}
      {finished && <p className="ga-note" role="status">{LOGIN_LABEL[login.state]}</p>}

      <div className="ga-actions">
        {canLogin && (
          <Button variant={needsLogin ? "primary" : undefined} busy={start.isPending} disabled={busy || !browserAvailable} onClick={() => start.mutate()}>
            <Icon name="key" />{needsLogin ? "로그인 창 열기" : "다시 로그인"}
          </Button>
        )}
        {active && (
          <>
            <Button variant="primary" busy={complete.isPending} disabled={busy} onClick={() => complete.mutate()}>
              <Icon name="check" />로그인 완료
            </Button>
            <Button variant="danger" busy={cancel.isPending} disabled={busy} onClick={() => cancel.mutate()}>
              <Icon name="x" />로그인 취소
            </Button>
          </>
        )}
        {extraActions}
      </div>
      {canLogin && !browserAvailable && <p className="ga-note ga-warn">Mac Studio에서 Chrome을 찾지 못해 로그인 창을 열 수 없어요.</p>}
      {canLogin && browserAvailable && (
        <p className="ga-note">로그인 창은 폰이 아니라 <strong>Mac Studio 화면</strong>에 떠요. 비밀번호는 따까리가 보지 않아요.</p>
      )}
    </>
  );
}

/** 세션 저장 방식과 쿠키 개수. 쿠키 값은 서버가 보내지 않는다. */
export function SessionFact({ session }: { session: Pick<GaSession, "stored" | "cookie_names" | "permissions_ok" | "encrypted"> }) {
  return (
    <div className="ga-fact">
      <dt>세션 저장 방식</dt>
      <dd>
        {session.encrypted ? "암호화해 저장" : "파일 권한으로 보호, 암호화 안 함"}
        {!session.stored && <small>아직 저장된 세션이 없어요.</small>}
        {session.stored && session.permissions_ok === false && <small className="ga-warn">파일 권한이 기대와 달라요. 소유자 전용(0600)이 아닐 수 있어요.</small>}
        {session.stored && session.cookie_names.length > 0 && <small>쿠키 {session.cookie_names.length}개 저장(이름만 보이고 값은 화면에 오지 않아요)</small>}
      </dd>
    </div>
  );
}
