import { useEffect, useMemo, useState } from "react";
import type React from "react";
import type { ReactNode } from "react";
import type { UUID } from "../../api/types";
import { STATUS_LABEL } from "../chat/runView";
import { sessionTime } from "../../shell/groupSessions";
import { Icon } from "../../ui/Icon";
import { AccountBadge, EngineBadge } from "../../ui/EngineBadge";
import { branchStatus, isActive } from "../tasks/buildTree";
import type { TreeItem } from "../tasks/buildTree";
import { StatusGlyph } from "../tasks/TaskTree";
import { DESK_ID, NODE_H, NODE_W, layoutForest } from "./layout";
import type { PlacedNode } from "./layout";
import { usePanZoom } from "./usePanZoom";
import "./canvas.css";

const ZOOM_STEP = 1.2;
const FIRST_MIN_K = 0.75;

function kindLabel(it: TreeItem): string {
  const n = it.node;
  if (n.kind === "orchestrator") return n.parent_id ? "기획" : "오케스트레이터";
  if (n.kind === "worker") return "작업";
  if (n.kind === "desk") return "따까리 대화";
  return "대화";
}

/** 카드 둘째 줄: 도는 중이면 누가 하는지, 끝났으면 결과 앞부분. */
function subline(it: TreeItem, now: Date): ReactNode {
  const n = it.node;
  const attribution = n.engine || n.profile ? (
    <span className="tnode__attribution">
      {n.engine && <EngineBadge engine={n.engine} />}
      {n.profile && <AccountBadge account={n.profile} />}
    </span>
  ) : null;
  if (n.status === "running") return <>실행 중{attribution}</>;
  if (n.status === "queued") return <>차례 기다리는 중{attribution}</>;
  if (it.activeBelow > 0) return <>하위 {it.activeBelow}개 실행 중{attribution}</>;
  if (n.last_result) return <>{n.last_result}{attribution}</>;
  return <>{`${n.status ? STATUS_LABEL[n.status] : "지시 전"} · ${sessionTime(n.updated_at, now)}`}{attribution}</>;
}

/** 지금 일이 없는 가지는 접어서 판을 작게 둔다. 사용자가 직접 펴거나 접은 것은 그대로 둔다. */
function autoCollapsed(forest: TreeItem[], keepOpen: ReadonlySet<UUID>): Set<UUID> {
  const out = new Set<UUID>();
  const walk = (t: TreeItem) => {
    if (t.children.length > 0 && t.activeBelow === 0 && !keepOpen.has(t.node.id)) out.add(t.node.id);
    t.children.forEach(walk);
  };
  forest.forEach(walk);
  return out;
}

export interface DeskCard {
  title: string;
  sub: string;
  live: boolean;
}

/**
 * 따까리 일의 계층을 한 판에 펼친 캔버스(back ADR 0014). 가계도·플로차트처럼 맨 위 따까리에서
 * 기획 세션, 작업 세션으로 위에서 아래로 내려간다. 일이 도는 가지는 선이 에이전트 색으로 바뀌고,
 * 고른 노드와 그 위아래 가지만 또렷하게 남긴다. 판은 끌어서 옮기고 ⌘+휠·핀치로 확대한다.
 */
export function TaskCanvas({
  forest,
  desk,
  selectedId,
  onSelect,
  focusId,
  overlay,
  bottomInset = 0,
  label,
}: {
  forest: TreeItem[];
  desk: DeskCard;
  selectedId: UUID | null;
  onSelect: (id: UUID) => void;
  /** 바뀌면 그 노드가 보이게 판을 옮긴다(검색으로 고른 노드). */
  focusId?: UUID | null;
  /** 판 위에 떠 있는 것(검색·입력창). 판 이동을 막지 않게 data-no-pan 을 단 상자에 넣는다. */
  overlay?: ReactNode;
  /** 아래에 떠 있는 입력창 높이. 맞춤 때 그만큼 비운다. */
  bottomInset?: number;
  label: string;
}) {
  const { ref, view, zoomAt, fit, reveal } = usePanZoom();
  const [touched, setTouched] = useState<Map<UUID, boolean>>(new Map());

  // 고른 노드까지의 길은 펼친다.
  const path = useMemo(() => {
    const parent = new Map<UUID, UUID | null>();
    const walk = (t: TreeItem, p: UUID | null) => {
      parent.set(t.node.id, p);
      t.children.forEach((c) => walk(c, t.node.id));
    };
    forest.forEach((r) => walk(r, null));
    const out = new Set<UUID>();
    let cur = selectedId ? (parent.get(selectedId) ?? null) : null;
    while (cur) {
      out.add(cur);
      cur = parent.get(cur) ?? null;
    }
    return { ancestors: out, parent };
  }, [forest, selectedId]);

  const collapsed = useMemo(() => {
    const auto = autoCollapsed(forest, path.ancestors);
    for (const [id, open] of touched) {
      if (open) auto.delete(id);
      else auto.add(id);
    }
    return auto;
  }, [forest, path.ancestors, touched]);
  const layout = useMemo(() => layoutForest(forest, collapsed), [forest, collapsed]);
  const toggle = (id: UUID) => setTouched((m) => new Map(m).set(id, collapsed.has(id)));

  // 고른 노드의 조상·자손만 또렷하게. 나머지는 옅게 둔다(가계도의 초점).
  const related = useMemo(() => {
    if (!selectedId || selectedId === DESK_ID) return null;
    const set = new Set<UUID>([DESK_ID, selectedId, ...path.ancestors]);
    const below = (t: TreeItem) => t.children.forEach((c) => (set.add(c.node.id), below(c)));
    const find = (t: TreeItem): TreeItem | null => (t.node.id === selectedId ? t : t.children.reduce<TreeItem | null>((a, c) => a ?? find(c), null));
    for (const r of forest) {
      const hit = find(r);
      if (hit) below(hit);
    }
    return set;
  }, [forest, selectedId, path.ancestors]);

  const box = { x: 0, y: 0, w: layout.width, h: layout.height };
  const pad = { top: 72, right: 32, bottom: 32 + bottomInset, left: 32 };
  // 처음 그릴 때 한 번만 맞춘다. 새 가지가 생길 때마다 판이 튀면 보던 자리를 잃는다.
  // 판이 넓으면 75% 아래로 줄이지 않고, 일이 도는 첫 뿌리(없으면 따까리)를 가운데에 둔다.
  useEffect(() => {
    const liveRoot = layout.nodes.find((p) => p.depth === 1 && p.item && (p.item.activeBelow > 0 || isActive(p.item.node.status)));
    const anchor = liveRoot ?? layout.nodes.find((p) => p.id === DESK_ID)!;
    fit(box, pad, FIRST_MIN_K, anchor.x + NODE_W / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const n = focusId ? layout.nodes.find((p) => p.id === focusId) : null;
    if (n) reveal({ x: n.x, y: n.y, w: NODE_W, h: NODE_H }, 96);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const now = new Date();
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as Element).closest("input, textarea")) return;
    if (e.key === "+" || e.key === "=") zoomAt(view.k * ZOOM_STEP);
    else if (e.key === "-") zoomAt(view.k / ZOOM_STEP);
    else if (e.key === "0") fit(box, pad);
    else return;
    e.preventDefault();
  };

  return (
    <div className="tcanvas" ref={ref} onKeyDown={onKey} style={{ "--tc-inset": `${bottomInset}px` } as React.CSSProperties} role="group" aria-label={label} aria-roledescription="작업 트리 캔버스">
      <div className="tcanvas__stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: layout.width, height: layout.height }}>
        <svg className="tcanvas__edges" width={layout.width} height={layout.height} aria-hidden="true">
          <defs>
            <marker id="tc-arrow" viewBox="0 0 8 8" refX="4" refY="7" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,2 L4,7 L8,2" className="tcanvas__arrow" />
            </marker>
            <marker id="tc-arrow-live" viewBox="0 0 8 8" refX="4" refY="7" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,2 L4,7 L8,2" className="tcanvas__arrow tcanvas__arrow--live" />
            </marker>
          </defs>
          {layout.edges.map((e) => (
            <path
              key={`${e.from}>${e.to}`}
              d={e.d}
              className="tcanvas__edge"
              data-live={e.live ? "" : undefined}
              data-dim={related && !related.has(e.to) ? "" : undefined}
              markerEnd={`url(#${e.live ? "tc-arrow-live" : "tc-arrow"})`}
            />
          ))}
        </svg>
        {layout.nodes.map((p) => (
          <NodeCard
            key={p.id}
            p={p}
            desk={desk}
            now={now}
            selected={p.id === selectedId}
            dim={!!related && !related.has(p.id)}
            onSelect={onSelect}
            onToggle={toggle}
            onFocus={() => reveal({ x: p.x, y: p.y, w: NODE_W, h: NODE_H })}
          />
        ))}
      </div>
      <div className="tcanvas__zoom" data-no-pan role="toolbar" aria-label="확대">
        <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="축소" onClick={() => zoomAt(view.k / ZOOM_STEP)}>
          <Icon name="zoom-out" />
        </button>
        <button className="tcanvas__pct" type="button" aria-label="화면에 맞추기" title="화면에 맞추기 (0)" onClick={() => fit(box, pad)}>
          {Math.round(view.k * 100)}%
        </button>
        <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="확대" onClick={() => zoomAt(view.k * ZOOM_STEP)}>
          <Icon name="zoom-in" />
        </button>
      </div>
      {overlay}
    </div>
  );
}

function NodeCard({
  p,
  desk,
  now,
  selected,
  dim,
  onSelect,
  onToggle,
  onFocus,
}: {
  p: PlacedNode;
  desk: DeskCard;
  now: Date;
  selected: boolean;
  dim: boolean;
  onSelect: (id: UUID) => void;
  onToggle: (id: UUID) => void;
  onFocus: () => void;
}) {
  const it = p.item;
  const style = { left: p.x, top: p.y, width: NODE_W, height: NODE_H };
  if (!it) {
    return (
      <div className="tnode tnode--desk" style={style} data-selected={selected ? "" : undefined} data-live={desk.live ? "" : undefined}>
        <button className="tnode__main" type="button" aria-pressed={selected} onClick={() => onSelect(DESK_ID)} onFocus={onFocus}>
          <span className="tk-avatar tk-avatar--agent tk-avatar--sm" aria-hidden />
          <span className="tnode__text">
            <span className="tnode__title">{desk.title}</span>
            <span className="tnode__sub">{desk.sub}</span>
          </span>
        </button>
      </div>
    );
  }
  const status = branchStatus(it);
  const live = isActive(status);
  const kids = it.children.length;
  return (
    <div
      className="tnode"
      style={style}
      data-status={status ?? "idle"}
      data-live={live ? "" : undefined}
      data-selected={selected ? "" : undefined}
      data-dim={dim ? "" : undefined}
    >
      <button className="tnode__main" type="button" aria-pressed={selected} onClick={() => onSelect(it.node.id)} onFocus={onFocus} title={it.node.title}>
        <StatusGlyph status={status} />
        <span className="tnode__text">
          <span className="tnode__title">
            {p.depth === 1 && it.node.pool === "work" && <span className="tk-badge tk-badge--info tnode__pool">회사</span>}
            {it.node.title || "제목 없는 일"}
          </span>
          <span className="tnode__sub">
            <span className="tnode__kind">{kindLabel(it)}</span>
            {subline(it, now)}
          </span>
        </span>
      </button>
      {kids > 0 && (
        <button
          className="tnode__fold"
          type="button"
          aria-expanded={p.hidden === 0}
          aria-label={`${it.node.title} 하위 ${it.size}개 ${p.hidden ? "펼치기" : "접기"}`}
          onClick={() => onToggle(it.node.id)}
          data-live={it.activeBelow > 0 ? "" : undefined}
        >
          {p.hidden ? `+${p.hidden}` : <Icon name="chevron-up" />}
        </button>
      )}
    </div>
  );
}
