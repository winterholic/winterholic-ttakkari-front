import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { checkTossInvest, getTossInvestLoginHelp, getTossInvestStatus, listTossInvestRuns, openTossInvestLoginWindow, syncTossInvest, ApiError } from "../api/client";
import type { TossInvestRun, TossInvestStatus } from "../api/stocksTypes";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { toast } from "../ui/toastStore";
import "./stocks.css";

const KST = new Intl.DateTimeFormat("ko-KR", {
  month: "long", day: "numeric", weekday: "short",
  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
});
const when = (iso: string | null) => iso ? KST.format(new Date(iso)) : "아직 없음";

function stateLabel(state: string): string {
  switch (state) {
    case "running": return "확인 중";
    case "ready": return "연결됨";
    case "login_required": return "로그인 필요";
    case "login_window": return "로그인 창 열림";
    case "unknown": return "확인 필요";
    case "disabled": return "꺼짐";
    case "error": return "오류";
    case "failed": return "실패";
    case "never_checked": return "미확인";
    default: return state;
  }
}

function stateTone(state: string): string {
  if (state === "login_required" || state === "never_checked" || state === "unknown") return "tk-status--warning";
  if (state === "error" || state === "failed") return "tk-status--danger";
  return "";
}

function runLabel(run: TossInvestRun): string {
  return `${run.kind === "sync" ? "동기화" : "연결 확인"} · ${stateLabel(run.status)}`;
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "rate_limited") return e.message || "조금 뒤에 다시 시도해 주세요.";
    if (e.status === 404) return "백엔드 배포 전이라 아직 쓸 수 없어요. 배포 뒤에 다시 시도해 주세요.";
  }
  return "요청하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function statusErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) {
    return "백엔드에 아직 토스증권 연결 기능이 없어요. 백엔드 배포 뒤에 다시 열어 주세요.";
  }
  return "연결 상태를 불러오지 못했어요.";
}

function loginWindowErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return "백엔드에 아직 로그인 창 열기 기능이 없어요. 백엔드 배포 뒤에 다시 시도해 주세요.";
    if (e.message) return e.message;
  }
  return "로그인 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.";
}

/** 사람 수준 빈도를 지키려고 다음 확인까지 기다려야 하는 초. 기다릴 필요 없으면 null. */
function nextWaitSeconds(status: TossInvestStatus): number | null {
  const last = status.last_run;
  if (!last || !status.check_interval_seconds) return null;
  const at = Math.max(Date.parse(last.created_at), Date.parse(last.updated_at));
  if (!Number.isFinite(at)) return null;
  const remain = status.check_interval_seconds - (Date.now() - at) / 1000;
  return remain > 0 ? Math.ceil(remain) : null;
}

function StatusCard({ status }: { status: TossInvestStatus }) {
  const wait = nextWaitSeconds(status);
  return <section className="tk-section" aria-labelledby="toss-status-title">
    <div className="tk-section__head">
      <h2 id="toss-status-title" className="tk-section__title">연결 상태</h2>
      <span className={`tk-status ${stateTone(status.state)}`} role="status">{stateLabel(status.state)}</span>
    </div>
    <p className="stocks-message">{status.message}</p>
    <dl className="stocks-facts">
      <div><dt>로그인 세션</dt><dd>{status.logged_in === null || status.logged_in === undefined ? "모름" : status.logged_in ? "유효" : "없음"}</dd></div>
      <div><dt>마지막 확인</dt><dd>{when(status.checked_at)}</dd></div>
      <div><dt>브라우저</dt><dd>{status.browser_available ? "Chrome 있음" : "Chrome 없음"}</dd></div>
      <div><dt>전용 프로필</dt><dd>{status.profile_exists ? "있음" : "아직 없음"}</dd></div>
      {wait !== null && <div><dt>다음 확인까지</dt><dd>약 {wait}초</dd></div>}
      {status.last_run?.page_title && <div><dt>마지막 페이지</dt><dd>{status.last_run.page_title}</dd></div>}
    </dl>
  </section>;
}

export function TossInvestPage() {
  const qc = useQueryClient();
  const statusQuery = useQuery({ queryKey: ["stocks", "tossinvest", "status"], queryFn: getTossInvestStatus });
  const runsQuery = useQuery({ queryKey: ["stocks", "tossinvest", "runs"], queryFn: () => listTossInvestRuns(20) });
  const helpQuery = useQuery({ queryKey: ["stocks", "tossinvest", "help"], queryFn: getTossInvestLoginHelp });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["stocks"] });
  };
  useForegroundResync(refresh);
  const check = useMutation({
    mutationFn: checkTossInvest,
    onSuccess: refresh,
    onError: (e) => toast({ message: errorMessage(e), tone: "danger" }),
  });
  const sync = useMutation({
    mutationFn: syncTossInvest,
    onSuccess: refresh,
    onError: (e) => toast({ message: errorMessage(e), tone: "danger" }),
  });
  const loginWindow = useMutation({
    mutationFn: openTossInvestLoginWindow,
    onSuccess: (res) => {
      toast({ message: res.message || "로그인 창이 열렸습니다.", tone: "success" });
      refresh();
    },
    onError: (e) => toast({ message: loginWindowErrorMessage(e), tone: "danger" }),
  });
  const busy = check.isPending || sync.isPending || loginWindow.isPending;
  const status = statusQuery.data;
  const needsLogin = status?.state === "login_required" || status?.state === "never_checked" || (status ? !status.profile_exists : false);
  const windowOpen = status?.state === "login_window";
  return <div className="tk-screen stocks-page">
    <PageHeader title="토스증권 연결" />
    <div className="tk-screen__body"><div className="tk-container tk-container--md">
      <nav className="stocks-crumb" aria-label="상위 메뉴"><Link to="/stocks">주식 투자</Link><span aria-hidden="true"> / </span><span aria-current="page">토스증권 연결</span></nav>
      <header className="stocks-heading">
        <div>
          <p className="stocks-eyebrow">읽기 전용 모니터링 · 사람 수준 저빈도</p>
          <h1>토스증권 연결</h1>
          <p>저장된 로그인으로 토스증권을 읽기만 한다. 주문·매수·매도·이체 기능은 없다.</p>
        </div>
        <div className="stocks-actions">
          <Button variant="primary" busy={check.isPending} disabled={busy} onClick={() => check.mutate()}>
            <Icon name="retry" />{check.isPending ? "확인 중" : "연결 확인"}
          </Button>
          <Button busy={sync.isPending} disabled={busy} onClick={() => sync.mutate()}>
            <Icon name="download" />{sync.isPending ? "동기화 중" : "동기화"}
          </Button>
        </div>
      </header>

      {statusQuery.isPending && <p className="tk-status" role="status" aria-busy="true"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />연결 상태를 불러오는 중</p>}
      {statusQuery.isError && <div className="stocks-state" role="alert"><strong>{statusErrorMessage(statusQuery.error)}</strong><Button variant="ghost" onClick={() => void statusQuery.refetch()}>다시 시도</Button></div>}
      {status && <StatusCard status={status} />}

      {windowOpen && <section className="tk-section" aria-labelledby="toss-window-title">
        <div className="tk-section__head"><h2 id="toss-window-title" className="tk-section__title">로그인 진행 중</h2></div>
        <p className="stocks-message" role="status">로그인 창이 열려 있습니다. 로그인 후 창을 닫아 주세요.</p>
        <p className="stocks-note">창을 닫은 뒤 위의 '연결 확인'을 누르면 로그인 상태를 확인합니다.</p>
      </section>}

      {needsLogin && !windowOpen && <section className="tk-section" aria-labelledby="toss-login-title">
        <div className="tk-section__head"><h2 id="toss-login-title" className="tk-section__title">최초 1회 로그인</h2></div>
        <div className="stocks-actions">
          <Button busy={loginWindow.isPending} disabled={loginWindow.isPending} onClick={() => loginWindow.mutate()}>
            {loginWindow.isPending ? "로그인 창 여는 중" : "토스증권 로그인 창 열기"}
          </Button>
        </div>
        {loginWindow.data && <p className="stocks-message" role="status">{loginWindow.data.message}</p>}
        {loginWindow.isError && <p className="stocks-message" role="alert">{loginWindowErrorMessage(loginWindow.error)}</p>}
        {helpQuery.isPending && <p className="tk-status" role="status" aria-busy="true"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />로그인 안내를 불러오는 중</p>}
        {helpQuery.isError && <p className="stocks-note" role="alert">단계 안내를 불러오지 못했어요. 위 버튼으로 창을 먼저 열어 로그인해 주세요.</p>}
        {helpQuery.data && <>
          <ol className="stocks-steps">
            {helpQuery.data.steps.map((step, i) => <li key={i}>{step}</li>)}
          </ol>
          <p className="stocks-command-label">터미널에 그대로 붙여 넣으세요</p>
          <pre className="stocks-command"><code>{helpQuery.data.open_command.join(" ")}</code></pre>
          <p className="stocks-note">{helpQuery.data.note}</p>
        </>}
        <p className="stocks-note">창에서 로그인한 뒤 창을 닫고, 위의 '연결 확인'을 눌러 주세요.</p>
      </section>}

      <section className="tk-section" aria-labelledby="toss-runs-title">
        <div className="tk-section__head"><h2 id="toss-runs-title" className="tk-section__title">최근 수집 작업</h2></div>
        {runsQuery.isPending && <p className="tk-status" role="status" aria-busy="true"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />작업 기록을 불러오는 중</p>}
        {runsQuery.isError && <p className="tk-status tk-status--warning" role="alert">작업 기록을 불러오지 못했어요.</p>}
        {runsQuery.data && runsQuery.data.length === 0 && <p className="stocks-muted">아직 확인·동기화 기록이 없어요.</p>}
        {runsQuery.data && runsQuery.data.length > 0 && <ul className="stocks-runs">
          {runsQuery.data.map(run => <li key={run.id}>
            <strong>{runLabel(run)}</strong>
            <span>{when(run.created_at)}{run.duration_ms !== null && run.duration_ms !== undefined ? ` · ${run.duration_ms}ms` : ""}</span>
            {run.message && <small>{run.message}</small>}
            {run.api_paths.length > 0 && <small className="stocks-muted">관측 {run.api_paths.length}개 경로</small>}
          </li>)}
        </ul>}
      </section>
    </div></div>
  </div>;
}
