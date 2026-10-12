import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { libQuality } from "../../api/client";
import type { EntityType, LibChunkExample, LibFinding, LibQuality, LibScope } from "../../api/client";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/Icon";
import { ErrorState, ListSkeleton } from "../viewer/screenStates";
import { BarList, KIND_LABEL, MEMORY_SOURCE_LABEL, Section, Stat, TYPE_COLOR, TYPE_LABEL, n, shortPath } from "./shared";

const LEVEL: Record<LibFinding["level"], { icon: IconName; label: string; badge: string; order: number }> = {
  warn: { icon: "warning", label: "손볼 만함", badge: "tk-badge--warning", order: 0 },
  info: { icon: "info", label: "참고", badge: "tk-badge--info", order: 1 },
  ok: { icon: "circle-check", label: "괜찮음", badge: "tk-badge--success", order: 2 },
};

function Findings({ items }: { items: LibFinding[] }) {
  const sorted = [...items].sort((a, b) => LEVEL[a.level].order - LEVEL[b.level].order);
  return (
    <ul className="cl-findings" aria-label="점검 항목">
      {sorted.map((f) => (
        <li key={f.code} className="cl-finding" data-level={f.level}>
          <Icon name={LEVEL[f.level].icon} />
          <div>
            <p className="cl-finding__title"><span className={`tk-badge ${LEVEL[f.level].badge}`}>{LEVEL[f.level].label}</span> {f.title}</p>
            {f.detail && <p className="cl-note">{f.detail}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 조각 길이 분포. 막대 옆에 값을 적고, 권장 범위 밖 구간은 다른 색 + 아래 표시로 색만으로 구분하지 않는다. */
export function Histogram({ q }: { q: LibQuality["chunks"] }) {
  const max = Math.max(1, ...q.histogram.map((b) => b.count));
  const off = (b: LibQuality["chunks"]["histogram"][number]) => (b.max !== null && b.max <= q.short_limit) || b.min >= q.long_limit;
  return (
    <figure className="cl-hist">
      <div className="cl-hist__plot" role="img" aria-label={`조각 길이 분포. ${q.histogram.map((b) => `${b.label}자 ${b.count}개`).join(", ")}`}>
        {q.histogram.map((b) => (
          <div key={b.label} className="cl-hist__col" data-off={off(b) ? "" : undefined}>
            <span className="cl-hist__count">{n(b.count)}</span>
            <span className="cl-hist__bar" style={{ height: `${Math.max(1, (b.count / max) * 100)}%` }} />
            <span className="cl-hist__label">{b.label}</span>
            <span className="cl-hist__tag">{b.max !== null && b.max <= q.short_limit ? "짧음" : b.min >= q.long_limit ? "긺" : ""}</span>
          </div>
        ))}
      </div>
      <figcaption className="cl-note">가로: 조각 글자 수, 세로: 조각 개수. 목표는 약 {n(q.target)}자예요. 주황색 막대는 너무 짧거나(&lt;{q.short_limit}) 긴(&gt;{n(q.long_limit)}) 쪽이에요.</figcaption>
      <details className="cl-details">
        <summary>표로 보기</summary>
        <table className="tk-table">
          <thead><tr><th>글자 수</th><th>조각</th></tr></thead>
          <tbody>{q.histogram.map((b) => <tr key={b.label}><td>{b.label}</td><td>{n(b.count)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

function Examples({ title, items, empty }: { title: string; items: LibChunkExample[]; empty: string }) {
  return (
    <details className="cl-details" open={items.length > 0 && items.length <= 3}>
      <summary>{title} ({items.length})</summary>
      {items.length === 0 ? <p className="cl-note">{empty}</p> : (
        <ul className="tk-list">
          {items.map((c) => (
            <li key={c.id}>
              <div className="tk-list__item"><span className="tk-list__body">
                <span className="tk-list__title tk-mono">{shortPath(c.path)}</span>
                <span className="tk-list__meta">
                  <span>{c.heading ?? "제목 없음"}</span><span>{n(c.length)}자</span>
                  {c.copies && <span>같은 내용 {n(c.copies)}개 · 문서 {n(c.documents ?? 0)}개</span>}
                </span>
                <span className="cl-memory"><code>{c.preview}</code></span>
              </span></div>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function Names({ label, names, total }: { label: string; names: string[]; total: number }) {
  if (!total) return null;
  return <p className="cl-note">{label}: {names.join(", ")}{total > names.length ? ` 외 ${total - names.length}` : ""}</p>;
}

export function QualityTab({ scope }: { scope: LibScope }) {
  const q = useQuery({ queryKey: ["ctxlib", "quality", scope], queryFn: () => libQuality(scope) });
  if (q.isError) return <ErrorState error={q.error} what="품질 진단" onRetry={() => void q.refetch()} />;
  if (!q.data) return <ListSkeleton rows={5} label="품질 지표를 계산하는 중" />;
  const d = q.data;
  const s = d.chunks.stats;
  const rows = (rec: Record<string, number>, label: (k: string) => string, color: (k: string) => string) =>
    Object.entries(rec).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: label(k), value: v, color: color(k) }));
  const body: ReactNode[] = [];
  body.push(
    <Section key="f" id="cl-q-findings" title="점검 요약" hint="지표를 읽는 기준까지 붙였어요. 손볼 만함부터 보여 줘요.">
      <Findings items={d.findings} />
    </Section>,
    <Section key="c" id="cl-q-chunks" title="조각 길이" hint="조각은 검색 결과의 단위예요. 너무 짧으면 맥락이 없고 너무 길면 점수가 흐려져요.">
      {s && (
        <div className="cl-stats cl-stats--sm">
          <Stat label="조각" value={n(d.chunks.total)} />
          <Stat label="중앙값" value={`${n(s.median)}자`} />
          <Stat label="상위 10%" value={`${n(s.p90)}자`} />
          <Stat label="최대" value={`${n(s.max)}자`} />
          <Stat label="짧음" value={n(d.chunks.short)} hint={`<${d.chunks.short_limit}자`} tone={d.chunks.total && d.chunks.short / d.chunks.total >= 0.1 ? "warn" : undefined} />
          <Stat label="긺" value={n(d.chunks.long)} hint={`>${n(d.chunks.long_limit)}자`} tone={d.chunks.total && d.chunks.long / d.chunks.total >= 0.1 ? "warn" : undefined} />
        </div>
      )}
      <Histogram q={d.chunks} />
      <Examples title="가장 짧은 조각" items={d.chunks.short_examples} empty="짧은 조각이 없어요." />
      <Examples title="가장 긴 조각" items={d.chunks.long_examples} empty="긴 조각이 없어요." />
    </Section>,
    <Section key="d" id="cl-q-dup" title="중복 조각" hint="내용이 완전히 같은 조각(md5 기준)이에요. 같은 문장이 결과 자리를 겹쳐 차지해요.">
      <div className="cl-stats cl-stats--sm">
        <Stat label="중복 묶음" value={n(d.duplicates.groups)} />
        <Stat label="겹치는 조각" value={n(d.duplicates.extra_chunks)} hint="묶음마다 하나는 빼고" tone={d.duplicates.extra_chunks ? "warn" : undefined} />
        <Stat label="제목 없는 조각" value={n(d.chunks.no_heading)} />
        <Stat label="문서당 조각" value={d.documents.chunks_per_doc.mean} hint={`최대 ${n(d.documents.chunks_per_doc.max)}`} />
      </div>
      <Examples title="많이 겹치는 조각" items={d.duplicates.examples} empty="중복이 없어요." />
    </Section>,
    <Section key="e" id="cl-q-ent" title="엔터티·관계" hint="온톨로지가 검색에 쓰이는 길은 이름·별칭 일치와 1단계 관계뿐이에요.">
      <div className="cl-stats cl-stats--sm">
        <Stat label="엔터티" value={n(d.entities.total)} />
        <Stat label="별칭 없음" value={n(d.entities.no_alias)} tone={d.entities.no_alias ? "warn" : undefined} />
        <Stat label="관계 없음" value={n(d.entities.isolated)} tone={d.entities.isolated ? "warn" : undefined} />
        <Stat label="근거 없음" value={n(d.entities.no_evidence)} tone={d.entities.no_evidence ? "warn" : undefined} />
        <Stat label="중복 의심" value={n(d.entities.duplicate_pairs.length)} tone={d.entities.duplicate_pairs.length ? "warn" : undefined} />
        <Stat label="관계" value={n(d.relations.total)} />
      </div>
      <Names label="별칭 없음" names={d.entities.no_alias_names} total={d.entities.no_alias} />
      <Names label="관계 없음" names={d.entities.isolated_names} total={d.entities.isolated} />
      <Names label="근거 없음" names={d.entities.no_evidence_names} total={d.entities.no_evidence} />
      {d.entities.duplicate_pairs.map((p) => <p key={`${p.a}-${p.b}`} className="cl-note">중복 의심: {p.a_name} ≈ {p.b_name} ({p.reason})</p>)}
      {d.relations.predicate_variants.map((v) => <p key={v.join("|")} className="cl-note">같은 뜻 다른 표기: {v.join(" / ")}</p>)}
      <p className="cl-sub">엔터티 종류</p>
      <BarList label="엔터티 종류" rows={rows(d.entities.by_type, (k) => TYPE_LABEL[k as EntityType] ?? k, (k) => TYPE_COLOR[k as EntityType] ?? TYPE_COLOR.other)} />
      <p className="cl-sub">관계 술어</p>
      <BarList label="관계 술어" rows={rows(d.relations.predicates, (k) => k, () => "var(--tk-color-chart-axis)")} />
    </Section>,
    <Section key="m" id="cl-q-mem" title="기억" hint="엔터티에 묶이고 근거 경로가 있는 기억만 오래된 결정을 가려낼 수 있어요.">
      <div className="cl-stats cl-stats--sm">
        <Stat label="기억" value={n(d.memories.total)} />
        <Stat label="엔터티 미연결" value={n(d.memories.unlinked)} tone={d.memories.unlinked ? "warn" : undefined} />
        <Stat label="근거 경로 없음" value={n(d.memories.no_source_ref)} tone={d.memories.no_source_ref ? "warn" : undefined} />
        <Stat label="고정(pinned)" value={n(d.memories.pinned)} />
        <Stat label="내용 중복" value={n(d.memories.duplicate)} tone={d.memories.duplicate ? "warn" : undefined} />
        <Stat label="평균 길이" value={`${n(d.memories.length.mean)}자`} hint={`최대 ${n(d.memories.length.max)}`} />
      </div>
      <BarList label="기억 종류" rows={rows(d.memories.by_kind, (k) => KIND_LABEL[k] ?? k, () => "var(--tk-color-chart-categorical-1)")} />
      <BarList label="기억 입력 경로" rows={rows(d.memories.by_source, (k) => MEMORY_SOURCE_LABEL[k] ?? k, () => "var(--tk-color-chart-categorical-2)")} />
    </Section>,
    <Section key="s" id="cl-q-src" title="출처·문서" hint="색인이 끊기거나 갱신이 멈춘 곳을 찾아요.">
      <div className="cl-stats cl-stats--sm">
        <Stat label="출처" value={n(d.sources.total)} />
        <Stat label="오류" value={n(d.sources.errors)} tone={d.sources.errors ? "warn" : undefined} />
        <Stat label="미색인" value={n(d.sources.never_indexed)} tone={d.sources.never_indexed ? "warn" : undefined} />
        <Stat label="48시간 넘게 갱신 없음" value={n(d.sources.stale.length)} tone={d.sources.stale.length ? "warn" : undefined} />
        <Stat label="조각 없는 문서" value={n(d.documents.empty)} tone={d.documents.empty ? "warn" : undefined} />
        <Stat label="조각 수 불일치" value={n(d.documents.count_mismatch)} tone={d.documents.count_mismatch ? "warn" : undefined} />
      </div>
      {d.documents.largest.length > 0 && (
        <details className="cl-details">
          <summary>조각이 가장 많은 문서</summary>
          <BarList label="조각이 많은 문서" rows={d.documents.largest.map((x) => ({ key: x.id, label: x.title.slice(0, 40) || shortPath(x.path), value: x.chunks, color: "var(--tk-color-chart-categorical-1)" }))} />
        </details>
      )}
    </Section>,
  );
  return <div className="cl-stack">{body}</div>;
}
