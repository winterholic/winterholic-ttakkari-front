import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { createPmsMilestone, deletePmsMilestone, getPmsDashboard, patchPmsMilestone } from "../../api/client";
import type { PmsAssigneeRow, PmsDashboard, PmsProject, PmsTaskBrief } from "../../api/types";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { ErrorState, ListSkeleton } from "../viewer/screenStates";
import { dueText, longDate, shortDate } from "./dates";
import { NOTE_KIND_LABEL, SEVERITY_LABEL, STATUS_LABEL } from "./labels";
import { progressTone } from "./ProjectList";
import { KEYS, Meter, PriorityMark, StatusPill, assigneeOptions, useTaskActions, useTasks } from "./shared";
import { TaskDialog } from "./TaskDialog";
import type { TaskTarget } from "./TaskDialog";

function Panel({ title, icon, aside, children, className }: { title: string; icon?: "flag" | "users" | "warning" | "clock"; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className ? `pms-panel ${className}` : "pms-panel"}>
      <header className="pms-panel__head">
        <h2>{icon && <Icon name={icon} />}{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone?: "danger" | "success" | "info"; hint?: string }) {
  return (
    <div className="pms-stat" data-tone={tone}>
      <span className="pms-stat__value">{value}</span>
      <span className="pms-stat__label">{label}</span>
      {hint && <span className="pms-stat__hint">{hint}</span>}
    </div>
  );
}

/** 일정 대비 진행: 기간이 있으면 오늘까지 흘러간 비율과 비교해 말로 알려 준다. */
function scheduleText(d: PmsDashboard): { text: string; tone?: "success" | "warning" | "danger" } | null {
  if (d.counts.total === 0) return null;
  if (d.planned_progress === null) return null;
  const gap = d.progress - d.planned_progress;
  if (d.project.status === "done") return null;
  if (gap >= 5) return { text: `일정보다 ${gap}%p 앞서 있어요`, tone: "success" };
  if (gap <= -15) return { text: `일정보다 ${-gap}%p 뒤처졌어요`, tone: "danger" };
  if (gap <= -5) return { text: `일정보다 ${-gap}%p 늦어요`, tone: "warning" };
  return { text: "일정대로 가고 있어요", tone: "success" };
}

function Hero({ d }: { d: PmsDashboard }) {
  const sched = scheduleText(d);
  const tone = progressTone(d.progress, d.planned_progress, d.counts.overdue);
  const left = d.days_left;
  return (
    <section className="pms-hero" aria-label="전체 진행">
      <div className="pms-hero__main">
        <span className="pms-hero__pct">{d.progress}<small>%</small></span>
        <div className="pms-hero__side">
          {left !== null && (
            <span className="pms-hero__due" data-late={left < 0 || undefined}>
              {left > 0 ? `마감까지 ${left}일` : left === 0 ? "오늘 마감" : `마감 ${-left}일 지남`}
            </span>
          )}
          {sched && <span className={`pms-hero__sched pms-text-${sched.tone}`}>{sched.text}</span>}
        </div>
      </div>
      <div className="pms-hero__bar">
        <Meter value={d.progress} label="전체 진행률" tone={tone} large />
        {d.planned_progress !== null && (
          <span className="pms-hero__plan" style={{ left: `${d.planned_progress}%` } as CSSProperties} title={`기간상 오늘까지 ${d.planned_progress}%`}>
            <span className="tk-sr-only">기간상 오늘까지 {d.planned_progress}%</span>
          </span>
        )}
      </div>
      {d.planned_progress !== null && <p className="pms-hero__legend"><span aria-hidden="true" className="pms-hero__tick" />기간상 오늘 {d.planned_progress}%</p>}
    </section>
  );
}

function TaskRow({ t, onOpen }: { t: PmsTaskBrief; onOpen: (id: string) => void }) {
  return (
    <li>
      <button type="button" className="pms-row" onClick={() => onOpen(t.id)}>
        <span className="pms-row__wbs">{t.wbs}</span>
        <span className="pms-row__body">
          <span className="pms-row__title">{t.title}<PriorityMark priority={t.priority} /></span>
          <span className="pms-row__meta">
            <StatusPill status={t.status} />
            {t.assignee && <span>{t.assignee}</span>}
            <span>{t.progress}%</span>
          </span>
        </span>
        <span className="pms-row__due" data-late={(t.days !== null && t.days < 0) || undefined}>
          {t.end_date && <span>{shortDate(t.end_date)}</span>}
          <b>{dueText(t.days)}</b>
        </span>
      </button>
    </li>
  );
}

function Workload({ rows }: { rows: PmsAssigneeRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <ul className="pms-load" aria-label="담당자별 작업">
      {rows.map((r) => (
        <li key={r.name || "-"}>
          <span className="pms-load__name">{r.name || "미배정"}</span>
          <span className="pms-load__bar" style={{ width: `${(r.total / max) * 100}%` }} role="img" aria-label={`완료 ${r.done}, 진행·검토 ${r.doing + r.review}, 할 일 ${r.todo}`}>
            {r.done > 0 && <span data-status="done" style={{ flexGrow: r.done }} />}
            {r.doing + r.review > 0 && <span data-status="doing" style={{ flexGrow: r.doing + r.review }} />}
            {r.todo > 0 && <span data-status="todo" style={{ flexGrow: r.todo }} />}
          </span>
          <span className="pms-load__num">{r.done}/{r.total}{r.overdue > 0 && <b className="pms-text-danger"> · 지연 {r.overdue}</b>}</span>
        </li>
      ))}
    </ul>
  );
}

function Milestones({ d, projectId }: { d: PmsDashboard; projectId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEYS.dashboard(projectId) });
    void qc.invalidateQueries({ queryKey: KEYS.projects });
  };
  const fail = (e: unknown) => toast({ message: errorText(e).message });
  const add = useMutation({
    mutationFn: () => createPmsMilestone(projectId, { title: title.trim(), due_date: date }),
    onSuccess: () => {
      setTitle("");
      setDate("");
      refresh();
    },
    onError: fail,
  });
  const toggle = useMutation({ mutationFn: (v: { id: string; done: boolean }) => patchPmsMilestone(v.id, { done: v.done }), onSuccess: refresh, onError: fail });
  const del = useMutation({ mutationFn: (id: string) => deletePmsMilestone(id), onSuccess: refresh, onError: fail });
  return (
    <Panel title="마일스톤" icon="flag" aside={<span className="pms-panel__count">{d.milestones.filter((m) => !m.done).length}개 남음</span>}>
      {d.milestones.length === 0 && <p className="pms-muted">출시일·중간 점검처럼 기억해야 할 날짜를 적어 두세요.</p>}
      <ul className="pms-miles">
        {d.milestones.map((m) => (
          <li key={m.id} data-done={m.done || undefined}>
            <label className="tk-checkbox tk-checkbox--bare">
              <input type="checkbox" checked={m.done} onChange={(e) => toggle.mutate({ id: m.id, done: e.target.checked })} aria-label={`${m.title} 완료`} />
            </label>
            <span className="pms-miles__title">{m.title}</span>
            <span className="pms-miles__due" data-late={m.overdue || undefined}>{longDate(m.due_date, d.today)}{!m.done && <b>{dueText(m.days)}</b>}</span>
            <button type="button" className="tk-icon-button tk-icon-button--sm" aria-label={`${m.title} 지우기`} onClick={() => del.mutate(m.id)}><Icon name="x" /></button>
          </li>
        ))}
      </ul>
      <form
        className="pms-inline-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && date) add.mutate();
        }}
      >
        <input className="tk-input tk-input--sm" value={title} maxLength={200} placeholder="새 마일스톤" aria-label="마일스톤 이름" autoComplete="off" onChange={(e) => setTitle(e.target.value)} />
        <input className="tk-input tk-input--sm" type="date" value={date} aria-label="마일스톤 기한" onChange={(e) => setDate(e.target.value)} />
        <Button size="sm" type="submit" busy={add.isPending} disabled={!title.trim() || !date}><Icon name="plus" />추가</Button>
      </form>
    </Panel>
  );
}

export function Dashboard({ project }: { project: PmsProject }) {
  const q = useQuery({ queryKey: KEYS.dashboard(project.id), queryFn: () => getPmsDashboard(project.id) });
  const tasks = useTasks(project.id);
  const actions = useTaskActions(project.id);
  const [target, setTarget] = useState<TaskTarget | null>(null);
  const d = q.data;

  if (q.isError) return <ErrorState error={q.error} what="대시보드" onRetry={() => void q.refetch()} />;
  if (!d) return <ListSkeleton rows={4} label="대시보드를 불러오는 중" />;
  const list = tasks.data ?? [];
  const c = d.counts;
  const open = (id: string) => setTarget({ mode: "edit", id });

  return (
    <div className="pms-dash">
      {c.total === 0 ? (
        <section className="pms-panel pms-dash__empty">
          <Icon name="wbs" />
          <p className="pms-panel__lead">아직 작업이 없어요</p>
          <p className="pms-muted">WBS에서 단계와 작업을 쪼개면 진행률·마감·담당자 현황이 여기에 모여요.</p>
          <Link className="tk-button tk-button--primary" to={`/wbs/${project.id}`}><Icon name="wbs" />WBS 만들기</Link>
        </section>
      ) : (
        <>
          <Hero d={d} />
          <div className="pms-stats">
            <Stat label="전체 작업" value={c.total} />
            <Stat label="진행·검토" value={c.doing + c.review} tone="info" />
            <Stat label="완료" value={c.done} tone="success" />
            <Stat label="지연" value={c.overdue} tone={c.overdue ? "danger" : undefined} hint={c.due_soon ? `임박 ${c.due_soon}` : undefined} />
          </div>
        </>
      )}

      <div className="pms-dash__grid">
        {(d.overdue.length > 0 || d.due_soon.length > 0) && (
          <Panel title="지연·마감 임박" icon="clock" className="pms-dash__wide" aside={<span className="pms-panel__count">7일 이내</span>}>
            {d.overdue.length > 0 && (
              <>
                <h3 className="pms-sub pms-text-danger">지연 {c.overdue}</h3>
                <ul className="pms-rows">{d.overdue.map((t) => <TaskRow key={t.id} t={t} onOpen={open} />)}</ul>
              </>
            )}
            {d.due_soon.length > 0 && (
              <>
                <h3 className="pms-sub">마감 임박 {c.due_soon}</h3>
                <ul className="pms-rows">{d.due_soon.map((t) => <TaskRow key={t.id} t={t} onOpen={open} />)}</ul>
              </>
            )}
          </Panel>
        )}

        <Milestones d={d} projectId={project.id} />

        {d.phases.length > 0 && (
          <Panel title="단계별 진행">
            <ul className="pms-phases">
              {d.phases.map((ph) => (
                <li key={ph.id}>
                  <span className="pms-phases__name"><b>{ph.wbs}</b> {ph.title}</span>
                  <Meter value={ph.progress} label={`${ph.title} 진행률`}  />
                  <span className="pms-phases__pct">{ph.progress}%</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {d.by_assignee.length > 0 && (
          <Panel title="담당자별 현황" icon="users" aside={<span className="pms-legend"><i data-status="done" />완료<i data-status="doing" />진행<i data-status="todo" />할 일</span>}>
            <Workload rows={d.by_assignee} />
          </Panel>
        )}

        <Panel
          title="이슈·리스크"
          icon="warning"
          aside={<Link className="tk-link" to={`/pms/${project.id}/notes`}>모두 보기</Link>}
        >
          {d.notes.open === 0 ? (
            <p className="pms-muted">열린 이슈나 리스크가 없어요.</p>
          ) : (
            <>
              <p className="pms-notes-sum">
                열림 {d.notes.open}<span> · 이슈 {d.notes.issues} · 리스크 {d.notes.risks}</span>
                {d.notes.high > 0 && <Badge tone="danger">심각 {d.notes.high}</Badge>}
              </p>
              <ul className="pms-rows">
                {d.notes.top.map((n) => (
                  <li key={n.id}>
                    <Link className="pms-row" to={`/pms/${project.id}/notes`}>
                      <span className="pms-row__wbs" data-severity={n.severity}>{NOTE_KIND_LABEL[n.kind]}</span>
                      <span className="pms-row__body"><span className="pms-row__title">{n.title}</span><span className="pms-row__meta"><span>심각도 {SEVERITY_LABEL[n.severity]}</span>{n.owner && <span>{n.owner}</span>}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        {c.total > 0 && (
          <Panel title="상태 분포">
            <div className="pms-dist" role="img" aria-label={`할 일 ${c.todo}, 진행 ${c.doing}, 검토 ${c.review}, 완료 ${c.done}`}>
              {(["done", "review", "doing", "todo"] as const).map((s) => c[s] > 0 && <span key={s} data-status={s} style={{ flexGrow: c[s] }}>{c[s]}</span>)}
            </div>
            <ul className="pms-dist__legend">
              {(["todo", "doing", "review", "done"] as const).map((s) => <li key={s}><i data-status={s} />{STATUS_LABEL[s]} {c[s]}</li>)}
            </ul>
          </Panel>
        )}
      </div>

      <TaskDialog target={target} tasks={list} members={assigneeOptions(project.members, list)} actions={actions} onClose={() => setTarget(null)} />
    </div>
  );
}
