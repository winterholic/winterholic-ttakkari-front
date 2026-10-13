import { useEffect, useId, useState } from "react";
import type { CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { clovaImport, clovaJobs, clovaNotes, clovaOpenLogin, clovaRetryJob, clovaStatus, clovaSync } from "../../api/client";
import type { ClovaJob, ClovaNoteSummary, ClovaStatus, MeetingScope, MeetingSummary } from "../../api/client";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { formatWhen } from "../viewer/kinds";
import { EmptyState, ErrorState, ListSkeleton } from "../viewer/screenStates";
import { useProjectOptions } from "./NewMeetingForm";
import { Callout, SCOPE_OPTIONS, StatusBadge } from "./shared";

/*
 * 클로바노트 연동(back ADR 0021) 화면 조각.
 * 연결이 정상이면 한 줄로만 보이고(평소엔 볼 일이 없다), 끊기거나 작업이 돌 때만 커진다.
 * 진행 표시는 실제 숫자가 있을 때(전사 %)만 채우고, 모르는 구간은 흐르는 막대로 둔다.
 */

export const clovaKeys = {
  status: ["clovanote", "status"] as const,
  jobs: ["clovanote", "jobs"] as const,
  notes: (q: string) => ["clovanote", "notes", q] as const,
};

const ACTIVE = new Set(["queued", "running", "waiting"]);
export const isJobActive = (j: Pick<ClovaJob, "status"> | null | undefined) => !!j && ACTIVE.has(j.status);

const KIND_LABEL: Record<ClovaJob["kind"], string> = { sync: "노트 동기화", import: "노트 가져오기", upload: "녹음 전사" };

function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return formatWhen(iso);
}

export function duration(ms: number | null | undefined): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}시간 ${m}분`;
  return m ? `${m}분 ${s % 60}초` : `${s}초`;
}

/** 연결 상태. 로그인 창이 열려 있거나 작업이 돌면 자주 묻고, 평소엔 1분마다. 처음 한 번은 실제로 확인한다. */
export function useClovaStatus() {
  const q = useQuery({
    queryKey: clovaKeys.status,
    queryFn: async () => {
      const st = await clovaStatus(false);
      return st.state === "unknown" ? clovaStatus(true) : st;
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      return d.state === "login_window" || d.login.state === "waiting" || d.login.state === "session_only" || d.active_jobs > 0 ? 3000 : 60_000;
    },
  });
  return q;
}

function useInvalidateClova() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["clovanote"] });
    void qc.invalidateQueries({ queryKey: ["meetings"] });
  };
}

// ---- 연결 상태 줄

export function ClovaBar() {
  const st = useClovaStatus();
  const refresh = useInvalidateClova();
  const qc = useQueryClient();
  const login = useMutation({
    mutationFn: clovaOpenLogin,
    onSuccess: (d) => qc.setQueryData(clovaKeys.status, (old: ClovaStatus | undefined) => (old ? { ...old, ...d } : old)),
    onError: (e) => toast({ message: errorText(e).message }),
  });
  const check = useMutation({ mutationFn: () => clovaStatus(true), onSuccess: (d) => qc.setQueryData(clovaKeys.status, d) });
  const sync = useMutation({
    mutationFn: clovaSync,
    onSuccess: () => refresh(),
    onError: (e) => toast({ message: errorText(e).message }),
  });

  // 로그인이 끝나면(창이 닫히고 확인되면) 목록을 새로 받는다.
  const loginDone = st.data?.login.state === "done";
  useEffect(() => {
    if (loginDone) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginDone]);

  if (st.isPending) return <p className="tk-status mt-clova-line" role="status"><span className="tk-spinner tk-spinner--xs" aria-hidden="true" />클로바노트 연결 확인 중</p>;
  if (st.isError) return <p className="tk-error mt-clova-line" role="alert"><Icon name="warning" />클로바노트 상태를 불러오지 못했어요. {errorText(st.error).message}</p>;
  const d = st.data;
  if (d.state === "disabled") return null;

  if (d.state === "login_window" || d.login.state === "waiting" || d.login.state === "session_only") {
    const sessionOnly = d.login.state === "session_only";
    return (
      <Callout tone={sessionOnly ? "warning" : "note"} icon={sessionOnly ? "warning" : "info"} title={sessionOnly ? "'로그인 상태 유지'를 켜 주세요" : "네이버 로그인을 기다리는 중"}>
        <p>{d.login.message ?? d.message}</p>
        <p className="tk-help">Mac 화면에 뜬 Chrome 창에서 진행해요. 로그인되면 창이 저절로 닫히고 이어서 처리해요.</p>
      </Callout>
    );
  }

  if (d.state !== "ready") {
    const failed = d.login.state === "failed" || d.login.state === "timeout";
    return (
      <Callout tone="warning" icon="warning" title={d.state === "login_required" ? "클로바노트 로그인이 필요해요" : "클로바노트에 연결하지 못했어요"}>
        <p>{failed && d.login.message ? d.login.message : d.message}</p>
        <p className="tk-help">로그인 창은 Mac 화면에 떠요. '로그인 상태 유지'를 체크하면 다시 할 일이 거의 없어요.</p>
        <div className="tk-button-group">
          <Button size="sm" variant="primary" busy={login.isPending} onClick={() => login.mutate()}><Icon name="key" />로그인 창 열기</Button>
          <Button size="sm" busy={check.isPending} onClick={() => check.mutate()}><Icon name="retry" />다시 확인</Button>
        </div>
      </Callout>
    );
  }

  const syncing = d.active_jobs > 0 || sync.isPending;
  return (
    <div className="mt-clova-line">
      <span className="mt-clova-line__state">
        <span className="tk-dot tk-dot--online" aria-hidden="true" />
        <span>클로바노트 연결됨</span>
      </span>
      <span className="mt-clova-line__meta">
        {d.account?.name && <span>{d.account.name}</span>}
        {d.quota && <span>변환 {d.quota.recognition_remain_minutes.toLocaleString("ko-KR")}분 남음</span>}
        <span>{d.last_sync_at ? `동기화 ${ago(d.last_sync_at)}` : "아직 동기화 전"}</span>
      </span>
      {syncing ? (
        <span className="tk-status mt-clova-line__action" role="status"><span className="tk-spinner tk-spinner--xs" aria-hidden="true" />처리 중</span>
      ) : (
        <Button size="xs" className="mt-clova-line__action" onClick={() => sync.mutate()} aria-label="클로바노트에서 노트 동기화">
          <Icon name="retry" />동기화
        </Button>
      )}
    </div>
  );
}

// ---- 작업 진행

function stageState(job: ClovaJob, index: number): "succeeded" | "running" | "failed" | "queued" {
  const cur = Math.max(0, job.stages.findIndex((s) => s.id === job.stage));
  if (job.status === "succeeded") return "succeeded";
  if (index < cur) return "succeeded";
  if (index === cur) return job.status === "failed" ? "failed" : job.status === "queued" ? "queued" : "running";
  return "queued";
}

/** 막대 하나 + 지금 하는 일 한 줄. 자세히 펼치면 단계와 시각별 기록. */
export function JobProgress({ job, title, linkMeeting }: { job: ClovaJob; title?: string; linkMeeting?: boolean }) {
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: () => clovaRetryJob(job.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["clovanote"] }),
    onError: (e) => toast({ message: errorText(e).message }),
  });
  const active = isJobActive(job);
  const known = job.stage === "recognize" || job.stage === "fetch" || job.kind === "sync";
  const value = job.status === "succeeded" ? 1 : known && job.progress != null ? job.progress / 100 : undefined;
  const label = job.stages.find((s) => s.id === job.stage)?.label ?? (job.status === "queued" ? "대기" : "");
  return (
    <div className="mt-job" data-status={job.status}>
      <div className="mt-job__head">
        <span className="mt-job__title">
          {active ? <span className="tk-spinner tk-spinner--xs" aria-hidden="true" /> : <Icon name={job.status === "failed" ? "circle-x" : "circle-check"} />}
          <span>{title ?? KIND_LABEL[job.kind]}</span>
          {linkMeeting && job.meeting_id && <Link className="tk-link mt-job__link" to={`/meetings/${job.meeting_id}`}>회의록 보기</Link>}
        </span>
        <span className="mt-job__stage">{job.status === "failed" ? "실패" : job.status === "succeeded" ? "완료" : label}</span>
      </div>
      {(active || job.status === "succeeded") && (
        <span
          className="tk-progress tk-progress--agent"
          role="progressbar"
          aria-label={`${title ?? KIND_LABEL[job.kind]} 진행`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value === undefined ? undefined : Math.round(value * 100)}
          data-indeterminate={value === undefined ? "" : undefined}
          style={value === undefined ? undefined : ({ "--tk-progress": value } as CSSProperties)}
        />
      )}
      <p className={job.status === "failed" ? "mt-job__msg mt-job__msg--error" : "mt-job__msg"} role={job.status === "failed" ? "alert" : "status"}>
        {job.status === "failed" ? job.error ?? job.message : job.message}
      </p>
      {job.status === "failed" && job.kind !== "upload" && (
        <div className="tk-button-group"><Button size="xs" busy={retry.isPending} onClick={() => retry.mutate()}><Icon name="retry" />다시 하기</Button></div>
      )}
      <details className="mt-details">
        <summary>단계·기록</summary>
        <ol className="tk-steps mt-job__steps" aria-label="처리 단계">
          {job.stages.map((s, i) => {
            const state = stageState(job, i);
            const last = [...job.steps].reverse().find((x) => x.stage === s.id);
            return (
              <li key={s.id} data-state={state}>
                {state === "succeeded" ? <Icon name="circle-check" /> : state === "running" ? <span className="tk-spinner tk-spinner--xs" aria-hidden="true" /> : state === "failed" ? <Icon name="circle-x" /> : <span className="tk-step__mark" aria-hidden="true" />}
                <span className="tk-step__name">{s.label}{last && <span className="tk-step__detail">{last.message}</span>}</span>
                <span className="tk-step__time">{last ? formatWhen(last.at) : ""}</span>
              </li>
            );
          })}
        </ol>
      </details>
    </div>
  );
}

/** 지금 돌고 있거나 방금 끝난 작업들. 없으면 아무것도 그리지 않는다. */
export function ClovaJobs({ exclude }: { exclude?: "upload" }) {
  const st = useClovaStatus();
  const active = (st.data?.active_jobs ?? 0) > 0;
  const q = useQuery({
    queryKey: clovaKeys.jobs,
    queryFn: () => clovaJobs({ limit: 8 }),
    refetchInterval: active ? 2000 : 30_000,
  });
  const recent = (q.data?.jobs ?? []).filter((j) => {
    if (exclude && j.kind === exclude) return false;
    if (isJobActive(j)) return true;
    // 끝난 작업은 10분 동안만 보여 준다(자동 동기화 성공은 보여 줄 필요가 없다).
    // 기준 시각은 목록을 받은 시각(렌더마다 바뀌는 Date.now 대신). 30초마다 다시 받으니 충분히 맞다.
    const fresh = j.finished_at && q.dataUpdatedAt - new Date(j.finished_at).getTime() < 10 * 60_000;
    return fresh && !(j.kind === "sync" && j.params.auto && j.status === "succeeded");
  });
  if (!recent.length) return null;
  return (
    <section className="mt-jobs" aria-label="클로바노트 처리 중인 작업">
      {recent.map((j) => <JobProgress key={j.id} job={j} linkMeeting />)}
    </section>
  );
}

// ---- 노트 목록

export function ClovaNotesView() {
  const st = useClovaStatus();
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<ClovaNoteSummary | null>(null);
  const search = q.trim();
  const busy = (st.data?.active_jobs ?? 0) > 0;
  const list = useQuery({
    queryKey: clovaKeys.notes(search),
    queryFn: () => clovaNotes({ q: search }),
    placeholderData: (prev) => prev,
    refetchInterval: busy ? 3000 : false,
  });
  const notes = list.data?.notes ?? [];
  return (
    <div className="mt-stack">
      <div className="mt-toolbar">
        <span className="tk-input-wrap mt-toolbar__search">
          <Icon name="search" />
          <input className="tk-input tk-input--sm" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·전사 찾기" aria-label="클로바노트 노트 찾기" />
        </span>
      </div>
      {list.isPending && <ListSkeleton rows={3} label="클로바노트 노트를 불러오는 중" />}
      {list.isError && <ErrorState error={list.error} what="클로바노트 노트" onRetry={() => void list.refetch()} />}
      {list.isSuccess && notes.length === 0 && (
        <EmptyState icon="mic" title={search ? "찾는 노트가 없어요" : "가져온 클로바노트 노트가 없어요"}>
          {search ? "다른 단어로 찾아 보세요." : "클로바노트 앱으로 녹음한 노트는 위 '동기화'를 누르면 여기에 나타나요. 30분마다 자동으로도 받아요."}
        </EmptyState>
      )}
      {notes.length > 0 && (
        <ul className="tk-list tk-list--inset" aria-label="클로바노트 노트">
          {notes.map((n) => <NoteRow key={n.note_id} n={n} onImport={() => setTarget(n)} />)}
        </ul>
      )}
      <ImportDialog note={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function NoteRow({ n, onImport }: { n: ClovaNoteSummary; onImport: () => void }) {
  const meta = [n.recorded_at ? formatWhen(n.recorded_at) : "", duration(n.duration_ms), n.speakers.length ? `화자 ${n.speakers.length}명` : ""].filter(Boolean);
  return (
    <li>
      <div className="tk-list__item mt-note">
        <span className="tk-list__body">
          <span className="tk-list__title tk-list__title--wrap">{n.title || "제목 없는 노트"}</span>
          <span className="tk-list__meta">
            {n.state === "processing" && <Badge tone="info"><span className="tk-spinner tk-spinner--xs" aria-hidden="true" />전사 중{n.progress != null ? ` ${n.progress}%` : ""}</Badge>}
            {n.state === "failed" && <Badge tone="danger">전사 실패</Badge>}
            {meta.map((x) => <span key={x}>{x}</span>)}
          </span>
          {n.summary && <span className="tk-list__snippet">{n.summary}</span>}
          {n.import_job && <JobProgress job={n.import_job} title="회의록으로 가져오는 중" />}
        </span>
        <span className="mt-note__end">
          {n.meeting ? (
            <Link className="tk-button tk-button--sm" to={`/meetings/${n.meeting.id}`} aria-label={`${n.title} 회의록 열기`}>
              <StatusBadge status={n.meeting.status} />회의록
            </Link>
          ) : n.import_job ? null : (
            <Button size="sm" variant={n.state === "ready" ? "primary" : undefined} disabled={n.state !== "ready" || !n.has_transcript} onClick={onImport}
              title={n.state !== "ready" ? "클로바노트에서 전사가 끝나야 가져올 수 있어요" : undefined}>
              가져오기
            </Button>
          )}
        </span>
      </div>
    </li>
  );
}

function ImportDialog({ note, onClose }: { note: ClovaNoteSummary | null; onClose: () => void }) {
  const id = useId();
  const refresh = useInvalidateClova();
  const [scope, setScope] = useState<MeetingScope>("personal");
  const [project, setProject] = useState("");
  const [analyze, setAnalyze] = useState(true);
  const { options } = useProjectOptions(scope);
  const run = useMutation({
    mutationFn: () => clovaImport(note!.note_id, { scope, project_id: project || null, analyze }),
    onSuccess: () => {
      refresh();
      toast({ message: analyze ? "가져오는 중이에요. 끝나면 분석까지 이어서 해요." : "가져오는 중이에요." });
      onClose();
    },
  });
  return (
    <Dialog
      open={!!note}
      onClose={() => { run.reset(); onClose(); }}
      modal
      size="sm"
      id="clova-import"
      title="회의록으로 가져오기"
      footer={
        <>
          <button className="tk-button" type="button" onClick={onClose}>취소</button>
          <Button variant="primary" busy={run.isPending} onClick={() => run.mutate()}>가져오기</Button>
        </>
      }
    >
      <div className="tk-stack mt-form">
        <p className="mt-prose">{note?.title}{note?.duration_ms ? ` · ${duration(note.duration_ms)}` : ""}</p>
        <div className="tk-field">
          <span className="tk-label" id={`${id}-scope`}>범위</span>
          <div className="tk-segmented tk-segmented--block" role="radiogroup" aria-labelledby={`${id}-scope`}>
            {SCOPE_OPTIONS.map((s) => (
              <label key={s.value}><input type="radio" name={`${id}-scope`} checked={scope === s.value} onChange={() => { setScope(s.value); setProject(""); }} />{s.label}</label>
            ))}
          </div>
        </div>
        <div className="tk-field">
          <label className="tk-label" id={`${id}-pl`} htmlFor={`${id}-p`}>PMS 프로젝트 <span className="mt-optional">선택</span></label>
          <Select id={`${id}-p`} labelledBy={`${id}-pl`} value={project} options={options} onChange={setProject} />
        </div>
        <label className="tk-checkbox">
          <input type="checkbox" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} />
          가져오자마자 결정·액션 분석
        </label>
        <p className="tk-help">전사는 맥락 도서관에 검색용(벡터)으로 저장돼요. 결정을 기억으로 남기는 건 분석 뒤 승인할 때만이에요.</p>
        {run.error && <p className="tk-error" role="alert"><Icon name="warning" />{errorText(run.error).message}</p>}
      </div>
    </Dialog>
  );
}

// ---- 맥락 도서관 저장 상태(회의 상세)

export function VectorLine({ v }: { v: NonNullable<MeetingSummary["vector"]> }) {
  if (v.status === "none") return null;
  return (
    <p className={v.status === "failed" ? "mt-vector mt-vector--error" : "mt-vector"}>
      <Icon name="context-library" />
      {v.status === "pending" && <>맥락 도서관에 저장하는 중<span className="tk-spinner tk-spinner--xs" aria-hidden="true" /></>}
      {v.status === "ready" && <>맥락 도서관에 {v.chunks}조각 저장됨 · 뜻으로 찾기 가능{v.embedded_at ? ` · ${ago(v.embedded_at)}` : ""}</>}
      {v.status === "failed" && <>맥락 도서관 저장 실패: {v.error}</>}
    </p>
  );
}
