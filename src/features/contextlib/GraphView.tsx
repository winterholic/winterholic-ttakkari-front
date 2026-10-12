import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { LibEdge, LibNode } from "../../api/client";
import { Icon } from "../../ui/Icon";
import { layoutGraph } from "./forceLayout";
import { TYPE_COLOR, TYPE_LABEL, useWidth } from "./shared";

interface View { x: number; y: number; k: number }
const IDENTITY: View = { x: 0, y: 0, k: 1 };
const MIN_K = 0.5;
const MAX_K = 4;

const radius = (n: LibNode) => 8 + Math.min(10, Math.sqrt(n.memories + n.documents / 4 + n.degree) * 2.2);
const clip = (s: string, max = 20) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * 엔터티 노드와 관계 엣지(술어 라벨). 터치로 확대·이동(두 손가락 핀치·한 손가락 드래그), 마우스는 휠·드래그.
 * 색은 엔터티 종류, 점선 고리는 "관계 없음", 이중 고리는 "중복 의심". 강조 집합이 있으면 나머지는 흐리게 한다.
 */
export function GraphView({ nodes, edges, selectedId, highlight, onSelect }: {
  nodes: LibNode[]; edges: LibEdge[]; selectedId: string | null; highlight: Set<string> | null; onSelect: (id: string | null) => void;
}) {
  const [wrapRef, width] = useWidth(720);
  const layout = useMemo(() => layoutGraph(nodes, edges, { width }), [nodes, edges, width]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; k: number } | null>(null);
  const moved = useRef(false);
  const byId = useMemo(() => new Map(nodes.map((nd) => [nd.id, nd])), [nodes]);
  const W = layout.width;
  const H = layout.height;

  // 데이터·너비가 바뀌어 배치가 새로 나오면 확대·이동을 처음으로 돌린다(effect 로 set 하지 않고 배치에 묶어 둔다).
  const [viewState, setViewState] = useState<{ layout: unknown; v: View }>({ layout: null, v: IDENTITY });
  const view = viewState.layout === layout ? viewState.v : IDENTITY;
  const setView = (next: View | ((v: View) => View)) =>
    setViewState((prev) => {
      const base = prev.layout === layout ? prev.v : IDENTITY;
      return { layout, v: typeof next === "function" ? next(base) : next };
    });

  const vw = W / view.k;
  const vh = H / view.k;

  const toSvg = (clientX: number, clientY: number, v: View) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !r.width) return { x: v.x, y: v.y };
    return { x: v.x + ((clientX - r.left) / r.width) * (W / v.k), y: v.y + ((clientY - r.top) / r.height) * (H / v.k) };
  };
  const zoomAt = (clientX: number, clientY: number, factor: number) =>
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const p = toSvg(clientX, clientY, v);
      const r = svgRef.current?.getBoundingClientRect();
      const fx = r && r.width ? (clientX - r.left) / r.width : 0.5;
      const fy = r && r.height ? (clientY - r.top) / r.height : 0.5;
      return { k, x: p.x - fx * (W / k), y: p.y - fy * (H / k) };
    });
  const zoomCenter = (factor: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  };

  // wheel 은 passive 가 아니어야 페이지 스크롤을 막을 수 있어서 React 핸들러 대신 직접 붙인다.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const target = Math.min(MAX_K, Math.max(MIN_K, pinch.current.k * (dist / pinch.current.dist)));
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target / view.k);
      moved.current = true;
      return;
    }
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 0) moved.current = true;
    setView((v) => ({ ...v, x: v.x - (dx / r.width) * (W / v.k), y: v.y - (dy / r.height) * (H / v.k) }));
  };
  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const keyNode = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
  };

  const pairCount = new Map<string, number>();
  const edgePaths = edges.map((e) => {
    const a = layout.positions.get(e.source);
    const b = layout.positions.get(e.target);
    const sa = byId.get(e.source);
    const sb = byId.get(e.target);
    if (!a || !b || !sa || !sb) return null;
    const pk = [e.source, e.target].sort().join("|");
    const idx = pairCount.get(pk) ?? 0;
    pairCount.set(pk, idx + 1);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const sx = a.x + ux * (radius(sa) + 2);
    const sy = a.y + uy * (radius(sa) + 2);
    const tx = b.x - ux * (radius(sb) + 5);
    const ty = b.y - uy * (radius(sb) + 5);
    const bend = idx === 0 ? 0 : (idx % 2 ? 1 : -1) * Math.ceil(idx / 2) * 28;
    const mx = (sx + tx) / 2 - uy * bend;
    const my = (sy + ty) / 2 + ux * bend;
    return { e, d: `M${sx},${sy} Q${mx},${my} ${tx},${ty}`, lx: (sx + 2 * mx + tx) / 4, ly: (sy + 2 * my + ty) / 4 };
  });
  const related = new Set<string>();
  if (selectedId) {
    related.add(selectedId);
    for (const e of edges) {
      if (e.source === selectedId) related.add(e.target);
      if (e.target === selectedId) related.add(e.source);
    }
  }
  const dim = (id: string) => (highlight ? !highlight.has(id) : selectedId ? !related.has(id) : false);

  return (
    <div className="cl-graph" ref={wrapRef}>
      <div className="cl-graph__controls" role="group" aria-label="그래프 보기 조절">
        <button type="button" className="tk-icon-button tk-icon-button--secondary" aria-label="확대" onClick={() => zoomCenter(1.3)}><Icon name="zoom-in" /></button>
        <button type="button" className="tk-icon-button tk-icon-button--secondary" aria-label="축소" onClick={() => zoomCenter(1 / 1.3)}><Icon name="zoom-out" /></button>
        <button type="button" className="tk-icon-button tk-icon-button--secondary" aria-label="맞춤" onClick={() => setView(IDENTITY)}><Icon name="fit" /></button>
      </div>
      <svg ref={svgRef} className="cl-graph__svg" viewBox={`${view.x} ${view.y} ${vw} ${vh}`} style={{ aspectRatio: `${W} / ${H}` }}
        role="group" aria-label={`온톨로지 그래프, 엔터티 ${nodes.length}개 관계 ${edges.length}개. 목록 보기로 같은 내용을 읽을 수 있어요.`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={() => { if (!moved.current) onSelect(null); }}>
        <defs>
          <marker id="cl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--tk-color-chart-axis)" />
          </marker>
        </defs>
        {layout.looseTop !== null && edges.length > 0 && (
          <text className="cl-graph__band" x={20} y={layout.looseTop - 50}>관계 없는 엔터티</text>
        )}
        <g>
          {edgePaths.map((p) => p && (
            <g key={p.e.id} className="cl-edge" data-dim={dim(p.e.source) && dim(p.e.target) ? "" : undefined}
              data-on={selectedId && (p.e.source === selectedId || p.e.target === selectedId) ? "" : undefined}>
              <path d={p.d} markerEnd="url(#cl-arrow)" />
              {(width >= 520 || view.k >= 1.8 || p.e.source === selectedId || p.e.target === selectedId) && (
                <text x={p.lx} y={p.ly} textAnchor="middle" dy="-3">{p.e.predicate}</text>
              )}
            </g>
          ))}
        </g>
        <g>
          {nodes.map((nd) => {
            const p = layout.positions.get(nd.id);
            if (!p) return null;
            const r = radius(nd);
            const color = TYPE_COLOR[nd.type] ?? TYPE_COLOR.other;
            const picked = highlight?.has(nd.id);
            return (
              <g key={nd.id} className="cl-node" transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button"
                aria-pressed={selectedId === nd.id} aria-label={`${nd.name}, ${TYPE_LABEL[nd.type]}, 관계 ${nd.degree}개${nd.flags.isolated ? ", 관계 없음" : ""}${nd.flags.duplicate_suspect ? ", 중복 의심" : ""}`}
                data-dim={dim(nd.id) ? "" : undefined} data-selected={selectedId === nd.id ? "" : undefined}
                style={{ "--c": color } as CSSProperties}
                onClick={(e) => { e.stopPropagation(); onSelect(nd.id); }} onKeyDown={(e) => keyNode(e, nd.id)}
                onPointerDown={(e) => e.stopPropagation()}>
                {picked && <circle r={r + 8} className="cl-node__pick" />}
                {nd.flags.duplicate_suspect && <circle r={r + 5} className="cl-node__dup" />}
                {nd.flags.isolated && <circle r={r + 4} className="cl-node__iso" />}
                <circle r={r} className="cl-node__dot" />
                <text y={r + 14} textAnchor="middle" className="cl-node__label">{clip(nd.name)}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <p className="cl-note cl-graph__help">드래그로 이동, 휠·핀치로 확대·축소. 점선 고리는 관계 없음, 이중 고리는 중복 의심이에요. 좁은 화면에서는 확대하거나 노드를 누르면 관계 이름이 보여요.</p>
    </div>
  );
}
