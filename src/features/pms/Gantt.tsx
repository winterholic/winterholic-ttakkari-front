import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPmsMilestones } from "../../api/client";
import type { PmsProject, PmsTask } from "../../api/types";
import { Icon } from "../../ui/Icon";
import { EmptyState } from "../viewer/screenStates";
import { addDays, diffDays, isDay, rangeText, todayStr } from "./dates";
import { DAY_W, ZOOM_LABEL, barOf, chartRange, dayMarks, dragDates, monthMarks, snapDays, xOfDay } from "./ganttMath";
import type { Zoom } from "./ganttMath";
import { KEYS, useWide } from "./shared";
import type { TaskActions } from "./shared";
import { visibleTasks } from "./WbsTable";

const ROW_H = 40;
const MONTH_H = 24;
const DAY_H = 28;
const HEAD_H = MONTH_H + DAY_H;

type Drag = { id: string; mode: "move" | "start" | "end"; dx: number; moved: boolean; x0: number };

/**
 * 간트 타임라인. 왼쪽 작업 이름 칸은 가로로 스크롤해도 고정되고, 위 날짜 줄도 세로로 스크롤하면 고정된다.
 * 막대: 끌어서 옮기기·양 끝 늘이기(마우스), 눌러서 상세(터치·마우스), 일정 없는 작업은 빈 줄을 눌러 그 날짜로 잡기.
 * 폰에서는 이름 칸을 좁히고 가로로 밀어서 본다. 선행 작업은 화살표로 이어진다.
 */
export function Gantt({ project, tasks, actions, onOpen }: {
  project: PmsProject;
  tasks: PmsTask[];
  actions: TaskActions;
  onOpen: (id: string) => void;
}) {
  const wide = useWide();
  const labelW = wide ? 280 : 132;
  const [zoom, setZoom] = useState<Zoom>("week");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const lastPointer = useRef<string>("mouse");
  const scroller = useRef<HTMLDivElement>(null);
  const ms = useQuery({ queryKey: KEYS.milestones(project.id), queryFn: () => listPmsMilestones(project.id) });
  const milestones = useMemo(() => ms.data?.milestones ?? [], [ms.data]);
  const today = todayStr();
  const dayW = DAY_W[zoom];
  const rows = useMemo(() => visibleTasks(tasks, collapsed), [tasks, collapsed]);
  // 간트 범위는 드래그 중에 흔들리지 않게 서버 값으로만 정한다.
  const range = useMemo(() => chartRange(tasks, milestones, project, today), [tasks, milestones, project, today]);
  const months = useMemo(() => monthMarks(range, dayW), [range, dayW]);
  const days = useMemo(() => dayMarks(range, zoom), [range, zoom]);
  const trackW = range.days * dayW;
  const hasMs = milestones.length > 0;
  const rowTop = (i: number) => (hasMs ? ROW_H : 0) + i * ROW_H;
  const index = useMemo(() => new Map(rows.map((t, i) => [t.id, i])), [rows]);
  const bodyH = rowTop(rows.length);

  const scrollToToday = (smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, xOfDay(today, range, dayW) - (el.clientWidth - labelW) / 3), behavior: smooth ? "smooth" : "auto" });
  };
  // 처음 열 때와 확대 단계를 바꿀 때 오늘이 보이게 맞춘다.
  useEffect(() => {
    scrollToToday(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, wide]);

  const bar = (t: PmsTask) => {
    let s = t.start_date;
    let e = t.end_date;
    if (drag && drag.id === t.id && isDay(s ?? e)) {
      const d = dragDates((s ?? e)!, (e ?? s)!, drag.mode, snapDays(drag.dx, dayW));
      s = d.start;
      e = d.end;
    }
    return barOf({ start_date: s, end_date: e }, range, dayW);
  };

  const begin = (ev: PointerEvent<HTMLElement>, t: PmsTask, mode: Drag["mode"]) => {
    lastPointer.current = ev.pointerType;
    if (ev.pointerType === "touch" || ev.button !== 0) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    ev.stopPropagation();
    setDrag({ id: t.id, mode, dx: 0, moved: false, x0: ev.clientX });
  };
  const moveDrag = (ev: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x0;
    setDrag({ ...drag, dx, moved: drag.moved || Math.abs(dx) > 3 });
  };
  const endDrag = (ev: PointerEvent<HTMLElement>, t: PmsTask, cancelled = false) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
    if (cancelled) return;
    if (!d.moved) return onOpen(t.id);
    const delta = snapDays(d.dx, dayW);
    const s = t.start_date ?? t.end_date;
    const e = t.end_date ?? t.start_date;
    if (delta === 0 || !isDay(s) || !isDay(e)) return;
    const next = dragDates(s, e, d.mode, delta);
    actions.patch.mutate({ id: t.id, body: { start_date: next.start, end_date: next.end } });
  };
  const setDayFromTrack = (ev: PointerEvent<HTMLElement>, t: PmsTask) => {
    if (t.has_children || t.dates_rollup || t.start_date || t.end_date) return;
    const x = ev.clientX - ev.currentTarget.getBoundingClientRect().left;
    const day = addDays(range.start, Math.max(0, Math.floor(x / dayW)));
    actions.patch.mutate({ id: t.id, body: { start_date: day, end_date: day } });
  };

  if (tasks.length === 0) {
    return <EmptyState icon="gantt" title="간트에 그릴 작업이 없어요">WBS 표에서 작업을 만들고 시작·종료일을 잡으면 여기에 막대로 나타나요.</EmptyState>;
  }

  const lines = rows.flatMap((t) =>
    t.predecessors.flatMap((pid) => {
      const p = tasks.find((x) => x.id === pid);
      const pb = p && index.has(p.id) ? bar(p) : null;
      const tb = index.has(t.id) ? bar(t) : null;
      if (!p || !pb || !tb) return [];
      const x1 = pb.left + pb.width;
      const y1 = rowTop(index.get(p.id)!) + ROW_H / 2;
      const x2 = tb.left;
      const y2 = rowTop(index.get(t.id)!) + ROW_H / 2;
      const late = x2 < x1;
      const d =
        x2 >= x1 + 12
          ? `M${x1} ${y1} H${x1 + 6} V${y2} H${x2 - 1}`
          : `M${x1} ${y1} H${x1 + 6} V${y1 + (y2 >= y1 ? ROW_H / 2 : -ROW_H / 2)} H${x2 - 8} V${y2} H${x2 - 1}`;
      return [{ key: `${pid}>${t.id}`, d, x2, y2, late }];
    }),
  );
  const todayX = xOfDay(today, range, dayW) + dayW / 2;
  const inRange = diffDays(range.start, today) >= 0 && diffDays(today, range.end) >= 0;

  return (
    <div className="pms-gantt-wrap">
      <div className="pms-gantt__bar">
        <div className="tk-segmented" role="radiogroup" aria-label="간트 확대">
          {(["day", "week", "month"] as const).map((z) => (
            <label key={z}><input type="radio" name="pms-zoom" checked={zoom === z} onChange={() => setZoom(z)} />{ZOOM_LABEL[z]}</label>
          ))}
        </div>
        <button type="button" className="tk-button tk-button--sm" onClick={() => scrollToToday()}><Icon name="calendar" />오늘</button>
        <span className="pms-gantt__legend" aria-hidden="true">
          <i data-status="todo" />할 일<i data-status="doing" />진행<i data-status="review" />검토<i data-status="done" />완료<i data-late="true" />지연
        </span>
      </div>
      <div className="pms-gantt" ref={scroller} tabIndex={0} aria-label="간트 타임라인" style={{ "--g-label": `${labelW}px`, "--g-row": `${ROW_H}px`, "--g-head": `${HEAD_H}px` } as CSSProperties}>
        <div className="pms-gantt__inner" style={{ width: labelW + trackW }}>
          <div className="pms-gantt__head">
            <div className="pms-gantt__corner">작업</div>
            <div className="pms-gantt__scale" style={{ width: trackW }}>
              <div className="pms-gantt__months" style={{ height: MONTH_H }}>
                {months.map((m) => <span key={m.key} style={{ left: m.left, width: m.width }}>{m.label}</span>)}
              </div>
              <div className="pms-gantt__days" style={{ height: DAY_H }}>
                {days.map((d) => d.label ? (
                  <span key={d.day} data-weekend={d.weekend || undefined} data-week={d.weekStart || undefined} style={{ left: d.left, width: d.width }}>{d.label}</span>
                ) : null)}
                {inRange && <i className="pms-gantt__flag" style={{ left: todayX }} title="오늘" />}
              </div>
            </div>
          </div>

          <div className="pms-gantt__body" style={{ height: bodyH }}>
            <div className="pms-gantt__bg" style={{ left: labelW, width: trackW, height: bodyH }} aria-hidden="true">
              {days.filter((d) => d.weekend && zoom !== "month").map((d) => <i key={d.day} className="pms-gantt__wk" style={{ left: d.left, width: d.width }} />)}
              {days.filter((d) => d.weekStart && zoom !== "month").map((d) => <i key={d.day} className="pms-gantt__grid" style={{ left: d.left }} />)}
              {zoom === "month" && months.map((m) => <i key={m.key} className="pms-gantt__grid" style={{ left: m.left }} />)}
            </div>

            {hasMs && (
              <div className="pms-grow pms-grow--ms" style={{ top: 0 }}>
                <div className="pms-grow__label"><Icon name="flag" />마일스톤</div>
                <div className="pms-grow__track" style={{ width: trackW }}>
                  {milestones.map((m) => (
                    <span key={m.id} className="pms-ms" data-done={m.done || undefined} data-late={m.overdue || undefined} style={{ left: xOfDay(m.due_date, range, dayW) + dayW / 2 }} title={`${m.title} · ${m.due_date}`}>
                      <i aria-hidden="true" />
                      <span>{m.title}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {rows.map((t, i) => {
              const b = bar(t);
              const isParent = t.has_children;
              const draggable = !isParent && !t.dates_rollup && wide;
              const open = !collapsed.has(t.id);
              const dragging = drag?.id === t.id && drag.moved;
              return (
                <div key={t.id} className="pms-grow" data-depth={Math.min(t.depth, 3)} data-parent={isParent || undefined} style={{ top: rowTop(i) }}>
                  <div className="pms-grow__label" style={{ "--d": t.depth } as CSSProperties}>
                    {isParent ? (
                      <button type="button" className="pms-twisty" aria-label={open ? `${t.title} 접기` : `${t.title} 펼치기`} onClick={() => setCollapsed((c) => { const n = new Set(c); if (open) n.add(t.id); else n.delete(t.id); return n; })}>
                        <Icon name={open ? "chevron-down" : "chevron-right"} />
                      </button>
                    ) : <span className="pms-twisty pms-twisty--leaf" aria-hidden="true" />}
                    <button type="button" className="pms-grow__name" onClick={() => onOpen(t.id)} title={`${t.wbs} ${t.title}`}>
                      <b>{t.wbs}</b><span>{t.title}</span>
                    </button>
                  </div>
                  <div
                    className="pms-grow__track"
                    style={{ width: trackW }}
                    data-empty={!b && !isParent ? "true" : undefined}
                    onPointerUp={!b ? (e) => setDayFromTrack(e, t) : undefined}
                    title={!b && !isParent ? "눌러서 이 날짜로 일정 잡기" : undefined}
                  >
                    {b ? (
                      <span
                        className={isParent ? "pms-bar pms-bar--parent" : "pms-bar"}
                        data-status={t.status}
                        data-late={t.overdue || undefined}
                        data-dragging={dragging || undefined}
                        style={{ left: b.left, width: b.width }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${t.wbs} ${t.title}, ${rangeText(t.start_date, t.end_date)}, 진행 ${t.progress}%`}
                        onKeyDown={(e) => e.key === "Enter" && onOpen(t.id)}
                        onPointerDown={draggable ? (e) => begin(e, t, "move") : undefined}
                        onPointerMove={draggable ? moveDrag : undefined}
                        onPointerUp={draggable ? (e) => endDrag(e, t) : undefined}
                        onPointerCancel={draggable ? (e) => endDrag(e, t, true) : undefined}
                        // 마우스로 끈 뒤에 따라오는 click 은 무시하고, 터치·키보드 탭만 상세를 연다.
                        onClick={() => (!draggable || lastPointer.current === "touch") && onOpen(t.id)}
                      >
                        {!isParent && <span className="pms-bar__fill" style={{ width: `${t.progress}%` }} />}
                        {draggable && (
                          <>
                            <span className="pms-bar__grip pms-bar__grip--start" onPointerDown={(e) => begin(e, t, "start")} onPointerMove={(e) => { e.stopPropagation(); moveDrag(e); }} onPointerUp={(e) => { e.stopPropagation(); endDrag(e, t); }} onPointerCancel={(e) => { e.stopPropagation(); endDrag(e, t, true); }} />
                            <span className="pms-bar__grip pms-bar__grip--end" onPointerDown={(e) => begin(e, t, "end")} onPointerMove={(e) => { e.stopPropagation(); moveDrag(e); }} onPointerUp={(e) => { e.stopPropagation(); endDrag(e, t); }} onPointerCancel={(e) => { e.stopPropagation(); endDrag(e, t, true); }} />
                          </>
                        )}
                      </span>
                    ) : (
                      !isParent && <span className="pms-grow__none">일정 없음 · 눌러서 잡기</span>
                    )}
                    {b && <span className="pms-bar__out" style={{ left: b.left + b.width + 6 }}>{t.progress}%</span>}
                  </div>
                </div>
              );
            })}

            <div className="pms-gantt__fg" style={{ left: labelW, width: trackW, height: bodyH }} aria-hidden="true">
              {inRange && <i className="pms-gantt__today" style={{ left: todayX }} />}
              <svg width={trackW} height={bodyH} className="pms-gantt__deps">
                {lines.map((l) => (
                  <g key={l.key} data-late={l.late || undefined}>
                    <path d={l.d} />
                    <path className="pms-gantt__head-arrow" d={`M${l.x2 - 6} ${l.y2 - 3.5} L${l.x2} ${l.y2} L${l.x2 - 6} ${l.y2 + 3.5} Z`} />
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      </div>
      <p className="pms-hint">
        {wide ? "막대를 끌어 일정을 옮기고, 양 끝을 끌어 기간을 늘려요. 눌러서 상세를 열어요." : "가로로 밀어서 보고, 막대를 눌러 상세를 열어요."} 일정이 없는 작업은 빈 줄을 눌러 그 날짜로 잡을 수 있어요.
      </p>
    </div>
  );
}
