import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router";
import { libSearchLab } from "../../api/client";
import type { LibScope, LibSearchHit, LibSearchLab } from "../../api/client";
import { Icon } from "../../ui/Icon";
import { ScopeBadge, Section, categoryLabel, fileName, libErrorMessage, scopeLabel, when } from "./shared";

const TYPE_LABEL: Record<LibSearchHit["type"], string> = { chunk: "문서 조각", memory: "기억", entity: "엔터티" };
const VIA_LABEL: Record<LibSearchHit["via"], string> = { keyword: "키워드 일치", entity: "엔터티 연결로 포함", fuzzy: "유사도(부분 일치)" };
const VIA_HELP: Record<LibSearchHit["via"], string> = {
  keyword: "질의 단어가 실제로 들어 있어요.",
  entity: "질의에 든 엔터티 이름·별칭과 연결돼 가산점으로 올라왔어요. 본문에는 단어가 없을 수 있어요.",
  fuzzy: "단어는 없지만 철자가 비슷해(trigram) 후보가 됐어요. 우연일 수 있어요.",
};
const SAMPLES = ["디자인 시스템 토큰", "따까리 구조", "회사 work-history", "홈서버 백업"];

/** 본문에서 질의 단어를 <mark> 로 감싼다. 정규식 특수문자는 이스케이프한다. */
export function markTerms(text: string, terms: string[]): (string | { mark: string })[] {
  const list = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!list.length) return [text];
  const re = new RegExp(`(${list.join("|")})`, "gi");
  // 캡처 그룹이 있는 split 은 일치 조각이 홀수 칸에 온다.
  return text.split(re).map((part, i) => (i % 2 === 1 ? { mark: part } : part)).filter((p) => typeof p !== "string" || p !== "");
}

function Marked({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {markTerms(text, terms).map((p, i) => (typeof p === "string" ? <Fragment key={i}>{p}</Fragment> : <mark key={i} className="cl-mark">{p.mark}</mark>))}
    </>
  );
}

function Hit({ hit, terms, top, search, from }: { hit: LibSearchHit; terms: string[]; top: number; search: string; from: string }) {
  const where = hit.type === "chunk"
    ? [hit.project, hit.category && categoryLabel(hit.category), hit.path && fileName(hit.path)]
    : hit.type === "memory" ? [hit.kind, hit.entities?.join(", "), hit.source_ref ? "근거 있음" : "근거 경로 없음"] : [hit.entity_type, hit.name];
  return (
    <li className="cl-hit" data-via={hit.via}>
      <Link className="cl-hit__open" to={`/context-library/items/${hit.type}/${hit.id}${search}`} state={{ from }} aria-label={`${hit.text} 상세 보기`}>
      <div className="cl-hit__head">
        <span className="cl-hit__rank tk-mono">{hit.rank}</span>
        <span className="tk-badge">{TYPE_LABEL[hit.type]}</span>
        {hit.scope && <ScopeBadge scope={hit.scope} />}
        <span className="cl-hit__score" title="점수는 정확도 확률이 아니에요. 같은 질의 안에서 순서를 정하는 값이에요.">
          <span className="cl-hit__bar" aria-hidden><span style={{ width: `${top > 0 ? Math.max(4, (hit.score / top) * 100) : 4}%` }} /></span>
          <span className="tk-mono">{hit.score.toFixed(3)}</span>
        </span>
      </div>
      <p className="cl-hit__where">{where.filter(Boolean).join(" · ")}{hit.heading ? ` › ${hit.heading}` : ""}</p>
      <p className="cl-hit__text"><Marked text={hit.text} terms={terms} /></p>
      <p className="cl-hit__why">
        <span className="cl-via" data-via={hit.via} title={VIA_HELP[hit.via]}>{VIA_LABEL[hit.via]}</span>
        {terms.length > 0 && <span>단어 {hit.matched_terms.length}/{terms.length}{hit.matched_terms.length ? ` (${hit.matched_terms.join(", ")})` : ""}</span>}
        {hit.match_in.length > 0 && <span>걸린 곳: {hit.match_in.join("·")}</span>}
        {(hit.indexed_at ?? hit.updated_at) && <span>{when(hit.indexed_at ?? hit.updated_at)}</span>}
      </p>
      {hit.path && <p className="cl-hit__path tk-mono">{hit.path.replace(/^\/Users\/[^/]+/, "~")}</p>}
      <span className="cl-hit__openhint">전체 내용과 연결 정보 보기 →</span>
      </Link>
    </li>
  );
}

export function diagnose(r: LibSearchLab): string[] {
  const notes: string[] = [];
  if (!r.terms.length) notes.push("질의에서 검색에 쓸 단어가 남지 않았어요(한 글자·불용어만 있음).");
  if (r.results.length === 0) notes.push("걸리는 게 없어요. 별칭이나 다른 키워드로 다시 찾아 보세요. 의미 검색은 하지 않아요.");
  const top = r.results.slice(0, 3).map((h) => h.score);
  if (top.length === 3 && top[0] === top[2]) notes.push("상위 3개의 점수가 같아요. 순서가 사실상 임의라서, 이 질의는 점수로 변별이 안 되는 상태예요.");
  const chunkShare = r.results.filter((h) => h.type === "chunk").length;
  if (r.results.length >= 5 && chunkShare === r.results.length) notes.push("결과가 전부 문서 조각이에요. 기억·엔터티는 점수 경쟁에서 밀렸을 수 있어요.");
  const weak = r.results.filter((h) => h.via !== "keyword").length;
  if (weak) notes.push(`키워드가 아닌 경로로 올라온 결과가 ${weak}개예요(엔터티 연결·유사도).`);
  return notes;
}

export function SearchLabTab({ scope }: { scope: LibScope }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const activeQuery = params.get("q") ?? "";
  const rawPage = Number(params.get("page") || 1);
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const [draft, setDraft] = useState({ forQuery: activeQuery, value: activeQuery });
  const query = draft.forQuery === activeQuery ? draft.value : activeQuery;
  const setQuery = (value: string) => setDraft({ forQuery: activeQuery, value });
  const run = (q: string) => {
    if (!q.trim()) return;
    const next = new URLSearchParams(params);
    next.set("tab", "search");
    next.set("q", q.trim());
    next.delete("page");
    setParams(next, { replace: false });
    setQuery(q.trim());
  };
  const m = useQuery({
    queryKey: ["ctxlib", "search-lab", activeQuery, scope, page],
    queryFn: () => libSearchLab(activeQuery, scope, 10, (page - 1) * 10),
    enabled: Boolean(activeQuery.trim()),
  });
  const r = m.data && m.data.scope === scope ? m.data : null;
  const top = r?.results[0]?.score ?? 0;
  const totalPages = r ? Math.max(1, Math.ceil(r.total / 10)) : 1;
  const from = location.pathname + location.search;
  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p <= 1) next.delete("page"); else next.set("page", String(p));
    setParams(next, { replace: false });
  };
  return (
    <div className="cl-stack">
      <Section id="cl-se-form" title="검색 실험실" hint={`따까리가 recall 할 때와 같은 검색을 ${scopeLabel(scope)} 범위로 돌려요. 임베딩 없이 키워드·부분 일치만 쓰므로, 걸린 단어를 같이 보여 줘요.`}>
        <form className="cl-searchform" onSubmit={(e) => { e.preventDefault(); run(query); }}>
          <input className="tk-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="예) 따까리 디자인 시스템" aria-label="질의" />
          <button className="tk-button tk-button--primary" type="submit" aria-busy={m.isFetching || undefined}><Icon name="search" />찾기</button>
        </form>
        <div className="cl-chips" aria-label="예시 질의">
          {SAMPLES.map((s) => (
            <button key={s} type="button" className="cl-signal" onClick={() => { setQuery(s); run(s); }}>{s}</button>
          ))}
        </div>
        {m.isError && <p className="tk-error" role="alert">{libErrorMessage(m.error)}</p>}
      </Section>
      {r && (
        <Section id="cl-se-result" title={`검색 결과 ${r.total.toLocaleString("ko-KR")}개`} hint={`${r.elapsed_ms}ms · 문서당 최대 2조각 · 페이지 ${page}/${totalPages}`}>
          <div className="cl-chips" aria-label="질의 분석">
            <span className="cl-note">검색 단어</span>
            {r.terms.length ? r.terms.map((t) => <span key={t} className="tk-badge tk-badge--mono">{t}</span>) : <span className="cl-note">없음</span>}
            {r.anchors.length > 0 && (<><span className="cl-note">인식한 엔터티</span>{r.anchors.map((a) => <span key={a} className="tk-badge tk-badge--info">{a}</span>)}</>)}
          </div>
          {diagnose(r).length > 0 && (
            <ul className="cl-diag" aria-label="진단">{diagnose(r).map((d) => <li key={d}><Icon name="info" />{d}</li>)}</ul>
          )}
          <ol className="cl-hits" aria-label="검색 결과">
            {r.results.map((h) => <Hit key={`${h.type}-${h.id}`} hit={h} terms={r.terms} top={top} search={`${location.search}`} from={from} />)}
          </ol>
          {r.total > 10 && <nav className="cl-pagination" aria-label="검색 결과 페이지">
            <button className="tk-button" type="button" disabled={page <= 1 || m.isFetching} onClick={() => setPage(page - 1)}>이전</button>
            <span className="cl-note">{page} / {totalPages} · {r.total.toLocaleString("ko-KR")}개</span>
            <button className="tk-button" type="button" disabled={page >= totalPages || m.isFetching} onClick={() => setPage(page + 1)}>다음</button>
          </nav>}
          <p className="cl-note">점수는 단어 포함 비율, 전문검색 순위, 철자 유사도, 제목 일치, 엔터티 연결 가산점을 더한 값이에요. 확률이 아니에요.</p>
        </Section>
      )}
    </div>
  );
}
