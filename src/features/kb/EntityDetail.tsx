import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isKbUnsupported, kbAddAlias, kbEntity, kbGraph } from "../../api/kb";
import type { KbEvidenceRef } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { EvidenceDialog } from "./Evidence";
import { failure } from "./labels";
import { CONFLICT_KIND_TEXT, conflictStatusText, distinctFacts, domainLabel, kindLabel } from "./labelsV3";

const LANGS = [{ value: "ko", label: "한국어" }, { value: "en", label: "영어" }];

/** 근거 인용 한 건: 인용문, 어느 문서·버전인지, 원문 위치와 문서로 이동. */
function Cite({ ev, onEvidence, openDocument }: { ev: KbEvidenceRef; onEvidence: (passageId: string) => void; openDocument: (documentId: string, revisionId?: string) => void }) {
  return <>
    <blockquote className="kb3-quote">{ev.quote}</blockquote>
    {ev.document_title && <p className="kb-note">{ev.document_title}{ev.rev_no != null ? ` · 버전 ${ev.rev_no}` : ""}{ev.page_no != null ? ` · p.${ev.page_no}` : ""}</p>}
    <div className="kb-actions">
      <Button size="sm" variant="ghost" onClick={() => onEvidence(ev.passage_id)}>원문 위치 보기</Button>
      {ev.document_id && <Button size="sm" variant="ghost" onClick={() => openDocument(ev.document_id!, ev.revision_id)}>문서 열기</Button>}
    </div>
  </>;
}

/**
 * 개념 상세. 정본 요약, 별칭(추가), 지지 주장과 원문 인용, 관계와 관계 근거, 연결된 문서, 충돌을 보여 준다.
 * 별칭을 추가하면 서버가 같은 표기가 나오는 패시지를 다시 연결하므로, 결과로 돌아온 숫자만 알려 준다.
 * 관계 근거 인용은 서버 개념 상세에는 개수만 있어서, 같은 개념의 1-hop 그래프 응답(에지의 대표 근거)에서 가져온다.
 */
export function EntityDetail({ id, candidates, onClose, onSelect, openDocument, onConflicts }: {
  id: string; candidates: boolean; onClose: () => void; onSelect: (id: string) => void;
  openDocument: (documentId: string, revisionId?: string) => void; onConflicts: (entityId: string) => void;
}) {
  const cache = useQueryClient();
  const [alias, setAlias] = useState("");
  const [lang, setLang] = useState("ko");
  const [evidence, setEvidence] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["kb-entity", id, candidates], queryFn: () => kbEntity(id, { include_candidates: candidates }) });
  const edges = useQuery({
    queryKey: ["kb-graph", "edges", id, candidates], enabled: q.isSuccess,
    queryFn: () => kbGraph({ center_entity_id: id, hops: 1, limit: 100, include_candidates: candidates }),
  });
  const edgeEvidence = new Map((edges.data?.edges ?? []).map((e) => [e.id, e.evidence ?? []]));
  const add = useMutation({
    mutationFn: () => kbAddAlias(id, alias.trim(), lang),
    onSuccess: async () => { setAlias(""); await Promise.all([cache.invalidateQueries({ queryKey: ["kb-entity", id] }), cache.invalidateQueries({ queryKey: ["kb-graph"] }), cache.invalidateQueries({ queryKey: ["kb-search"] })]); },
  });
  const head = <div className="kb-actions"><Button size="sm" variant="ghost" onClick={onClose}>닫기</Button></div>;
  if (q.isPending) return <aside className="kb-detail" aria-label="개념 상세">{head}<p className="kb-note" role="status">개념을 여는 중</p></aside>;
  if (q.isError) {
    return <aside className="kb-detail" aria-label="개념 상세">{head}
      <p className={isKbUnsupported(q.error) ? "kb-note" : "tk-error"} role={isKbUnsupported(q.error) ? "status" : "alert"}>{failure(q.error)}</p>
      {!isKbUnsupported(q.error) && <Button variant="ghost" onClick={() => void q.refetch()}>다시 시도</Button>}
    </aside>;
  }
  const e = q.data;
  const canon = e.canonical;
  const openConflicts = e.conflicts.filter((c) => c.status === "open").length;
  return <aside className="kb-detail" aria-label="개념 상세">
    <div className="kb-detail__head">
      {head}
      <h2 tabIndex={-1}>{e.name}</h2>
      <div className="kb-badges">
        <Badge tone="info">{kindLabel(e.entity_kind)}</Badge>
        {e.domain && <Badge>{domainLabel(e.domain)}</Badge>}
        {e.document_count !== undefined && <Badge>{`문서 ${e.document_count}`}</Badge>}
        {openConflicts > 0 && <Badge tone="warning">{`열린 충돌 ${openConflicts}건`}</Badge>}
      </div>
    </div>
    <section aria-label="정본 요약">
      <h3 className="kb3-sub">정본 요약</h3>
      {canon && (canon.summary || canon.key_facts.length > 0) ? <>
        {canon.summary && <p className="kb3-summary">{canon.summary}</p>}
        {distinctFacts(canon).length > 0 && <ul className="kb3-facts" aria-label="핵심 사실">{distinctFacts(canon).map((f) => <li key={f}>{f}</li>)}</ul>}
      </> : <p className="kb-note">아직 근거로 뒷받침된 정본 요약이 없어요. 문서가 더 모이면 합성돼요.</p>}
    </section>
    <section aria-label="별칭">
      <h3 className="kb3-sub">별칭</h3>
      {e.aliases.length === 0 ? <p className="kb-note">등록된 별칭이 없어요.</p>
        : <ul className="kb3-chiplist" aria-label="별칭 목록">{e.aliases.map((a) => <li key={`${a.alias}-${a.lang ?? ""}`}>
          <span className="tk-badge kb3-tag">{a.lang ? `${a.alias} · ${a.lang}` : a.alias}</span>{a.source === "user_verified" && <Badge tone="success">직접 추가</Badge>}</li>)}</ul>}
      <form className="kb3-alias-form" onSubmit={(ev) => { ev.preventDefault(); if (alias.trim()) add.mutate(); }}>
        <label className="kb-field"><span>별칭 추가</span>
          <input className="tk-input" value={alias} maxLength={200} onChange={(ev) => setAlias(ev.target.value)} placeholder="예: 디플로이먼트" /></label>
        <div className="kb-field"><span id={`kb3-alias-lang-${id}`}>언어</span>
          <Select id={`kb3-alias-lang-s-${id}`} labelledBy={`kb3-alias-lang-${id}`} size="sm" value={lang} options={LANGS} onChange={setLang} /></div>
        <Button size="sm" type="submit" busy={add.isPending} disabled={!alias.trim()}>추가</Button>
      </form>
      {add.isSuccess && <p className="kb-note" role="status">
        {add.data.created === false ? "이미 있는 별칭이에요." : `별칭을 추가했어요.${add.data.relinked_count ? ` 이 표기가 나오는 패시지 ${add.data.relinked_count}건을 이 개념에 다시 연결했어요.` : " 새로 연결된 패시지는 없어요."}`}
      </p>}
      {add.isError && <p className="tk-error" role="alert">{failure(add.error)}</p>}
    </section>
    <section aria-label="지지 주장">
      <h3 className="kb3-sub">지지 주장과 원문 인용</h3>
      {e.assertions.length === 0 ? <p className="kb-note">연결된 주장이 없어요.</p>
        : <ul className="kb3-claims" aria-label="주장 목록">{e.assertions.map((a) => <li key={a.id}>
          <p>{a.text}</p>
          <div className="kb-badges">
            {a.is_canonical && <Badge tone="success">정본</Badge>}
            {a.status === "disputed" && <Badge tone="warning">다툼</Badge>}
          </div>
          {a.evidence?.[0] ? <Cite ev={a.evidence[0]} onEvidence={setEvidence} openDocument={openDocument} /> : <p className="kb-note">접근할 수 있는 근거 인용이 없어요.</p>}
        </li>)}</ul>}
    </section>
    <section aria-label="연결된 관계">
      <h3 className="kb3-sub">관계와 근거</h3>
      {e.relations.length === 0 ? <p className="kb-note">{candidates ? "연결된 개념이 없어요." : "확정된 관계가 없어요. 후보 관계는 그래프의 후보 관계 보기를 켜면 나와요."}</p>
        : <ul className="kb3-claims" aria-label="관계 목록">{e.relations.map((r) => {
          const ev = r.id ? edgeEvidence.get(r.id)?.[0] : undefined;
          return <li key={r.id ?? `${r.predicate}-${r.entity_id}-${r.direction ?? ""}`}>
            <p className="kb3-relation">
              <span className="kb3-chip__pred">{r.direction === "in" ? `← ${r.predicate}` : `${r.predicate} →`}</span>
              <button type="button" className="kb-chip" onClick={() => onSelect(r.entity_id)}>{r.name}</button>
            </p>
            <div className="kb-badges">
              {r.candidate ? <Badge tone="warning">후보 · 확정 전</Badge> : <Badge tone="success">확정</Badge>}
              {r.evidence_count !== undefined && <Badge>{`근거 ${r.evidence_count}건`}</Badge>}
            </div>
            {ev ? <Cite ev={ev} onEvidence={setEvidence} openDocument={openDocument} />
              : (r.evidence_count ?? 0) > 0 && <p className="kb-note">{edges.isPending ? "근거 인용을 읽는 중" : edges.isError ? "근거 인용을 읽지 못했어요." : "이 관계의 대표 근거를 이 화면에서 읽지 못했어요(이웃이 많아 한 번에 다 못 가져왔어요)."}</p>}
          </li>;
        })}</ul>}
    </section>
    <section aria-label="관련 문서">
      <h3 className="kb3-sub">관련 문서</h3>
      {e.documents.length === 0 ? <p className="kb-note">연결된 문서가 없어요.</p>
        : <ul className="kb3-chiplist" aria-label="관련 문서 목록">{e.documents.map((d) => <li key={d.id}>
          <button type="button" className="kb-chip" onClick={() => openDocument(d.id)}>{d.title}{d.rev_no != null ? <span className="kb-note"> v{d.rev_no}</span> : null}</button></li>)}</ul>}
    </section>
    {e.conflicts.length > 0 && <section aria-label="열린 충돌">
      <h3 className="kb3-sub">열린 충돌</h3>
      <ul className="kb3-claims" aria-label="개념의 충돌">{e.conflicts.map((c) => {
        const st = conflictStatusText(c);
        return <li key={c.id}><div className="kb-badges"><Badge tone={st.tone}>{st.label}</Badge><Badge>{CONFLICT_KIND_TEXT[c.kind] ?? c.kind}</Badge></div></li>;
      })}</ul>
      <Button onClick={() => onConflicts(e.id)}>{`충돌 ${e.conflicts.length}건 비교하기`}</Button>
    </section>}
    <EvidenceDialog passageId={evidence} onClose={() => setEvidence(null)} openDocument={(d, r) => openDocument(d, r)} />
  </aside>;
}
