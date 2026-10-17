import { Fragment, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { libDocumentChunks, libSourceDocuments, libTree } from "../../api/client";
import type { LibScope, LibTreeCategory, LibTreeGroup, LibTreeSource } from "../../api/client";
import { Icon } from "../../ui/Icon";
import { useMediaQuery } from "../../shell/useMediaQuery";
import { EmptyState, ListSkeleton } from "../viewer/screenStates";
import { inset, squarify, withFloor } from "./treemap";
import type { Placed } from "./treemap";
import { CATEGORY_COLOR, Legend, LibError, ScopeBadge, Section, ago, categoryLabel, fileName, n, shortPath, useWidth, when } from "./shared";

type View = "treemap" | "list";
const gkey = (c: string, g: LibTreeGroup) => `${c}:${g.entity_id ?? "none"}`;
const HEADER = 22;

function Treemap({ cats, selected, onSelect }: { cats: LibTreeCategory[]; selected: string | null; onSelect: (c: string, g: LibTreeGroup) => void }) {
  const [ref, width] = useWidth();
  const height = width < 520 ? Math.round(width * 1.25) : Math.min(520, Math.round(width * 0.58));
  const tiles = useMemo(() => {
    const top = withFloor(cats.map((c) => ({ value: c.chunks, data: c })), 0.04);
    const outer = squarify(top.items, { x: 0, y: 0, w: width, h: height });
    let inflated = top.inflated;
    const placed = outer.map((o) => {
      const body = inset({ x: o.x, y: o.y + HEADER, w: o.w, h: o.h - HEADER }, 2);
      const inner = withFloor(o.data.groups.map((g) => ({ value: g.chunks, data: g })), 0.03);
      inflated ||= inner.inflated;
      return { outer: o, groups: squarify(inner.items, body) as Placed<LibTreeGroup>[] };
    });
    return { placed, inflated };
  }, [cats, width, height]);
  return (
    <>
      <div ref={ref} className="cl-treemap" style={{ height }} role="group" aria-label="구조 트리맵: 면적은 조각 수">
        {tiles.placed.map(({ outer, groups }) => {
          const c = outer.data;
          const color = (CATEGORY_COLOR[c.category] ?? CATEGORY_COLOR.health) as string;
          return (
            <Fragment key={c.category}>
              <div className="cl-treemap__cat" style={{ left: outer.x, top: outer.y, width: outer.w, height: outer.h, "--c": color } as CSSProperties}>
                <span className="cl-treemap__cat-label">{categoryLabel(c.category)} · {n(c.chunks)}</span>
              </div>
              {groups.map((g) => {
                const roomy = g.w > 84 && g.h > 38;
                const key = gkey(c.category, g.data);
                return (
                  <button key={key} type="button" className="cl-tile" aria-pressed={selected === key}
                    title={`${g.data.name} · 출처 ${g.data.sources.length} · 문서 ${g.data.documents} · 조각 ${g.data.chunks}`}
                    aria-label={`${categoryLabel(c.category)} ${g.data.name}, 조각 ${g.data.chunks}`}
                    style={{ left: g.x, top: g.y, width: g.w, height: g.h, "--c": color } as CSSProperties} onClick={() => onSelect(c.category, g.data)}>
                    {roomy && <span className="cl-tile__name">{g.data.name}</span>}
                    {roomy && g.h > 56 && <span className="cl-tile__num">{n(g.data.chunks)}</span>}
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </div>
      {tiles.inflated && <p className="cl-note">아주 작은 항목은 누를 수 있게 면적을 조금 키워 그렸어요. 정확한 수는 목록에서 봐요.</p>}
    </>
  );
}

function GroupList({ cats, selected, onSelect }: { cats: LibTreeCategory[]; selected: string | null; onSelect: (c: string, g: LibTreeGroup) => void }) {
  return (
    <div className="cl-grouplist">
      {cats.map((c) => {
        const max = Math.max(1, ...c.groups.map((g) => g.chunks));
        return (
          <div key={c.category} role="group" aria-label={categoryLabel(c.category)}>
            <p className="cl-grouphead"><span className="cl-swatch" style={{ "--c": CATEGORY_COLOR[c.category] } as CSSProperties} aria-hidden /> {categoryLabel(c.category)} · 출처 {n(c.sources)} · 문서 {n(c.documents)} · 조각 {n(c.chunks)}</p>
            <ul className="cl-bars">
              {c.groups.map((g) => {
                const key = gkey(c.category, g);
                return (
                  <li key={key} className="cl-bars__row">
                    <button type="button" className="cl-rowbtn" aria-pressed={selected === key} onClick={() => onSelect(c.category, g)}>
                      <span className="cl-bars__label">{g.name}</span>
                      <span className="cl-bars__track" aria-hidden>
                        <span className="cl-bars__fill" style={{ "--c": CATEGORY_COLOR[c.category], width: `${Math.max(2, (g.chunks / max) * 100)}%` } as CSSProperties} />
                      </span>
                      <span className="cl-bars__value">{n(g.chunks)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function DocumentPreview({ docId, scope }: { docId: string; scope: LibScope }) {
  const q = useQuery({ queryKey: ["ctxlib", "chunks", docId, scope], queryFn: () => libDocumentChunks(docId, scope) });
  if (q.isError) return <LibError error={q.error} what="조각" onRetry={() => void q.refetch()} />;
  if (!q.data) return <ListSkeleton rows={2} label="조각을 불러오는 중" />;
  return (
    <div className="cl-chunks" aria-label="조각 미리보기">
      <p className="cl-note">{q.data.title} · 조각 {q.data.total}개 중 {q.data.chunks.length}개 미리보기</p>
      {q.data.chunks.map((c) => (
        <article key={c.id} className="cl-chunk" data-flag={c.length < 80 ? "short" : undefined}>
          <header className="cl-chunk__head">
            <span className="tk-mono">#{c.ord}</span>
            <span className="cl-chunk__heading">{c.heading ?? "제목 없음"}</span>
            <span className="tk-mono">{n(c.length)}자</span>
          </header>
          <pre className="cl-chunk__body">{c.content}</pre>
        </article>
      ))}
    </div>
  );
}

function SourceDocs({ source, scope }: { source: LibTreeSource; scope: LibScope }) {
  const [doc, setDoc] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["ctxlib", "docs", source.id, scope], queryFn: () => libSourceDocuments(source.id, scope) });
  if (q.isError) return <LibError error={q.error} what="문서 목록" onRetry={() => void q.refetch()} />;
  if (!q.data) return <ListSkeleton rows={3} label="문서를 불러오는 중" />;
  return (
    <div className="cl-docs">
      <p className="cl-note">문서 {n(q.data.total)}개{q.data.total > q.data.documents.length ? ` 중 조각 많은 ${q.data.documents.length}개` : ""}</p>
      <ul className="tk-list" aria-label="문서 목록">
        {q.data.documents.map((d) => (
          <li key={d.id}>
            <button type="button" className="tk-list__item cl-listbtn" aria-expanded={doc === d.id} onClick={() => setDoc(doc === d.id ? null : d.id)}>
              <span className="tk-list__body">
                <span className="tk-list__title">{d.title}</span>
                <span className="tk-list__meta"><span className="tk-mono">{fileName(d.path)}</span><span>조각 {d.chunks}</span><span>{when(d.indexed_at)}</span></span>
              </span>
              <span className="tk-list__end"><Icon name={doc === d.id ? "chevron-up" : "chevron-down"} /></span>
            </button>
            {doc === d.id && <DocumentPreview docId={d.id} scope={scope} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupDetail({ group, category, scope }: { group: LibTreeGroup; category: string; scope: LibScope }) {
  const [source, setSource] = useState<string | null>(null);
  return (
    <Section id="cl-st-detail" title={`${group.name}`} hint={`${categoryLabel(category)} · 출처 ${group.sources.length} · 문서 ${n(group.documents)} · 조각 ${n(group.chunks)}`}>
      <ul className="tk-list" aria-label="출처 목록">
        {group.sources.map((s) => (
          <li key={s.id}>
            <button type="button" className="tk-list__item cl-listbtn" aria-expanded={source === s.id} onClick={() => setSource(source === s.id ? null : s.id)}>
              <span className="tk-list__body">
                <span className="tk-list__title tk-mono">{shortPath(s.path)}</span>
                <span className="tk-list__meta">
                  <ScopeBadge scope={s.scope} />
                  <span>문서 {s.documents}</span><span>조각 {n(s.chunks)}</span>
                  <span>{ago(s.last_indexed_at)}</span>
                  {!s.enabled && <span>꺼짐</span>}
                </span>
                {s.last_error && <span className="tk-error">{s.last_error}</span>}
              </span>
              <span className="tk-list__end"><Icon name={source === s.id ? "chevron-up" : "chevron-down"} /></span>
            </button>
            {source === s.id && <SourceDocs source={s} scope={scope} />}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function StructureTab({ scope }: { scope: LibScope }) {
  const q = useQuery({ queryKey: ["ctxlib", "tree", scope], queryFn: () => libTree(scope) });
  const compact = useMediaQuery("(max-width: 640px)");
  const [view, setView] = useState<View>("treemap");
  const [sel, setSel] = useState<{ category: string; group: LibTreeGroup } | null>(null);
  if (q.isError) return <LibError error={q.error} what="구조" onRetry={() => void q.refetch()} />;
  if (!q.data) return <ListSkeleton rows={5} label="구조를 불러오는 중" />;
  const cats = q.data.categories;
  if (!cats.length) return <EmptyState icon="folder-search" art="empty-harness-visualization" title="등록된 출처가 없어요">비서 관리의 지식 탭에서 출처를 추가하면 여기에 나와요.</EmptyState>;
  // 범위를 바꿔 선택한 모음이 사라졌으면 선택을 풀어 오래된 데이터를 보여 주지 않는다.
  const current = sel && cats.find((c) => c.category === sel.category)?.groups.find((g) => gkey(sel.category, g) === gkey(sel.category, sel.group));
  const pick = (category: string, group: LibTreeGroup) => setSel({ category, group });
  const selKey = sel && current ? gkey(sel.category, current) : null;
  return (
    <div className="cl-stack">
      <Section id="cl-st-map" title="구조" hint={compact ? "종류별 프로젝트·모음 목록이에요. 누르면 출처·문서·조각을 볼 수 있어요." : "종류 → 프로젝트·모음 → 출처 → 문서 순서예요. 면적은 조각 수, 색은 종류예요. 눌러서 안을 봐요."}>
        <div className="cl-toolbar">
          <Legend items={cats.map((c) => ({ key: c.category, label: categoryLabel(c.category), color: CATEGORY_COLOR[c.category] ?? CATEGORY_COLOR.health }))} />
          {!compact && <div className="tk-segmented" role="radiogroup" aria-label="보기 방식">
            {(["treemap", "list"] as const).map((v) => (
              <label key={v}><input type="radio" name="cl-structure-view" checked={view === v} onChange={() => setView(v)} />{v === "treemap" ? "트리맵" : "목록"}</label>
            ))}
          </div>}
        </div>
        {!compact && view === "treemap" ? <Treemap cats={cats} selected={selKey} onSelect={pick} /> : <GroupList cats={cats} selected={selKey} onSelect={pick} />}
        <p className="cl-note">건강 종류는 아직 데이터가 없어서 나오지 않아요(ADR 0009).</p>
      </Section>
      {sel && current ? <GroupDetail key={selKey} group={current} category={sel.category} scope={scope} /> : <p className="cl-note">위에서 프로젝트나 모음을 누르면 출처·문서·조각을 볼 수 있어요.</p>}
    </div>
  );
}
