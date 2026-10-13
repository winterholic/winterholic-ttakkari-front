import type { RunStatus, TaskNode, UUID } from "../../api/types";

export interface TreeItem {
  node: TaskNode;
  children: TreeItem[];
  depth: number;
  /** 자기 아래(자기 제외)에서 실행 중·대기 중인 세션 수. 접힌 가지에도 일이 도는지 보이게 쓴다. */
  activeBelow: number;
  /** 자기 아래(자기 제외) 세션 수 */
  size: number;
}

export const isActive = (s: RunStatus | null | undefined): boolean => s === "running" || s === "queued";

/**
 * 평평한 노드 목록을 뿌리 순서대로 세운다. 자식은 만든 순서다(일을 나눈 순서가 그대로 읽히게).
 * 뿌리의 parent_id 는 접수일 수 있어 roots 목록으로만 뿌리를 정한다. 부모를 못 찾은 노드는 버린다.
 */
export function buildForest(roots: UUID[], nodes: TaskNode[]): TreeItem[] {
  const kids = new Map<UUID, TaskNode[]>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rootSet = new Set(roots);
  for (const n of nodes) {
    if (rootSet.has(n.id) || !n.parent_id) continue;
    const list = kids.get(n.parent_id) ?? [];
    list.push(n);
    kids.set(n.parent_id, list);
  }
  const grow = (node: TaskNode, depth: number, seen: Set<UUID>): TreeItem => {
    seen.add(node.id);
    const children = (kids.get(node.id) ?? [])
      .filter((c) => !seen.has(c.id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => grow(c, depth + 1, seen));
    return {
      node,
      children,
      depth,
      activeBelow: children.reduce((sum, c) => sum + c.activeBelow + (isActive(c.node.status) ? 1 : 0), 0),
      size: children.reduce((sum, c) => sum + c.size + 1, 0),
    };
  };
  return roots.flatMap((id) => {
    const n = byId.get(id);
    return n ? [grow(n, 0, new Set())] : [];
  });
}

/** 가지 안에 일이 돌고 있거나 지금 보는 세션까지의 길이면 펼친다. 지금 세션도 펼쳐 자식이 보이게 한다. */
export function defaultOpen(items: TreeItem[], currentPath: readonly UUID[] = []): Set<UUID> {
  const open = new Set<UUID>(currentPath);
  const walk = (it: TreeItem) => {
    if (it.activeBelow > 0) open.add(it.node.id);
    it.children.forEach(walk);
  };
  items.forEach(walk);
  return open;
}

/** 가지의 대표 상태: 아래에서 하나라도 돌면 실행 중, 아니면 자기 마지막 상태. */
export function branchStatus(it: TreeItem): RunStatus | null {
  return it.activeBelow > 0 && !isActive(it.node.status) ? "running" : it.node.status;
}
