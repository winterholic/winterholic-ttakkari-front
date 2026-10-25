import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isKbUnsupported, kbAddAlias, kbEntity } from "../../api/kb";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { EvidenceDialog } from "./Evidence";
import { failure } from "./labels";
import { kindLabel } from "./labelsV3";

const LANGS = [{ value: "ko", label: "한국어" }, { value: "en", label: "영어" }];

/**
 * 개념 상세. 정본 요약, 별칭(추가), 지지 주장과 원문 인용, 연결된 문서·관계, 열린 충돌을 보여 준다.
 * 별칭을 추가하면 서버가 같은 이름의 개념을 다시 연결할 수 있어서, 결과로 돌아온 숫자만 알려 준다.
 */
export function EntityDetail({ id, onClose, onSelect, openDocument, onConflicts }: {
  id: string; onClose: () => void; onSelect: (id: string) => void;
  openDocument: (documentId: string, revisionId?: string) => void; onConflicts: (entityId: string) => void;
}) {
  const cache = useQueryClient();
  const [alias, setAlias] = useState("");
  const [lang, setLang] = useState("ko");
  const [evidence, setEvidence] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["kb-entity", id], queryFn: () => kbEntity(id) });
  const add = useMutation({
    mutationFn: () => kbAddAlias(id, alias.trim(), lang),
    onSuccess: async () => { setAlias(""); await Promise.all([cache.invalidateQueries({ queryKey: ["kb-entity", id] }), cache.invalidateQueries({ queryKey: ["kb-graph"] })]); },
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
  return <aside className="kb-detail" aria-label="개념 상세">
    <div className="kb-detail__head">
      {head}
      <h2 tabIndex={-1}>{e.name}</h2>
      <div className="kb-badges"><Badge tone="info">{kindLabel(e.entity_kind)}</Badge>{e.conflicts.length > 0 && <Badge tone="warning">{`열린 충돌 ${e.conflicts.length}건`}</Badge>}</div>
    </div>
    <section aria-label="정본 요약">
      <h3 className="kb3-sub">정본 요약</h3>
      {canon ? <>
        <p className="kb3-summary">{canon.summary}</p>
        {canon.key_facts.length > 0 && <ul className="kb3-facts" aria-label="핵심 사실">{canon.key_facts.map((f) => <li key={f}>{f}</li>)}</ul>}
      </> : <p className="kb-note">아직 정본 요약이 없어요. 문서가 더 모이면 합성돼요.</p>}
    </section>
    <section aria-label="별칭">
      <h3 className="kb3-sub">별칭</h3>
      {e.aliases.length === 0 ? <p className="kb-note">등록된 별칭이 없어요.</p>
        : <ul className="kb3-chiplist" aria-label="별칭 목록">{e.aliases.map((a) => <li key={`${a.alias}-${a.lang ?? ""}`}><Badge mono>{a.lang ? `${a.alias} · ${a.lang}` : a.alias}</Badge></li>)}</ul>}
      <form className="kb3-alias-form" onSubmit={(ev) => { ev.preventDefault(); if (alias.trim()) add.mutate(); }}>
        <label className="kb-field"><span>별칭 추가</span>
          <input className="tk-input" value={alias} maxLength={200} onChange={(ev) => setAlias(ev.target.value)} placeholder="예: 디플로이먼트" /></label>
        <div className="kb-field"><span id={`kb3-alias-lang-${id}`}>언어</span>
          <Select id={`kb3-alias-lang-s-${id}`} labelledBy={`kb3-alias-lang-${id}`} size="sm" value={lang} options={LANGS} onChange={setLang} /></div>
        <Button size="sm" type="submit" busy={add.isPending} disabled={!alias.trim()}>추가</Button>
      </form>
      {add.isSuccess && <p className="kb-note" role="status">별칭을 추가했어요.{add.data.relinked_count ? ` 문서 ${add.data.relinked_count}건을 다시 연결했어요.` : ""}</p>}
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
            {a.status === "superseded" && <Badge>이전 주장</Badge>}
          </div>
          {a.evidence?.[0] && <>
            <blockquote className="kb3-quote">{a.evidence[0].quote}</blockquote>
            <Button size="sm" variant="ghost" onClick={() => setEvidence(a.evidence![0].passage_id)}>원문 위치 보기</Button>
          </>}
        </li>)}</ul>}
    </section>
    <section aria-label="연결된 관계">
      <h3 className="kb3-sub">연결된 개념</h3>
      {e.relations.length === 0 ? <p className="kb-note">연결된 개념이 없어요.</p>
        : <ul className="kb3-relations" aria-label="관계 목록">{e.relations.map((r) => <li key={r.id ?? `${r.predicate}-${r.entity_id}-${r.direction ?? ""}`}>
          <span className="kb3-chip__pred">{r.direction === "in" ? `← ${r.predicate}` : `${r.predicate} →`}</span>
          <button type="button" className="kb-chip" onClick={() => onSelect(r.entity_id)}>{r.name}</button>
        </li>)}</ul>}
    </section>
    <section aria-label="관련 문서">
      <h3 className="kb3-sub">관련 문서</h3>
      {e.documents.length === 0 ? <p className="kb-note">연결된 문서가 없어요.</p>
        : <ul className="kb3-chiplist" aria-label="관련 문서 목록">{e.documents.map((d) => <li key={d.id}>
          <button type="button" className="kb-chip" onClick={() => openDocument(d.id)}>{d.title}</button></li>)}</ul>}
    </section>
    {e.conflicts.length > 0 && <Button onClick={() => onConflicts(e.id)}>{`충돌 ${e.conflicts.length}건 비교하기`}</Button>}
    <EvidenceDialog passageId={evidence} onClose={() => setEvidence(null)} openDocument={(d, r) => openDocument(d, r)} />
  </aside>;
}
