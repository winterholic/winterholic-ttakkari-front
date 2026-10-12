/** 작은 온톨로지(수십~수백 노드)용 힘 기반 배치. 외부 그래프 라이브러리 없이 결정적으로 계산한다(같은 입력이면 같은 배치). */
export interface LayoutNode { id: string }
export interface LayoutEdge { source: string; target: string }
export interface Pos { x: number; y: number }
export interface LayoutResult { positions: Map<string, Pos>; width: number; height: number; /** 관계 없는 노드 띠의 첫 줄 y. 없으면 null. */ looseTop: number | null }

/** 입력 id 로 만든 0~1 의사난수. Math.random 을 쓰면 다시 그릴 때마다 노드가 뛴다. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const PAD = 64;
// 간선 라벨(술어)이 들어갈 만큼 길게 잡는다. 라벨이 노드 위에 겹치면 읽을 수 없다.
const EDGE_LEN = 140;
const GAP = 40;
const LOOSE_CELL = 150;
const LOOSE_ROW = 70;

interface Component { ids: string[]; pts: Pos[]; w: number; h: number }

/** 이어진 노드 묶음마다 따로 힘 계산을 한다. 전체를 한 번에 돌리면 서로 무관한 묶음이 멀리 밀려나 캔버스가 비어 보인다. */
function simulate(ids: string[], edges: LayoutEdge[], iterations: number): Component {
  const idx = new Map(ids.map((id, i) => [id, i]));
  const side = Math.max(200, Math.sqrt(ids.length) * EDGE_LEN);
  const px = ids.map((id) => (hash01(`x${id}`) - 0.5) * side);
  const py = ids.map((id) => (hash01(`y${id}`) - 0.5) * side);
  const dx = new Array<number>(ids.length).fill(0);
  const dy = new Array<number>(ids.length).fill(0);
  for (let it = 0; it < iterations; it += 1) {
    const t = 1 - it / iterations; // 식으면서 안정된다.
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        let vx = px[i] - px[j];
        let vy = py[i] - py[j];
        let d2 = vx * vx + vy * vy;
        if (d2 < 0.01) {
          vx = hash01(`a${i}-${j}`) - 0.5;
          vy = hash01(`b${i}-${j}`) - 0.5;
          d2 = vx * vx + vy * vy + 0.01;
        }
        const f = (EDGE_LEN * EDGE_LEN) / d2;
        dx[i] += vx * f;
        dy[i] += vy * f;
        dx[j] -= vx * f;
        dy[j] -= vy * f;
      }
    }
    for (const e of edges) {
      const a = idx.get(e.source);
      const b = idx.get(e.target);
      if (a === undefined || b === undefined || a === b) continue;
      const vx = px[a] - px[b];
      const vy = py[a] - py[b];
      const d = Math.sqrt(vx * vx + vy * vy) || 0.01;
      const f = ((d - EDGE_LEN) / d) * 0.6;
      dx[a] -= vx * f;
      dy[a] -= vy * f;
      dx[b] += vx * f;
      dy[b] += vy * f;
    }
    for (let i = 0; i < ids.length; i += 1) {
      dx[i] -= px[i] * 0.01;
      dy[i] -= py[i] * 0.01;
      const len = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1;
      const step = Math.min(len, 40 * t + 1);
      px[i] += (dx[i] / len) * step;
      py[i] += (dy[i] / len) * step;
    }
  }
  const minX = Math.min(...px);
  const minY = Math.min(...py);
  const pts = ids.map((_, i) => ({ x: px[i] - minX, y: py[i] - minY }));
  return { ids, pts, w: Math.max(...pts.map((p) => p.x)), h: Math.max(...pts.map((p) => p.y)) };
}

function components(nodes: LayoutNode[], edges: LayoutEdge[]): { ids: string[]; edges: LayoutEdge[] }[] {
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const e of edges) {
    if (parent.has(e.source) && parent.has(e.target)) parent.set(find(e.source), find(e.target));
  }
  const groups = new Map<string, { ids: string[]; edges: LayoutEdge[] }>();
  const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
  for (const n of nodes) {
    if (!linked.has(n.id)) continue;
    const r = find(n.id);
    if (!groups.has(r)) groups.set(r, { ids: [], edges: [] });
    groups.get(r)!.ids.push(n.id);
  }
  for (const e of edges) groups.get(find(e.source))?.edges.push(e);
  return [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
}

/**
 * 이어진 묶음은 힘 기반으로 따로 배치해 위쪽에 선반처럼 채우고, 관계 없는 노드는 아래 띠에 줄 세운다.
 * 고립 노드가 가장자리에 흩어지면 "관계 없음"이라는 품질 신호가 오히려 안 보인다.
 */
export function layoutGraph(nodes: LayoutNode[], edges: LayoutEdge[], opts: { width?: number; iterations?: number } = {}): LayoutResult {
  const width = opts.width ?? 720;
  const iterations = opts.iterations ?? 300;
  const inner = Math.max(200, width - 2 * PAD);
  const positions = new Map<string, Pos>();
  let x = 0;
  let y = 0;
  let rowH = 0;
  let coreBottom = 0;
  for (const g of components(nodes, edges)) {
    const c = simulate(g.ids, g.edges, iterations);
    const s = c.w > inner ? inner / c.w : 1; // 화면보다 넓은 묶음만 줄인다.
    // 사슬처럼 길게 늘어난 묶음은 세로만 눌러 가로 폭의 60%(좁은 화면은 세로 화면이라 160%) 안에 담는다. 세로가 길면 SVG 전체가 줄어 글씨가 작아진다.
    const sy = Math.min(s, (inner * (width < 520 ? 1.6 : 0.6)) / Math.max(c.h, 1));
    const w = c.w * s;
    const h = c.h * sy;
    if (x > 0 && x + w > inner) {
      x = 0;
      y += rowH + GAP;
      rowH = 0;
    }
    c.ids.forEach((id, i) => positions.set(id, { x: PAD + x + c.pts[i].x * s, y: PAD + y + c.pts[i].y * sy }));
    x += w + GAP;
    rowH = Math.max(rowH, h);
    coreBottom = PAD + y + rowH;
  }
  const loose = nodes.filter((n) => !positions.has(n.id));
  let height = coreBottom + PAD;
  let looseTop: number | null = null;
  if (loose.length) {
    const perRow = Math.max(1, Math.floor((width - 40) / LOOSE_CELL));
    const top = coreBottom ? coreBottom + 96 : 50;
    looseTop = top;
    loose.forEach((n, i) => positions.set(n.id, { x: 40 + LOOSE_CELL / 2 + (i % perRow) * LOOSE_CELL, y: top + Math.floor(i / perRow) * LOOSE_ROW }));
    height = top + Math.ceil(loose.length / perRow) * LOOSE_ROW + 10;
  }
  return { positions, width, height: Math.max(height, 200), looseTop };
}
