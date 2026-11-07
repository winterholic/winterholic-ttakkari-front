import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError, applyArtcraftUpdate, checkArtcraftRemote, controlArtcraftApp, getArtcraftAppUpdate, getArtcraftJob,
  getArtcraftUpdateStatus, rollbackArtcraftUpdate, runArtcraftSmoke,
} from "../../api/client";
import type { ArtcraftApp, ArtcraftJob, ArtcraftOverview, ArtcraftUpdateInfo, ArtcraftUpdateRecord } from "../../api/artcraftTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { ago } from "./format";

const ACTIVE = new Set(["queued", "running"]);
const isActive = (j: ArtcraftJob | undefined) => Boolean(j && ACTIVE.has(j.state));
const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;
const JOB_TITLE: Record<string, string> = {
  "remote-check": "최신 버전 확인",
  "smoke-cli": "CLI 스모크",
  "smoke-full": "GUI 포함 스모크",
  "gui-start": "앱 실행",
  "gui-stop": "앱 종료",
  "update-apply": "앱 업데이트",
  "update-rollback": "이전 버전 복구",
};
const JOB_TONE = { queued: "info", running: "info", succeeded: "success", failed: "danger", timeout: "danger", interrupted: "danger" } as const;
const JOB_STATE = { queued: "대기", running: "진행 중", succeeded: "완료", failed: "실패", timeout: "시간 초과", interrupted: "중단" } as const;

function JobBanner({ jobId, updateApp, onDone, onDismiss, onRecover }: { jobId: string; updateApp?: ArtcraftApp; onDone: () => void; onDismiss: () => void; onRecover: () => void }) {
  const job = useQuery({
    queryKey: ["artcraft", "job", jobId],
    queryFn: () => getArtcraftJob(jobId),
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
    refetchInterval: (q) => (isNotFound(q.state.error) ? false : isActive(q.state.data) || !q.state.data ? 1500 : false),
  });
  const updateState = useQuery({
    queryKey: [...updateKey(updateApp?.app ?? ""), "status"],
    queryFn: () => getArtcraftUpdateStatus(updateApp!.app),
    enabled: Boolean(updateApp),
    refetchInterval: (q) => {
      const status = q.state.data?.last_status;
      return status?.job_id === jobId && ACTIVE.has(status.status) ? 1500 : false;
    },
  });
  const record = updateState.data?.last_status;
  const fallbackRecord = job.isError && isNotFound(job.error) && updateApp && record?.job_id === jobId ? record : null;
  const fallbackApp = fallbackRecord ? updateApp : null;
  const terminalFallback = fallbackRecord && (fallbackRecord.status === "succeeded" || fallbackRecord.status === "failed" || fallbackRecord.status === "interrupted")
    ? fallbackRecord.status
    : null;
  const terminalState = job.data && !ACTIVE.has(job.data.state)
    ? job.data.state
    : terminalFallback;
  const notifiedJobId = useRef<string | null>(null);
  useEffect(() => {
    if (terminalState && notifiedJobId.current !== jobId) {
      notifiedJobId.current = jobId;
      onDone();
    }
  }, [jobId, onDone, terminalState]);
  if (fallbackRecord && fallbackApp && (fallbackRecord.status === "queued" || fallbackRecord.status === "running")) {
    return (
      <div className="ac-job" role="status" aria-label="진행 중인 작업">
        <div className="ac-job__head"><span className="tk-spinner tk-spinner--xs" aria-hidden="true" />
          <span className="ac-job__title">{JOB_TITLE[fallbackRecord.action] ?? fallbackRecord.action}{fallbackRecord.action === "update-apply" || fallbackRecord.action === "update-rollback" ? ` · ${fallbackApp.app}` : ""}</span>
          <Badge tone="info">{JOB_STATE[fallbackRecord.status]}</Badge>
        </div>
        {fallbackRecord.error && <p className="ac-job__summary">{fallbackRecord.error}</p>}
      </div>
    );
  }
  if (fallbackRecord && fallbackApp && fallbackRecord.status === "failed" && updateState.data?.state === "failed") {
    return (
      <div className="ac-job" role="status" aria-label="업데이트 복구 실패">
        <div className="ac-job__head"><span className="ac-job__title">{fallbackApp.title} 이전 설치를 복구하지 못했어요.</span><Badge tone="danger">실패</Badge></div>
        {fallbackRecord.error && <p className="tk-error" role="alert">{fallbackRecord.error}</p>}
        <Button size="xs" variant="ghost" onClick={onRecover}>업데이트 관리 열기</Button>
      </div>
    );
  }
  if (fallbackRecord && fallbackApp && fallbackRecord.status === "interrupted" && updateState.data?.state === "interrupted") {
    return (
      <div className="ac-job" role="status" aria-label="업데이트 복구 상태">
        <div className="ac-job__head"><span className="ac-job__title">{fallbackApp.title} 업데이트 작업이 서버 재시작으로 중단됐어요.</span><Badge tone="danger">중단</Badge></div>
        {fallbackRecord.error && <p className="ac-job__summary">{fallbackRecord.error}</p>}
        <Button size="xs" variant="ghost" onClick={onRecover}>업데이트 관리 열기</Button>
      </div>
    );
  }
  if (fallbackRecord && fallbackApp && (fallbackRecord.status === "succeeded" || fallbackRecord.status === "failed" || fallbackRecord.status === "interrupted")) {
    const labels = { succeeded: "완료", failed: "실패", interrupted: "중단" } as const;
    return (
      <div className="ac-job" role="status" aria-label="업데이트 결과">
        <div className="ac-job__head"><span className="ac-job__title">{fallbackApp.title} {fallbackRecord.action === "update-rollback" ? "이전 버전 복구" : "업데이트"}</span><Badge tone={fallbackRecord.status === "succeeded" ? "success" : "danger"}>{labels[fallbackRecord.status]}</Badge></div>
        {fallbackRecord.error && <p className="ac-job__summary">{fallbackRecord.error}</p>}
        <p className="ac-job__summary">{fallbackRecord.from_version ?? "알 수 없음"} → {fallbackRecord.to_version ?? "알 수 없음"}</p>
        <Button size="xs" variant="ghost" onClick={onRecover}>업데이트 관리 열기</Button>
      </div>
    );
  }
  if (job.isError) {
    const message = isNotFound(job.error)
      ? "작업 기록을 찾을 수 없습니다. 서버가 다시 시작되면 기록이 지워질 수 있어요."
      : errorText(job.error).message;
    return (
      <div className="ac-job" role="status">
        <p className="ac-job__title">작업 상태를 읽지 못했어요. {message}</p>
        {updateApp && <Button size="xs" variant="ghost" onClick={onRecover}>업데이트 관리 열기</Button>}
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

const updateKey = (app: string) => ["artcraft", "app-update", app] as const;
const UPDATE_STATE: Record<string, string> = {
  idle: "대기", queued: "대기", running: "진행 중", succeeded: "완료", failed: "실패", interrupted: "중단",
};

function UpdateRecord({ record }: { record: ArtcraftUpdateRecord }) {
  const action = record.action === "update-rollback" ? "이전 버전 복구" : "업데이트";
  return (
    <li className="ac-update__history-item">
      <div className="ac-update__history-head">
        <strong>{action}</strong>
        <Badge tone={record.status === "succeeded" ? "success" : record.status === "failed" || record.status === "interrupted" ? "danger" : "info"}>
          {UPDATE_STATE[record.status] ?? record.status}
        </Badge>
        <time className="ac-sub" dateTime={record.at}>{ago(record.at)}</time>
      </div>
      <p className="ac-sub">{record.from_version ?? "알 수 없음"} → {record.to_version ?? "알 수 없음"}</p>
      {record.error && <p className="tk-error" role="alert">{record.error}</p>}
    </li>
  );
}

function AppUpdateDialog({ app, onClose, onJobStarted }: { app: ArtcraftApp; onClose: () => void; onJobStarted: (job: ArtcraftJob) => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<"update" | "rollback" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const preview = useQuery({ queryKey: updateKey(app.app), queryFn: () => getArtcraftAppUpdate(app.app) });
  const history = useQuery({
    queryKey: [...updateKey(app.app), "status"],
    queryFn: () => getArtcraftUpdateStatus(app.app),
    refetchInterval: (q) => q.state.data && ["queued", "running"].includes(q.state.data.state) ? 1500 : false,
  });
  const refresh = useMutation({
    mutationFn: () => getArtcraftAppUpdate(app.app, true),
    onSuccess: (value) => {
      qc.setQueryData(updateKey(app.app), value);
      void qc.invalidateQueries({ queryKey: ["artcraft", "apps"] });
    },
    onError: (e) => setActionError(errorText(e).message),
  });
  const apply = useMutation({
    mutationFn: (value: ArtcraftUpdateInfo) => applyArtcraftUpdate(app.app, {
      ...(value.latest_release?.tag ? { tag: value.latest_release.tag } : {}), confirm: true,
    }),
    onSuccess: (job) => {
      setActionError(null);
      void qc.invalidateQueries({ queryKey: [...updateKey(app.app), "status"] });
      onJobStarted(job);
      onClose();
    },
    onError: (e) => {
      setActionError(errorText(e).message);
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: updateKey(app.app) });
      void qc.invalidateQueries({ queryKey: [...updateKey(app.app), "status"] });
      refresh.mutate();
    },
  });
  const rollback = useMutation({
    mutationFn: () => rollbackArtcraftUpdate(app.app, { confirm: true }),
    onSuccess: (job) => {
      setActionError(null);
      void qc.invalidateQueries({ queryKey: [...updateKey(app.app), "status"] });
      onJobStarted(job);
      onClose();
    },
    onError: (e) => {
      setActionError(errorText(e).message);
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: updateKey(app.app) });
      void qc.invalidateQueries({ queryKey: [...updateKey(app.app), "status"] });
      refresh.mutate();
    },
  });
  const value = preview.data;
  const isBusy = value?.busy ?? app.update_busy ?? false;
  const canUpdate = Boolean(value?.can_update && value.update_available && !isBusy);
  const canRollback = Boolean(value?.can_rollback && !isBusy);
  const loadingError = preview.isError ? errorText(preview.error).message : history.isError ? errorText(history.error).message : null;
  const refreshPreview = () => { setActionError(null); refresh.mutate(); };

  return (
    <>
      <Dialog open={confirm === null} onClose={() => { if (confirm === null) onClose(); }} size="lg" title={`${app.title} 업데이트 관리`} modal>
        <div className="ac-stack">
          {preview.isPending ? <p role="status"><span className="tk-spinner tk-spinner--xs" aria-hidden="true" />앱 버전과 업데이트 가능 여부를 확인하고 있어요.</p> : value && (
            <>
              <div className="ac-card ac-update__plan">
                <h3>앱 버전</h3>
                <p>설치 버전 <span className="ac-mono">{value.installed_version ?? "확인할 수 없음"}</span>
                  {value.latest_release?.version && <> → <span className="ac-mono">{value.latest_release.version}</span></>}
                </p>
                {value.latest_release?.tag && <p>공식 릴리스 <span className="ac-mono">{value.latest_release.tag}</span></p>}
                {value.latest_release?.asset_name && <p className="ac-sub">받을 파일: <span className="ac-mono">{value.latest_release.asset_name}</span></p>}
                {value.latest_release?.published_at && <p className="ac-sub">릴리스 날짜 <time dateTime={value.latest_release.published_at}>{ago(value.latest_release.published_at)}</time></p>}
                {value.busy && <p className="tk-status tk-status--agent" role="alert">지금 적용할 수 없어요. {value.busy_reason ?? "이 앱을 사용 중인 작업이 있어요."}</p>}
                {!value.latest_release && <p className="ac-note">최신 릴리스 정보가 없어요. 최신 정보를 다시 확인해 주세요.</p>}
                {value.latest_release && !value.update_available && <p className="ac-note">현재 설치된 버전이 최신이에요.</p>}
              </div>
              <div className="ac-actions">
                <Button size="sm" variant="ghost" busy={refresh.isPending} onClick={refreshPreview}><Icon name="retry" />최신 정보 확인</Button>
                {value.update_available && value.latest_release && <Button size="sm" disabled={!canUpdate} onClick={() => canUpdate && setConfirm("update")}>v{value.latest_release.version} 업데이트</Button>}
                {value.can_update && value.update_available && !isBusy && !canUpdate && <p className="ac-note">업데이트 계획을 확인할 수 없어 적용을 잠갔어요.</p>}
                {canRollback && <Button size="sm" variant="ghost" onClick={() => setConfirm("rollback")}>{value.previous_version ? `${value.previous_version}으로 복구` : "이전 버전으로 복구"}</Button>}
              </div>
            </>
          )}
          {loadingError && <p className="tk-error" role="alert">{loadingError}</p>}
          {(preview.isError || loadingError) && <Button size="sm" variant="ghost" onClick={() => { void preview.refetch(); void history.refetch(); }}>다시 불러오기</Button>}
          {history.data && (
            <section className="ac-update__history" aria-label="업데이트 이력">
              <h3>업데이트 이력</h3>
              <p className="ac-sub">현재 설치 버전 {history.data.current_version ?? "확인할 수 없음"}
                {history.data.previous_version && ` · 복구 가능 ${history.data.previous_version}`}
              </p>
              {history.data.error && <p className="tk-error" role="alert">{history.data.error}</p>}
              {history.data.history.length > 0 ? <ol className="ac-update__history-list">{history.data.history.slice(-5).reverse().map((record) => <UpdateRecord key={`${record.job_id}-${record.at}`} record={record} />)}</ol>
                : <p className="ac-note">아직 업데이트 기록이 없어요.</p>}
            </section>
          )}
          {actionError && <p className="tk-error" role="alert">요청을 처리하지 못했어요. {actionError}</p>}
        </div>
      </Dialog>
      <Dialog
        open={confirm === "update"}
        onClose={() => setConfirm(null)}
        size="sm"
        title={`${app.title} 업데이트 확인`}
        modal
        footer={<div className="tk-button-group tk-button-group--end">
          <Button variant="ghost" onClick={() => setConfirm(null)}>취소</Button>
          <Button busy={apply.isPending} disabled={!value || !canUpdate} onClick={() => value && apply.mutate(value)}>업데이트 적용</Button>
        </div>}
      >
        <p>공식 릴리스 {value?.latest_release?.tag ?? "최신 버전"}을 설치하고 적용 후 검사를 실행해요. 검사가 실패하면 백엔드가 이전 설치판 복구를 시도합니다.</p>
      </Dialog>
      <Dialog
        open={confirm === "rollback"}
        onClose={() => setConfirm(null)}
        size="sm"
        title={`${app.title} 이전 버전 복구 확인`}
        modal
        footer={<div className="tk-button-group tk-button-group--end">
          <Button variant="ghost" onClick={() => setConfirm(null)}>취소</Button>
          <Button variant="danger" busy={rollback.isPending} disabled={!canRollback} onClick={() => rollback.mutate()}>이전 버전으로 복구</Button>
        </div>}
      >
        <p>현재 버전을 보존된 이전 버전 <span className="ac-mono">{value?.previous_version}</span>으로 바꿔요. 앱이 사용 중이면 백엔드가 요청을 거절합니다.</p>
      </Dialog>
    </>
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
        <Button size="sm" variant="ghost" onClick={onUpdate}><Icon name="download" />업데이트 관리</Button>
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
  const [updateJobApp, setUpdateJobApp] = useState<string | null>(null);
  const activeJob = data.jobs.find(isActive);
  const recoveryApp = updateJobApp ?? (activeJob?.kind === "update" ? activeJob.apps[0] : null);
  // 새로고침으로 돌아와도 서버에서 도는 작업을 이어서 본다
  const shownId = jobId ?? (activeJob && activeJob.id !== dismissed ? activeJob.id : null);
  // 최신 버전 확인은 다른 작업과 겹쳐도 된다. 스모크·앱 실행·종료만 서로 막는다.
  const locked = data.jobs.some((j) => isActive(j) && j.kind !== "remote");
  const refetch = () => void qc.invalidateQueries({ queryKey: ["artcraft", "apps"] });
  const refetchUpdates = () => {
    refetch();
    void qc.invalidateQueries({ queryKey: ["artcraft", "app-update"] });
  };
  const onError = (e: unknown) => toast({ message: errorText(e).message, tone: "danger" });
  const started = (job: ArtcraftJob, appName?: string) => {
    setJobId(job.id);
    setUpdateJobApp(appName ?? null);
    refetch();
  };
  const remote = useMutation({ mutationFn: () => checkArtcraftRemote(), onSuccess: (job) => started(job), onError });
  const smoke = useMutation({ mutationFn: (v: Parameters<typeof runArtcraftSmoke>[0]) => runArtcraftSmoke(v), onSuccess: (job) => started(job), onError });
  const control = useMutation({ mutationFn: (v: { app: string; action: "start" | "stop"; confirm?: boolean }) => controlArtcraftApp(v.app, v), onSuccess: (job) => started(job), onError });

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
          {data.remote.checked_at ? (
            <>저장된 최신 버전 정보 · <time dateTime={data.remote.checked_at} title={data.remote.checked_at}>{ago(data.remote.checked_at)} 확인한 값</time></>
          ) : "저장된 최신 버전 정보가 없어요."}
        </p>
        {data.remote.checking && (
          <p className="tk-status tk-status--agent" role="status" aria-label="최신 버전 확인 중">
            <span className="tk-spinner tk-spinner--xs" aria-hidden="true" />최신 버전을 지금 확인하고 있어요.
          </p>
        )}
        {!data.remote.checking && data.remote.error && data.remote.attempted_at && (
          <p className="tk-error" role="alert">
            마지막 확인 시도({ago(data.remote.attempted_at)})가 실패했어요. 이전에 저장된 버전 정보가 있으면 그대로 보여 줘요. {data.remote.error}
          </p>
        )}
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
      {shownId && <JobBanner
        jobId={shownId}
        updateApp={recoveryApp ? data.apps.find((a) => a.app === recoveryApp) : undefined}
        onDone={refetchUpdates}
        onDismiss={() => { setDismissed(shownId); setJobId(null); }}
        onRecover={() => {
          const target = data.apps.find((a) => a.app === recoveryApp);
          if (target) setUpdate(target);
          void qc.invalidateQueries({ queryKey: [...updateKey(recoveryApp ?? ""), "status"] });
        }}
      />}
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
      {update && <AppUpdateDialog app={update} onClose={() => setUpdate(null)} onJobStarted={(job) => started(job, update.app)} />}
    </section>
  );
}
