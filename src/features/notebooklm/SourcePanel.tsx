import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addNotebookTextSource, addNotebookUrlSource, cancelNotebookJob, deleteNotebookSource, uploadNotebookSource } from "../../api/client";
import type { ApiError } from "../../api/client";
import type { NlmAddSourceResult, NlmDuplicateSource, NlmJob, NlmNotebookDetail, NlmSource } from "../../api/notebooklmTypes";
import { FileButton } from "../../ui/FileButton";
import { Badge } from "../../ui/Badge";
import { Button, IconButton } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { ErrorNotice } from "./ErrorNotice";
import { SOURCE_STATUS, describeError, formatBytes, jobActive, jobStatusText, jobTarget, sourceKindLabel, sourceTitle } from "./labels";
import { nlmKeys } from "./queries";

type Mode = "url" | "youtube" | "text" | "file";
const MODES: { id: Mode; label: string }[] = [
  { id: "url", label: "웹 URL" },
  { id: "youtube", label: "YouTube" },
  { id: "text", label: "텍스트" },
  { id: "file", label: "파일" },
];

export function SourceRow({ source, onDelete }: { source: NlmSource; onDelete?: () => void }) {
  const st = SOURCE_STATUS[source.status] ?? SOURCE_STATUS.unknown;
  return (
    <li className="nlm-src" data-status={source.status}>
      <div className="nlm-src__body">
        <strong className="nlm-src__title">{sourceTitle(source)}</strong>
        <span className="nlm-src__meta">
          <Badge>{sourceKindLabel(source.kind)}</Badge>
          <Badge tone={st.tone}>{st.label}</Badge>
          {source.word_count != null && <small>{source.word_count.toLocaleString("ko-KR")}단어</small>}
        </span>
        {source.url && <a className="nlm-src__url tk-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a>}
      </div>
      {onDelete && <IconButton size="sm" aria-label={`${sourceTitle(source)} 삭제`} onClick={onDelete}><Icon name="trash" /></IconButton>}
    </li>
  );
}

function DuplicateFound({ found, sources }: { found: NlmDuplicateSource; sources: NlmSource[] }) {
  const existing = sources.find((s) => s.id === found.id);
  return (
    <div className="tk-callout tk-callout--note nlm-notice" role="status" data-testid="duplicate-found">
      <Icon name="info" className="tk-callout__icon" />
      <div className="tk-callout__body">
        <strong className="tk-callout__title">이미 등록됨</strong>
        <p>같은 소스가 이미 이 노트북에 있어서 새로 만들지 않았어요.</p>
        {existing ? (
          <ul className="nlm-srclist nlm-srclist--flat"><SourceRow source={existing} /></ul>
        ) : (
          <p className="nlm-src__title">{found.title?.trim() || "제목 없음"}<small> · {sourceKindLabel(found.kind)}</small></p>
        )}
      </div>
    </div>
  );
}

function AddSourceDialog({ notebook, onClose }: { notebook: NlmNotebookDetail; onClose: () => void }) {
  const id = useId();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [found, setFound] = useState<NlmDuplicateSource | null>(null);
  // 409 duplicate 뒤: 목록을 다시 읽어 눈으로 확인하기 전에는 force 를 열지 않는다.
  const [listChecked, setListChecked] = useState(false);
  const [checking, setChecking] = useState(false);

  const send = useMutation<NlmAddSourceResult, ApiError, boolean>({
    mutationFn: (force) => {
      if (mode === "text") return addNotebookTextSource(notebook.id, { title: title.trim(), text, force });
      if (mode === "file") return uploadNotebookSource(notebook.id, file as File, { title: title.trim() || undefined, force });
      return addNotebookUrlSource(notebook.id, { url: url.trim(), title: title.trim() || undefined, force });
    },
    onSuccess: (res) => {
      if (res.duplicate) {
        setFound(res.source);
        return;
      }
      toast({ message: "소스 등록을 시작했어요. 진행 상태는 소스 목록 위에 나와요.", tone: "success" });
      void qc.invalidateQueries({ queryKey: nlmKeys.jobs });
      onClose();
    },
  });

  const valid = mode === "text" ? title.trim() !== "" && text.trim() !== "" : mode === "file" ? file !== null : url.trim() !== "";
  const err = send.error;
  const conflict = err?.code === "duplicate" ? err : null;
  const otherError = err && !conflict ? err : null;

  const changeMode = (m: Mode) => { setMode(m); setFound(null); setListChecked(false); send.reset(); };
  const checkList = async () => {
    setChecking(true);
    try {
      await qc.refetchQueries({ queryKey: nlmKeys.notebook(notebook.id) });
      setListChecked(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="소스 추가"
      modal
      footer={
        <div className="tk-button-group tk-button-group--end">
          <Button variant="ghost" onClick={onClose}>{found ? "닫기" : "취소"}</Button>
          {!found && <Button variant="primary" type="submit" form={`${id}-form`} busy={send.isPending} disabled={!valid || conflict !== null}>추가</Button>}
        </div>
      }
    >
      <div className="tk-segmented tk-segmented--block" role="radiogroup" aria-label="소스 종류">
        {MODES.map((m) => (
          <label key={m.id}>
            <input type="radio" name={`${id}-mode`} checked={mode === m.id} onChange={() => changeMode(m.id)} />
            {m.label}
          </label>
        ))}
      </div>

      <form id={`${id}-form`} className="nlm-form" onSubmit={(e) => { e.preventDefault(); if (valid && !send.isPending) { setFound(null); send.mutate(false); } }}>
        {(mode === "url" || mode === "youtube") && (
          <div className="tk-field">
            <label className="tk-label" htmlFor={`${id}-url`}>{mode === "youtube" ? "YouTube 링크" : "웹페이지 주소"}</label>
            <input id={`${id}-url`} className="tk-input" type="url" inputMode="url" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder={mode === "youtube" ? "https://www.youtube.com/watch?v=..." : "https://"} />
            <p className="tk-help">{mode === "youtube" ? "YouTube 주소는 NotebookLM이 영상 소스로 알아봐요." : "공개된 웹페이지만 읽을 수 있어요."}</p>
          </div>
        )}
        {mode === "text" && (
          <>
            <div className="tk-field">
              <label className="tk-label" htmlFor={`${id}-ttitle`}>제목</label>
              <input id={`${id}-ttitle`} className="tk-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="tk-field">
              <label className="tk-label" htmlFor={`${id}-text`}>내용</label>
              <textarea id={`${id}-text`} className="tk-input nlm-textarea" rows={8} value={text} maxLength={500000} onChange={(e) => setText(e.target.value)} />
              <p className="tk-help">{text.length.toLocaleString("ko-KR")} / 500,000자</p>
            </div>
          </>
        )}
        {mode === "file" && (
          <div className="tk-field">
            <span className="tk-label">파일</span>
            <FileButton onFiles={(fs) => setFile(fs[0] ?? null)} className="tk-button">
              <Icon name="paperclip" />파일 고르기
            </FileButton>
            {file ? <p className="nlm-filename" data-testid="picked-file">{file.name} · {formatBytes(file.size)}</p> : <p className="tk-help">PDF·문서 등 NotebookLM이 읽는 형식만 처리돼요. 크기 제한을 넘으면 거절돼요.</p>}
          </div>
        )}
        {mode !== "text" && (
          <div className="tk-field">
            <label className="tk-label" htmlFor={`${id}-title`}>제목<span className="tk-label__optional">선택</span></label>
            <input id={`${id}-title`} className="tk-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}
      </form>

      {found && <DuplicateFound found={found} sources={notebook.sources} />}

      {conflict && (
        <div className="tk-callout tk-callout--warning nlm-notice" role="alert" data-testid="duplicate-conflict">
          <Icon name="warning" className="tk-callout__icon" />
          <div className="tk-callout__body">
            <strong className="tk-callout__title">등록 여부를 확정하지 못했어요</strong>
            <p>{conflict.message}</p>
            <p>소스 목록에서 같은 소스가 이미 있는지 먼저 확인해 주세요. 없을 때만 강제로 등록해요.</p>
            {!listChecked ? (
              <Button size="sm" busy={checking} onClick={() => void checkList()}><Icon name="retry" />소스 목록 확인</Button>
            ) : (
              <>
                {notebook.sources.length === 0 ? <p className="nlm-note">현재 소스가 없어요.</p> : (
                  <ul className="nlm-srclist nlm-srclist--flat" data-testid="recheck-list">
                    {notebook.sources.map((s) => <SourceRow key={s.id} source={s} />)}
                  </ul>
                )}
                <Button size="sm" variant="danger" busy={send.isPending} onClick={() => send.mutate(true)}>목록에 없어요, 그래도 등록(force)</Button>
              </>
            )}
          </div>
        </div>
      )}
      {otherError && <ErrorNotice error={otherError} />}
    </Dialog>
  );
}

function JobRow({ job, onDismiss }: { job: NlmJob; onDismiss: () => void }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => cancelNotebookJob(job.id),
    onSettled: () => { void qc.invalidateQueries({ queryKey: nlmKeys.jobs }); },
    onError: (e) => toast({ message: describeError(e).title, tone: "danger" }),
  });
  const st = jobStatusText(job);
  const active = jobActive(job);
  return (
    <li className="nlm-job" data-status={job.status}>
      {active ? <span className="tk-spinner tk-spinner--sm" aria-hidden="true" /> : <Icon name={job.status === "succeeded" && job.result?.ready !== false ? "circle-check" : job.status === "failed" ? "circle-x" : "warning"} />}
      <div className="nlm-job__body">
        <strong className="nlm-job__target">{jobTarget(job)}</strong>
        <span className={`nlm-job__text nlm-tone-${st.tone ?? "plain"}`}>{job.cancel_requested && active ? "취소하는 중" : st.text}</span>
      </div>
      {active ? (
        <Button size="xs" variant="ghost" busy={cancel.isPending} disabled={job.cancel_requested} onClick={() => cancel.mutate()}>취소</Button>
      ) : (
        <IconButton size="sm" aria-label="알림 닫기" onClick={onDismiss}><Icon name="x" /></IconButton>
      )}
    </li>
  );
}

/** 소스 목록, 소스 추가·삭제, 진행 중인 소스 등록 작업. */
export function SourcePanel({ notebook, jobs, active }: { notebook: NlmNotebookDetail; jobs: NlmJob[]; active: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<NlmSource | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const remove = useMutation({
    mutationFn: (s: NlmSource) => deleteNotebookSource(notebook.id, s.id),
    onSuccess: () => {
      setDeleting(null);
      toast({ message: "소스를 삭제했어요.", tone: "success" });
      void qc.invalidateQueries({ queryKey: nlmKeys.notebook(notebook.id) });
      void qc.invalidateQueries({ queryKey: nlmKeys.notebooks });
    },
    onError: (e) => { if (describeError(e).kind === "unknown_outcome") void qc.invalidateQueries({ queryKey: nlmKeys.notebook(notebook.id) }); },
  });
  // 끝난 작업은 화면을 연 시점 30분 안에 끝난 것만 남겨 두고, 사용자가 닫을 수 있다.
  const [openedAt] = useState(() => Date.now());
  const visibleJobs = jobs.filter((j) => j.notebook_id === notebook.id && j.kind.startsWith("source_add") && (jobActive(j) || (
    !dismissed.has(j.id) && j.finished_at !== null && Date.parse(j.finished_at) > openedAt - 30 * 60 * 1000)));

  return (
    <section className="nlm-panel" data-active={active} aria-label="소스" id="nlm-panel-sources">
      <div className="tk-section__head">
        <h2 className="tk-section__title">소스 <small>{notebook.sources.length}</small></h2>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}><Icon name="plus" />소스 추가</Button>
      </div>

      {visibleJobs.length > 0 && (
        <ul className="nlm-joblist" aria-label="소스 등록 작업" aria-live="polite">
          {visibleJobs.map((j) => <JobRow key={j.id} job={j} onDismiss={() => setDismissed((d) => new Set(d).add(j.id))} />)}
        </ul>
      )}

      {notebook.sources.length === 0 ? (
        <div className="tk-empty tk-empty--boxed">
          <Icon name="file-text" className="tk-icon--xl" />
          <p className="tk-empty__title">아직 소스가 없어요</p>
          <p className="nlm-note">웹페이지, YouTube, 텍스트, 파일을 넣으면 그 내용으로 질문할 수 있어요.</p>
        </div>
      ) : (
        <ul className="nlm-srclist">
          {notebook.sources.map((s) => <SourceRow key={s.id} source={s} onDelete={() => { remove.reset(); setDeleting(s); }} />)}
        </ul>
      )}

      {adding && <AddSourceDialog notebook={notebook} onClose={() => setAdding(false)} />}
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        size="sm"
        title="소스를 삭제할까요?"
        modal
        footer={
          <div className="tk-button-group tk-button-group--end">
            <Button variant="ghost" onClick={() => setDeleting(null)}>취소</Button>
            <Button variant="danger" busy={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>삭제</Button>
          </div>
        }
      >
        <p><strong>{deleting ? sourceTitle(deleting) : ""}</strong> 소스를 이 노트북에서 지워요.</p>
        <p className="nlm-note">이 소스를 근거로 한 이후 답변에서는 빠져요. 되돌릴 수 없어요.</p>
        {remove.error != null && <ErrorNotice error={remove.error} />}
      </Dialog>
    </section>
  );
}
