import type { KbDocumentRowV3, KbSearchHitV3 } from "../../api/kbTypes";
import { sourceType, withinDays } from "./labelsV3";

/** 화면 상태는 모두 URL 에 둔다. 예전 view=search·add·collect 와 scope 는 읽기만 하고 새 값으로 바꾼다(기존 주소 호환). */
export type KbView = "explore" | "graph" | "docs" | "conflicts";
export const VIEWS: { id: KbView; label: string }[] = [
  { id: "explore", label: "지식 탐색" },
  { id: "graph", label: "개념 그래프" },
  { id: "docs", label: "문서·처리" },
  { id: "conflicts", label: "충돌·품질" },
];

export function viewOf(raw: string | null): KbView | "legacy-collect" {
  if (raw === "collect") return "legacy-collect";
  if (raw === "graph" || raw === "docs" || raw === "conflicts") return raw;
  return "explore"; // 없음, search, add 와 모르는 값
}

export interface KbFilters {
  /** 서버 필터: 주제, 개념(entity_id), 처리 상태 */
  domain: string;
  concept: string;
  conceptName: string;
  status: string;
  /** 불러온 결과 안에서 거르는 필터: 유형, 출처, 기간. 계약에 서버 파라미터가 없다. */
  type: string;
  source: string;
  when: string;
}

export function filtersOf(p: URLSearchParams): KbFilters {
  return {
    domain: p.get("domain") || "", concept: p.get("concept") || "", conceptName: p.get("cn") || "", status: p.get("status") || "",
    type: p.get("type") || "", source: p.get("source") || "", when: p.get("when") || "",
  };
}

/** 서버 계약에 없는 필터가 켜져 있는지. 켜져 있으면 "불러온 N건 중" 이라고 밝혀야 한다. */
export const hasClientFilter = (f: KbFilters) => Boolean(f.type || f.source.trim() || f.when);

export function activeFilterCount(f: KbFilters, withStatus: boolean): number {
  return [f.domain, f.concept, withStatus ? f.status : "", f.type, f.source.trim(), f.when].filter(Boolean).length;
}

export function matchDocument(d: KbDocumentRowV3, f: KbFilters, now = Date.now()): boolean {
  const src = d.current_revision?.source;
  if (f.type && sourceType(d.source_kind ?? src?.kind) !== f.type) return false;
  const needle = f.source.trim().toLowerCase();
  if (needle && !`${src?.locator ?? ""} ${src?.source_key ?? ""} ${d.doc_key}`.toLowerCase().includes(needle)) return false;
  if (f.when && !withinDays(d.updated_at, Number(f.when), now)) return false;
  return true;
}

export function matchHit(h: KbSearchHitV3, f: KbFilters, now = Date.now()): boolean {
  if (f.type && sourceType(h.source?.kind) !== f.type) return false;
  const needle = f.source.trim().toLowerCase();
  if (needle && !`${h.source?.locator ?? ""} ${h.source?.source_key ?? ""}`.toLowerCase().includes(needle)) return false;
  if (f.when && !withinDays(h.source?.collected_at, Number(f.when), now)) return false;
  return true;
}
