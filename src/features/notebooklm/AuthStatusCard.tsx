import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { cancelNotebookLMLogin, completeNotebookLMLogin, resumeNotebookLM, startNotebookLMLogin, verifyNotebookLM } from "../../api/client";
import type { NlmAuthStatus } from "../../api/notebooklmTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { GoogleLoginPanel, SessionFact } from "../google-account/GoogleLoginPanel";
import type { LoginActions } from "../google-account/GoogleLoginPanel";
import { ErrorNotice } from "./ErrorNotice";
import { STATE_LABEL, STATE_SENTENCE, capabilityLabel, describeError, formatRemaining, when } from "./labels";
import { nlmKeys, useCountdown } from "./queries";

/** 로그인은 Google 계정 공통 패널이 하고, NotebookLM 은 기존 호환 경로(/api/notebooklm/auth/*)로 같은 동작을 건다. */
const NLM_LOGIN: LoginActions = {
  start: () => startNotebookLMLogin(),
  complete: () => completeNotebookLMLogin(),
  cancel: () => cancelNotebookLMLogin(),
};

function Capabilities({ status }: { status: NlmAuthStatus }) {
  const off = status.capabilities.filter((c) => !c.available);
  const on = status.capabilities.filter((c) => c.available);
  return (
    <section className="nlm-caps" aria-label="지원 기능">
      <h3 className="nlm-subtitle">지원 기능</h3>
      {on.length > 0 && (
        <ul className="nlm-chips">
          {on.map((c) => <li key={c.name}><Badge tone="success">{capabilityLabel(c)}</Badge></li>)}
        </ul>
      )}
      {off.length > 0 && (
        <ul className="nlm-caplist">
          {off.map((c) => (
            <li key={c.name}>
              <span className="nlm-caplist__name">{capabilityLabel(c)}</span>
              <Badge>지원 안 함</Badge>
              {c.reason && <small>{c.reason}</small>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metrics({ status }: { status: NlmAuthStatus }) {
  const counters = Object.entries(status.metrics.counters);
  const latency = Object.entries(status.metrics.latency);
  const l = status.limits;
  return (
    <details className="nlm-metrics">
      <summary>사용 지표·제한</summary>
      <dl className="nlm-facts nlm-facts--small">
        <div className="nlm-fact"><dt>동시 요청 한도</dt><dd>{l.concurrency}</dd></div>
        <div className="nlm-fact"><dt>읽기 재시도</dt><dd>최대 {l.read_retry_max}회</dd></div>
        <div className="nlm-fact"><dt>요청 제한시간</dt><dd>{l.request_timeout_seconds}초</dd></div>
        <div className="nlm-fact"><dt>질의 제한시간</dt><dd>{l.query_timeout_seconds}초</dd></div>
      </dl>
      <p className="nlm-note">서버가 켜진 뒤의 수치예요(재시작하면 0부터).</p>
      {counters.length === 0 && latency.length === 0 && <p className="nlm-note">아직 쌓인 지표가 없어요.</p>}
      {counters.length > 0 && (
        <ul className="nlm-metric-list">
          {counters.map(([k, v]) => <li key={k}><span className="tk-mono">{k}</span><strong>{v}</strong></li>)}
        </ul>
      )}
      {latency.length > 0 && (
        <ul className="nlm-metric-list">
          {latency.map(([k, v]) => <li key={k}><span className="tk-mono">{k}</span><span>{v.count}회 · 평균 {v.avg_ms}ms · 최대 {v.max_ms}ms</span></li>)}
        </ul>
      )}
    </details>
  );
}

/** 연결 상태 카드. auth/status 는 Google 에 요청하지 않으므로 화면을 열 때마다 읽어도 안전하다. */
export function AuthStatusCard({ status }: { status: NlmAuthStatus }) {
  const qc = useQueryClient();
  const [confirmResume, setConfirmResume] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: nlmKeys.status });
  const fail = (e: unknown) => {
    const d = describeError(e);
    toast({ message: d.cause ? d.title + " (" + d.cause + ")" : d.title, tone: d.kind === "too_soon" ? "neutral" : "danger" });
  };
  const setStatus = (s: NlmAuthStatus) => {
    qc.setQueryData(nlmKeys.status, s);
    void qc.invalidateQueries({ queryKey: nlmKeys.notebooks });
  };

  const verify = useMutation({
    mutationFn: verifyNotebookLM,
    onSuccess: setStatus,
    onError: (e) => { fail(e); void refresh(); },
  });
  const resume = useMutation({
    mutationFn: resumeNotebookLM,
    onSuccess: (s) => { setStatus(s); setConfirmResume(false); },
    onError: (e) => { fail(e); setConfirmResume(false); void refresh(); },
  });

  const left = useCountdown(status.state === "cooldown" ? status.cooldown_until : null, () => void refresh());
  const label = STATE_LABEL[status.state];
  const busy = verify.isPending || resume.isPending;

  return (
    <section className="tk-section nlm-status" aria-labelledby="nlm-status-title" data-state={status.state}>
      <div className="tk-section__head">
        <h2 id="nlm-status-title" className="tk-section__title">연결 상태</h2>
        <Badge tone={label.tone}>{label.label}</Badge>
      </div>

      <p className="nlm-sentence">{STATE_SENTENCE[status.state]}</p>
      {status.message && ["cooldown", "blocked", "reauth_required"].includes(status.state) && <p className="nlm-note">서버 메시지: {status.message}</p>}

      {status.state === "cooldown" && (
        <p className="nlm-countdown" role="timer" aria-live="off">
          <Icon name="clock" />
          {left !== null && left > 0 ? <>남은 시간 <strong>{formatRemaining(left)}</strong></> : "곧 풀려요. 상태를 다시 읽는 중이에요."}
        </p>
      )}

      <GoogleLoginPanel
        state={status.state}
        login={status.login}
        browserAvailable={status.browser_available}
        actions={NLM_LOGIN}
        onChanged={() => void refresh()}
        disabled={busy}
        errorText={(e) => describeError(e).title}
        extraActions={
          <>
            {status.state === "session_saved" && (
              <Button variant="primary" busy={verify.isPending} disabled={busy} onClick={() => verify.mutate()}>
                <Icon name="retry" />접속 확인
              </Button>
            )}
            {status.state === "blocked" && (
              <Button variant="primary" disabled={busy} onClick={() => setConfirmResume(true)}>
                <Icon name="play" />확인했어요, 재개
              </Button>
            )}
          </>
        }
      />
      <p className="nlm-note">이 로그인은 Google 계정 단위라 다른 기능과 함께 써요. <Link to="/settings#google-accounts">Google 계정 설정</Link>에서 같은 상태를 볼 수 있어요.</p>

      {status.last_error && (
        <aside className="tk-callout tk-callout--caution nlm-notice" role="status" data-testid="nlm-last-error">
          <Icon name="caution" className="tk-callout__icon" />
          <div className="tk-callout__body">
            <strong className="tk-callout__title">마지막 요청이 실패했어요</strong>
            <p>{status.last_error.message}</p>
            {status.last_error.detail && <p className="tk-mono">원인: {status.last_error.detail}</p>}
            <p className="nlm-note">{when(status.last_error.at)} · 코드 {status.last_error.code}</p>
          </div>
        </aside>
      )}

      <dl className="nlm-facts">
        <div className="nlm-fact"><dt>마지막 성공</dt><dd>{when(status.last_ok_at)}</dd></div>
        <div className="nlm-fact"><dt>마지막 확인</dt><dd>{when(status.last_checked_at)}</dd></div>
        <SessionFact session={status.session} />
        {status.last_error_code && <div className="nlm-fact"><dt>마지막 오류 코드</dt><dd className="tk-mono">{status.last_error_code}</dd></div>}
      </dl>
      <p className="nlm-note nlm-note--protect">{status.session.protection}</p>

      <Capabilities status={status} />
      <Metrics status={status} />

      <Dialog
        open={confirmResume}
        onClose={() => setConfirmResume(false)}
        size="sm"
        title="보안 확인 뒤 재개할까요?"
        modal
        footer={
          <div className="tk-button-group tk-button-group--end">
            <Button variant="ghost" onClick={() => setConfirmResume(false)}>아직이에요</Button>
            <Button variant="primary" busy={resume.isPending} onClick={() => resume.mutate()}>재개</Button>
          </div>
        }
      >
        <p>Google에서 CAPTCHA나 보안 확인을 <strong>직접 열어 마친 뒤</strong>에만 눌러 주세요.</p>
        <p className="nlm-note">재개는 따까리의 자동 요청을 다시 허용할 뿐 Google 쪽 문제를 풀어 주지 않아요. 확인하지 않고 누르면 같은 신호가 다시 나와 멈출 수 있어요.</p>
      </Dialog>
    </section>
  );
}

/** 상태를 불러오지 못했을 때. 네트워크와 서버 오류를 구분해 보여 준다. */
export function StatusLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return <ErrorNotice error={error} onRetry={onRetry} retryLabel="상태 다시 읽기" />;
}
