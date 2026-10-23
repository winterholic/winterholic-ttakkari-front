import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getHarnessItem } from "../../api/client";
import type { HarnessCounterparts, HarnessDetail, HarnessSession } from "../../api/harnessTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Hl, failure } from "./Finder";
import { ENGINE_LABEL, SCOPE_LABEL, SESSION_LABEL, SOURCE_LABEL, activeLabel, formatAge, formatSize, formatTime } from "./labels";
import { concernTarget, contextOf, crumbTarget, type Update } from "./nav";

function Copy({ text, label }: { text: string; label: string }) {
  const [note, setNote] = useState("");
  return <span className="hv-copy">
    <Button variant="ghost" size="sm" onClick={() => {
      if (!navigator.clipboard) { setNote("복사할 수 없어요. 글자를 눌러 선택해 주세요."); return; }
      void navigator.clipboard.writeText(text).then(() => setNote("복사했어요."), () => setNote("복사할 수 없어요. 글자를 눌러 선택해 주세요."));
    }}><Icon name="copy" />{label}</Button>
    <span className="hv-note" role="status">{note}</span>
  </span>;
}

function Body({ item, offset, setOffset, query }: { item: HarnessDetail; offset: number; setOffset: (n: number) => void; query: string }) {
  const [raw, setRaw] = useState(item.kind !== "markdown");
  const [expanded, setExpanded] = useState(false);
  const long = item.body.length > 1800 || item.body.split("\n").length > 40;
  const paged = offset > 0 || item.next_offset != null;
  if (!item.body) return <p className="hv-note">{item.present ? "본문이 비어 있어요." : "파일이 없어 읽을 본문이 없어요."}</p>;
  return <section className="hv-body" aria-label="본문">
    <div className="hv-tools">
      <span className="hv-note">{paged ? `${offset.toLocaleString()}–${(offset + item.body.length).toLocaleString()} / ${item.chars.toLocaleString()}자` : formatSize(item.chars, item.lines)}</span>
      {item.kind === "markdown" && <Button variant="ghost" size="sm" aria-pressed={raw} onClick={() => setRaw((v) => !v)}>{raw ? "문서로 읽기" : "원문 보기"}</Button>}
      <Copy text={item.body} label="이 구간 복사" />
    </div>
    <div className="hv-body__box" data-collapsed={long && !expanded || undefined}>
      {item.kind === "markdown" && !raw
        ? <div className="tk-prose hv-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
          table: ({ children }) => <div className="hv-table-scroll" role="region" aria-label="문서 표" tabIndex={0}><table>{children}</table></div>,
          img: ({ alt }) => <span className="hv-note">[이미지: {alt || "원본 자료"}]</span>,
          a: ({ href, children }) => (href && /^https?:\/\//i.test(href) ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>),
        }}>{item.body}</ReactMarkdown></div>
        : <pre className="hv-code" tabIndex={0} aria-label="원문">{query && item.kind !== "json" ? <Hl text={item.body} query={query} /> : item.body}</pre>}
    </div>
    {long && <Button variant="ghost" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>{expanded ? "접기" : "전체 펼치기"}</Button>}
    {paged && <div className="hv-tools" aria-label="본문 구간 이동">
      <Button variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 8000))}>이전 구간</Button>
      <Button variant="ghost" disabled={item.next_offset == null} onClick={() => { if (item.next_offset != null) setOffset(item.next_offset); }}>다음 구간</Button>
    </div>}
  </section>;
}

function Callout({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220;
  return <blockquote className="hv-callout" aria-label="설명">
    <span className="hv-callout__label">{label}</span>
    <span className="hv-callout__text" data-clamped={long && !open || undefined}>{text}</span>
    {long && <button type="button" className="hv-callout__more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "접기" : "전체 보기"}</button>}
  </blockquote>;
}

function Breadcrumb({ item, update }: { item: HarnessDetail; update: Update }) {
  return <nav className="hv-crumbs" aria-label="경로">
    <ol>
      {item.crumb.map((c) => <li key={c.kind + "-" + c.id}><button type="button" onClick={() => update(crumbTarget(c, item))}>{c.label}</button></li>)}
      <li aria-current="page"><span className="hv-crumbs__here">{item.name}</span></li>
    </ol>
  </nav>;
}

function Counterparts({ data, item, update }: { data: HarnessCounterparts; item: HarnessDetail; update: Update }) {
  if (data.items.length === 0 && data.concerns.length === 0) return null;
  return <section className="hv-counter" aria-label="같은 레이어의 다른 엔진">
    <h3 className="tk-heading-4">같은 레이어의 다른 엔진</h3>
    <p className="hv-note">{item.layer_label} 레이어에서 이 항목과 같은 역할을 하는 다른 엔진의 항목이에요.</p>
    <ul className="hv-counter__list">
      {data.items.map((c) => <li key={c.id}>
        <button type="button" className="hv-chip" data-muted={!c.present || undefined}
          onClick={() => update(contextOf({ id: c.id, hgroup: c.hgroup, concern: item.concern, project: item.project }))}>
          {c.label} · {c.name}<span>{c.present ? "열기" : "없음"}</span></button>
      </li>)}
      {data.concerns.map((c) => <li key={c.hgroup + "-" + c.engine}>
        <button type="button" className="hv-chip" onClick={() => update(concernTarget({ hgroup: c.hgroup, concern: c.concern, project: c.project }))}>
          {c.label} 의 같은 관심사<span>{c.total}개</span></button>
      </li>)}
    </ul>
  </section>;
}

function Facts({ item, openSession }: { item: HarnessDetail; openSession: (s: HarnessSession) => void }) {
  const state = activeLabel(item);
  return <dl className="hv-facts">
    <dt>{item.source === "file" ? "파일 경로" : "출처 위치"}</dt><dd><code className="hv-path hv-path--full">{item.path ?? "-"}</code>{item.path && <Copy text={item.path} label="경로 복사" />}</dd>
    {item.real_path && <><dt>실제 파일</dt><dd><code className="hv-path hv-path--full">{item.real_path}</code><span className="hv-note">심볼릭 링크를 따라간 위치예요.</span></dd></>}
    <dt>출처</dt><dd>{SOURCE_LABEL[item.source]}</dd>
    <dt>엔진</dt><dd>{ENGINE_LABEL[item.engine]}</dd>
    <dt>적용 범위</dt><dd>{SCOPE_LABEL[item.scope]}{item.group ? ` · ${item.group}` : ""}{item.pool === "company" ? " · 회사" : ""}</dd>
    <dt>레이어</dt><dd>{item.layer_label}</dd>
    <dt>상태</dt><dd><Badge tone={state.tone}>{state.text}</Badge>{item.active_note && <span className="hv-note"> {item.active_note}</span>}</dd>
    <dt>수정 시각</dt><dd>{item.mtime == null ? "해당 없음(코드·DB·생성 값)" : `${formatTime(item.mtime)} · ${formatAge(item.mtime)}`}</dd>
    <dt>크기</dt><dd>{formatSize(item.chars, item.lines)}</dd>
    <dt>실리는 세션</dt><dd>{item.sessions.length === 0 ? <span className="hv-note">세션 프롬프트에 직접 합쳐지지 않아요.</span>
      : <span className="hv-chips">{item.sessions.map((s) => <button key={s} type="button" className="hv-chip hv-chip--small" onClick={() => openSession(s)}>{SESSION_LABEL[s]}</button>)}</span>}</dd>
  </dl>;
}

export function Detail({ id, query, back, openSession, update }: {
  id: string; query: string; back: () => void; openSession: (s: HarnessSession) => void; update: Update;
}) {
  const [offset, setOffset] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const result = useQuery({ queryKey: ["harness-item", id, offset], queryFn: () => getHarnessItem(id, offset) });
  const item = result.data;
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, [id, result.isSuccess]);
  return <section className="hv-detail" aria-label="항목 상세">
    <div className="hv-tools"><Button variant="ghost" onClick={back}><Icon name="back" />목록으로</Button></div>
    {item && item.crumb.length > 0 && <Breadcrumb item={item} update={update} />}
    {result.isPending && <p role="status" className="hv-note">내용을 읽는 중</p>}
    {result.isError && <div className="hv-error"><p className="tk-error" role="alert">{failure(result.error)}</p><Button variant="ghost" onClick={() => void result.refetch()}>다시 시도</Button></div>}
    {item && <>
      <header className="hv-detail__head">
        <h2 ref={heading} tabIndex={-1} className="tk-heading-3 hv-break">{item.name}</h2>
        <span className="hv-badges"><Badge tone="info">{ENGINE_LABEL[item.engine]}</Badge><Badge>{SCOPE_LABEL[item.scope]}</Badge><Badge tone={activeLabel(item).tone}>{activeLabel(item).text}</Badge></span>
      </header>
      {(item.frontmatter?.description || item.description) && <Callout label={item.frontmatter?.description ? "frontmatter description" : "설명"} text={item.frontmatter?.description || item.description} />}
      {item.warnings.length > 0 && <ul className="hv-alerts" aria-label="경고">{item.warnings.map((w) => <li key={w}><Icon name="warning" /><span>{w}</span></li>)}</ul>}
      {item.masked > 0 && <p className="hv-masked" role="note"><Icon name="lock" />비밀로 보이는 값 {item.masked}곳을 가렸어요. 값은 서버에서 지워진 뒤 전달돼요.</p>}
      <Facts item={item} openSession={openSession} />
      <Counterparts data={item.counterparts} item={item} update={update} />
      {item.frontmatter && Object.keys(item.frontmatter).length > 0 && <details className="hv-disclosure">
        <summary>frontmatter · {Object.keys(item.frontmatter).length}개 항목</summary>
        <dl className="hv-facts">{Object.entries(item.frontmatter).map(([k, v]) => <div key={k} className="hv-facts__row"><dt>{k}</dt><dd className="hv-break">{v}</dd></div>)}</dl>
      </details>}
      <Body key={`${item.id}:${offset}`} item={item} offset={offset} setOffset={setOffset} query={query} />
    </>}
  </section>;
}
