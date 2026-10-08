import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { useAuth } from "../auth";
import { useConnection } from "../shell/useConnection";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

/** 남은 시간을 "2분 30초" 꼴로. Retry-After 는 초 단위다. */
export function formatWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}초`;
  return r === 0 ? `${m}분` : `${m}분 ${r}초`;
}

/** 로그인 실패를 해요체 한 문장으로. 무엇이 잘못됐는지 → 지금 할 수 있는 것 순서(docs/10 §3). */
export function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "비밀번호가 맞지 않아요. 다시 입력해 주세요.";
    if (err.status === 429) {
      const wait = err.retryAfter ? ` ${formatWait(err.retryAfter)} 뒤에 다시 시도해 주세요.` : " 잠시 뒤에 다시 시도해 주세요.";
      return `시도가 너무 많았어요.${wait}`;
    }
    if (err.status === 503) return "서버에 로그인 비밀번호가 아직 설정되지 않았어요. Mac Studio 에서 백엔드 설정을 먼저 마쳐 주세요.";
    return `로그인하지 못했어요. ${err.message}`;
  }
  return "Mac Studio 에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.";
}

export function LoginPage() {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const connection = useConnection(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  if (state === "in") return <Navigate to="/chat" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await login(password);
      void navigate("/chat", { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
      setBusy(false);
      input.current?.focus();
    }
  };

  const [dot, text] = !connection.online
    ? ["tk-dot--offline", "오프라인"]
    : connection.mac === "online"
      ? ["tk-dot--online", "Mac Studio 응답 중"]
      : connection.mac === "offline"
        ? ["tk-dot--offline", "Mac Studio 연결 끊김"]
        : ["tk-dot--connecting", "Mac Studio 확인 중"];

  return (
    <>
      <a className="tk-skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <main className="tk-auth tk-dotgrid" id="main" tabIndex={-1}>
        <div className="tk-auth__panel">
          <div className="tk-auth__brand">
            <img src="/brand/logo-mark.svg" alt="" />
            <span className="tk-heading-3">Ttakkari</span>
          </div>
          <div className="tk-stack tk-gap-2">
            <h1 className="tk-display">내 Mac Studio에 연결</h1>
            <p className="tk-body-md tk-text-secondary">
              이 기기에서 따까리에게 일을 시키려면 한 번 인증해야 해요. 연결은 이 기기에만 저장돼요.
            </p>
          </div>
          <form className="tk-card tk-card--lg" onSubmit={(e) => void submit(e)} aria-busy={busy || undefined} noValidate>
            <div className="tk-stack tk-gap-3">
              <div className="tk-field">
                <label className="tk-label" htmlFor="password">
                  비밀번호
                </label>
                <input
                  ref={input}
                  className="tk-input tk-input--lg"
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "password-error" : undefined}
                />
                {error && (
                  <p className="tk-error" id="password-error" role="alert">
                    <Icon name="circle-x" />
                    {error}
                  </p>
                )}
              </div>
              <Button variant="primary" size="lg" block type="submit" busy={busy} disabled={!password}>
                <Icon name="key" />
                {busy ? "확인하는 중" : "로그인"}
              </Button>
            </div>
            <p className="tk-presence tk-presence--plain">
              <span className={`tk-dot ${dot}`} aria-hidden="true" />
              {text}
            </p>
          </form>
          <aside className="tk-callout tk-callout--note" role="note">
            <Icon name="shield" className="tk-callout__icon" />
            <div className="tk-callout__body">
              <strong className="tk-callout__title">파일은 승인 없이 밖으로 나가지 않아요</strong>
              <p>다운로드 링크는 짧게 만료되고, 외부로 보내는 일은 매번 이 기기에서 승인해요.</p>
            </div>
          </aside>
          <p className="tk-auth__foot">Winterholic Ttakkari · 개인용 원격 작업 환경</p>
        </div>
      </main>
    </>
  );
}
