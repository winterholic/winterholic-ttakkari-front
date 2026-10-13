import type { UUID } from "../../api/types";
import type { TreeItem } from "../tasks/buildTree";

/** 노드 카드 크기와 간격(px, 확대 1 기준). 카드 안 글자 크기는 디자인 시스템 토큰을 따르고, 여기 값은 배치 격자다. */
export const NODE_W = 240;
export const NODE_H = 72;
const GAP_X = 24;
const GAP_Y = 64;

export const DESK_ID = "__desk__";

export interface PlacedNode {
  id: UUID;
  item: TreeItem | null; // null 이면 맨 위 따까리 노드
  x: number; // 왼쪽 위
  y: number;
  depth: number;
  /** 접혀서 숨은 하위 수. 0 이면 펼쳐져 있거나 자식이 없다. */
  hidden: number;
}

export interface Edge {
  from: UUID;
  to: UUID;
  /** 아래쪽 가지에서 일이 돌고 있다. 선을 에이전트 색으로 그린다. */
  live: boolean;
  d: string;
}

export interface Layout {
  nodes: PlacedNode[];
  edges: Edge[];
  width: number;
  height: number;
}

const CORNER = 12;

/** 부모 아래 가운데 → 중간 높이 → 자식 위 가운데. 꺾이는 곳은 둥글게(가계도·플로차트 문법). */
export function elbow(x1: number, y1: number, x2: number, y2: number): string {
  const mid = y1 + (y2 - y1) / 2;
  if (Math.abs(x2 - x1) < 1) return `M${x1},${y1} V${y2}`;
  const dir = x2 > x1 ? 1 : -1;
  const r = Math.min(CORNER, Math.abs(x2 - x1) / 2, (y2 - y1) / 2);
  return [
    `M${x1},${y1}`,
    `V${mid - r}`,
    `Q${x1},${mid} ${x1 + dir * r},${mid}`,
    `H${x2 - dir * r}`,
    `Q${x2},${mid} ${x2},${mid + r}`,
    `V${y2}`,
  ].join(" ");
}

/**
 * 위에서 아래로 펼치는 정돈된 트리 배치. 맨 위는 따까리, 그 아래가 뿌리(기획 세션)들이다.
 * 하위 폭을 먼저 재고 부모를 자식들 가운데 위에 둔다. 접힌 노드의 자식은 배치하지 않는다.
 */
export function layoutForest(forest: TreeItem[], collapsed: ReadonlySet<UUID>): Layout {
  const nodes: PlacedNode[] = [];
  const edges: Edge[] = [];
  const kids = (it: TreeItem) => (collapsed.has(it.node.id) ? [] : it.children);
  const widthOf = new Map<TreeItem, number>();
  const measure = (it: TreeItem): number => {
    const ks = kids(it);
    const w = ks.length === 0 ? NODE_W : Math.max(NODE_W, ks.reduce((s, k) => s + measure(k), 0) + GAP_X * (ks.length - 1));
    widthOf.set(it, w);
    return w;
  };
  const rootsW = forest.length === 0 ? NODE_W : forest.reduce((s, r) => s + measure(r), 0) + GAP_X * (forest.length - 1);
  const totalW = Math.max(NODE_W, rootsW);

  let maxDepth = 0;
  const place = (it: TreeItem, left: number, depth: number, parent: PlacedNode) => {
    const w = widthOf.get(it)!;
    const x = left + (w - NODE_W) / 2;
    const y = depth * (NODE_H + GAP_Y);
    // 선이 살아 있다는 것은 그 선 아래(자기 포함)에서 일이 돈다는 뜻이다.
    const live = it.activeBelow > 0 || it.node.status === "running" || it.node.status === "queued";
    const me: PlacedNode = { id: it.node.id, item: it, x, y, depth, hidden: collapsed.has(it.node.id) ? it.size : 0 };
    nodes.push(me);
    maxDepth = Math.max(maxDepth, depth);
    edges.push({
      from: parent.id,
      to: me.id,
      live,
      d: elbow(parent.x + NODE_W / 2, parent.y + NODE_H, x + NODE_W / 2, y),
    });
    let cursor = left + (w - (kids(it).reduce((s, k) => s + widthOf.get(k)!, 0) + GAP_X * Math.max(0, kids(it).length - 1))) / 2;
    for (const k of kids(it)) {
      place(k, cursor, depth + 1, me);
      cursor += widthOf.get(k)! + GAP_X;
    }
  };

  const desk: PlacedNode = { id: DESK_ID, item: null, x: (totalW - NODE_W) / 2, y: 0, depth: 0, hidden: 0 };
  nodes.push(desk);
  let cursor = (totalW - rootsW) / 2;
  for (const r of forest) {
    place(r, cursor, 1, desk);
    cursor += widthOf.get(r)! + GAP_X;
  }
  return { nodes, edges, width: totalW, height: (maxDepth + 1) * NODE_H + maxDepth * GAP_Y };
}
