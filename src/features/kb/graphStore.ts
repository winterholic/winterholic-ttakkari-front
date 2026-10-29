import type { KbGraph, KbGraphEdge, KbGraphNode } from "../../api/kbTypes";
import { layoutGraph } from "../contextlib/forceLayout";
import type { Pos } from "../contextlib/forceLayout";

/**
 * 점진적으로 펼쳐지는 그래프의 상태. 처음 허브 노드만 힘 기반으로 배치하고, 이후 펼친 이웃은 기존 노드를 움직이지 않고
 * 중심 노드 둘레의 빈 자리에 놓는다. 전체를 다시 계산하면 클릭할 때마다 노드가 뛰어서 읽던 자리를 잃는다.
 */
export interface GraphStore {
  nodes: Map<string, KbGraphNode>;
  edges: Map<string, KbGraphEdge & { id: string }>;
  pos: Map<string, Pos>;
  /** 이웃을 이미 불러온 노드 */
  expanded: Set<string>;
  /** 서버가 알려 준 전체 개념 수 */
  total: number;
  /** 이웃이 한 쪽(limit)보다 많은 노드의 다음 offset. 이 맵에 있으면 아직 못 가져온 이웃이 있다. */
  more: Map<string, number>;
  /** 노드별 서버 전체 이웃 수 */
  neighborTotal: Map<string, number>;
}

export const edgeId = (e: KbGraphEdge) => e.id ?? `${e.source}|${e.predicate}|${e.target}`;

export function seedStore(graph: KbGraph): GraphStore {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = new Map(graph.edges.filter((e) => nodes.has(e.source) && nodes.has(e.target)).map((e) => [edgeId(e), { ...e, id: edgeId(e) }]));
  const layout = layoutGraph(graph.nodes.map((n) => ({ id: n.id })), [...edges.values()].map((e) => ({ source: e.source, target: e.target })), { width: 720 });
  return { nodes, edges, pos: new Map(layout.positions), expanded: new Set(), total: graph.total_entities, more: new Map(), neighborTotal: new Map() };
}

const RINGS = [150, 210, 270];
const ANGLES = 24;

/** 새 노드 하나를 center 둘레에서 기존 노드와 가장 멀리 떨어진 자리에 놓는다. 같은 입력이면 같은 자리다. */
export function placeAround(center: Pos, taken: Pos[]): Pos {
  let best: Pos = { x: center.x + RINGS[0], y: center.y };
  let bestDist = -1;
  for (const r of RINGS) {
    for (let i = 0; i < ANGLES; i += 1) {
      const a = (i / ANGLES) * Math.PI * 2;
      const p = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
      const d = taken.length ? Math.min(...taken.map((t) => Math.hypot(t.x - p.x, t.y - p.y))) : r;
      // 같은 거리면 안쪽 고리를 먼저 쓴다(<= 가 아니라 < 로 갱신).
      if (d > bestDist + 1e-6) { best = p; bestDist = d; }
    }
    if (bestDist >= 90) break;
  }
  return best;
}

export function mergeGraph(prev: GraphStore, graph: KbGraph, centerId: string): GraphStore {
  const nodes = new Map(prev.nodes);
  const edges = new Map(prev.edges);
  const pos = new Map(prev.pos);
  const center = pos.get(centerId) ?? { x: 0, y: 0 };
  const fresh = graph.nodes.filter((n) => !nodes.has(n.id));
  for (const n of graph.nodes) nodes.set(n.id, { ...nodes.get(n.id), ...n });
  for (const n of fresh) {
    const p = placeAround(center, [...pos.values()]);
    pos.set(n.id, p);
  }
  for (const e of graph.edges) if (nodes.has(e.source) && nodes.has(e.target)) edges.set(edgeId(e), { ...e, id: edgeId(e) });
  const more = new Map(prev.more);
  if (graph.has_more) more.set(centerId, (graph.offset ?? 0) + (graph.limit ?? graph.nodes.length)); else more.delete(centerId);
  const neighborTotal = new Map(prev.neighborTotal);
  if (typeof graph.total_neighbors === "number") neighborTotal.set(centerId, graph.total_neighbors);
  return { nodes, edges, pos, expanded: new Set(prev.expanded).add(centerId), total: Math.max(prev.total, graph.total_entities), more, neighborTotal };
}

export function bounds(pos: Map<string, Pos>): { x: number; y: number; w: number; h: number } {
  const pts = [...pos.values()];
  if (pts.length === 0) return { x: 0, y: 0, w: 400, h: 300 };
  const pad = 70;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  return { x: minX, y: minY, w: Math.max(maxX - minX, 300), h: Math.max(maxY - minY, 240) };
}

export const nodeRadius = (n: KbGraphNode) => 8 + Math.min(10, Math.sqrt(n.document_count + n.assertion_count / 2) * 2.2);

/** 한 노드의 1-hop 관계를 방향별로 모은다(목록 보기·모바일 폴백이 쓴다). */
export function neighborsOf(store: Pick<GraphStore, "nodes" | "edges">, id: string) {
  const out: { predicate: string; candidate?: boolean; node: KbGraphNode }[] = [];
  const into: { predicate: string; candidate?: boolean; node: KbGraphNode }[] = [];
  for (const e of store.edges.values()) {
    if (e.source === id) { const node = store.nodes.get(e.target); if (node) out.push({ predicate: e.predicate, candidate: e.candidate, node }); }
    if (e.target === id) { const node = store.nodes.get(e.source); if (node) into.push({ predicate: e.predicate, candidate: e.candidate, node }); }
  }
  return { out, into };
}
