import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkArtcraftRemote, controlArtcraftApp, getArtcraftJob, runArtcraftSmoke } from "../../api/client";
import type { ArtcraftApp, ArtcraftJob, ArtcraftOverview } from "../../api/artcraftTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { ago, copyText, updateSteps } from "./format";

const ACTIVE = new Set(["queued", "running"]);
const isActive = (j: ArtcraftJob | undefined) => Boolean(j && ACTIVE.has(j.state));
const JOB_TITLE: Record<string, string> = {
  "remote-check": "최신 버전 확인",
  "smoke-cli": "CLI 스모크",
  "smoke-full": "GUI 포함 스모크",
  "gui-start": "앱 실행",
  "gui-stop": "앱 종료",
};
const JOB_TONE = { queued: "info", running: "info", succeeded: "success", failed: "danger", timeout: "danger" } as const;
const JOB_STATE = { queued: "대기", running: "진행 중", succeeded: "완료", failed: "실패", timeout: "시간 초과" } as const;

function JobBanner({ jobId, onDone, onDismiss }: { jobId: string; onDone: () => void; onDismiss: () => void }) {
  const job = useQuery({
    queryKey: ["artcraft", "job", jobId],
    queryFn: () => getArtcraftJob(jobId),
    refetchInterval: (q) => (isActive(q.state.data) || !q.state.data ? 1500 : false),
  });
  const state = job.data?.state;
  useEffect(() => {
    if (state && !ACTIVE.has(state)) onDone();
    // 끝난 순간 한 번만 목록을 새로 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  if (job.isError) {
    return (
      <div className="ac-job" role="status">
        <p className="ac-job__title">작업 상태를 읽지 못했어요. 서버가 다시 시작되면 작업 기록이 지워져요.</p>
        <Button size="xs" variant="ghost" onClick={onDismiss}>닫기</Button>
      </div>
    );
  }
  const j = job.data;
  if (!j) return <p className="ac-job" role="status"><span className="tk-spinner tk-spinner--xs" aria-hidden="true" />작업 상태를 읽는 중</p>;
  return (
    <div className="ac-job" role="status" aria-label="진행 중인 작업">
      <div className="ac-job__head">
        {isActive(j) && <span className="tk-spinner tk-spinner--xs" aria-hidden="true" />}
        <span className="ac-job__title">{JOB_TITLE[j.action] ?? j.action}{j.apps.length === 1 ? ` · ${j.apps[0]}` : ""}</span>
        <Badge tone={JOB_TONE[j.state]}>{JOB_STATE[j.state]}</Badge>
        {!isActive(j) && <Button size="xs" variant="ghost" onClick={onDismiss}>닫기</Button>}
      </div>
      {j.summary && <p className="ac-job__summary">{j.summary}</p>}
      {j.output && !isActive(j) && (
        <details className="ac-job__log">
          <summary>출력 보기</summary>
          <pre className="ac-pre" tabIndex={0}>{j.output}</pre>
        </details>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function VersionBadge({ app }: { app: ArtcraftApp }) {
  if (app.latest.update_available) return <Badge tone="warning">업데이트 가능</Badge>;
  if (app.latest.update_available === false) return <Badge tone="success">최신</Badge>;
  return <Badge>확인 전</Badge>;
}

function AppCard({ app, locked, onStart, onStop, onSmoke, onUpdate, onGoto }: {
  app: ArtcraftApp;
  locked: boolean;
  onStart: () => void;
  onStop: () => void;
  onSmoke: () => void;
  onUpdate: () => void;
  onGoto: (tab: "bugs" | "agent", key: string) => void;
}) {
  const { installed, latest, smoke, mcp, gui, auth } = app;
  const external = gui.listening && !gui.running;
  return (
    <li className="ac-card" aria-label={app.title} data-update={latest.update_available ? "true" : undefined}>
      <div className="ac-card__head">
        <div className="ac-card__title">
          <h3>{app.title}</h3>
          <span className="ac-card__domain" title={app.domain ?? undefined}>{app.domain}</span>
        </div>
        <div className="ac-card__badges">
          {app.site_status && <Badge>{app.site_status}</Badge>}
          {!app.healthy && <Badge tone="danger">이상</Badge>}
          <VersionBadge app={app} />
        </div>
      </div>
      <dl className="ac-dl">
        <Row label="설치 버전">
          <span className="ac-mono">{installed.release ? `v${installed.release}` : "-"}</span> 릴리스
          {installed.source_build && (
            <span className="ac-sub">소스 빌드 <span className="ac-mono">{installed.source_build.commit ?? "-"}</span></span>
          )}
        </Row>
        <Row label="최신 업스트림">
          {latest.tag ? <span className="ac-mono">{latest.tag}</span> : "아직 확인하지 않았어요"}
          {latest.checked_at && <span className="ac-sub">{ago(latest.checked_at)} 확인</span>}
        </Row>
        <Row label="CLI 스모크">
          {smoke ? (
            <>
              <Badge tone={smoke.passed === smoke.total && !smoke.error ? "success" : "danger"}>{smoke.error ? "오류" : `${smoke.passed}/${smoke.total} 통과`}</Badge>
              <span className="ac-sub">{ago(smoke.ts)}{smoke.source === "ttakkari" ? " · 이 화면에서 실행" : ""}</span>
              {smoke.failed[0] && <span className="ac-sub ac-sub--danger">실패: {smoke.failed[0].test}</span>}
            </>
          ) : "기록 없음"}
        </Row>
        <Row label="MCP 도구">
          {mcp ? (mcp.ok ? <><span className="ac-mono">{mcp.tool_count ?? "?"}개</span> <Badge tone="success">응답</Badge></> : <Badge tone="danger">응답 없음</Badge>) : "-"}
        </Row>
        <Row label="UI 제어 포트">
          {gui.running ? <Badge tone="success">실행 중</Badge> : external ? <Badge tone="warning">외부에서 실행 중</Badge> : <Badge>꺼짐</Badge>}
          <span className="ac-sub ac-mono">{gui.port ? `127.0.0.1:${gui.port}` : gui.transport === "file" ? "파일 기반" : "-"}</span>
        </Row>
        <Row label="인증">
          <Badge tone={auth.protected ? "success" : "warning"}>{auth.label}</Badge>
          {!auth.protected && <span className="ac-sub">같은 Mac 의 누구나 제어할 수 있어요</span>}
        </Row>
      </dl>
      {app.known_bugs.length > 0 && (
        <p className="ac-chips" aria-label="알려진 버그">
          {app.known_bugs.map((id) => (
            <button key={id} type="button" className="tk-chip" onClick={() => onGoto("bugs", id)}><span>{id}</span></button>
          ))}
        </p>
      )}
      <div className="ac-actions">
        {gui.running ? (
          <Button size="sm" variant="danger" disabled={locked} onClick={onStop}><Icon name="stop" />종료</Button>
        ) : (
          <Button size="sm" disabled={locked || external} onClick={onStart}><Icon name="play" />실행</Button>
        )}
        <Button size="sm" variant="ghost" disabled={locked} onClick={onSmoke}><Icon name="circle-check" />스모크</Button>
        <Button size="sm" variant="ghost" onClick={() => onGoto("agent", app.app)}><Icon name="terminal" />MCP 설정</Button>
        {latest.update_available && <Button size="sm" variant="ghost" onClick={onUpdate}><Icon name="download" />업데이트 방법</Button>}
      </div>
    </li>
  );
}

type Confirm = { kind: "stop"; app: ArtcraftApp } | { kind: "smoke-full" } | null;

export function AppsTab({ data, onGoto }: { data: ArtcraftOverview; onGoto: (tab: "bugs" | "agent", key: string) => void }) {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [update, setUpdate] = useState<ArtcraftApp | null>(null);
  const activeJob = data.jobs.find(isActive);
  // 새로고침으로 돌아와도 서버에서 도는 작업을 이어서 본다
  const shownId = jobId ?? (activeJob && activeJob.id !== dismissed ? activeJob.id : null);
  // 최신 버전 확인은 다른 작업과 겹쳐도 된다. 스모크·앱 실행·종료만 서로 막는다.
  const locked = data.jobs.some((j) => isActive(j) && j.kind !== "remote");
  const refetch = () => void qc.invalidateQueries({ queryKey: ["artcraft", "apps"] });
  const onError = (e: unknown) => toast({ message: errorText(e).message, tone: "danger" });
  const started = (job: ArtcraftJob) => {
    setJobId(job.id);
    refetch();
  };
  const remote = useMutation({ mutationFn: () => checkArtcraftRemote(), onSuccess: started, onError });
  const smoke = useMutation({ mutationFn: (v: Parameters<typeof runArtcraftSmoke>[0]) => runArtcraftSmoke(v), onSuccess: started, onError });
  const control = useMutation({ mutationFn: (v: { app: string; action: "start" | "stop"; confirm?: boolean }) => controlArtcraftApp(v.app, v), onSuccess: started, onError });

  const updates = data.apps.filter((a) => a.latest.update_available).length;
  const running = data.apps.filter((a) => a.gui.running).length;
  const busy = remote.isPending || smoke.isPending || control.isPending;
  const closeConfirm = () => setConfirm(null);

  return (
    <section className="ac-stack" aria-label="앱 목록">
      <div className="ac-card ac-card--summary">
        <p className="ac-summary" aria-label="요약">
          <Badge>{data.apps.length}개 앱</Badge>
          <Badge tone={running ? "success" : undefined}>실행 중 {running}</Badge>
          <Badge tone={updates ? "warning" : undefined}>업데이트 가능 {updates}</Badge>
        </p>
        <p className="ac-note">
          {data.remote.checked_at ? `최신 버전은 ${ago(data.remote.checked_at)}에 확인했어요.` : "최신 버전을 아직 확인하지 않았어요."}
          {data.remote.error && ` (${data.remote.error})`}
        </p>
        <div className="ac-actions">
          <Button size="sm" variant="ghost" busy={remote.isPending || data.remote.checking} onClick={() => remote.mutate()}>
            <Icon name="retry" />최신 버전 확인
          </Button>
          <Button size="sm" variant="ghost" busy={smoke.isPending} disabled={locked || busy} onClick={() => smoke.mutate({ mode: "cli" })}>
            <Icon name="circle-check" />CLI 스모크(전체)
          </Button>
          <Button size="sm" variant="ghost" disabled={locked || busy} onClick={() => setConfirm({ kind: "smoke-full" })}>
            <Icon name="presentation" />GUI 포함 스모크…
          </Button>
        </div>
        {data.stale && <p className="tk-error" role="alert">상태를 새로 읽지 못해 이전 값을 보여 줘요. {data.error}</p>}
      </div>
      {shownId && <JobBanner jobId={shownId} onDone={refetch} onDismiss={() => { setDismissed(shownId); setJobId(null); }} />}
      <ul className="ac-list">
        {data.apps.map((app) => (
          <AppCard
            key={app.app}
            app={app}
            locked={locked || busy}
            onStart={() => control.mutate({ app: app.app, action: "start" })}
            onStop={() => setConfirm({ kind: "stop", app })}
            onSmoke={() => smoke.mutate({ apps: [app.app], mode: "cli" })}
            onUpdate={() => setUpdate(app)}
            onGoto={onGoto}
          />
        ))}
      </ul>
      <Dialog
        open={confirm?.kind === "stop"}
        onClose={closeConfirm}
        size="sm"
        modal
        title={confirm?.kind === "stop" ? `${confirm.app.title} 종료` : "앱 종료"}
        footer={
          <div className="tk-button-group tk-button-group--end">
            <Button variant="ghost" onClick={closeConfirm}>취소</Button>
            <Button variant="danger" onClick={() => {
              if (confirm?.kind === "stop") control.mutate({ app: confirm.app.app, action: "stop", confirm: true });
              closeConfirm();
            }}>종료</Button>
          </div>
        }
      >
        <p>열려 있는 문서를 저장하지 않았다면 사라질 수 있어요. 관제가 켠 앱만 종료할 수 있고, 5초 안에 닫히지 않으면 강제로 끝내요.</p>
      </Dialog>
      <Dialog
        open={confirm?.kind === "smoke-full"}
        onClose={closeConfirm}
        size="sm"
        modal
        title="GUI 포함 스모크"
        footer={
          <div className="tk-button-group tk-button-group--end">
            <Button variant="ghost" onClick={closeConfirm}>취소</Button>
            <Button onClick={() => {
              smoke.mutate({ mode: "full", confirm: true });
              closeConfirm();
            }}>실행</Button>
          </div>
        }
      >
        <p>13개 앱의 창을 차례로 열었다가 닫아요. 몇 분 걸리고 Mac Studio 화면에 창이 보여요. 화면이 잠겨 있으면 스크린샷 확인이 실패할 수 있어요.</p>
        <p>이미 실행 중인 앱이 있으면 그 앱이 닫히지 않도록 시작하지 않아요. 먼저 종료해 주세요.</p>
      </Dialog>
      <Dialog open={Boolean(update)} onClose={() => setUpdate(null)} size="lg" title={update ? `${update.title} 업데이트 방법` : "업데이트 방법"}>
        {update && (
          <div className="ac-stack">
            <p>
              설치된 <span className="ac-mono">v{update.installed.release}</span>보다 새 릴리스 <span className="ac-mono">{update.latest.tag}</span>가 있어요.
              이 화면은 설치·업데이트를 대신 실행하지 않아요(설치 상태를 망가뜨릴 수 있어서요). Mac Studio 터미널이나 에이전트에서 아래 절차를 따르세요.
            </p>
            <pre className="ac-pre" tabIndex={0}>{updateSteps(update.app)}</pre>
            <Button size="sm" onClick={() => copyText(updateSteps(update.app), "업데이트 절차")}><Icon name="copy" />절차 복사</Button>
          </div>
        )}
      </Dialog>
    </section>
  );
}
