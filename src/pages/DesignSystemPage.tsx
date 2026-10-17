import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSearchParams } from "react-router";
import { designSystemCatalog, getDesignSystemItem, searchDesignSystem } from "../api/client";
import type { DesignItem, DesignKind, DesignTheme } from "../api/designSystemTypes";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import "./design-system.css";

const KINDS: { id: DesignKind; label: string }[] = [
  { id: "token", label: "토큰" }, { id: "document", label: "사용 지침" },
  { id: "component", label: "컴포넌트 CSS" }, { id: "example", label: "예제 소스" },
];
const message = (e: unknown) => e instanceof Error ? e.message : "불러오지 못했어요.";
const valueText = (v: unknown) => typeof v === "string" ? v : JSON.stringify(v, null, 2) ?? "값 없음";

function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="ds-error"><p className="tk-error" role="alert">{message(error)}</p><Button variant="ghost" onClick={retry}>다시 시도</Button></div>;
}

function Copy({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState("");
  return <span className="ds-copy"><Button variant="ghost" size="sm" onClick={() => {
    if (!navigator.clipboard) { setState("복사할 수 없어요. 텍스트를 선택해 복사해 주세요."); return; }
    void navigator.clipboard.writeText(text).then(() => setState("복사했어요."), () => setState("복사할 수 없어요. 텍스트를 선택해 복사해 주세요."));
  }}>{label}</Button><span className="ds-note" role="status">{state}</span></span>;
}

function ThemeValue({ label, theme, select }: { label: string; theme?: DesignTheme | null; select: (id: string) => void }) {
  const color = theme?.type === "color" && typeof theme.resolved === "string" && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(theme.resolved) ? theme.resolved : null;
  return <section className="ds-theme" aria-label={`${label} 값`}>
    <h3 className="tk-heading-4">{label}</h3>
    {!theme ? <p className="ds-note">이 테마의 정의가 없어요.</p> : <>
      {theme.error ? <p className="tk-error" role="alert">참조 해석 실패: {theme.error}</p> : <div className="ds-value">
        {color && <span className="ds-swatch" style={{ backgroundColor: color }} aria-label={`${label} 색상 ${color}`} role="img" />}
        <pre className="ds-code">{valueText(theme.resolved)}</pre>
      </div>}
      <dl className="ds-properties"><dt>원본 값</dt><dd><code>{valueText(theme.raw)}</code></dd><dt>용도</dt><dd>{theme.description || "설명이 없어요."}</dd>
        <dt>출처</dt><dd><code>{theme.source}</code><br /><code>{theme.pointer}</code></dd></dl>
      {theme.references.length > 0 && <div className="ds-stack"><span className="ds-note">직접 참조</span><div className="ds-references">{theme.references.map((ref) => <Button variant="ghost" size="sm" key={ref} aria-label={`참조 ${ref}`} onClick={() => select("token:" + ref)}>{ref}</Button>)}</div></div>}
    </>}
  </section>;
}

function Source({ item, offset, setOffset, select }: { item: DesignItem; offset: number; setOffset: (n: number) => void; select: (id: string) => void }) {
  const [raw, setRaw] = useState(false);
  function docLink(href: string): string | null {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return null;
    try {
      const base = new URL(item.source, "https://design-source.invalid/");
      const resolved = new URL(href, base);
      const path = decodeURIComponent(resolved.pathname.slice(1));
      return path.startsWith(item.system + "/") ? "file:" + path : null;
    } catch { return null; }
  }
  return <div className="ds-stack">
    <div className="ds-tools">
      <span className="ds-note">{offset.toLocaleString()}–{Math.min(offset + (item.content?.length ?? 0), item.total_chars ?? 0).toLocaleString()} / {item.total_chars?.toLocaleString()}자</span>
      {item.kind === "document" && <Button variant="ghost" size="sm" aria-pressed={raw} onClick={() => setRaw((v) => !v)}>{raw ? "문서로 읽기" : "원문 보기"}</Button>}
      <Copy text={item.content ?? ""} label="현재 구간 복사" />
    </div>
    {item.kind === "document" && !raw ? <div className="tk-prose ds-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      table: ({ children }) => <div className="ds-table-scroll" role="region" aria-label="문서 표" tabIndex={0}><table>{children}</table></div>,
      img: ({ alt }) => <span className="ds-note">[이미지: {alt || "원본 자료"}]</span>,
      a: ({ href, children }) => {
        const id = href ? docLink(href) : null;
        if (id) return <button className="ds-doc-link" type="button" onClick={() => select(id)}>{children}</button>;
        return href && /^https?:\/\//i.test(href) ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
      },
    }}>{item.content ?? ""}</ReactMarkdown></div> : <pre className="ds-code ds-source" tabIndex={0} aria-label="원문 소스">{item.content}</pre>}
    <div className="ds-tools" aria-label="본문 구간 이동">
      <Button variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 6000))}>이전 구간</Button>
      <Button variant="ghost" disabled={item.next_offset == null} onClick={() => { if (item.next_offset != null) setOffset(item.next_offset); }}>다음 구간</Button>
    </div>
  </div>;
}

function Detail({ system, id, revision, select, back }: { system: string; id: string; revision: string; select: (id: string) => void; back: () => void }) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({ queryKey: ["design-system-item", system, id, revision, offset], queryFn: () => getDesignSystemItem(system, id, { revision, offset }) });
  const item = query.data;
  return <section className="ds-detail ds-stack" aria-label="항목 상세">
    <div className="ds-tools"><Button variant="ghost" onClick={back}>목록으로</Button></div>
    {query.isPending && <p role="status" className="ds-note">원본을 읽는 중</p>}
    {query.isError && <Failure error={query.error} retry={() => void query.refetch()} />}
    {item && <>
      <header className="ds-stack"><h2 className="tk-heading-3 ds-break">{item.title}</h2>
        <span className="ds-note">{KINDS.find((k) => k.id === item.kind)?.label}{item.type ? ` · ${item.type}` : ""}</span>
        <code className="ds-path">{item.source}</code>
      </header>
      {item.kind === "token" ? <>
        <div className="ds-stack"><code className="ds-code ds-break">var({item.css_variable})</code><Copy key={item.id} text={`var(${item.css_variable})`} label="CSS 변수 복사" /></div>
        <div className="ds-themes"><ThemeValue label="라이트" theme={item.light} select={select} /><ThemeValue label="다크" theme={item.dark} select={select} /></div>
      </> : <Source item={item} offset={offset} setOffset={setOffset} select={select} />}
    </>}
  </section>;
}

function SearchBox({ initial, submit }: { initial: string; submit: (text: string) => void }) {
  const [text, setText] = useState(initial);
  return <form className="ds-search" role="search" onSubmit={(e) => { e.preventDefault(); submit(text.trim()); }}>
    <input className="tk-input" type="search" aria-label="디자인시스템 검색" placeholder="토큰 이름·값·용도·본문 검색" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
    <Button type="submit">검색</Button>
  </form>;
}

function Entries({ system, kind, text, revision, selected, select }: { system: string; kind: DesignKind; text: string; revision: string; selected: string; select: (id: string) => void }) {
  const query = useInfiniteQuery({
    queryKey: ["design-system-search", system, kind, text, revision],
    queryFn: ({ pageParam }) => searchDesignSystem(system, { kind, q: text, revision, cursor: pageParam }),
    initialPageParam: 0, getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const items = [...new Map((query.data?.pages.flatMap((p) => p.items) ?? []).map((i) => [i.id, i])).values()];
  return <section className="ds-results ds-stack" aria-label="검색 결과">
    {query.isPending && <p role="status" className="ds-note">항목을 찾는 중</p>}
    {query.isError && <Failure error={query.error} retry={() => void query.refetch()} />}
    {query.isSuccess && <p className="ds-note" role="status">{query.data.pages[0].total.toLocaleString()}건 중 {items.length.toLocaleString()}건</p>}
    {query.isSuccess && items.length === 0 && <div className="tk-empty tk-empty--boxed"><p>조건에 맞는 항목이 없어요.</p><p>검색어를 바꾸거나 다른 종류를 골라 보세요.</p></div>}
    {items.length > 0 && <ul className="ds-list">{items.map((entry) => <li key={entry.id}>
      <button type="button" className="ds-row" aria-pressed={selected === entry.id} onClick={() => select(entry.id)}>
        <span className="ds-row__title">{entry.title}</span><span className="ds-row__excerpt">{entry.excerpt}</span>
        <span className="ds-path">{entry.source}</span>
      </button>
    </li>)}</ul>}
    {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>더 보기</Button>}
  </section>;
}

/** 저장소 브라우저 아키타입: 목록 → 읽기 전용 원본 상세. 모바일은 상세만, 넓은 화면은 두 열. */
export function DesignSystemPage() {
  const [params, setParams] = useSearchParams();
  const catalog = useQuery({ queryKey: ["design-system-catalog"], queryFn: designSystemCatalog });
  const data = catalog.data;
  const system = params.get("system") || "ttakkari";
  const kind = KINDS.find((k) => k.id === params.get("kind"))?.id ?? "token";
  const text = params.get("q") || "";
  const selected = params.get("item") || "";
  const revision = params.get("revision") || data?.revision || "";
  const ds = data?.items.find((s) => s.id === system);
  function update(values: Record<string, string | null>) {
    setParams((prev) => { const next = new URLSearchParams(prev); for (const [k, v] of Object.entries(values)) { if (v) next.set(k, v); else next.delete(k); } return next; });
  }
  function select(id: string) { update({ item: id, revision }); }
  return <div className="tk-screen">
    <PageHeader title="디자인시스템" meta="토큰·컴포넌트·사용 지침을 원본과 함께" />
    <div className="tk-screen__body"><div className="tk-container tk-container--lg ds-stack">
      {catalog.isPending && <p className="ds-note" role="status">디자인시스템을 불러오는 중</p>}
      {catalog.isError && <Failure error={catalog.error} retry={() => void catalog.refetch()} />}
      {data && <>
        <div className="ds-heading ds-stack" data-selected={Boolean(selected)}>
          <div className="ds-tools"><label className="ds-select"><span className="ds-note">프로젝트</span>
            <select className="tk-select" aria-label="디자인시스템 선택" value={system} onChange={(e) => update({ system: e.target.value, item: null, q: null })}>
              {data.items.map((s) => <option key={s.id} value={s.id}>{s.name} · v{s.version}</option>)}
            </select>
          </label><Button variant="ghost" busy={catalog.isFetching} onClick={() => { update({ revision: null, item: null }); void catalog.refetch(); }}>최신 커밋 조회</Button></div>
          <p className="ds-note">커밋된 원본 기준 · <code title={revision}>{revision.slice(0, 12)}</code> · 저장소의 미커밋 변경은 제외해요.</p>
          {revision !== data.revision && <p className="ds-note">이전 커밋을 보고 있어요. 프로젝트 선택기의 버전은 최신 목록 기준입니다.</p>}
          <div className="ds-kinds" role="group" aria-label="조회 종류">{KINDS.map((k) => <Button key={k.id} variant="ghost" aria-pressed={kind === k.id} onClick={() => update({ kind: k.id, item: null })}>{`${k.label} ${ds?.counts[k.id] ?? 0}`}</Button>)}</div>
          <SearchBox key={`${system}:${text}`} initial={text} submit={(q) => update({ q, item: null })} />
        </div>
        {data.items.length === 0 ? <p className="ds-note">조회 가능한 디자인시스템이 없어요.</p> : !ds ? <p className="tk-error" role="alert">등록되지 않은 디자인시스템입니다. 프로젝트를 선택해 주세요.</p> : <div className="ds-browser" data-selected={Boolean(selected)}>
          <Entries system={system} kind={kind} text={text} revision={revision} selected={selected} select={select} />
          {selected ? <Detail key={`${system}:${selected}:${revision}`} system={system} id={selected} revision={revision} select={select} back={() => update({ item: null })} /> : <div className="ds-placeholder"><p>항목을 고르면 원본과 상세 정보가 여기에 보여요.</p><p className="ds-note">토큰은 라이트·다크 값과 참조 관계를 함께 확인할 수 있어요.</p></div>}
        </div>}
      </>}
    </div></div>
  </div>;
}
