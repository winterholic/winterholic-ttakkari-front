import { useId, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, deleteGoogleSession } from "../../api/client";
import type { GaAccount } from "../../api/googleAccountTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/toastStore";
import { FeatureList } from "./FeatureList";
import { accountLoginActions, GoogleLoginPanel, SessionFact } from "./GoogleLoginPanel";
import { ACCOUNT_STATE_LABEL, ACCOUNT_STATE_SENTENCE, when } from "./labels";
import { gaKeys } from "./queries";
import "./googleAccount.css";

/**
 * Google 계정 연결 카드: 상태, 로그인 창(열기·완료·취소), 세션 정보, 이 계정을 쓰는 기능 목록, 세션 삭제.
 * 어느 페이지에서든 같은 모양과 같은 상태를 보여 준다. 기능 고유 상태(쿨다운 등)는 기능 목록에 요약만 나온다.
 */
export function GoogleAccountCard({ account }: { account: GaAccount }) {
  const qc = useQueryClient();
  const id = useId();
  const options = useMemo(() => account.features.map((f) => ({ value: f.id, label: f.label })), [account.features]);
  const [via, setVia] = useState<string | undefined>(undefined);
  const feature = via ?? options[0]?.value;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = useMutation({
    mutationFn: () => deleteGoogleSession(account.account_id),
    onSuccess: (next) => {
      qc.setQueryData(gaKeys.list, (cur: { accounts: GaAccount[] } | undefined) =>
        cur ? { accounts: cur.accounts.map((a) => (a.account_id === next.account_id ? next : a)) } : cur);
      void qc.invalidateQueries({ queryKey: gaKeys.all });
      void qc.invalidateQueries({ queryKey: ["notebooklm"] });
      setConfirmDelete(false);
    },
    onError: (e) => {
      toast({ message: e instanceof ApiError ? e.message : "세션을 지우지 못했어요.", tone: "danger" });
      setConfirmDelete(false);
    },
  });

  const label = ACCOUNT_STATE_LABEL[account.state];
  const loginActive = account.login.active;

  return (
    <section className="tk-section ga-card" aria-labelledby={`${id}-title`} data-account={account.account_id} data-state={account.state}>
      <div className="tk-section__head">
        <h3 id={`${id}-title`} className="tk-section__title">{account.label || "Google 계정"} <span className="ga-card__id tk-mono">{account.account_id}</span></h3>
        <Badge tone={label.tone}>{label.label}</Badge>
      </div>
      <p className="ga-sentence">{ACCOUNT_STATE_SENTENCE[account.state]}</p>
      {account.message && account.state === "reauth_required" && <p className="ga-note">서버 메시지: {account.message}</p>}

      {options.length > 1 && !loginActive && (
        <div className="tk-field">
          <label className="tk-label" id={`${id}-via-label`} htmlFor={`${id}-via`}>로그인할 화면</label>
          <Select id={`${id}-via`} labelledBy={`${id}-via-label`} value={feature ?? ""} options={options} onChange={setVia} />
          <p className="tk-help">이 기능의 앱 화면에서 로그인해요. 같은 계정이라 다른 기능도 같은 로그인을 써요.</p>
        </div>
      )}

      <GoogleLoginPanel
        state={account.state}
        login={account.login}
        browserAvailable={account.browser_available}
        actions={accountLoginActions(account.account_id, feature)}
        allowRelogin
        disabled={remove.isPending}
        extraActions={account.session.stored && !loginActive ? (
          <Button variant="danger" disabled={remove.isPending} onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" />세션 삭제
          </Button>
        ) : undefined}
      />

      <dl className="ga-facts">
        <div className="ga-fact"><dt>마지막 로그인</dt><dd>{when(account.last_login_at)}</dd></div>
        <div className="ga-fact"><dt>마지막 성공</dt><dd>{when(account.last_ok_at)}</dd></div>
        <SessionFact session={account.session} />
      </dl>
      <p className="ga-note ga-note--protect">{account.session.protection}</p>

      <FeatureList features={account.features} />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        size="sm"
        title="저장된 세션을 지울까요?"
        modal
        footer={
          <div className="tk-button-group tk-button-group--end">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>아니요</Button>
            <Button variant="danger" busy={remove.isPending} onClick={() => remove.mutate()}>세션 삭제</Button>
          </div>
        }
      >
        <p>이 계정의 저장된 로그인 세션을 지워요. <strong>이 계정을 쓰는 모든 기능</strong>이 다시 로그인해야 해요.</p>
        <p className="ga-note">Google 계정에서 로그아웃하는 건 아니에요. 전용 Chrome 창의 로그인 상태는 남아 있어서 다시 로그인하면 빨라요.</p>
      </Dialog>
    </section>
  );
}
