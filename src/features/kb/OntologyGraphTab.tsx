import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isKbUnsupported, kbGraph } from "../../api/kb";
import type { KbGraph } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { EntityDetail } from "./EntityDetail";
import { mergeGraph, neighborsOf, seedStore } from "./graphStore";
import type { GraphStore } from "./graphStore";
import type { KbFilters } from "./kbState";
import { failure } from "./labels";
import { kindColor, kindLabel } from "./labelsV3";
import { OntologyGraph } from "./OntologyGraph";

/** 좁은 화면(768 미만)에서는 캔버스 대신 카드 목록으로 바꾼다. matchMedia 가 없는 환경은 넓은 화면으로 본다. */
function useNarrow(): boolean {
  const query = "(max-width: 767px)";
  return useSyncExternalStore(
    (cb) => { const m = typeof window.matchMedia === "function" ? window.matchMedia(query) : null; m?.addEventListener("change", cb); return () => m?.removeEventListener("change", cb); },
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false),
    () => false,
  );
}

const HUB_LIMIT = 30;

function ConceptCards({ store, selectedId, onSelect }: { store: GraphStore; selectedId: string | null; onSelect: (id: string) => void }) {
  const sorted = [...store.nodes.values()].sort((a, b) => b.document_count - a.document_count || a.name.localeCompare(b.name, "ko"));
  const near = selectedId ? neighborsOf(store, selectedId) : null;
  const group = (title: string, items: { predicate: string; node: { id: string; name: string; entity_kind: string } }[]) => items.length > 0 && <div className="kb3-tree__group">
    <p className="kb-note">{title}</p>
    <ul className="kb3-relations" aria-label={title}>{items.map((x) => <li key={`${x.predicate}-${x.node.id}`}>
      <span className="kb3-chip__pred">{x.predicate}</span>
      <button type="button" className="kb-chip" onClick={() => onSelect(x.node.id)}>{x.node.name}</button></li>)}</ul>
  </div>;
  return <div className="kb3-cards">
    {selectedId && near && <section className="kb3-tree" aria-label="선택한 개념의 이웃">
      <h3 className="kb3-sub">{store.nodes.get(selectedId)?.name}</h3>
      {near.out.length === 0 && near.into.length === 0
        ? <p className="kb-note">{store.expanded.has(selectedId) ? "이웃 개념이 없어요." : "이웃을 불러오는 중이에요."}</p>
        : <>{group("나가는 관계 (이 개념 → 대상)", near.out)}{group("들어오는 관계 (출처 → 이 개념)", near.into)}</>}
    </section>}
    <ul className="kb3-cardlist" aria-label="핵심 개념 목록">{sorted.map((n) => <li key={n.id}>
      <button type="button" className="kb-row" aria-pressed={selectedId === n.id} onClick={() => onSelect(n.id)}>
        <span className="kb-row__main"><span className="kb-row__title"><span className="kb3-dot" style={{ background: kindColor(n.entity_kind) }} aria-hidden="true" />{n.name}</span><span aria-hidden="true" className="kb-row__arrow">›</span></span>
        <span className="kb-badges"><Badge>{kindLabel(n.entity_kind)}</Badge>{n.has_open_conflict && <Badge tone="warning">열린 충돌</Badge>}</span>
        <span className="kb-row__meta"><span>문서 {n.document_count}</span><span>주장 {n.assertion_count}</span></span>
      </button></li>)}</ul>
  </div>;
}

function ExpandableGraph({ seed, selectedId, onSelect, asList }: { seed: KbGraph; selectedId: string | null; onSelect: (id: string | null) => void; asList: boolean }) {
  const [store, setStore] = useState<GraphStore>(() => seedStore(seed));
  const expand = useMutation({
    mutationFn: (id: string) => kbGraph({ center_entity_id: id, hops: 1, limit: HUB_LIMIT }),
    onSuccess: (graph, id) => setStore((prev) => mergeGraph(prev, graph, id)),
  });
  const pick = onSelect;
  // 선택이 어디서 바뀌든(그래프·목록·상세의 관계 칩·주소의 ?ent=) 아직 안 펼친 개념은 이웃을 불러온다.
  const { mutate } = expand;
  const pendingId = expand.isPending ? expand.variables : null;
  const failedId = expand.isError ? expand.variables : null;
  useEffect(() => {
    if (selectedId && !store.expanded.has(selectedId) && pendingId !== selectedId && failedId !== selectedId) mutate(selectedId);
  }, [selectedId, store.expanded, pendingId, failedId, mutate]);
  const loadingId = expand.isPending ? (expand.variables ?? null) : null;
  return <div className="kb3-graphwrap">
    {asList ? <ConceptCards store={store} selectedId={selectedId} onSelect={(id) => pick(id)} />
      : <OntologyGraph store={store} selectedId={selectedId} loadingId={loadingId} onSelect={pick} />}
    {expand.isError && <div className="kb-error">
      <p className="tk-error" role="alert">이웃 개념을 불러오지 못했어요. {failure(expand.error)}</p>
      <Button size="sm" variant="ghost" onClick={() => expand.variables && expand.mutate(expand.variables)}>다시 시도</Button>
    </div>}
    <p className="kb-note" role="status">개념 {store.nodes.size.toLocaleString("ko-KR")}개 표시{store.total > store.nodes.size ? ` (전체 ${store.total.toLocaleString("ko-KR")}개 중 허브부터)` : ""} · 관계 {store.edges.size.toLocaleString("ko-KR")}개</p>
  </div>;
}

/**
 * 개념 그래프 탭. 처음에는 문서 출현·연결이 가장 많은 허브 개념만 그리고, 개념을 누르면 1-hop 이웃을 펼친다(점진 탐색).
 * 노드를 한꺼번에 다 그리면 거미줄이 되어 읽을 수 없다.
 */
export function OntologyGraphTab({ filters, selectedId, onSelect, openDocument, onConflicts }: {
  filters: KbFilters; selectedId: string | null; onSelect: (id: string | null) => void;
  openDocument: (documentId: string, revisionId?: string) => void; onConflicts: (entityId: string) => void;
}) {
  const narrow = useNarrow();
  const [asList, setAsList] = useState(false);
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const graph = useQuery({ queryKey: ["kb-graph", "view", term, filters.domain], queryFn: () => kbGraph({ q: term, domain: filters.domain || undefined, limit: HUB_LIMIT }) });
  const list = narrow || asList;
  return <div className="kb3-graphtab" data-selected={Boolean(selectedId)}>
    <div className="kb3-graphmain">
      <div className="kb3-graphbar">
        <form className="kb-search" role="search" onSubmit={(e) => { e.preventDefault(); setTerm(text.trim()); onSelect(null); }}>
          <Icon name="search" />
          <input className="tk-input" type="search" aria-label="개념 찾기" placeholder="개념 이름이나 별칭 (예: Deployment, 쿠버네티스)" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="primary" type="submit">찾기</Button>
        </form>
        {!narrow && <div className="kb-actions" role="group" aria-label="보기 방식">
          <Button size="sm" variant={asList ? "ghost" : "primary"} aria-pressed={!asList} onClick={() => setAsList(false)}>그래프</Button>
          <Button size="sm" variant={asList ? "primary" : "ghost"} aria-pressed={asList} onClick={() => setAsList(true)}>목록</Button>
        </div>}
      </div>
      {term && <p className="kb-note">“{term}” 와 관련된 개념만 보고 있어요. <button type="button" className="kb3-linkbtn" onClick={() => { setTerm(""); setText(""); }}>허브 개념으로 돌아가기</button></p>}
      {graph.isPending && <p className="kb-note" role="status">개념 그래프를 읽는 중</p>}
      {graph.isError && <div className="kb-error">
        <p className={isKbUnsupported(graph.error) ? "kb-note" : "tk-error"} role={isKbUnsupported(graph.error) ? "status" : "alert"}>{failure(graph.error)}</p>
        {!isKbUnsupported(graph.error) && <Button variant="ghost" onClick={() => void graph.refetch()}>다시 시도</Button>}
      </div>}
      {graph.data && graph.data.nodes.length === 0 && <div className="kb-empty">
        <p>{term ? `“${term}” 와 맞는 개념이 없어요.` : "아직 추출된 개념이 없어요."}</p>
        <p className="kb-note">{term ? "다른 이름이나 별칭으로 찾아보세요." : "자료 처리가 끝나면 허브 개념부터 여기에 나타나요."}</p>
      </div>}
      {graph.data && graph.data.nodes.length > 0 && <ExpandableGraph key={`${graph.dataUpdatedAt}-${term}`} seed={graph.data} selectedId={selectedId} onSelect={onSelect} asList={list} />}
    </div>
    {selectedId && <EntityDetail id={selectedId} onClose={() => onSelect(null)} onSelect={onSelect} openDocument={openDocument} onConflicts={onConflicts} />}
  </div>;
}
