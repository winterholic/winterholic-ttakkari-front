import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { PmsProject, PmsTask } from "../../api/types";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { EmptyState } from "../viewer/screenStates";
import { rangeText } from "./dates";
import { Initial, Meter, PriorityMark, StatusPill, assigneeOptions, useWide } from "./shared";
import type { TaskActions } from "./shared";

const NEW_TASK = "새 작업";
const NEW_PHASE = "새 단계";

/** 접힌 상위 작업 아래에 있는 줄을 뺀 보이는 줄. tasks 는 트리 순서라 한 번 훑으면 된다. */
export function visibleTasks(tasks: PmsTask[], collapsed: Set<string>): PmsTask[] {
  const out: PmsTask[] = [];
  let hideBelow: number | null = null;
  for (const t of tasks) {
    if (hideBelow !== null) {
      if (t.depth > hideBelow) continue;
      hideBelow = null;
    }
    out.push(t);
    if (collapsed.has(t.id) && t.has_children) hideBelow = t.depth;
  }
  return out;
}

/** "1.2, 2.1" → 선행 작업 id 목록. 모르는 번호는 따로 돌려준다. */
export function parsePredecessors(text: string, tasks: PmsTask[]): { ids: string[]; unknown: string[] } {
  const byWbs = new Map(tasks.map((t) => [t.wbs, t.id]));
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const tok of text.split(/[\s,]+/).filter(Boolean)) {
    const id = byWbs.get(tok.replace(/\.$/, ""));
    if (!id) unknown.push(tok);
    else if (!ids.includes(id)) ids.push(id);
  }
  return { ids, unknown };
}

function ToolButton({ icon, label, onClick, disabled, hint }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <button type="button" className="pms-tool" onClick={onClick} disabled={disabled} title={hint ? `${label} (${hint})` : label} aria-label={label}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  );
}

/**
 * WBS 트리 표. 번호(1.1.2)·상위 작업 집계는 서버가 계산해 주고, 여기서는 줄을 직접 고친다.
 * 제목 칸에서 Enter 형제 추가 · Ctrl+Enter 하위 추가 · Tab 들여쓰기 · Shift+Tab 내어쓰기 · Alt+↑↓ 순서 · ↑↓ 줄 이동.
 * 폰에서는 칸으로 펼치지 않고 줄마다 제목(바로 수정)과 요약 한 줄이며, 요약을 누르면 상세 창이 열린다.
 */
export function WbsTable({ project, tasks, actions, onOpen }: {
  project: PmsProject;
  tasks: PmsTask[];
  actions: TaskActions;
  onOpen: (id: string) => void;
}) {
  const wide = useWide();
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const focusId = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const rows = useMemo(() => visibleTasks(tasks, collapsed), [tasks, collapsed]);
  const members = useMemo(() => assigneeOptions(project.members, tasks), [project.members, tasks]);
  const sel = selected ? byId.get(selected) : undefined;
  const parents = tasks.filter((t) => t.has_children);

  // 만들거나 옮긴 줄의 제목 칸으로 포커스를 따라간다(키보드로 계속 이어 쓰게).
  useEffect(() => {
    const id = focusId.current;
    if (!id) return;
    const el = root.current?.querySelector<HTMLInputElement>(`[data-title-input="${id}"]`);
    if (el) {
      focusId.current = null;
      el.focus();
      el.select();
    }
  }, [tasks, rows]);

  const sibs = (t: PmsTask) => tasks.filter((x) => x.parent_id === t.parent_id);
  const reveal = (id: string) => setCollapsed((c) => { if (!c.has(id)) return c; const n = new Set(c); n.delete(id); return n; });
  const created = (r: { task: PmsTask }) => { focusId.current = r.task.id; setSelected(r.task.id); };

  const addSibling = (t: PmsTask) => actions.create.mutate({ title: t.depth === 0 ? NEW_PHASE : NEW_TASK, after_id: t.id }, { onSuccess: created });
  const addChild = (t: PmsTask) => {
    reveal(t.id);
    actions.create.mutate({ title: NEW_TASK, parent_id: t.id }, { onSuccess: created });
  };
  const addRoot = () => actions.create.mutate({ title: NEW_PHASE, parent_id: null }, { onSuccess: created });
  const indent = (t: PmsTask) => {
    const s = sibs(t);
    const i = s.findIndex((x) => x.id === t.id);
    if (i <= 0) return toast({ message: "들여쓰려면 위에 같은 단계의 작업이 있어야 해요." });
    reveal(s[i - 1].id);
    actions.move.mutate({ id: t.id, parent_id: s[i - 1].id }, { onSuccess: () => { focusId.current = t.id; } });
  };
  const outdent = (t: PmsTask) => {
    if (!t.parent_id) return toast({ message: "이미 맨 위 단계예요." });
    const p = byId.get(t.parent_id)!;
    const pi = sibs(p).findIndex((x) => x.id === p.id);
    actions.move.mutate({ id: t.id, parent_id: p.parent_id, index: pi + 1 }, { onSuccess: () => { focusId.current = t.id; } });
  };
  const shift = (t: PmsTask, dir: -1 | 1) => {
    const s = sibs(t);
    const i = s.findIndex((x) => x.id === t.id);
    if (i + dir < 0 || i + dir >= s.length) return;
    actions.move.mutate({ id: t.id, parent_id: t.parent_id, index: i + dir }, { onSuccess: () => { focusId.current = t.id; } });
  };
  const remove = (t: PmsTask) => {
    const idx = rows.findIndex((r) => r.id === t.id);
    const next = rows[idx + 1] ?? rows[idx - 1];
    const n = tasks.filter((x) => x.id === t.id || descendsFrom(tasks, x, t.id)).length;
    if (n > 1 && !window.confirm(`"${t.title}"과 하위 작업 ${n - 1}개를 지울까요?`)) return;
    actions.remove.mutate(t.id, { onSuccess: () => setSelected(next?.id ?? null) });
  };

  const focusRow = (from: PmsTask, dir: -1 | 1) => {
    const i = rows.findIndex((r) => r.id === from.id);
    const target = rows[i + dir];
    if (!target) return;
    const el = root.current?.querySelector<HTMLInputElement>(`[data-title-input="${target.id}"]`);
    el?.focus();
    el?.select();
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>, t: PmsTask) => {
    if (e.nativeEvent.isComposing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur(); // 제목 저장은 blur 에서
      if (mod) addChild(t);
      else addSibling(t);
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.currentTarget.blur();
      if (e.shiftKey) outdent(t);
      else indent(t);
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      shift(t, e.key === "ArrowUp" ? -1 : 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(t, e.key === "ArrowUp" ? -1 : 1);
    } else if (e.key === "Escape") {
      e.currentTarget.value = t.title;
      e.currentTarget.blur();
    }
  };

  const saveTitle = (t: PmsTask, value: string) => {
    const v = value.trim();
    if (!v) return; // 비우면 되돌린다(key 가 같아 input 값은 직접 복구)
    if (v !== t.title) actions.patch.mutate({ id: t.id, body: { title: v } });
  };
  const saveText = (t: PmsTask, field: "assignee", value: string) => {
    const v = value.trim() || null;
    if (v !== t[field]) actions.patch.mutate({ id: t.id, body: { [field]: v } });
  };
  const saveDate = (t: PmsTask, field: "start_date" | "end_date", value: string) => {
    const v = value || null;
    if (v !== t[field]) actions.patch.mutate({ id: t.id, body: { [field]: v } });
  };
  const saveProgress = (t: PmsTask, value: string) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(value))));
    if (Number.isFinite(n) && n !== t.progress) actions.patch.mutate({ id: t.id, body: { progress: n } });
  };
  const savePreds = (t: PmsTask, value: string) => {
    const { ids, unknown } = parsePredecessors(value, tasks);
    if (unknown.length) return toast({ message: `${unknown.join(", ")} 번호의 작업을 찾지 못했어요.` });
    if (ids.join() !== t.predecessors.join()) actions.patch.mutate({ id: t.id, body: { predecessors: ids } });
  };
  const predConflict = (t: PmsTask): boolean =>
    !!t.start_date && t.predecessors.some((p) => { const e = byId.get(p)?.end_date; return !!e && e >= t.start_date!; });

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon="wbs"
        art="empty-work-visualization"
        title="아직 작업이 없어요"
        actions={<button className="tk-button tk-button--primary" type="button" onClick={addRoot}><Icon name="plus" />첫 단계 추가</button>}
      >
        단계를 만들고, 각 단계 아래에 작업과 하위 작업을 쪼개 나가요. 번호(1.1.2)는 자동으로 붙어요.
      </EmptyState>
    );
  }

  const busy = actions.create.isPending || actions.move.isPending;

  return (
    <div className="pms-wbs" ref={root} data-wide={wide || undefined}>
      <div className="pms-wbs__tools" role="toolbar" aria-label="WBS 편집">
        <ToolButton icon="plus" label="형제" hint="Enter" disabled={!sel || busy} onClick={() => sel && addSibling(sel)} />
        <ToolButton icon="child" label="하위" hint="Ctrl+Enter" disabled={!sel || busy} onClick={() => sel && addChild(sel)} />
        <ToolButton icon="indent" label="들여쓰기" hint="Tab" disabled={!sel || busy} onClick={() => sel && indent(sel)} />
        <ToolButton icon="outdent" label="내어쓰기" hint="Shift+Tab" disabled={!sel || busy} onClick={() => sel && outdent(sel)} />
        <ToolButton icon="chevron-up" label="위로" hint="Alt+↑" disabled={!sel || busy} onClick={() => sel && shift(sel, -1)} />
        <ToolButton icon="chevron-down" label="아래로" hint="Alt+↓" disabled={!sel || busy} onClick={() => sel && shift(sel, 1)} />
        <ToolButton icon="trash" label="삭제" disabled={!sel || busy} onClick={() => sel && remove(sel)} />
        <span className="pms-wbs__tools-sep" aria-hidden="true" />
        <ToolButton icon="chevron-right" label="모두 접기" onClick={() => setCollapsed(new Set(parents.map((p) => p.id)))} disabled={parents.length === 0} />
        <ToolButton icon="chevron-down" label="모두 펼치기" onClick={() => setCollapsed(new Set())} disabled={collapsed.size === 0} />
      </div>

      <div className="pms-table" role="treegrid" aria-label="작업 분해 구조">
        {wide && (
          <div className="pms-table__head" role="row">
            <span role="columnheader">번호</span>
            <span role="columnheader">작업</span>
            <span role="columnheader">담당자</span>
            <span role="columnheader">시작</span>
            <span role="columnheader">종료</span>
            <span role="columnheader">선행</span>
            <span role="columnheader">진행</span>
            <span role="columnheader" className="tk-sr-only">상세</span>
          </div>
        )}
        {rows.map((t) => {
          const open = !collapsed.has(t.id);
          const preds = t.predecessors.map((p) => byId.get(p)?.wbs).filter(Boolean).join(", ");
          return (
            <div
              key={t.id}
              className="pms-trow"
              role="row"
              aria-level={t.depth + 1}
              aria-expanded={t.has_children ? open : undefined}
              aria-selected={selected === t.id}
              data-depth={Math.min(t.depth, 4)}
              data-parent={t.has_children || undefined}
              data-selected={selected === t.id || undefined}
              data-status={t.status}
              onFocus={() => setSelected(t.id)}
            >
              <span className="pms-trow__wbs" role="gridcell">{t.wbs}</span>
              <span className="pms-trow__title" role="gridcell" style={{ "--d": t.depth } as CSSProperties}>
                {t.has_children ? (
                  <button type="button" className="pms-twisty" aria-label={open ? `${t.title} 접기` : `${t.title} 펼치기`} onClick={() => setCollapsed((c) => { const n = new Set(c); if (open) n.add(t.id); else n.delete(t.id); return n; })}>
                    <Icon name={open ? "chevron-down" : "chevron-right"} />
                  </button>
                ) : <span className="pms-twisty pms-twisty--leaf" aria-hidden="true" />}
                <input
                  key={`${t.id}:${t.title}`}
                  className="pms-cell pms-cell--title"
                  data-title-input={t.id}
                  defaultValue={t.title}
                  maxLength={300}
                  aria-label={`${t.wbs} 작업 이름`}
                  autoComplete="off"
                  spellCheck={false}
                  onKeyDown={(e) => onTitleKey(e, t)}
                  onBlur={(e) => saveTitle(t, e.currentTarget.value)}
                />
                <PriorityMark priority={t.priority} />
              </span>
              {wide ? (
                <>
                  <span role="gridcell" className="pms-trow__who">
                    {t.assignee && <Initial name={t.assignee} />}
                    <input className="pms-cell" list="pms-members" defaultValue={t.assignee ?? ""} key={`a:${t.id}:${t.assignee}`} maxLength={100} aria-label={`${t.wbs} 담당자`} placeholder="담당자" autoComplete="off"
                      onBlur={(e) => saveText(t, "assignee", e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.currentTarget.blur()} />
                  </span>
                  <span role="gridcell"><input className="pms-cell pms-cell--date" type="date" value={t.start_date ?? ""} disabled={t.dates_rollup} aria-label={`${t.wbs} 시작일`} onChange={(e) => saveDate(t, "start_date", e.target.value)} /></span>
                  <span role="gridcell"><input className="pms-cell pms-cell--date" type="date" min={t.start_date ?? undefined} value={t.end_date ?? ""} disabled={t.dates_rollup} data-late={t.overdue || undefined} aria-label={`${t.wbs} 종료일`} onChange={(e) => saveDate(t, "end_date", e.target.value)} /></span>
                  <span role="gridcell" className="pms-trow__pred">
                    <input className="pms-cell" defaultValue={preds} key={`p:${t.id}:${preds}`} placeholder="번호" aria-label={`${t.wbs} 선행 작업 번호`} autoComplete="off" onBlur={(e) => savePreds(t, e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.currentTarget.blur()} />
                    {predConflict(t) && <span className="pms-warn" title="선행 작업이 끝나기 전에 시작하도록 잡혀 있어요"><Icon name="warning" /><span className="tk-sr-only">선행 작업과 일정이 겹쳐요</span></span>}
                  </span>
                  <span role="gridcell" className="pms-trow__progress">
                    {t.has_children ? (
                      <span className="pms-trow__rollup" title="하위 작업에서 자동 계산"><span>{t.progress}%</span></span>
                    ) : (
                      <span className="pms-trow__num"><input className="pms-cell pms-cell--num" type="number" min={0} max={100} step={5} inputMode="numeric" defaultValue={t.progress} key={`g:${t.id}:${t.progress}`} aria-label={`${t.wbs} 진행률`}
                        onBlur={(e) => saveProgress(t, e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.currentTarget.blur()} /><span aria-hidden="true">%</span></span>
                    )}
                    <Meter value={t.progress} label={`${t.wbs} 진행률`} tone={t.overdue ? "danger" : undefined} decorative />
                  </span>
                  <span role="gridcell"><button type="button" className="tk-icon-button tk-icon-button--sm" aria-label={`${t.wbs} 상세`} onClick={() => onOpen(t.id)}><Icon name="more-vertical" /></button></span>
                </>
              ) : (
                <>
                  <button type="button" className="pms-trow__sum" role="gridcell" aria-label={`${t.wbs} 상세 열기`} onClick={() => onOpen(t.id)}>
                    <StatusPill status={t.status} />
                    <span className={t.assignee ? undefined : "pms-muted"}>{t.assignee ?? "미배정"}</span>
                    {rangeText(t.start_date, t.end_date) && <span data-late={t.overdue || undefined}>{rangeText(t.start_date, t.end_date)}</span>}
                    <span>{t.progress}%</span>
                    {predConflict(t) && <span className="pms-warn"><Icon name="warning" /></span>}
                  </button>
                  <span role="gridcell" className="pms-trow__bar"><Meter value={t.progress} label={`${t.wbs} 진행률`} tone={t.overdue ? "danger" : undefined} /></span>
                </>
              )}
            </div>
          );
        })}
        <button type="button" className="pms-table__add" onClick={addRoot} disabled={busy}><Icon name="plus" />단계 추가</button>
      </div>
      <datalist id="pms-members">{members.map((m) => <option key={m} value={m} />)}</datalist>
      <p className="pms-hint pms-hint--keys">
        작업 이름 칸에서 <kbd>Enter</kbd> 형제 추가 · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 하위 추가 · <kbd>Tab</kbd> 들여쓰기 · <kbd>Shift</kbd>+<kbd>Tab</kbd> 내어쓰기 · <kbd>Alt</kbd>+<kbd>↑↓</kbd> 순서 · <kbd>↑↓</kbd> 줄 이동
      </p>
    </div>
  );
}

function descendsFrom(tasks: PmsTask[], t: PmsTask, ancestorId: string): boolean {
  let cur: PmsTask | undefined = t;
  const byId = new Map(tasks.map((x) => [x.id, x]));
  while (cur?.parent_id) {
    if (cur.parent_id === ancestorId) return true;
    cur = byId.get(cur.parent_id);
  }
  return false;
}
