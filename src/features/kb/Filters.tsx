import { useState } from "react";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { activeFilterCount, hasClientFilter } from "./kbState";
import type { KbFilters } from "./kbState";
import { DOMAINS, SOURCE_TYPE_OPTIONS, WHEN_OPTIONS } from "./labelsV3";

type Update = (values: Record<string, string | null>) => void;

const DOMAIN_OPTIONS = [{ value: "", label: "모든 주제" }, ...DOMAINS];
const STATUS_OPTIONS = [
  { value: "", label: "모든 상태" }, { value: "active", label: "진행 중" }, { value: "attention", label: "주의 필요(보류·실패·부분 완료)" },
  { value: "ready", label: "완료" }, { value: "degraded", label: "부분 완료" }, { value: "held", label: "보류" }, { value: "failed", label: "실패" },
  { value: "none", label: "처리 기록 없음" },
];

/**
 * 주제·개념·처리 상태는 서버에 보내고, 유형·출처·기간은 불러온 결과 안에서 거른다(계약에 서버 파라미터가 없다).
 * 좁은 화면에서는 접어 두고 켜진 필터 수만 보여 준다.
 */
export function FilterBar({ filters, update, withStatus, resetKeys }: { filters: KbFilters; update: Update; withStatus?: boolean; resetKeys?: string[] }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(filters.source);
  const [seen, setSeen] = useState(filters.source);
  if (filters.source !== seen) { setSeen(filters.source); setSource(filters.source); }
  const count = activeFilterCount(filters, Boolean(withStatus));
  const clear = () => update({ domain: null, concept: null, cn: null, status: null, type: null, source: null, when: null, ...Object.fromEntries((resetKeys ?? []).map((k) => [k, null])) });
  const set = (key: string, value: string) => update({ [key]: value || null, ...Object.fromEntries((resetKeys ?? []).map((k) => [k, null])) });
  return <section className="kb3-filters" aria-label="필터" data-open={open}>
    <div className="kb3-filters__bar">
      <Button size="sm" className="kb3-filters__toggle" aria-expanded={open} aria-controls="kb3-filter-body" onClick={() => setOpen((v) => !v)}>
        {count > 0 ? `필터 ${count}` : "필터"}
      </Button>
      {filters.concept && <span className="kb3-concept-chip">
        <span>개념: {filters.conceptName || "선택됨"}</span>
        <button type="button" aria-label="개념 필터 해제" onClick={() => set("concept", "")}>×</button>
      </span>}
      {count > 0 && <Button size="sm" variant="ghost" onClick={clear}>필터 지우기</Button>}
    </div>
    <div className="kb3-filters__body" id="kb3-filter-body">
      <div className="kb3-filter-field"><span id="kb3-f-domain">주제</span>
        <Select id="kb3-domain" labelledBy="kb3-f-domain" size="sm" value={filters.domain} options={DOMAIN_OPTIONS} onChange={(v) => set("domain", v)} /></div>
      <div className="kb3-filter-field"><span id="kb3-f-type">유형</span>
        <Select id="kb3-type" labelledBy="kb3-f-type" size="sm" value={filters.type} options={SOURCE_TYPE_OPTIONS} onChange={(v) => set("type", v)} /></div>
      <div className="kb3-filter-field"><span id="kb3-f-when">기간</span>
        <Select id="kb3-when" labelledBy="kb3-f-when" size="sm" value={filters.when} options={WHEN_OPTIONS} onChange={(v) => set("when", v)} /></div>
      {withStatus && <div className="kb3-filter-field"><span id="kb3-f-status">처리 상태</span>
        <Select id="kb3-status" labelledBy="kb3-f-status" size="sm" value={filters.status} options={STATUS_OPTIONS} onChange={(v) => set("status", v)} /></div>}
      <label className="kb3-filter-field"><span>출처 주소</span>
        <input className="tk-input" value={source} maxLength={200} placeholder="예: postgresql.org" onChange={(e) => setSource(e.target.value)}
          onBlur={() => { if (source.trim() !== filters.source) set("source", source.trim()); }}
          onKeyDown={(e) => { if (e.key === "Enter") set("source", source.trim()); }} />
      </label>
    </div>
    {hasClientFilter(filters) && <p className="kb-note">유형·출처·기간은 서버가 아직 거르지 않아, 불러온 결과 안에서만 걸러요.</p>}
  </section>;
}
