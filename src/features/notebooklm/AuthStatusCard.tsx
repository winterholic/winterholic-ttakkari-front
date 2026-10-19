import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cancelNotebookLMLogin, resumeNotebookLM, startNotebookLMLogin, verifyNotebookLM } from "../../api/client";
import type { NlmAuthStatus } from "../../api/notebooklmTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { ErrorNotice } from "./ErrorNotice";
import { LOGIN_LABEL, STATE_LABEL, STATE_SENTENCE, capabilityLabel, describeError, formatRemaining, when } from "./labels";
import { nlmKeys, useCountdown } from "./queries";

const LOGIN_NEEDED = new Set(["login_required", "reauth_required"]);

function SessionRow({ status }: { status: NlmAuthStatus }) {
  const s = status.session;
  return (
    <div className="nlm-fact">
      <dt>세션 저장 방식</dt>
      <dd>
        {s.encrypted ? "암호화해 저장" : "파일 권한으로 보호, 암호화 안 함"}
        {!s.stored && <small>아직 저장된 세션이 없어요.</small>}
        {s.stored && s.permissions_ok === false && <small className="nlm-warn">파일 권한이 기대와 달라요. 소유자 전용(0600)이 아닐 수 있어요.</small>}
        {s.stored && s.cookie_names.length > 0 && <small>쿠키 {s.cookie_names.length}개 저장(이름만 보이고 값은 화면에 오지 않아요)</small>}
      </dd>
    </div>
  );
}

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
  const fail = (e: unknown) => toast({ message: describeError(e).title, tone: "danger" });
  const setStatus = (s: NlmAuthStatus) => {
    qc.setQueryData(nlmKeys.status, s);
    void qc.invalidateQueries({ queryKey: nlmKeys.notebooks });
  };

  const login = useMutation({
    mutationFn: startNotebookLMLogin,
    onSuccess: refresh,
    onError: (e) => { fail(e); void refresh(); },
  });
  const cancel = useMutation({ mutationFn: cancelNotebookLMLogin, onSuccess: refresh, onError: fail });
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
  const loginActive = status.login.active;
  const needsLogin = LOGIN_NEEDED.has(status.state);
  // 연결돼 있을 때는 로그인 버튼을 두지 않는다. 만료되면 reauth_required 로 바뀌며 나타난다.
  const canLogin = !["disabled", "blocked", "ready", "cooldown"].includes(status.state) && !loginActive;
  const loginFinished = !loginActive && ["timeout", "cancelled", "failed"].includes(status.login.state);
  const busy = login.isPending || cancel.isPending || verify.isPending || resume.isPending;

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

      {loginActive && (
        <div className="tk-callout tk-callout--note nlm-login" role="status" data-login={status.login.state}>
          <Icon name="info" className="tk-callout__icon" />
          <div className="tk-callout__body">
            <strong className="tk-callout__title">로그인 창 진행 중</strong>
            <p>{LOGIN_LABEL[status.login.state] || status.login.message}</p>
          </div>
        </div>
      )}
      {loginFinished && <p className="nlm-note" role="status">{LOGIN_LABEL[status.login.state]}</p>}

      <div className="nlm-actions">
        {canLogin && (
          <Button variant={needsLogin ? "primary" : undefined} busy={login.isPending} disabled={busy || !status.browser_available} onClick={() => login.mutate()}>
            <Icon name="key" />{needsLogin ? "로그인 창 열기" : "다시 로그인"}
          </Button>
        )}
        {loginActive && (
          <Button variant="danger" busy={cancel.isPending} onClick={() => cancel.mutate()}>
            <Icon name="x" />로그인 취소
          </Button>
        )}
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
      </div>
      {canLogin && !status.browser_available && <p className="nlm-note nlm-warn">Mac Studio에서 Chrome을 찾지 못해 로그인 창을 열 수 없어요.</p>}
      {canLogin && status.browser_available && (
        <p className="nlm-note">로그인 창은 폰이 아니라 <strong>Mac Studio 화면</strong>에 떠요. 비밀번호는 따까리가 보지 않아요.</p>
      )}

      <dl className="nlm-facts">
        <div className="nlm-fact"><dt>마지막 성공</dt><dd>{when(status.last_ok_at)}</dd></div>
        <div className="nlm-fact"><dt>마지막 확인</dt><dd>{when(status.last_checked_at)}</dd></div>
        <SessionRow status={status} />
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
