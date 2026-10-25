import type { KbMatchedEntity } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { distinctFacts, kindLabel } from "./labelsV3";

/**
 * 질문과 연결된 개념의 정본 카드. 정본 정의·핵심 사실·1-hop 이웃은 서버가 여러 문서에서 합성해 준 값만 보여 주고,
 * 없으면 없다고 말한다(요약을 만들어 채우지 않는다).
 */
export function CanonicalCard({ entity, onConcept, onGraph, onConflicts }: {
  entity: KbMatchedEntity;
  onConcept: (id: string, name: string) => void;
  onGraph: (id: string) => void;
  onConflicts: (id: string) => void;
}) {
  const canon = entity.canonical;
  const conflicts = entity.open_conflict_count ?? 0;
  const aliases = (entity.aliases ?? []).filter((a) => a !== entity.name);
  return <article className="kb3-canon" aria-label={`개념 ${entity.name}`}>
    <header className="kb3-canon__head">
      <h3 className="kb3-canon__name">{entity.name}</h3>
      <div className="kb-badges">
        <Badge tone="info">{kindLabel(entity.entity_kind)}</Badge>
        {entity.document_count !== undefined && <Badge>{`문서 ${entity.document_count}`}</Badge>}
        {conflicts > 0 && <button type="button" className="kb3-conflict-badge" onClick={() => onConflicts(entity.id)}>{`충돌 ${conflicts}건 감지됨`}</button>}
      </div>
    </header>
    {aliases.length > 0 && <p className="kb-note">다른 이름: {aliases.join(" · ")}</p>}
    {canon && (canon.summary || canon.key_facts.length > 0) ? <>
      {canon.summary && <p className="kb3-canon__summary">{canon.summary}</p>}
      {distinctFacts(canon).length > 0 && <ul className="kb3-facts" aria-label="핵심 사실">{distinctFacts(canon).map((f) => <li key={f}>{f}</li>)}</ul>}
    </> : <p className="kb-note">아직 근거로 뒷받침된 정본 요약이 없어요. 아래 근거 패시지를 확인해 주세요.</p>}
    {entity.neighbors && entity.neighbors.length > 0 && <div className="kb3-neighbors">
      <p className="kb-note">연결된 개념</p>
      <ul className="kb3-chiplist" aria-label="연결된 개념">
        {entity.neighbors.map((n) => <li key={`${n.entity_id}-${n.predicate}`}>
          <button type="button" className="kb-chip" onClick={() => onConcept(n.entity_id, n.name)}>
            <span className="kb3-chip__pred">{n.direction === "in" ? `← ${n.predicate}` : `${n.predicate} →`}</span> {n.name}{n.candidate ? " (후보)" : ""}
          </button>
        </li>)}
      </ul>
    </div>}
    <div className="kb-actions">
      <Button size="sm" onClick={() => onGraph(entity.id)}>그래프에서 보기</Button>
      <Button size="sm" variant="ghost" onClick={() => onConcept(entity.id, entity.name)}>이 개념으로 좁혀 보기</Button>
    </div>
  </article>;
}
