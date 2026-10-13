import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPmsNote, deletePmsNote, listPmsNotes, patchPmsNote } from "../../api/client";
import type { PmsNote, PmsNoteKind, PmsProject, PmsSeverity } from "../../api/types";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { EmptyState, ErrorState, ListSkeleton } from "../viewer/screenStates";
import { longDate } from "./dates";
import { NOTE_KINDS, NOTE_KIND_LABEL, SEVERITIES, SEVERITY_LABEL } from "./labels";
import { KEYS, assigneeOptions, useTasks } from "./shared";

type Filter = "open" | "resolved" | "all";
type Target = { mode: "create" } | { mode: "edit"; note: PmsNote } | null;

const SEV_TONE: Record<PmsSeverity, "danger" | "warning" | undefined> = { high: "danger", medium: "warning", low: undefined };

function NoteForm({ project, target, onClose }: { project: PmsProject; target: NonNullable<Target>; onClose: () => void }) {
  const id = useId();
  const qc = useQueryClient();
  const tasks = useTasks(project.id);
  const note = target.mode === "edit" ? target.note : undefined;
  const [kind, setKind] = useState<PmsNoteKind>(note?.kind ?? "issue");
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [severity, setSeverity] = useState<PmsSeverity>(note?.severity ?? "medium");
  const [owner, setOwner] = useState(note?.owner ?? "");
  const [taskId, setTaskId] = useState(note?.task_id ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = () => {
    void qc.invalidateQueries({ queryKey: KEYS.notes(project.id) });
    void qc.invalidateQueries({ queryKey: KEYS.dashboard(project.id) });
    void qc.invalidateQueries({ queryKey: KEYS.projects });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => {
      const b = { kind, title: title.trim(), body, severity, owner: owner.trim() || null, task_id: taskId || null };
      return note ? patchPmsNote(note.id, b) : createPmsNote(project.id, b);
    },
    onSuccess: done,
  });
  const del = useMutation({ mutationFn: () => deletePmsNote(note!.id), onSuccess: done });
  const err = problem ?? (save.error ? errorText(save.error).message : null) ?? (del.error ? errorText(del.error).message : null);
  const names = assigneeOptions(project.members, tasks.data ?? []);

  return (
    <form
      className="pms-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return setProblem("제목을 적어 주세요.");
        setProblem(null);
        save.mutate();
      }}
    >
      <div className="tk-field">
        <span id={`${id}-kind`}>종류</span>
        <div className="tk-segmented tk-segmented--block" role="radiogroup" aria-labelledby={`${id}-kind`}>
          {NOTE_KINDS.map((k) => <label key={k}><input type="radio" name={`${id}-kind`} checked={kind === k} onChange={() => setKind(k)} />{NOTE_KIND_LABEL[k]}</label>)}
        </div>
      </div>
      <div className="tk-field">
        <label htmlFor={`${id}-title`}>제목</label>
        <input id={`${id}-title`} className="tk-input tk-input--lg" value={title} maxLength={300} autoComplete="off" autoFocus={!note} placeholder={kind === "risk" ? "예) 외부 API 심사가 늦어질 수 있음" : "예) 로그인 후 빈 화면이 나와요"} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="tk-field">
        <label htmlFor={`${id}-body`}>내용 <span className="pms-optional">선택</span></label>
        <textarea id={`${id}-body`} className="tk-textarea" rows={4} value={body} maxLength={20000} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="pms-form__pair">
        <div className="tk-field">
          <span id={`${id}-sev`}>심각도</span>
          <Select id={`${id}-sevsel`} labelledBy={`${id}-sev`} value={severity} options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))} onChange={setSeverity} />
        </div>
        <div className="tk-field">
          <label htmlFor={`${id}-owner`}>담당자 <span className="pms-optional">선택</span></label>
          <input id={`${id}-owner`} className="tk-input" list={`${id}-names`} value={owner} maxLength={100} autoComplete="off" onChange={(e) => setOwner(e.target.value)} />
          <datalist id={`${id}-names`}>{names.map((n) => <option key={n} value={n} />)}</datalist>
        </div>
      </div>
      <div className="tk-field">
        <span id={`${id}-task`}>관련 작업 <span className="pms-optional">선택</span></span>
        <Select
          id={`${id}-tasksel`}
          labelledBy={`${id}-task`}
          value={taskId}
          options={[{ value: "", label: "연결 안 함" }, ...(tasks.data ?? []).map((t) => ({ value: t.id, label: `${t.wbs} ${t.title}` }))]}
          onChange={setTaskId}
        />
      </div>
      {err && <p className="tk-error" role="alert">{err}</p>}
      <div className="tk-button-group pms-form__actions">
        {note && !confirmDelete && <Button variant="danger" onClick={() => setConfirmDelete(true)}>지우기</Button>}
        {note && confirmDelete && (
          <>
            <span className="pms-form__confirm" role="alert">이 항목을 지울까요?</span>
            <Button variant="danger" busy={del.isPending} onClick={() => del.mutate()}>네, 지울게요</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>취소</Button>
          </>
        )}
        {!confirmDelete && (
          <>
            <span className="pms-form__spacer" />
            <Button variant="ghost" onClick={onClose}>닫기</Button>
            <Button variant="primary" type="submit" busy={save.isPending}>{note ? "저장" : "추가"}</Button>
          </>
        )}
      </div>
    </form>
  );
}

/** 이슈·리스크·메모. 해결하면 대시보드의 열린 항목에서 빠진다. */
export function Notes({ project }: { project: PmsProject }) {
  const qc = useQueryClient();
  const tasks = useTasks(project.id);
  const [filter, setFilter] = useState<Filter>("open");
  const [kind, setKind] = useState<PmsNoteKind | null>(null);
  const [target, setTarget] = useState<Target>(null);
  const q = useQuery({ queryKey: KEYS.notes(project.id), queryFn: () => listPmsNotes(project.id) });
  const toggle = useMutation({
    mutationFn: (n: PmsNote) => patchPmsNote(n.id, { status: n.status === "open" ? "resolved" : "open" }),
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: KEYS.notes(project.id) });
      void qc.invalidateQueries({ queryKey: KEYS.dashboard(project.id) });
      void qc.invalidateQueries({ queryKey: KEYS.projects });
      toast({ message: n.status === "resolved" ? "해결로 표시했어요." : "다시 열었어요." });
    },
    onError: (e) => toast({ message: errorText(e).message }),
  });
  const wbs = new Map((tasks.data ?? []).map((t) => [t.id, t]));
  const all = q.data?.notes ?? [];
  const list = all.filter((n) => (filter === "all" || n.status === filter) && (!kind || n.kind === kind));
  const openCount = all.filter((n) => n.status === "open").length;

  return (
    <div className="pms-notes">
      <div className="pms-notes__bar">
        <div className="tk-segmented" role="radiogroup" aria-label="상태">
          {([["open", `열림 ${openCount}`], ["resolved", "해결"], ["all", "전체"]] as const).map(([v, label]) => (
            <label key={v}><input type="radio" name="pms-note-filter" checked={filter === v} onChange={() => setFilter(v)} />{label}</label>
          ))}
        </div>
        <Button variant="primary" size="sm" onClick={() => setTarget({ mode: "create" })}><Icon name="plus" />이슈·리스크 추가</Button>
      </div>
      <div className="tk-chips" role="group" aria-label="종류">
        <button type="button" className="tk-chip" aria-pressed={!kind} onClick={() => setKind(null)}>모두</button>
        {NOTE_KINDS.map((k) => <button key={k} type="button" className="tk-chip" aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>{NOTE_KIND_LABEL[k]}</button>)}
      </div>
      {q.isPending && <ListSkeleton rows={3} label="이슈를 불러오는 중" />}
      {q.isError && <ErrorState error={q.error} what="이슈" onRetry={() => void q.refetch()} />}
      {q.isSuccess && list.length === 0 && (
        <EmptyState icon="warning" title={all.length ? "조건에 맞는 항목이 없어요" : "기록된 이슈·리스크가 없어요"} actions={!all.length && <Button variant="primary" onClick={() => setTarget({ mode: "create" })}><Icon name="plus" />추가</Button>}>
          {all.length ? "필터를 바꿔 보세요." : "막힌 일(이슈)이나 걱정되는 일(리스크)을 적어 두면 대시보드에서 챙겨 볼 수 있어요."}
        </EmptyState>
      )}
      <ul className="pms-notelist">
        {list.map((n) => {
          const t = n.task_id ? wbs.get(n.task_id) : undefined;
          return (
            <li key={n.id} className="pms-note" data-status={n.status} data-severity={n.severity}>
              <button
                type="button"
                className="pms-note__check"
                role="checkbox"
                aria-checked={n.status === "resolved"}
                aria-label={n.status === "resolved" ? `${n.title} 다시 열기` : `${n.title} 해결로 표시`}
                onClick={() => toggle.mutate(n)}
              >
                <Icon name="check" />
              </button>
              <button type="button" className="pms-note__body" onClick={() => setTarget({ mode: "edit", note: n })}>
                <span className="pms-note__title">{n.title}</span>
                {n.body && <span className="pms-note__text">{n.body}</span>}
                <span className="pms-note__meta">
                  <Badge tone={n.kind === "risk" ? "warning" : n.kind === "note" ? undefined : "info"}>{NOTE_KIND_LABEL[n.kind]}</Badge>
                  <Badge tone={SEV_TONE[n.severity]}>심각도 {SEVERITY_LABEL[n.severity]}</Badge>
                  {n.owner && <span>{n.owner}</span>}
                  {t && <span>{t.wbs} {t.title}</span>}
                  <span>{longDate(n.created_at.slice(0, 10))}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Dialog open={target !== null} onClose={() => setTarget(null)} size="lg" title={target?.mode === "edit" ? "이슈·리스크 수정" : "이슈·리스크 추가"} modal id="pms-note-dialog">
        {target && <NoteForm key={target.mode === "edit" ? target.note.id : "new"} project={project} target={target} onClose={() => setTarget(null)} />}
      </Dialog>
    </div>
  );
}
