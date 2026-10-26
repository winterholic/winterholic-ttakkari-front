import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { errorText, getSnapshot } from '../api';
import { fmtTime, safeLink } from '../format';
import { experimentName, rk } from '../hooks';
import { EPISTEMIC, EVENT, KIND } from '../labels';
import { Callout, FactList, Skeleton } from './parts';

const COLLECTIONS = { nodes: '지식·가설', relations: '관계', experiments: '실험', timeline: '변경 이력' } as const;
type Collection = keyof typeof COLLECTIONS;
const SIZE = 100;

/** The overview stays bounded; this archive loads only the requested page when opened. */
export function RecordArchive({ studyId, onExperiment }: { studyId: string; onExperiment: (id: string) => void }) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Collection>('nodes');
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: [...rk(), 'record-page', studyId, offset], queryFn: () => getSnapshot(studyId, { offset, limit: SIZE }), enabled: open });
  const data = q.data;
  const pagination = data?.pagination;
  const total = pagination?.totals[kind] ?? 0;
  const page = Math.floor(offset / SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const nodes = new Map(data?.nodes.map(node => [node.id, node]) ?? []);
  return <details className="rs-ledger" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>전체 기록 찾아보기</summary>
    {open && <div className="rs-form">
      <p className="rs-muted">요약에 없는 기록도 종류별로 찾아볼 수 있습니다. 각 페이지는 작성 순서로 표시합니다.</p>
      <label htmlFor={`${fieldId}-kind`}>기록 종류</label>
      <select id={`${fieldId}-kind`} className="tk-input" value={kind} onChange={event => { setKind(event.target.value as Collection); setOffset(0); }}>
        {Object.entries(COLLECTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {q.isPending && <Skeleton rows={3} />}
      {q.error && <Callout kind="caution">{errorText(q.error)} <Button size="sm" onClick={() => void q.refetch()}>다시 불러오기</Button></Callout>}
      {data && !pagination && <Callout kind="caution">서버가 페이지 정보를 제공하지 않습니다. 페이지 탐색을 지원하는 버전이 반영된 뒤 다시 불러와 주세요. <Button size="sm" onClick={() => void q.refetch()}>다시 불러오기</Button></Callout>}
      {data && pagination && <>
        <p role="status">{COLLECTIONS[kind]} · 전체 {total.toLocaleString('ko-KR')}개 · {page} / {pages}페이지</p>
        <div className="rs-actions">
          <Button size="sm" disabled={offset === 0 || q.isFetching} onClick={() => setOffset(Math.max(0, offset - SIZE))}>이전 기록</Button>
          <Button size="sm" disabled={offset + SIZE >= total || q.isFetching} onClick={() => setOffset(offset + SIZE)}>다음 기록</Button>
        </div>
        <form key={`${kind}-${offset}`} className="rs-actions" onSubmit={event => {
          event.preventDefault();
          const value = Number(new FormData(event.currentTarget).get('page'));
          if (Number.isInteger(value) && value >= 1 && value <= pages) setOffset((value - 1) * SIZE);
        }}>
          <label htmlFor={`${fieldId}-page`}>기록 페이지</label>
          <input id={`${fieldId}-page`} name="page" type="number" className="tk-input" min={1} max={pages} step={1} defaultValue={page} required />
          <Button size="sm" type="submit" disabled={q.isFetching}>이동</Button>
        </form>
        {!data[kind].length && <p className="rs-muted">이 종류의 기록이 없습니다.</p>}
        {kind === 'nodes' && data.nodes.map(node => {
          const evidence = data.evidence.find(item => item.id === node.evidence_id);
          return <article className="rs-note" key={node.id}>
            <p className="rs-muted">{KIND[node.kind] ?? node.kind} · {EPISTEMIC[node.epistemic_status] ?? node.epistemic_status}</p>
            <h4>{node.title}</h4>{node.summary && <p className="rs-prose rs-prewrap">{node.summary}</p>}
            {evidence && <blockquote className="rs-quote"><p>{evidence.quote}</p><footer>{safeLink(evidence.locator) ? <a href={safeLink(evidence.locator)} target="_blank" rel="noreferrer">{evidence.source_key}</a> : evidence.source_key}{!evidence.active && ' · 이전 원문 버전'}<details><summary>출처 지문</summary><code className="tk-mono">{evidence.sha256}</code></details></footer></blockquote>}
            {Object.keys(node.conditions ?? {}).length > 0 && <details><summary>적용 조건</summary><FactList data={node.conditions} /></details>}
          </article>;
        })}
        {kind === 'relations' && data.relations.map(relation => <article className="rs-note" key={relation.id}>
          <p className="rs-prose"><strong>{nodes.get(relation.from_id)?.title ?? relation.from_id}</strong> → <strong>{nodes.get(relation.to_id)?.title ?? relation.to_id}</strong></p>
          <p>{relation.predicate} · 조건부 관계 제안, 인과 확정 아님</p><p className="rs-prose">{relation.rationale}</p>
          <FactList data={relation.conditions} empty="관계 조건이 기록되지 않았습니다." />
        </article>)}
        {kind === 'experiments' && data.experiments.map(experiment => <article className="rs-note" key={experiment.id}>
          <h4>{experimentName(experiment)}</h4><p className="rs-prose">{experiment.hypothesis}</p><p className="rs-muted">{experiment.state}</p>
          <Button size="sm" onClick={() => onExperiment(experiment.id)}>실험 상세 보기</Button>
        </article>)}
        {kind === 'timeline' && data.timeline.map(event => <article className="rs-note" key={event.id}>
          <h4>{EVENT[event.kind] ?? event.kind}</h4><p className="rs-muted"><time dateTime={event.created_at}>{fmtTime(event.created_at)}</time> · {event.actor}</p>
          <details><summary>세부 기록</summary><FactList data={event.payload} /></details>
        </article>)}
      </>}
    </div>}
  </details>;
}
