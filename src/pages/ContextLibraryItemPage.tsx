import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { libItem } from "../api/client";
import type { LibItemDetail, LibScope } from "../api/client";
import { LibError, ScopeBadge, categoryLabel, when } from "../features/contextlib/shared";
import { ListSkeleton } from "../features/viewer/screenStates";
import { PageHeader } from "../shell/PageHeader";
import "../features/contextlib/contextlib.css";

const kinds = new Set<LibItemDetail["kind"]>(["memory", "chunk", "entity"]);
const relationText = (r: { subject: string; predicate: string; object: string; note: string | null }) =>
  <>{r.subject} <code className="cl-pred">{r.predicate}</code> {r.object}{r.note && <span className="cl-note"> · {r.note}</span>}</>;

function ItemBody({ item }: { item: LibItemDetail }) {
  if (item.kind === "memory") return (
    <>
      <p className="cl-memory cl-item__content">{item.content}</p>
      <div className="cl-chips"><ScopeBadge scope={item.scope} /><span className="tk-badge">{item.memory_kind}</span>
        {item.pinned && <span className="tk-badge tk-badge--info">고정</span>}{item.source && <span className="tk-badge">입력: {item.source}</span>}</div>
      <MetaRows rows={[["출처 경로", item.source_ref], ["생성", item.created_at && when(item.created_at)], ["수정", item.updated_at && when(item.updated_at)]]} />
      <h2 className="cl-section__title">연결된 항목 · {item.entities?.length ?? 0}</h2>
      {item.entities?.map((entity) => <article className="cl-item__related" key={entity.id}>
        <h3>{entity.name} <span className="tk-badge">{entity.type}</span></h3>
        {entity.category && <p className="cl-note">{categoryLabel(entity.category)}</p>}
        <Relations rows={entity.relations} />
        {entity.sources.map((source) => <p className="cl-item__path tk-mono" key={source.id}>{source.path}</p>)}
      </article>)}
    </>
  );
  if (item.kind === "chunk") return (
    <>
      <div className="cl-chips"><ScopeBadge scope={item.scope} />{item.category && <span className="tk-badge">{categoryLabel(item.category)}</span>}{item.project && <span className="tk-badge">{item.project}</span>}</div>
      <MetaRows rows={[["출처 경로", item.source_path], ["문서", item.path], ["생성", item.created_at && when(item.created_at)], ["수정·색인", item.updated_at && when(item.updated_at)]]} />
      <p className="cl-memory cl-item__content">{item.content}</p>
      {item.entity && <article className="cl-item__related"><h3>{item.entity.name}</h3><Relations rows={item.entity.relations} /></article>}
    </>
  );
  return (
    <>
      <div className="cl-chips"><ScopeBadge scope={item.scope} /><span className="tk-badge">{item.type}</span>{item.aliases?.map((a) => <span className="tk-badge" key={a}>{a}</span>)}</div>
      {item.summary && <p className="cl-summary">{item.summary}</p>}
      <MetaRows rows={[["생성", item.created_at && when(item.created_at)], ["수정", item.updated_at && when(item.updated_at)]]} />
      {item.attributes && Object.keys(item.attributes).length > 0 && <pre className="cl-memory cl-item__content">{JSON.stringify(item.attributes, null, 2)}</pre>}
      <Relations rows={item.relations} />
      {item.memories?.map((memory) => <article className="cl-item__related" key={memory.id}><p className="cl-note">{memory.kind}</p><p className="cl-memory">{memory.content}</p></article>)}
      {item.sources?.map((source) => <article className="cl-item__related" key={source.id}>
        <p className="cl-item__path tk-mono">{source.path}</p><p className="cl-note">{categoryLabel(source.category)} · 문서 {source.documents} · 조각 {source.chunks}</p>
      </article>)}
    </>
  );
}

function MetaRows({ rows }: { rows: [string, string | null | undefined][] }) {
  return <dl className="cl-item__meta">{rows.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function Relations({ rows }: { rows?: { subject: string; predicate: string; object: string; note: string | null }[] }) {
  if (!rows?.length) return <p className="cl-note">연결된 관계가 없어요.</p>;
  return <ul className="cl-item__relations">{rows.map((r, i) => <li key={`${r.subject}-${r.predicate}-${r.object}-${i}`}>{relationText(r)}</li>)}</ul>;
}

export function ContextLibraryItemPage() {
  const { kind: rawKind, id = "" } = useParams();
  const kind = rawKind && kinds.has(rawKind as LibItemDetail["kind"]) ? rawKind as LibItemDetail["kind"] : null;
  const [params] = useSearchParams();
  const scope = (params.get("scope") === "personal" || params.get("scope") === "work" ? params.get("scope") : "all") as LibScope;
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? `/context-library?tab=search&scope=${scope}`;
  const q = useQuery({ queryKey: ["ctxlib", "item", kind, id, scope], queryFn: () => libItem(kind!, id, scope), enabled: Boolean(kind && id) });
  const item = q.data;
  if (!kind) return <div className="tk-screen"><PageHeader title="항목을 찾을 수 없어요" actions={<Link className="tk-button" to={from}>뒤로</Link>} /></div>;
  return (
    <div className="tk-screen">
      <PageHeader title={item?.name ?? item?.title ?? item?.heading ?? (item?.kind === "memory" ? "상세 기억" : "맥락 항목")}
        actions={<Link className="tk-button" to={from}>검색 결과로 돌아가기</Link>} />
      <div className="tk-screen__body"><div className="tk-container tk-container--lg"><main className="cl-page cl-item">
        {q.isError && <LibError error={q.error} what="항목 상세" onRetry={() => void q.refetch()} />}
        {!item && !q.isError && <ListSkeleton rows={4} label="항목 상세를 불러오는 중" />}
        {item && <ItemBody item={item} />}
      </main></div></div>
    </div>
  );
}
