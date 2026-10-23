import type { HarnessGroupId } from "../../api/harnessTypes";

export type Update = (values: Record<string, string | null>) => void;

/** 주소(쿼리)로 두는 화면 상태. 그룹 › 관심사 › 항목이 주소에 그대로 남아 새로고침·뒤로가기에서 같은 자리로 돌아온다. */
export interface Nav {
  g: HarnessGroupId | "";
  c: string;
  l: string;
  p: string;
  v: string;
  item: string;
  find: boolean;
  q: string;
  warn: boolean;
  fg: string;
  s: string;
  le: string;
  pool: string;
}

export const GROUP_IDS: HarnessGroupId[] = ["claude", "codex", "muse", "qwen", "antigravity", "ttakkari", "projects"];

export function readNav(params: URLSearchParams): Nav {
  const g = GROUP_IDS.find((id) => id === params.get("g")) ?? "";
  const q = params.get("q") || "";
  return {
    g, c: params.get("c") || "", l: params.get("l") || "", p: params.get("p") || "", v: params.get("v") || "",
    item: params.get("item") || "", find: params.get("find") === "1" || Boolean(q), q, warn: params.get("warn") === "1", fg: params.get("fg") || "",
    s: params.get("s") || "", le: params.get("le") || "", pool: params.get("pool") || "",
  };
}

const CLEAR = { c: null, l: null, p: null, v: null, item: null, find: null, q: null, warn: null, fg: null } as const;

/** 경로(breadcrumb) 한 칸을 눌렀을 때 이동할 주소 값. 프로젝트 안의 엔진 칸은 프로젝트 화면으로 간다. */
export function crumbTarget(crumb: { kind: string; id: string }, item: { hgroup: HarnessGroupId; project: string }): Record<string, string | null> {
  if (crumb.kind === "group") return { ...CLEAR, g: crumb.id };
  if (crumb.kind === "project" || crumb.kind === "engine") return { ...CLEAR, g: "projects", p: item.project };
  return { ...CLEAR, g: item.hgroup, c: item.hgroup === "projects" ? null : crumb.id, p: item.project || null };
}

export const concernTarget = (c: { hgroup: HarnessGroupId; concern: string; project: string }): Record<string, string | null> =>
  c.hgroup === "projects" ? { ...CLEAR, g: "projects", p: c.project || null } : { ...CLEAR, g: c.hgroup, c: c.concern };

/** 항목을 그 항목이 속한 그룹 › 관심사 자리에서 연다(검색을 빠져나온다). */
export const contextOf = (row: { id: string; hgroup: HarnessGroupId; concern: string; project?: string }): Record<string, string | null> => ({
  g: row.hgroup, c: row.concern, p: row.project || null, l: null, v: null, item: row.id, find: null, q: null, warn: null, fg: null,
});
