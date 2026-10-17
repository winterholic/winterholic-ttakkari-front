import { useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { CollisionDetection, DragEndEvent, DragStartEvent, SensorDescriptor, SensorOptions } from "@dnd-kit/core";
import { Link } from "react-router";
import type { PmsPriority, PmsProject, PmsTask, PmsTaskStatus } from "../../api/types";
import { useMediaQuery } from "../../shell/useMediaQuery";
import { Icon } from "../../ui/Icon";
import { Menu } from "../../ui/Menu";
import { toast } from "../../ui/toastStore";
import { ErrorState, ListSkeleton } from "../viewer/screenStates";
import { EmptyState } from "../viewer/screenStates";
import { dueText, shortDate, diffDays, todayStr } from "./dates";
import { STATUSES, STATUS_LABEL } from "./labels";
import { Initial, PriorityMark, assigneeOptions, useTaskActions, useTasks } from "./shared";
import type { TaskActions } from "./shared";
import { TaskDialog } from "./TaskDialog";
import type { TaskTarget } from "./TaskDialog";

const PRIO_RANK: Record<PmsPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
/** 폰(칸을 가로로 늘어놓으면 옆 칸이 잘리는 폭)에서는 상태 탭으로 한 칸씩 보여 준다. 칸 사이 끌기는 없고 카드 메뉴로 옮긴다. 데스크톱 칸반은 그대로. */
const COMPACT = "(max-width: 767px)";
const NO_SENSORS: SensorDescriptor<SensorOptions>[] = [];
const ALL = "__all";
const NONE = "__none";

/** 칸 안 순서: 지연·급한 것이 위로. 완료는 최근에 끝낸 것부터. */
function sortColumn(status: PmsTaskStatus, list: PmsTask[]): PmsTask[] {
  if (status === "done") return [...list].sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "") || a.wbs.localeCompare(b.wbs, undefined, { numeric: true }));
  return [...list].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      PRIO_RANK[a.priority] - PRIO_RANK[b.priority] ||
      (a.end_date ?? "9999").localeCompare(b.end_date ?? "9999") ||
      a.wbs.localeCompare(b.wbs, undefined, { numeric: true }),
  );
}

/** 포인터가 칸 안에 있으면 그 칸, 아니면 가장 많이 겹친 칸. 칸이 좁은 폰에서도 놓는 칸이 헷갈리지 않는다. */
const byColumn: CollisionDetection = (args) => {
  const hit = pointerWithin(args);
  return hit.length ? hit : rectIntersection(args);
};

function CardBody({ t, parent, blocked, overlay }: { t: PmsTask; parent?: PmsTask; blocked: boolean; overlay?: boolean }) {
  const today = todayStr();
  const days = t.end_date ? diffDays(today, t.end_date) : null;
  return (
    <>
      <span className="pms-card2__top">
        <span className="pms-card2__wbs">{t.wbs}</span>
        <PriorityMark priority={t.priority} />
        {blocked && <span className="pms-card2__blocked" title="끝나지 않은 선행 작업이 있어요"><Icon name="clock" />선행 대기</span>}
      </span>
      <span className="pms-card2__title">{t.title}</span>
      {parent && <span className="pms-card2__parent">{parent.title}</span>}
      <span className="pms-card2__meta">
        {t.assignee ? <span className="pms-card2__who"><Initial name={t.assignee} />{t.assignee}</span> : <span className="pms-card2__who pms-muted">미배정</span>}
        {t.end_date && (
          <span className="pms-card2__due" data-late={(t.overdue) || undefined}>
            <Icon name="calendar" />{shortDate(t.end_date)}{t.status !== "done" && days !== null && days <= 3 ? ` · ${dueText(days)}` : ""}
          </span>
        )}
        {t.status !== "todo" && t.status !== "done" && <span className="pms-card2__pct">{t.progress}%</span>}
      </span>
      {overlay && <span className="tk-sr-only">옮기는 중</span>}
    </>
  );
}

function Card({ t, parent, blocked, onOpen, onMove }: { t: PmsTask; parent?: PmsTask; blocked: boolean; onOpen: () => void; onMove: (s: PmsTaskStatus) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, data: { status: t.status } });
  return (
    <li className="pms-card2-wrap" data-dragging={isDragging || undefined}>
      <div ref={setNodeRef} className="pms-card2" data-status={t.status} data-late={t.overdue || undefined} {...attributes} {...listeners} role="button" tabIndex={0}
        aria-label={`${t.wbs} ${t.title}, ${STATUS_LABEL[t.status]}`}
        onClick={onOpen}
        onKeyDown={(e) => {
          // dnd-kit 키보드 센서가 Space 를 쓴다. Enter 는 상세를 연다.
          if (e.key === "Enter") onOpen();
          else listeners?.onKeyDown?.(e);
        }}>
        <CardBody t={t} parent={parent} blocked={blocked} />
      </div>
      <span className="pms-card2__menu" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <Menu
          label={`${t.title} 옮기기`}
          triggerClassName="tk-icon-button tk-icon-button--sm"
          items={STATUSES.filter((s) => s !== t.status).map((s) => ({ label: `${STATUS_LABEL[s]}(으)로`, onSelect: () => onMove(s) }))}
        >
          <Icon name="more-vertical" />
        </Menu>
      </span>
    </li>
  );
}

function Column({ status, tasks, byId, blockedIds, onOpen, onMove, onAdd, dragging }: {
  status: PmsTaskStatus;
  tasks: PmsTask[];
  byId: Map<string, PmsTask>;
  blockedIds: Set<string>;
  onOpen: (id: string) => void;
  onMove: (id: string, s: PmsTaskStatus) => void;
  onAdd: (s: PmsTaskStatus) => void;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section className="pms-col" data-status={status} data-over={isOver || undefined} data-dragging={dragging || undefined} aria-label={`${STATUS_LABEL[status]} ${tasks.length}건`}>
      <header className="pms-col__head">
        <h2><span className="pms-col__dot" aria-hidden="true" />{STATUS_LABEL[status]}<span className="pms-col__count">{tasks.length}</span></h2>
        <button type="button" className="tk-icon-button tk-icon-button--sm" aria-label={`${STATUS_LABEL[status]}에 작업 추가`} onClick={() => onAdd(status)}><Icon name="plus" /></button>
      </header>
      <ul ref={setNodeRef} className="pms-col__list">
        {tasks.map((t) => (
          <Card key={t.id} t={t} parent={t.parent_id ? byId.get(t.parent_id) : undefined} blocked={blockedIds.has(t.id)} onOpen={() => onOpen(t.id)} onMove={(s) => onMove(t.id, s)} />
        ))}
        {tasks.length === 0 && <li className="pms-col__empty">{dragging ? "여기에 놓기" : "비어 있어요"}</li>}
      </ul>
    </section>
  );
}

/**
 * 칸반: 말단 작업이 카드다(WBS 의 같은 작업). 카드를 칸으로 끌면 상태가 바뀌고 진행률이 맞춰진다.
 * 폰에서는 상태 탭(할 일·진행·검토·완료, 개수 표시)으로 한 칸씩 보고 ⋮ 메뉴로 옮긴다. 데스크톱은 네 칸을 나란히 두고 끌어 옮긴다.
 */
export function Board({ project }: { project: PmsProject }) {
  const q = useTasks(project.id);
  const actions: TaskActions = useTaskActions(project.id);
  const [target, setTarget] = useState<TaskTarget | null>(null);
  const [who, setWho] = useState(ALL);
  const [activeId, setActiveId] = useState<string | null>(null);
  const compact = useMediaQuery(COMPACT);
  const [picked, setPicked] = useState<PmsTaskStatus | null>(null);
  const sensors = useSensors(
    // PointerSensor 는 터치 스크롤과 다투므로 마우스·터치 센서를 따로 둔다. 터치는 길게 눌러야 끌려서 칸을 가로로 넘기는 스크롤과 구분된다.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const all = useMemo(() => q.data ?? [], [q.data]);
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all]);
  const leaves = useMemo(() => all.filter((t) => !t.has_children), [all]);
  const names = useMemo(() => assigneeOptions(project.members, all), [project.members, all]);
  const blockedIds = useMemo(() => new Set(leaves.filter((t) => t.status !== "done" && t.predecessors.some((p) => byId.get(p) && byId.get(p)!.status !== "done")).map((t) => t.id)), [leaves, byId]);
  const shown = leaves.filter((t) => who === ALL || (who === NONE ? !t.assignee : t.assignee === who));
  const active = activeId ? byId.get(activeId) : undefined;

  const move = (id: string, status: PmsTaskStatus) => {
    const t = byId.get(id);
    if (!t || t.status === status) return;
    actions.patch.mutate({ id, body: { status } });
    // 폰: 옮긴 카드가 지금 탭에서 사라지므로 어디로 갔는지 알려 준다
    if (compact) toast({ message: `"${t.title}"을(를) ${STATUS_LABEL[status]}(으)로 옮겼어요.` });
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const to = e.over?.id;
    if (typeof to === "string" && (STATUSES as readonly string[]).includes(to)) move(String(e.active.id), to as PmsTaskStatus);
  };

  // 탭: 고른 상태가 없으면 카드가 있는 첫 상태(진행 → 할 일 → 검토 → 완료)
  const counts = Object.fromEntries(STATUSES.map((st) => [st, shown.filter((t) => t.status === st).length])) as Record<PmsTaskStatus, number>;
  const current: PmsTaskStatus = picked ?? (["doing", "todo", "review", "done"] as const).find((st) => counts[st] > 0) ?? "todo";
  const visible = compact ? [current] : STATUSES;

  if (q.isPending) return <ListSkeleton rows={4} label="작업을 불러오는 중" />;
  if (q.isError) return <ErrorState error={q.error} what="작업" onRetry={() => void q.refetch()} />;

  return (
    <div className="pms-board">
      {leaves.length === 0 ? (
        <EmptyState
          icon="kanban"
          art="empty-work-visualization"
          title="칸반에 올릴 작업이 없어요"
          actions={
            <>
              <button className="tk-button tk-button--primary" type="button" onClick={() => setTarget({ mode: "create", status: "todo" })}><Icon name="plus" />작업 추가</button>
              <Link className="tk-button" to={`/wbs/${project.id}`}><Icon name="wbs" />WBS에서 쪼개기</Link>
            </>
          }
        >
          칸반의 카드는 WBS의 가장 아래 작업이에요. 여기서 바로 추가해도 되고, WBS에서 단계별로 나눠도 돼요.
        </EmptyState>
      ) : (
        <>
          {names.length > 0 && (
            <div className="tk-chips pms-board__who" role="group" aria-label="담당자로 거르기">
              <button type="button" className="tk-chip" aria-pressed={who === ALL} onClick={() => setWho(ALL)}>전체</button>
              {names.map((n) => <button key={n} type="button" className="tk-chip" aria-pressed={who === n} onClick={() => setWho(who === n ? ALL : n)}><Initial name={n} />{n}</button>)}
              <button type="button" className="tk-chip" aria-pressed={who === NONE} onClick={() => setWho(who === NONE ? ALL : NONE)}>미배정</button>
            </div>
          )}
          <DndContext
            sensors={compact ? NO_SENSORS : sensors}
            collisionDetection={byColumn}
            onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={onDragEnd}
            accessibility={{ screenReaderInstructions: { draggable: "Space 로 카드를 집고 좌우 화살표로 칸을 옮긴 뒤 Space 로 놓아요. Enter 는 상세 열기예요." } }}
          >
            {compact && (
              <div className="tk-tablist pms-board__tabs" role="tablist" aria-label="상태">
                {STATUSES.map((st) => (
                  <button key={st} type="button" id={`pms-tab-${st}`} className="tk-tab" role="tab" data-status={st} aria-selected={current === st} aria-controls="pms-tabpanel" tabIndex={current === st ? 0 : -1} onClick={() => setPicked(st)}>
                    {STATUS_LABEL[st]}<span className="pms-board__tabcount">{counts[st]}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="pms-cols" data-compact={compact || undefined} {...(compact ? { id: "pms-tabpanel", role: "tabpanel", "aria-labelledby": `pms-tab-${current}` } : {})}>
              {visible.map((s) => (
                <Column
                  key={s}
                  status={s}
                  tasks={sortColumn(s, shown.filter((t) => t.status === s))}
                  byId={byId}
                  blockedIds={blockedIds}
                  dragging={!!activeId}
                  onOpen={(id) => setTarget({ mode: "edit", id })}
                  onMove={move}
                  onAdd={(st) => setTarget({ mode: "create", status: st })}
                />
              ))}
            </div>
            <DragOverlay dropAnimation={null}>
              {active && <div className="pms-card2 pms-card2--overlay" data-status={active.status}><CardBody t={active} parent={active.parent_id ? byId.get(active.parent_id) : undefined} blocked={false} overlay /></div>}
            </DragOverlay>
          </DndContext>
          <p className="pms-hint">{compact ? "위 탭으로 상태를 바꿔 보고, 카드의 ⋮ 메뉴에서 상태를 옮겨요. 완료로 옮기면 진행률이 100%가 돼요." : "카드를 끌어 칸을 옮기면 상태가 바뀌어요. 완료로 옮기면 진행률이 100%가 돼요."}</p>
        </>
      )}
      <TaskDialog target={target} tasks={all} members={names} actions={actions} onClose={() => setTarget(null)} onAddChild={(id) => setTarget({ mode: "create", parentId: id })} />
    </div>
  );
}
