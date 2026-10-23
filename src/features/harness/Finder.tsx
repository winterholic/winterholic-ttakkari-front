import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { searchHarness } from "../../api/client";
import type { HarnessCategory, HarnessRow, HarnessSummary, HarnessWarningKind } from "../../api/harnessTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import {
  ENGINE_LABEL, SCOPE_LABEL, WARNING_LABEL, activeLabel, formatAge, formatSize, formatTime, highlightParts,
} from "./labels";

export interface FinderState {
  q: string;
  cat: string;
  engine: string;
  scope: string;
  active: "" | "1" | "0";
  warn: boolean;
  hideMissing: boolean;
}

export const failure = (e: unknown) => (e instanceof Error ? e.message : "불러오지 못했어요.");

export function Hl({ text, query }: { text: string; query: string }) {
  return <>{highlightParts(text, query).map((p, i) => (p.hit ? <mark key={i} className="hv-mark">{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" }) {
  return <div className={tone ? "hv-stat hv-stat--warn" : "hv-stat"}><span className="hv-stat__value">{value}</span><span className="hv-stat__label">{label}</span></div>;
}

export function SummaryBar({ summary, state, update, openItem }: {
  summary: HarnessSummary; state: FinderState; update: (v: Record<string, string | null>) => void; openItem: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inactive = summary.categories.reduce((n, c) => n + c.inactive, 0);
  const missing = summary.categories.reduce((n, c) => n + c.missing, 0);
  const kinds = Object.entries(summary.warning_kinds).filter(([, n]) => n > 0) as [HarnessWarningKind, number][];
  return <section className="hv-summary" aria-label="요약">
    <div className="hv-chips hv-chips--scroll" role="group" aria-label="카테고리">
      <button type="button" className="hv-chip" aria-pressed={!state.cat} onClick={() => update({ cat: null, item: null })}>전체 <span>{summary.total.toLocaleString()}</span></button>
      {summary.categories.map((c) => <button key={c.id} type="button" className="hv-chip" aria-pressed={state.cat === c.id} onClick={() => update({ cat: state.cat === c.id ? null : c.id, item: null })}>
        {c.label} <span>{c.total.toLocaleString()}</span>{c.warnings > 0 && <i className="hv-chip__dot" aria-label={`경고 ${c.warnings}`} />}
      </button>)}
    </div>
    <div className="hv-stats">
      <Stat label="전체 항목" value={summary.total.toLocaleString()} />
      <Stat label="비활성" value={inactive.toLocaleString()} />
      <Stat label="없는 항목" value={missing.toLocaleString()} />
      <button type="button" className="hv-stat hv-stat--button" data-tone={summary.warning_total ? "warn" : undefined} aria-expanded={open} aria-controls="hv-warnings" onClick={() => setOpen((v) => !v)}>
        <span className="hv-stat__value">{summary.warning_total.toLocaleString()}</span><span className="hv-stat__label">경고 {open ? "닫기" : "보기"}</span>
      </button>
    </div>
    {open && <div id="hv-warnings" className="hv-warnings">
      {summary.warning_total === 0 && <p className="hv-note">감지된 경고가 없어요.</p>}
      <div className="hv-chips" role="group" aria-label="경고 종류">
        {kinds.map(([kind, n]) => <Badge key={kind} tone="warning">{`${WARNING_LABEL[kind]} ${n}`}</Badge>)}
      </div>
      <ul className="hv-warning-list">{summary.warnings.map((w) => <li key={`${w.item_id}-${w.message}`}>
        <button type="button" className="hv-warning" onClick={() => openItem(w.item_id)}>
          <Icon name="warning" />
          <span className="hv-warning__text"><strong>{w.name}</strong><span>{w.message}</span></span>
          <span className="hv-row__arrow" aria-hidden="true">›</span>
        </button>
      </li>)}</ul>
      {summary.warning_total > summary.warnings.length && <Button variant="ghost" onClick={() => { update({ warn: "1", item: null }); setOpen(false); }}>경고 있는 항목 전체 보기</Button>}
      <p className="hv-note">감지 항목: 마크다운 링크·`~/` 경로가 가리키는 파일 없음, 훅 스크립트 없음, 같은 이름의 스킬, 지나치게 긴 지침 파일.</p>
    </div>}
  </section>;
}

export function SearchBar({ value, onSubmit }: { value: string; onSubmit: (q: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // 주소가 바뀌어(뒤로 가기 등) 값이 달라졌을 때만 입력칸을 맞춘다. 입력 중에는 건드리지 않는다.
  if (value !== seen) { setSeen(value); setText(value); }
  useEffect(() => {
    if (text === value) return undefined;
    const t = window.setTimeout(() => onSubmit(text.trim()), 300);
    return () => window.clearTimeout(t);
  }, [text, value, onSubmit]);
  return <form className="hv-search" role="search" onSubmit={(e) => { e.preventDefault(); onSubmit(text.trim()); }}>
    <Icon name="search" />
    <input className="tk-input" type="search" aria-label="하네스 검색" placeholder="이름·설명·본문 검색 (예: launchctl, 커밋, 스킬 이름)" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
  </form>;
}

export function Filters({ summary, state, update }: { summary: HarnessSummary; state: FinderState; update: (v: Record<string, string | null>) => void }) {
  const active = [state.engine, state.scope, state.active, state.warn ? "1" : "", state.hideMissing ? "1" : ""].filter(Boolean).length;
  return <details className="hv-filters" open={active > 0 || undefined}>
    <summary>필터{active > 0 ? ` · ${active}개 적용` : ""}</summary>
    <div className="hv-filters__body">
      <label className="hv-field"><span>엔진</span>
        <select className="tk-select" aria-label="엔진 필터" value={state.engine} onChange={(e) => update({ engine: e.target.value || null, item: null })}>
          <option value="">전체</option>
          {summary.engines.map((e) => <option key={e.id} value={e.id}>{ENGINE_LABEL[e.id] ?? e.id} ({e.total})</option>)}
        </select></label>
      <label className="hv-field"><span>적용 범위</span>
        <select className="tk-select" aria-label="범위 필터" value={state.scope} onChange={(e) => update({ scope: e.target.value || null, item: null })}>
          <option value="">전체</option>
          {summary.scopes.map((s) => <option key={s.id} value={s.id}>{SCOPE_LABEL[s.id]} ({s.total})</option>)}
        </select></label>
      <label className="hv-field"><span>활성 여부</span>
        <select className="tk-select" aria-label="활성 필터" value={state.active} onChange={(e) => update({ active: e.target.value || null, item: null })}>
          <option value="">전체</option><option value="1">활성만</option><option value="0">비활성만</option>
        </select></label>
      <label className="hv-check"><input type="checkbox" checked={state.warn} onChange={(e) => update({ warn: e.target.checked ? "1" : null, item: null })} /><span>경고 있는 항목만</span></label>
      <label className="hv-check"><input type="checkbox" checked={state.hideMissing} onChange={(e) => update({ hide_missing: e.target.checked ? "1" : null, item: null })} /><span>없는 항목 숨기기</span></label>
      {active > 0 && <Button variant="ghost" onClick={() => update({ engine: null, scope: null, active: null, warn: null, hide_missing: null, item: null })}>필터 초기화</Button>}
    </div>
  </details>;
}

function Row({ row, query, selected, select }: { row: HarnessRow; query: string; selected: boolean; select: (id: string) => void }) {
  const state = activeLabel(row);
  return <li>
    <button type="button" className="hv-row" data-missing={!row.present || undefined} data-inactive={row.active === false || undefined} aria-pressed={selected} onClick={() => select(row.id)}>
      <span className="hv-row__main"><span className="hv-row__title"><Hl text={row.name} query={query} /></span><span aria-hidden="true" className="hv-row__arrow">›</span></span>
      <span className="hv-badges">
        <Badge tone="info">{ENGINE_LABEL[row.engine]}</Badge>
        <Badge>{SCOPE_LABEL[row.scope]}</Badge>
        <Badge tone={state.tone}>{state.text}</Badge>
        {row.alias_of && <Badge>링크 별칭</Badge>}
        {row.warnings.length > 0 && <Badge tone="warning">{`경고 ${row.warnings.length}`}</Badge>}
      </span>
      {row.description && <span className="hv-row__desc"><Hl text={row.description} query={query} /></span>}
      {row.snippet && <span className="hv-row__snippet"><span className="hv-row__where">본문</span> <Hl text={row.snippet} query={query} /></span>}
      {row.path && <span className="hv-path">{row.path}</span>}
      <span className="hv-row__meta">{row.group && <span>{row.group}</span>}<span>{formatSize(row.chars, row.lines)}</span>{row.mtime != null && <span>{formatTime(row.mtime)} · {formatAge(row.mtime)}</span>}</span>
    </button>
  </li>;
}

export function ResultList({ state, selected, select }: { state: FinderState; selected: string; select: (id: string) => void }) {
  const query = useInfiniteQuery({
    queryKey: ["harness-items", state],
    queryFn: ({ pageParam }) => searchHarness({
      q: state.q || undefined, category: state.cat || undefined, engine: state.engine || undefined, scope: state.scope || undefined,
      active: state.active ? state.active === "1" : undefined, warned: state.warn || undefined, present: state.hideMissing ? true : undefined,
      cursor: pageParam,
    }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const rows = [...new Map((query.data?.pages.flatMap((p) => p.items) ?? []).map((r) => [r.id, r])).values()];
  const total = query.data?.pages[0]?.total ?? 0;
  return <section className="hv-results" aria-label="검색 결과">
    {query.isPending && <p role="status" className="hv-note">항목을 찾는 중</p>}
    {query.isError && <div className="hv-error"><p className="tk-error" role="alert">{failure(query.error)}</p><Button variant="ghost" onClick={() => void query.refetch()}>다시 시도</Button></div>}
    {query.isSuccess && <p className="hv-note" role="status">{total.toLocaleString()}건 중 {rows.length.toLocaleString()}건{state.q ? ` · "${state.q}"` : ""}</p>}
    {query.isSuccess && rows.length === 0 && <div className="tk-empty tk-empty--boxed"><p>조건에 맞는 항목이 없어요.</p><p>검색어를 줄이거나 필터를 풀어 보세요.</p></div>}
    {rows.length > 0 && <ul className="hv-list">{rows.map((r) => <Row key={r.id} row={r} query={state.q} selected={selected === r.id} select={select} />)}</ul>}
    {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>더 보기</Button>}
  </section>;
}

export const categoryLabel = (summary: HarnessSummary | undefined, id: HarnessCategory | string) => summary?.categories.find((c) => c.id === id)?.label ?? id;
