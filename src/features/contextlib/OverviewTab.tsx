import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { libOverview } from "../../api/client";
import type { EntityType, LibScope } from "../../api/client";
import { ListSkeleton } from "../viewer/screenStates";
import {
  BarList, CATEGORY_COLOR, CATEGORY_ORDER, KIND_LABEL, LibError, MEMORY_SOURCE_LABEL, ScopeBadge, Section, Stat, TYPE_COLOR, TYPE_LABEL,
  ago, categoryLabel, n, scopeLabel, shortPath, when,
} from "./shared";

const NEUTRAL = "var(--tk-color-chart-categorical-1)";

export function OverviewTab({ scope }: { scope: LibScope }) {
  const q = useQuery({ queryKey: ["ctxlib", "overview", scope], queryFn: () => libOverview(scope) });
  if (q.isError) return <LibError error={q.error} what="도서관 개요" onRetry={() => void q.refetch()} />;
  if (!q.data) return <ListSkeleton rows={5} label="개요를 불러오는 중" />;
  const o = q.data;
  const t = o.totals;
  const rows = CATEGORY_ORDER.map((c) => {
    const parts = o.by_category.filter((r) => r.category === c);
    return {
      category: c,
      sources: parts.reduce((a, r) => a + r.sources, 0),
      documents: parts.reduce((a, r) => a + r.documents, 0),
      chunks: parts.reduce((a, r) => a + r.chunks, 0),
      scopes: parts,
    };
  });
  const extra = o.by_category.filter((r) => !CATEGORY_ORDER.includes(r.category));
  const maxChunks = Math.max(1, ...rows.map((r) => r.chunks));
  return (
    <div className="cl-stack">
      <Section id="cl-ov-totals" title="한눈에" hint="아래 숫자는 위에서 고른 범위 기준이에요. 회사 범위는 회사·공통 자료만 세요.">
        <div className="cl-stats">
          <Stat label="출처" value={n(t.sources)} hint={t.enabled_sources !== t.sources ? `사용 중 ${t.enabled_sources}` : "폴더·파일"} />
          <Stat label="문서" value={n(t.documents)} />
          <Stat label="조각" value={n(t.chunks)} hint="검색 단위" />
          <Stat label="기억" value={n(t.memories)} hint="보관 안 한 것" />
          <Stat label="엔터티" value={n(t.entities)} />
          <Stat label="관계" value={n(t.relations)} hint={t.entities ? `엔터티당 ${(t.relations / t.entities).toFixed(1)}` : undefined} tone={t.entities > 5 && t.relations < t.entities / 2 ? "warn" : undefined} />
        </div>
      </Section>

      <Section id="cl-ov-cat" title="종류별 분량" hint="막대 길이는 조각 수예요. 범위별 수는 오른쪽에 적었어요.">
        <ul className="cl-cats" aria-label="종류별 분량">
          {rows.map((r) => (
            <li key={r.category} className="cl-cats__row" data-empty={r.chunks === 0 ? "" : undefined}>
              <div className="cl-cats__head">
                <span className="cl-cats__name"><span className="cl-swatch" style={{ "--c": CATEGORY_COLOR[r.category] } as CSSProperties} aria-hidden />{categoryLabel(r.category)}</span>
                <span className="cl-cats__nums">
                  {r.chunks === 0 ? "아직 없음" : `출처 ${n(r.sources)} · 문서 ${n(r.documents)} · 조각 ${n(r.chunks)}`}
                </span>
              </div>
              <span className="cl-cats__track" aria-hidden>
                {r.scopes.map((s, i) => (
                  <span key={s.scope} className="cl-cats__seg" data-scope={s.scope} data-i={i}
                    style={{ "--c": CATEGORY_COLOR[r.category], width: `${(s.chunks / maxChunks) * 100}%` } as CSSProperties} />
                ))}
              </span>
              {r.scopes.length > 0 && (
                <span className="cl-cats__scopes">
                  {r.scopes.map((s) => (
                    <span key={s.scope}><ScopeBadge scope={s.scope} /> 조각 {n(s.chunks)}</span>
                  ))}
                </span>
              )}
            </li>
          ))}
          {extra.map((r) => (
            <li key={`${r.category}-${r.scope}`} className="cl-cats__row">
              <div className="cl-cats__head"><span className="cl-cats__name">{categoryLabel(r.category)} · {scopeLabel(r.scope)}</span><span className="cl-cats__nums">조각 {n(r.chunks)}</span></div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="cl-ov-index" title="색인 상태">
        <div className="cl-stats cl-stats--sm">
          <Stat label="마지막 색인" value={ago(o.last_indexed_at)} hint={when(o.last_indexed_at)} />
          <Stat label="아직 색인 안 된 출처" value={n(o.never_indexed)} tone={o.never_indexed ? "warn" : undefined} />
          <Stat label="오류 있는 출처" value={n(o.error_sources.length)} tone={o.error_sources.length ? "warn" : undefined} />
          <Stat label="검색 방식" value="키워드" hint="임베딩 없음, 부분 일치" />
        </div>
        {o.error_sources.length > 0 && (
          <ul className="tk-list" aria-label="색인 오류가 있는 출처">
            {o.error_sources.map((s) => (
              <li key={s.id}>
                <div className="tk-list__item">
                  <span className="tk-list__body">
                    <span className="tk-list__title tk-mono">{shortPath(s.path)}</span>
                    <span className="tk-list__meta">
                      <ScopeBadge scope={s.scope} />
                      <span>{categoryLabel(s.category)}</span>
                      <span>마지막 시도 {when(s.last_indexed_at)}</span>
                    </span>
                    <span className="tk-error">{s.last_error}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="cl-pair">
        <Section id="cl-ov-mem" title="기억">
          <BarList label="기억 종류" rows={Object.entries(o.memories.by_kind).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: KIND_LABEL[k] ?? k, value: v, color: NEUTRAL }))} />
          <p className="cl-note">입력 경로</p>
          <BarList label="기억 입력 경로" rows={Object.entries(o.memories.by_source).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: MEMORY_SOURCE_LABEL[k] ?? k, value: v, color: "var(--tk-color-chart-categorical-2)" }))} />
        </Section>
        <Section id="cl-ov-ent" title="엔터티 종류">
          <BarList label="엔터티 종류" rows={Object.entries(o.entities.by_type).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
            key: k, label: TYPE_LABEL[k as EntityType] ?? k, value: v, color: TYPE_COLOR[k as EntityType] ?? TYPE_COLOR.other }))} />
        </Section>
      </div>
    </div>
  );
}
