import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { libEntity, libGraph } from "../../api/client";
import type { EntityType, LibGraph, LibNode, LibScope } from "../../api/client";
import { EmptyState, ErrorState, ListSkeleton } from "../viewer/screenStates";
import { BarList, KIND_LABEL, Legend, ScopeBadge, Section, TYPE_COLOR, TYPE_LABEL, categoryLabel, n, shortPath } from "./shared";

// 그래프 그리기·배치 코드는 이 탭을 열 때만 받는다.
const GraphView = lazy(() => import("./GraphView").then((m) => ({ default: m.GraphView })));

type Flag = keyof LibNode["flags"];
const FLAGS: { key: Flag; label: string; why: string }[] = [
  { key: "isolated", label: "관계 없음", why: "관계가 없으면 1단계 관계 확장이 일어나지 않아요." },
  { key: "no_alias", label: "별칭 없음", why: "검색은 이름·별칭 부분 일치가 전부라 별칭이 동의어 사전이에요." },
  { key: "duplicate_suspect", label: "중복 의심", why: "이름·별칭이 겹쳐 같은 대상을 둘로 나눴을 수 있어요." },
  { key: "no_evidence", label: "근거 없음", why: "연결된 기억도 출처 문서도 없어요." },
  { key: "no_summary", label: "요약 없음", why: "요약은 recall 에서 엔터티를 설명하는 유일한 문장이에요." },
];

function NodeDetail({ node, graph, scope, onSelect }: { node: LibNode; graph: LibGraph; scope: LibScope; onSelect: (id: string) => void }) {
  const q = useQuery({ queryKey: ["ctxlib", "entity", node.id, scope], queryFn: () => libEntity(node.id, scope) });
  const byName = new Map(graph.nodes.map((x) => [x.name, x.id]));
  const flags = FLAGS.filter((f) => node.flags[f.key]);
  return (
    <Section id="cl-on-detail" title={node.name} hint={`${TYPE_LABEL[node.type]} · ${node.aliases.length ? `별칭 ${node.aliases.join(", ")}` : "별칭 없음"}`}>
      <div className="cl-chips">
        <ScopeBadge scope={node.scope} />
        <span className="tk-badge tk-badge--mono">관계 {node.degree}</span>
        <span className="tk-badge tk-badge--mono">기억 {node.memories}</span>
        <span className="tk-badge tk-badge--mono">출처 {node.sources} · 문서 {node.documents} · 조각 {n(node.chunks)}</span>
        {flags.map((f) => <span key={f.key} className="tk-badge tk-badge--warning" title={f.why}>{f.label}</span>)}
      </div>
      {node.summary && <p className="cl-summary">{node.summary}</p>}
      {q.isError && <ErrorState error={q.error} what="연결된 근거" onRetry={() => void q.refetch()} />}
      {!q.data && !q.isError && <ListSkeleton rows={2} label="연결된 근거를 불러오는 중" />}
      {q.data && (
        <>
          <p className="cl-sub">관계</p>
          {q.data.relations.length === 0 ? <p className="cl-note">관계가 없어요.</p> : (
            <ul className="tk-list" aria-label="관계">
              {q.data.relations.map((r, i) => {
                const other = r.subject === node.name ? r.object : r.subject;
                const otherId = other ? byName.get(other) : undefined;
                return (
                  <li key={`${r.subject}-${r.predicate}-${r.object}-${i}`}>
                    <button type="button" className="tk-list__item cl-listbtn" disabled={!otherId} onClick={() => otherId && onSelect(otherId)}>
                      <span className="tk-list__body">
                        <span className="tk-list__title">{r.subject} <span className="cl-pred">{r.predicate}</span> {r.object}</span>
                        {r.note && <span className="tk-list__meta"><span>{r.note}</span></span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="cl-sub">연결된 기억 {q.data.memories.length}</p>
          {q.data.memories.length === 0 ? <p className="cl-note">연결된 기억이 없어요.</p> : (
            <ul className="tk-list" aria-label="연결된 기억">
              {q.data.memories.map((m) => (
                <li key={m.id}><div className="tk-list__item"><span className="tk-list__body">
                  <span className="tk-list__meta"><span>{KIND_LABEL[m.kind] ?? m.kind}</span></span>
                  <span className="cl-memory">{m.content}</span>
                </span></div></li>
              ))}
            </ul>
          )}
          <p className="cl-sub">연결된 출처 {q.data.sources.length}</p>
          {q.data.sources.length === 0 ? <p className="cl-note">이 엔터티에 묶인 문서 출처가 없어요.</p> : (
            <ul className="tk-list" aria-label="연결된 출처">
              {q.data.sources.map((s) => (
                <li key={s.id}><div className="tk-list__item"><span className="tk-list__body">
                  <span className="tk-list__title tk-mono">{shortPath(s.path)}</span>
                  <span className="tk-list__meta"><span>{categoryLabel(s.category)}</span><ScopeBadge scope={s.scope} /><span>문서 {s.documents}</span><span>조각 {n(s.chunks)}</span></span>
                </span></div></li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

function NodeList({ nodes, selectedId, onSelect }: { nodes: LibNode[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="tk-list" aria-label="엔터티 목록">
      {[...nodes].sort((a, b) => b.degree - a.degree || b.memories - a.memories || a.name.localeCompare(b.name, "ko")).map((nd) => (
        <li key={nd.id}>
          <button type="button" className="tk-list__item cl-listbtn" aria-pressed={selectedId === nd.id} onClick={() => onSelect(nd.id)}>
            <span className="tk-list__body">
              <span className="tk-list__title"><span className="cl-swatch" style={{ "--c": TYPE_COLOR[nd.type] } as React.CSSProperties} aria-hidden /> {nd.name}</span>
              <span className="tk-list__meta">
                <span>{TYPE_LABEL[nd.type]}</span><ScopeBadge scope={nd.scope} /><span>관계 {nd.degree}</span><span>기억 {nd.memories}</span><span>문서 {nd.documents}</span>
                {FLAGS.filter((f) => nd.flags[f.key]).map((f) => <span key={f.key} className="cl-flag">{f.label}</span>)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function OntologyTab({ scope }: { scope: LibScope }) {
  const q = useQuery({ queryKey: ["ctxlib", "graph", scope], queryFn: () => libGraph(scope) });
  const [view, setView] = useState<"graph" | "list">(() => (typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches ? "list" : "graph"));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flag, setFlag] = useState<Flag | null>(null);
  const g = q.data;
  const highlight = useMemo(() => (g && flag ? new Set(g.nodes.filter((x) => x.flags[flag]).map((x) => x.id)) : null), [g, flag]);
  if (q.isError) return <ErrorState error={q.error} what="온톨로지" onRetry={() => void q.refetch()} />;
  if (!g) return <ListSkeleton rows={5} label="온톨로지를 불러오는 중" />;
  if (!g.nodes.length) return <EmptyState icon="library" title="엔터티가 없어요">비서 관리에서 엔터티를 만들거나 목록을 등록하면 여기에 나와요.</EmptyState>;
  const selected = g.nodes.find((x) => x.id === selectedId) ?? null;
  const types = [...new Set(g.nodes.map((x) => x.type))];
  const counts = Object.fromEntries(FLAGS.map((f) => [f.key, g.nodes.filter((x) => x.flags[f.key]).length])) as Record<Flag, number>;
  return (
    <div className="cl-stack">
      <Section id="cl-on-signals" title="설계 신호" hint="누르면 해당 엔터티를 그래프와 목록에서 강조해요. 0이면 문제가 없는 거예요.">
        <div className="cl-chips" role="group" aria-label="품질 신호">
          {FLAGS.map((f) => (
            <button key={f.key} type="button" className="cl-signal" aria-pressed={flag === f.key} data-zero={counts[f.key] === 0 ? "" : undefined} title={f.why}
              onClick={() => setFlag(flag === f.key ? null : f.key)}>
              {f.label} <b>{counts[f.key]}</b>
            </button>
          ))}
        </div>
        {flag && <p className="cl-note">{FLAGS.find((f) => f.key === flag)?.why}</p>}
        {g.duplicates.length > 0 && (
          <ul className="tk-list" aria-label="중복 의심 쌍">
            {g.duplicates.map((d) => (
              <li key={`${d.a}-${d.b}`}><div className="tk-list__item"><span className="tk-list__body">
                <span className="tk-list__title">
                  <button type="button" className="cl-link" onClick={() => setSelectedId(d.a)}>{d.a_name}</button> ≈ <button type="button" className="cl-link" onClick={() => setSelectedId(d.b)}>{d.b_name}</button>
                </span>
                <span className="tk-list__meta"><span>{d.reason}</span><span className="tk-mono">{d.score.toFixed(2)}</span></span>
              </span></div></li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="cl-on-graph" title="엔터티와 관계" hint={`엔터티 ${g.nodes.length} · 관계 ${g.edges.length}. 색은 엔터티 종류예요.`}>
        <div className="cl-toolbar">
          <Legend items={types.map((t) => ({ key: t, label: TYPE_LABEL[t as EntityType] ?? t, color: TYPE_COLOR[t as EntityType] ?? TYPE_COLOR.other }))} />
          <div className="tk-segmented" role="radiogroup" aria-label="보기 방식">
            {(["graph", "list"] as const).map((v) => (
              <label key={v}><input type="radio" name="cl-onto-view" checked={view === v} onChange={() => setView(v)} />{v === "graph" ? "그래프" : "목록"}</label>
            ))}
          </div>
        </div>
        {view === "graph" ? (
          <Suspense fallback={<ListSkeleton rows={3} label="그래프를 불러오는 중" />}>
            <GraphView nodes={g.nodes} edges={g.edges} selectedId={selectedId} highlight={highlight} onSelect={setSelectedId} />
          </Suspense>
        ) : <NodeList nodes={g.nodes} selectedId={selectedId} onSelect={setSelectedId} />}
        {g.edges.length === 0 && <p className="cl-note">관계가 하나도 없어서 그래프에 선이 없어요.</p>}
      </Section>

      {selected ? <NodeDetail node={selected} graph={g} scope={scope} onSelect={setSelectedId} /> : <p className="cl-note">엔터티를 누르면 연결된 기억·문서를 볼 수 있어요.</p>}

      <Section id="cl-on-pred" title="관계 타입" hint="같은 뜻의 술어가 여러 표기로 갈라져 있지 않은지 봐요.">
        <BarList label="관계 타입별 개수" rows={Object.entries(g.predicates).map(([k, v]) => ({ key: k, label: k, value: v, color: "var(--tk-color-chart-axis)" }))} />
      </Section>
    </div>
  );
}
