import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../../ui/Icon";
import { useWidth } from "../contextlib/shared";
import { bounds, nodeRadius } from "./graphStore";
import type { GraphStore } from "./graphStore";
import { kindColor, kindLabel } from "./labelsV3";
import "../contextlib/contextlib.css";

interface View { dx: number; dy: number; k: number }
const FIT: View = { dx: 0, dy: 0, k: 1 };
const MIN_K = 0.4;
const MAX_K = 4;
const clip = (s: string, max = 18) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * 개념 그래프 캔버스. 배치는 graphStore 가 정하고 여기서는 그리기·확대·이동·선택만 한다.
 * 마우스는 휠·드래그, 터치는 핀치·드래그, 키보드는 노드 Tab·Enter. 색은 개념 종류, 점선 경고 고리는 열린 충돌이다.
 */
export function OntologyGraph({ store, selectedId, loadingId, onSelect }: {
  store: GraphStore; selectedId: string | null; loadingId: string | null; onSelect: (id: string | null) => void;
}) {
  const [wrapRef, width] = useWidth(720);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; k: number } | null>(null);
  const moved = useRef(false);
  const fit = useMemo(() => bounds(store.pos), [store.pos]);
  const nodes = useMemo(() => [...store.nodes.values()], [store.nodes]);
  const edges = useMemo(() => [...store.edges.values()], [store.edges]);

  // 노드 집합이 달라지면 확대·이동을 처음(전체 맞춤)으로 돌린다.
  const [viewState, setViewState] = useState<{ key: unknown; v: View }>({ key: null, v: FIT });
  const view = viewState.key === store.pos ? viewState.v : FIT;
  const setView = (next: View | ((v: View) => View)) =>
    setViewState((prev) => {
      const base = prev.key === store.pos ? prev.v : FIT;
      return { key: store.pos, v: typeof next === "function" ? next(base) : next };
    });

  const vw = fit.w / view.k;
  const vh = fit.h / view.k;
  const vx = fit.x + fit.w / 2 - vw / 2 + view.dx;
  const vy = fit.y + fit.h / 2 - vh / 2 + view.dy;

  const zoomBy = (factor: number) => setView((v) => ({ ...v, k: Math.min(MAX_K, Math.max(MIN_K, v.k * factor)) }));
  // wheel 은 passive 가 아니어야 페이지 스크롤을 막을 수 있어서 React 핸들러 대신 직접 붙인다.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); };
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
      const target = Math.min(MAX_K, Math.max(MIN_K, pinch.current.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist)));
      setView((v) => ({ ...v, k: target }));
      moved.current = true;
      return;
    }
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;
    setView((v) => ({ ...v, dx: v.dx - (dx / r.width) * (fit.w / v.k), dy: v.dy - (dy / r.height) * (fit.h / v.k) }));
  };
  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const keyNode = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); }
  };

  const related = new Set<string>();
  if (selectedId) {
    related.add(selectedId);
    for (const e of edges) {
      if (e.source === selectedId) related.add(e.target);
      if (e.target === selectedId) related.add(e.source);
    }
  }
  const dim = (id: string) => Boolean(selectedId) && !related.has(id);
  const pairCount = new Map<string, number>();
  const paths = edges.map((e) => {
    const a = store.pos.get(e.source);
    const b = store.pos.get(e.target);
    const sa = store.nodes.get(e.source);
    const sb = store.nodes.get(e.target);
    if (!a || !b || !sa || !sb) return null;
    const pk = [e.source, e.target].sort().join("|");
    const idx = pairCount.get(pk) ?? 0;
    pairCount.set(pk, idx + 1);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const sx = a.x + ux * (nodeRadius(sa) + 2);
    const sy = a.y + uy * (nodeRadius(sa) + 2);
    const tx = b.x - ux * (nodeRadius(sb) + 5);
    const ty = b.y - uy * (nodeRadius(sb) + 5);
    const bend = idx === 0 ? 0 : (idx % 2 ? 1 : -1) * Math.ceil(idx / 2) * 28;
    const mx = (sx + tx) / 2 - uy * bend;
    const my = (sy + ty) / 2 + ux * bend;
    return { e, d: `M${sx},${sy} Q${mx},${my} ${tx},${ty}`, lx: (sx + 2 * mx + tx) / 4, ly: (sy + 2 * my + ty) / 4 };
  });
  const kinds = [...new Set(nodes.map((n) => n.entity_kind))];

  return <div className="cl-graph" ref={wrapRef}>
    <div className="cl-graph__controls" role="group" aria-label="그래프 보기 조절">
      <button type="button" className="tk-icon-button tk-icon-button--secondary" aria-label="확대" onClick={() => zoomBy(1.3)}><Icon name="zoom-in" /></button>
      <button type="button" className="tk-icon-button tk-icon-button--secondary" aria-label="축소" onClick={() => zoomBy(1 / 1.3)}><Icon name="zoom-out" /></button>
      <button type="button" className="tk-icon-button tk-icon-button--secondary" aria-label="맞춤" onClick={() => setView(FIT)}><Icon name="fit" /></button>
    </div>
    <svg ref={svgRef} className="cl-graph__svg" viewBox={`${vx} ${vy} ${vw} ${vh}`} style={{ aspectRatio: `${fit.w} / ${fit.h}` }}
      role="group" aria-label={`개념 그래프, 개념 ${nodes.length}개 관계 ${edges.length}개. 목록 보기로 같은 내용을 읽을 수 있어요.`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onClick={() => { if (!moved.current) onSelect(null); }}>
      <defs>
        <marker id="kb3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--tk-color-chart-axis)" />
        </marker>
      </defs>
      <g>{paths.map((p) => p && <g key={p.e.id} className="cl-edge" data-dim={dim(p.e.source) && dim(p.e.target) ? "" : undefined}
        data-on={selectedId && (p.e.source === selectedId || p.e.target === selectedId) ? "" : undefined}>
        <path d={p.d} markerEnd="url(#kb3-arrow)" />
        {(width >= 520 || view.k >= 1.8 || p.e.source === selectedId || p.e.target === selectedId) && <text x={p.lx} y={p.ly} textAnchor="middle" dy="-3">{p.e.predicate}</text>}
      </g>)}</g>
      <g>{nodes.map((nd) => {
        const p = store.pos.get(nd.id);
        if (!p) return null;
        const r = nodeRadius(nd);
        return <g key={nd.id} className="cl-node" data-layout-ok="그래프 노드. 같은 노드의 목록이 터치·키보드 대안이다" transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button"
          aria-pressed={selectedId === nd.id}
          aria-label={`${nd.name}, ${kindLabel(nd.entity_kind)}, 문서 ${nd.document_count}개, 주장 ${nd.assertion_count}개${nd.has_open_conflict ? ", 열린 충돌 있음" : ""}${store.expanded.has(nd.id) ? "" : ", 눌러서 이웃 펼치기"}`}
          data-dim={dim(nd.id) ? "" : undefined} data-selected={selectedId === nd.id ? "" : undefined}
          style={{ "--c": kindColor(nd.entity_kind) } as CSSProperties}
          onClick={(e) => { e.stopPropagation(); onSelect(nd.id); }} onKeyDown={(e) => keyNode(e, nd.id)} onPointerDown={(e) => e.stopPropagation()}>
          {nd.has_open_conflict && <circle r={r + 5} className="kb3-node__conflict" />}
          {loadingId === nd.id && <circle r={r + 9} className="kb3-node__loading" />}
          <circle r={r} className="cl-node__dot" />
          <text y={r + 14} textAnchor="middle" className="cl-node__label">{clip(nd.name)}</text>
        </g>;
      })}</g>
    </svg>
    <ul className="kb3-legend" aria-label="범례">
      {kinds.map((k) => <li key={k}><span className="kb3-dot" style={{ background: kindColor(k) }} aria-hidden="true" />{kindLabel(k)}</li>)}
      <li><span className="kb3-dot kb3-dot--conflict" aria-hidden="true" />열린 충돌</li>
      <li className="kb-note">크기는 문서·주장 수</li>
    </ul>
    <p className="cl-note cl-graph__help">드래그로 이동, 휠·핀치로 확대·축소. 개념을 누르면 이웃이 펼쳐지고 오른쪽에 상세가 열려요.</p>
  </div>;
}
