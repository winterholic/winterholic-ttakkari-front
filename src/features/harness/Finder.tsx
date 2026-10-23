import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { searchHarness } from "../../api/client";
import type { HarnessQuery, HarnessRow, HarnessWarningKind, HarnessSummary } from "../../api/harnessTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ENGINE_LABEL, SCOPE_LABEL, WARNING_LABEL, activeLabel, formatAge, formatSize, formatTime, highlightParts } from "./labels";

export const failure = (e: unknown) => (e instanceof Error ? e.message : "불러오지 못했어요.");

export function Hl({ text, query }: { text: string; query: string }) {
  return <>{highlightParts(text, query).map((p, i) => (p.hit ? <mark key={i} className="hv-mark">{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}

/** 항목 한 줄. 그룹 화면의 목록과 검색 결과가 같은 모양을 쓴다. 검색 결과에서만 그룹 › 관심사 경로(crumb)를 보여 준다. */
export function ItemRow({ row, query = "", selected, select, showCrumb, layerLabel, showEngine = true }: {
  row: HarnessRow; query?: string; selected: boolean; select: (row: HarnessRow) => void; showCrumb?: boolean; layerLabel?: string; showEngine?: boolean;
}) {
  const state = activeLabel(row);
  return <li>
    <button type="button" className="hv-row" data-missing={!row.present || undefined} data-inactive={row.active === false || undefined} aria-pressed={selected} onClick={() => select(row)}>
      {showCrumb && row.crumb && <span className="hv-crumb-line">{row.crumb.map((c) => c.label).join(" › ")}</span>}
      <span className="hv-row__main"><span className="hv-row__title"><Hl text={row.name} query={query} /></span><span aria-hidden="true" className="hv-row__arrow">›</span></span>
      <span className="hv-badges">
        {layerLabel && <Badge mono>{layerLabel}</Badge>}
        {showEngine && <Badge tone="info">{ENGINE_LABEL[row.engine]}</Badge>}
        {row.pool === "company" && <Badge tone="warning">회사</Badge>}
        {!layerLabel && <Badge>{SCOPE_LABEL[row.scope]}</Badge>}
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

export function SearchBar({ value, onSubmit, autoFocus }: { value: string; onSubmit: (q: string) => void; autoFocus?: boolean }) {
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
    <input className="tk-input" type="search" aria-label="하네스 검색" placeholder="이름·설명·본문 검색 (예: launchctl, 커밋, 스킬 이름)" maxLength={200} value={text} autoFocus={autoFocus} onChange={(e) => setText(e.target.value)} />
  </form>;
}

/** 목록 쿼리 한 벌. 그룹 화면·프로젝트 화면·검색이 같은 API 를 다른 조건으로 부른다. */
export function ItemList({ query, text = "", selected, select, empty, showCrumb, showEngine, layerLabels, footer }: {
  query: HarnessQuery; text?: string; selected: string; select: (row: HarnessRow) => void; empty?: string; showCrumb?: boolean; showEngine?: boolean;
  layerLabels?: Record<string, string>; footer?: boolean;
}) {
  const result = useInfiniteQuery({
    queryKey: ["harness-items", query],
    queryFn: ({ pageParam }) => searchHarness({ ...query, cursor: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const rows = [...new Map((result.data?.pages.flatMap((p) => p.items) ?? []).map((r) => [r.id, r])).values()];
  const total = result.data?.pages[0]?.total ?? 0;
  return <section className="hv-results" aria-label="항목 목록">
    {result.isPending && <p role="status" className="hv-note">항목을 찾는 중</p>}
    {result.isError && <div className="hv-error"><p className="tk-error" role="alert">{failure(result.error)}</p><Button variant="ghost" onClick={() => void result.refetch()}>다시 시도</Button></div>}
    {result.isSuccess && <p className="hv-note" role="status">{total.toLocaleString()}건 중 {rows.length.toLocaleString()}건{text ? ` · "${text}"` : ""}</p>}
    {result.isSuccess && rows.length === 0 && <div className="tk-empty tk-empty--boxed"><p>{empty ?? "조건에 맞는 항목이 없어요."}</p></div>}
    {rows.length > 0 && <ul className="hv-list">{rows.map((r) => <ItemRow key={r.id} row={r} query={text} selected={selected === r.id} select={select} showCrumb={showCrumb} showEngine={showEngine} layerLabel={layerLabels?.[r.layer]} />)}</ul>}
    {result.hasNextPage && <Button variant="ghost" busy={result.isFetchingNextPage} onClick={() => void result.fetchNextPage()}>더 보기</Button>}
    {footer && <p className="hv-note">검색은 이름·설명·본문을 함께 찾아요.</p>}
  </section>;
}

export function WarningToggle({ summary, open, toggle }: { summary: HarnessSummary; open: boolean; toggle: () => void }) {
  return <button type="button" className="hv-stat hv-stat--button" data-tone={summary.warning_total ? "warn" : undefined} aria-expanded={open} aria-controls="hv-warnings" onClick={toggle}>
    <span className="hv-stat__value">{summary.warning_total.toLocaleString()}</span><span className="hv-stat__label">경고 {open ? "닫기" : "보기"}</span>
  </button>;
}

/** 경고 목록. 홈에서 펼쳐 항목으로 바로 이동한다. */
export function WarningPanel({ summary, openItem, onlyWarned }: { summary: HarnessSummary; openItem: (id: string) => void; onlyWarned: () => void }) {
  const kinds = Object.entries(summary.warning_kinds).filter(([, n]) => n > 0) as [HarnessWarningKind, number][];
  return <div id="hv-warnings" className="hv-warnings">
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
    {summary.warning_total > summary.warnings.length && <Button variant="ghost" onClick={onlyWarned}>경고 있는 항목 전체 검색</Button>}
    <p className="hv-note">감지 항목: 마크다운 링크·~/ 경로가 가리키는 파일 없음, 훅 스크립트 없음, 같은 이름의 스킬, 지나치게 긴 지침 파일.</p>
  </div>;
}
