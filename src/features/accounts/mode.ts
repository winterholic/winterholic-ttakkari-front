import type { AccountOut, AccountPool } from "../../api/types";

/** 그 모드에서 켜져 있는지. 개인·회사 모드의 켜기는 서로 독립이다. */
export const isOn = (a: AccountOut, pool: AccountPool): boolean => (pool === "work" ? a.work_enabled : a.enabled);

/** 그 모드의 계정 목록. 개인은 모든 계정을 서버가 준 순서로, 회사는 들어온 계정만 회사 순서(work_priority)로 본다. */
export function modeRows(all: AccountOut[], pool: AccountPool): AccountOut[] {
  if (pool === "personal") return all;
  return all.filter((a) => a.pool === "work").sort((a, b) => a.work_priority - b.work_priority);
}

/** 서버가 돌려준 한 모드의 순서를 전체 캐시에 합친다. 다른 모드의 값은 건드리지 않는다. */
export function applyOrder(all: AccountOut[], ordered: AccountOut[], pool: AccountPool): AccountOut[] {
  if (pool === "personal") {
    const byId = new Map(ordered.map((a) => [a.id, a]));
    const known = new Set(all.map((a) => a.id));
    // 서버가 모르는 계정은 버리고, 목록에 없는 계정(방금 추가된 것)은 뒤에 둔다.
    return [...ordered.filter((a) => known.has(a.id)), ...all.filter((a) => !byId.has(a.id))];
  }
  const rank = new Map(ordered.map((a, i) => [a.id, i]));
  return all.map((a) => (rank.has(a.id) ? { ...a, work_priority: rank.get(a.id)! } : a));
}
