import { useId, useState } from "react";
import type { PmsPriority, PmsTask, PmsTaskPatch, PmsTaskStatus } from "../../api/types";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { errorText } from "../viewer/api";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from "./labels";
import type { TaskActions } from "./shared";

export type TaskTarget = { mode: "edit"; id: string } | { mode: "create"; parentId?: string | null; status?: PmsTaskStatus; afterId?: string | null };

interface Form {
  title: string;
  description: string;
  status: PmsTaskStatus;
  progress: number;
  assignee: string;
  priority: PmsPriority;
  start: string;
  end: string;
  predecessors: string[];
  parent: string;
}

const QUICK_PROGRESS = [0, 25, 50, 75, 100];

function initial(task: PmsTask | undefined, t: TaskTarget): Form {
  if (task) {
    return {
      title: task.title, description: task.description, status: task.status, progress: task.progress, assignee: task.assignee ?? "",
      priority: task.priority, start: task.start_date ?? "", end: task.end_date ?? "", predecessors: task.predecessors, parent: task.parent_id ?? "",
    };
  }
  const c = t.mode === "create" ? t : undefined;
  const status = c?.status ?? "todo";
  return {
    title: "", description: "", status, progress: status === "done" ? 100 : 0, assignee: "", priority: "normal", start: "", end: "", predecessors: [],
    parent: c?.parentId ?? "",
  };
}

/** 내가 가진 하위 작업은 선행/상위 후보에서 뺀다(서버도 순환은 막는다). */
function descendantIds(tasks: PmsTask[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks) {
      if (t.parent_id && out.has(t.parent_id) && !out.has(t.id)) {
        out.add(t.id);
        grew = true;
      }
    }
  }
  return out;
}

/** 작업 한 건을 만들거나 고치는 모달. 칸반·WBS 표·간트가 같이 쓴다. */
export function TaskDialog({ target, tasks, members, actions, onClose, onAddChild }: {
  target: TaskTarget | null;
  tasks: PmsTask[];
  members: string[];
  actions: TaskActions;
  onClose: () => void;
  onAddChild?: (parentId: string) => void;
}) {
  const task = target?.mode === "edit" ? tasks.find((t) => t.id === target.id) : undefined;
  return (
    <Dialog open={target !== null} onClose={onClose} size="lg" title={target?.mode === "create" ? "새 작업" : task ? `${task.wbs} 작업` : "작업"} modal id="pms-task-dialog">
      {target && (target.mode === "create" || task) && (
        <TaskForm key={task?.id ?? `new-${target.mode === "create" ? `${target.parentId ?? ""}${target.status ?? ""}${target.afterId ?? ""}` : ""}`} target={target} task={task} tasks={tasks} members={members} actions={actions} onClose={onClose} onAddChild={onAddChild} />
      )}
    </Dialog>
  );
}

function TaskForm({ target, task, tasks, members, actions, onClose, onAddChild }: {
  target: TaskTarget;
  task?: PmsTask;
  tasks: PmsTask[];
  members: string[];
  actions: TaskActions;
  onClose: () => void;
  onAddChild?: (parentId: string) => void;
}) {
  const id = useId();
  const [f, setF] = useState<Form>(() => initial(task, target));
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (p: Partial<Form>) => setF((cur) => ({ ...cur, ...p }));
  const rollup = !!task?.has_children;
  const datesLocked = !!task?.dates_rollup;
  const blocked = task ? descendantIds(tasks, task.id) : new Set<string>();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const busy = actions.create.isPending || actions.patch.isPending;
  const serverErr = actions.create.error ?? actions.patch.error ?? actions.remove.error;
  const err = problem ?? (serverErr ? errorText(serverErr).message : null);

  const setStatus = (status: PmsTaskStatus) => set({ status, progress: status === "done" ? 100 : status === "todo" ? 0 : f.progress === 100 ? 90 : f.progress });
  const setProgress = (n: number) => {
    const progress = Math.max(0, Math.min(100, Math.round(n) || 0));
    set({ progress, status: progress === 100 ? "done" : f.status === "done" ? "doing" : progress > 0 && f.status === "todo" ? "doing" : f.status });
  };

  const submit = () => {
    if (!f.title.trim()) return setProblem("작업 이름을 적어 주세요.");
    if (f.start && f.end && f.end < f.start) return setProblem("종료일이 시작일보다 빠를 수 없어요.");
    setProblem(null);
    if (task) {
      const body: PmsTaskPatch = {};
      if (f.title.trim() !== task.title) body.title = f.title.trim();
      if (f.description !== task.description) body.description = f.description;
      if (f.priority !== task.priority) body.priority = f.priority;
      if ((f.assignee.trim() || null) !== task.assignee) body.assignee = f.assignee.trim() || null;
      if (!datesLocked) {
        if ((f.start || null) !== task.start_date) body.start_date = f.start || null;
        if ((f.end || null) !== task.end_date) body.end_date = f.end || null;
      }
      if (!rollup) {
        if (f.status !== task.status) body.status = f.status;
        if (f.progress !== task.progress) body.progress = f.progress;
      }
      if (f.predecessors.join() !== task.predecessors.join()) body.predecessors = f.predecessors;
      if (Object.keys(body).length === 0) return onClose();
      actions.patch.mutate({ id: task.id, body }, { onSuccess: onClose });
    } else {
      const c = target.mode === "create" ? target : undefined;
      actions.create.mutate(
        {
          title: f.title.trim(), description: f.description, priority: f.priority, assignee: f.assignee.trim() || null,
          start_date: f.start || null, end_date: f.end || null, status: f.status, progress: f.progress, predecessors: f.predecessors,
          ...(c?.afterId ? { after_id: c.afterId } : { parent_id: f.parent || null }),
        },
        { onSuccess: onClose },
      );
    }
  };

  const predOptions = tasks.filter((t) => !blocked.has(t.id) && !f.predecessors.includes(t.id));
  const parentOptions = [{ value: "", label: "최상위 (단계)" }, ...tasks.filter((t) => t.depth < 6).map((t) => ({ value: t.id, label: `${t.wbs} ${t.title}` }))];

  return (
    <form
      className="pms-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="tk-field">
        <label htmlFor={`${id}-title`}>작업 이름</label>
        <input id={`${id}-title`} className="tk-input tk-input--lg" value={f.title} maxLength={300} autoComplete="off" autoFocus={!task} onChange={(e) => set({ title: e.target.value })} />
      </div>

      <div className="tk-field">
        <span id={`${id}-status`}>상태</span>
        <div className="tk-segmented tk-segmented--block" role="radiogroup" aria-labelledby={`${id}-status`}>
          {STATUSES.map((s) => (
            <label key={s}>
              <input type="radio" name={`${id}-status`} checked={f.status === s} disabled={rollup} onChange={() => setStatus(s)} />
              {STATUS_LABEL[s]}
            </label>
          ))}
        </div>
        {rollup && <p className="tk-help">하위 작업이 있어서 상태와 진행률은 하위 작업에서 자동으로 계산돼요.</p>}
      </div>

      <div className="tk-field">
        <label htmlFor={`${id}-progress`}>진행률 <span className="pms-optional">{f.progress}%</span></label>
        <div className="pms-progress-edit">
          <input id={`${id}-progress`} className="tk-input pms-progress-edit__num" type="number" inputMode="numeric" min={0} max={100} step={5} value={f.progress} disabled={rollup} onChange={(e) => setProgress(Number(e.target.value))} />
          <div className="tk-chips" role="group" aria-label="진행률 빠른 선택">
            {QUICK_PROGRESS.map((n) => (
              <button key={n} type="button" className="tk-chip" aria-pressed={f.progress === n} disabled={rollup} onClick={() => setProgress(n)}>{n}%</button>
            ))}
          </div>
        </div>
      </div>

      <div className="pms-form__pair">
        <div className="tk-field">
          <label htmlFor={`${id}-assignee`}>담당자</label>
          <input id={`${id}-assignee`} className="tk-input" list={`${id}-members`} value={f.assignee} maxLength={100} autoComplete="off" placeholder="이름" onChange={(e) => set({ assignee: e.target.value })} />
          <datalist id={`${id}-members`}>{members.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <div className="tk-field">
          <span id={`${id}-prio`}>우선순위</span>
          <Select id={`${id}-priosel`} labelledBy={`${id}-prio`} value={f.priority} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} onChange={(v) => set({ priority: v })} />
        </div>
      </div>

      <div className="pms-form__pair">
        <div className="tk-field">
          <label htmlFor={`${id}-start`}>시작일</label>
          <input id={`${id}-start`} className="tk-input" type="date" value={f.start} disabled={datesLocked} onChange={(e) => set({ start: e.target.value, ...(f.end && e.target.value > f.end ? { end: e.target.value } : {}) })} />
        </div>
        <div className="tk-field">
          <label htmlFor={`${id}-end`}>종료일</label>
          <input id={`${id}-end`} className="tk-input" type="date" min={f.start || undefined} value={f.end} disabled={datesLocked} onChange={(e) => set({ end: e.target.value })} />
        </div>
      </div>
      {datesLocked && <p className="tk-help">기간은 하위 작업의 가장 이른 시작~가장 늦은 종료로 자동 계산돼요.</p>}

      {!task && target.mode === "create" && !target.afterId && (
        <div className="tk-field">
          <span id={`${id}-parent`}>상위 작업</span>
          <Select id={`${id}-parentsel`} labelledBy={`${id}-parent`} value={f.parent} options={parentOptions} onChange={(v) => set({ parent: v })} />
        </div>
      )}

      <div className="tk-field">
        <span id={`${id}-pred`}>선행 작업 <span className="pms-optional">끝나야 시작할 수 있는 작업</span></span>
        {f.predecessors.length > 0 && (
          <div className="tk-chips tk-chips--wrap" role="list" aria-labelledby={`${id}-pred`}>
            {f.predecessors.map((pid) => {
              const p = byId.get(pid);
              return (
                <span className="tk-chip" role="listitem" key={pid}>
                  <span>{p ? `${p.wbs} ${p.title}` : "삭제된 작업"}</span>
                  <button type="button" className="pms-chip-x" aria-label="선행 작업 빼기" onClick={() => set({ predecessors: f.predecessors.filter((x) => x !== pid) })}><Icon name="x" /></button>
                </span>
              );
            })}
          </div>
        )}
        {predOptions.length > 0 && (
          <Select
            id={`${id}-predsel`}
            labelledBy={`${id}-pred`}
            value=""
            options={[{ value: "", label: "선행 작업 추가…" }, ...predOptions.map((t) => ({ value: t.id, label: `${t.wbs} ${t.title}` }))]}
            onChange={(v) => v && set({ predecessors: [...f.predecessors, v] })}
          />
        )}
      </div>

      <div className="tk-field">
        <label htmlFor={`${id}-desc`}>설명 <span className="pms-optional">선택</span></label>
        <textarea id={`${id}-desc`} className="tk-textarea" rows={3} value={f.description} maxLength={20000} onChange={(e) => set({ description: e.target.value })} />
      </div>

      {err && <p className="tk-error" role="alert">{err}</p>}
      <div className="tk-button-group pms-form__actions">
        {task && !confirmDelete && (
          <>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>지우기</Button>
            {onAddChild && <Button variant="ghost" onClick={() => { onClose(); onAddChild(task.id); }}><Icon name="plus" />하위 작업</Button>}
          </>
        )}
        {task && confirmDelete && (
          <>
            <span className="pms-form__confirm" role="alert">{task.has_children ? "하위 작업까지 모두 지워져요." : "이 작업을 지울까요?"}</span>
            <Button variant="danger" busy={actions.remove.isPending} onClick={() => actions.remove.mutate(task.id, { onSuccess: onClose })}>네, 지울게요</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>취소</Button>
          </>
        )}
        {!confirmDelete && (
          <>
            <span className="pms-form__spacer" />
            <Button variant="ghost" onClick={onClose}>닫기</Button>
            <Button variant="primary" type="submit" busy={busy}>{task ? "저장" : "만들기"}</Button>
          </>
        )}
      </div>
    </form>
  );
}
