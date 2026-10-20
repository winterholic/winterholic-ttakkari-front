import { useState } from "react";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { EMPTY_FILTER, activeFilterCount } from "./versionInfo";
import type { FeedbackFilter, PeriodFilter, StatusFilter, VersionFilter } from "./versionInfo";

const STATUS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "전체" }, { id: "succeeded", label: "성공" }, { id: "failed", label: "실패" }, { id: "building", label: "만드는 중" },
];
const PERIOD: { id: PeriodFilter; label: string }[] = [
  { id: "all", label: "전체" }, { id: "today", label: "오늘" }, { id: "7d", label: "7일" }, { id: "30d", label: "30일" },
];
const FEEDBACK: { id: FeedbackFilter; label: string }[] = [
  { id: "all", label: "전체" }, { id: "applied", label: "피드백 반영" }, { id: "received", label: "피드백 받음" }, { id: "none", label: "없음" },
];

function Group<T extends string>({ name, label, options, value, onChange }: { name: string; label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="game-filter__group">
      <p className="tk-label" id={`${name}-label`}>{label}</p>
      <div className="tk-segmented tk-segmented--scroll" role="radiogroup" aria-labelledby={`${name}-label`}>
        {options.map((o) => (
          <label key={o.id}>
            <input type="radio" name={name} checked={value === o.id} onChange={() => onChange(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/** 버전 목록의 검색·필터. 서버를 다시 부르지 않고 이미 받은 빌드 기록에서 거른다. 피드백 필터는 서버가 요청 정보를 줄 때만 나온다. */
export function VersionFilters({ gameId, filter, onChange, total, shown, withRequests }: {
  gameId: string;
  filter: VersionFilter;
  onChange: (f: VersionFilter) => void;
  total: number;
  shown: number;
  withRequests: boolean;
}) {
  const active = activeFilterCount(filter);
  const [open, setOpen] = useState(false);
  const panelId = `game-filter-${gameId}`;
  return (
    <div className="tk-filterbar game-filter">
      <div className="tk-filterbar__row">
        <label className="tk-input-wrap">
          <Icon name="search" />
          <input
            className="tk-input"
            type="search"
            value={filter.text}
            placeholder={withRequests ? "요청 내용·v번호·커밋으로 찾기" : "v번호·커밋으로 찾기"}
            aria-label="버전 검색"
            onChange={(e) => onChange({ ...filter, text: e.target.value })}
          />
        </label>
        <Button size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
          <Icon name="filter" />
          <span>필터{active ? ` ${active}` : ""}</span>
        </Button>
      </div>
      {open && (
        <div id={panelId} className="game-filter__panel">
          <Group name={`${panelId}-status`} label="상태" options={STATUS} value={filter.status} onChange={(status) => onChange({ ...filter, status })} />
          <Group name={`${panelId}-period`} label="기간" options={PERIOD} value={filter.period} onChange={(period) => onChange({ ...filter, period })} />
          {withRequests && <Group name={`${panelId}-fb`} label="시각 피드백" options={FEEDBACK} value={filter.feedback} onChange={(feedback) => onChange({ ...filter, feedback })} />}
        </div>
      )}
      <p className="tk-filterbar__count" role="status">
        {active ? `버전 ${total}개 중 ${shown}개` : `버전 ${total}개`}
        {active > 0 && <> · <button className="tk-link" type="button" onClick={() => onChange(EMPTY_FILTER)}>필터 지우기</button></>}
      </p>
    </div>
  );
}
