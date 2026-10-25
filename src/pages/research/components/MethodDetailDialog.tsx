import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { getMethod, errorText } from '../api';
import { fmtPct, relationOther, safeLink, stringify } from '../format';
import { useTaxonomy, rk } from '../hooks';
import { EXECUTION, ORIGIN, RELATION, adapterLabel, metricLabel, AXIS_LABEL, STRATEGY } from '../labels';
import { AXES, type MethodDetail, type Strategy } from '../types';
import { EvidenceBadge, ExecutionStatusBadge, LifecycleBadge, MeasuredBadge } from './ExecutionStatusBadge';
import { BulletList, Callout, Skeleton } from './parts';
import { PromoteModal } from './MethodFormModal';

const TABS = [['overview', '개요'], ['params', '파라미터'], ['evidence', '근거'], ['relations', '관계'], ['history', '실험 이력']] as const;
type Tab = (typeof TABS)[number][0];

interface Props { slug: string; onClose: () => void; onOpenMethod: (slug: string) => void; onDesign: (slug: string) => void; onOpenExperiment: (studyId: string | undefined, experimentId: string) => void }

/** 방법 상세. 원리·파라미터·기대 효과와 부작용·호환 환경·관계·근거(문헌 보고 vs 따까리 실측 구분)·과거 이력을 한 곳에서 본다. */
export function MethodDetailDialog({ slug, onClose, onOpenMethod, onDesign, onOpenExperiment }: Props) {
  const q = useQuery({ queryKey: [...rk(), 'method', slug], queryFn: () => getMethod(slug) });
  const [tab, setTab] = useState<Tab>('overview');
  const [promote, setPromote] = useState(false);
  const m = q.data;
  const canPromote = m && (m.lifecycle_status === 'hypothesis' || m.lifecycle_status === 'candidate');
  const designLabel = m?.execution_status === 'adapter_required' || m?.execution_status === 'hypothesis_stage' ? '외부 결과로 실험 설계' : '이 방법으로 실험 설계';
  return <>
    <Dialog open onClose={onClose} size="lg" title={m ? m.name_ko || m.name : '방법 상세'}
      footer={m ? <>
        {canPromote && <Button onClick={() => setPromote(true)}>검증 후 승격</Button>}
        <Button variant="primary" onClick={() => onDesign(m.slug)}>{designLabel}</Button></> : undefined}>
      {q.isPending && <Skeleton rows={4} />}
      {q.error && <Callout kind="caution">{errorText(q.error)}</Callout>}
      {m && <div className="rs-detail">
        <div className="rs-detail__badges">
          <ExecutionStatusBadge status={m.execution_status} reason={m.unavailable_reason} />
          <LifecycleBadge status={m.lifecycle_status} />
          <MeasuredBadge runs={m.local_measurements?.measured_run_count} />
          <EvidenceBadge status={m.evidence_status} />
          <span className="rs-muted">{ORIGIN[m.origin] ?? m.origin} · v{m.version}</span>
        </div>
        <p className="rs-detail__sum">{m.summary}</p>
        <ExecutionNote m={m} />
        <div className="tk-tablist" role="tablist" aria-label="방법 상세 보기">
          {TABS.map(([id, label]) => <button key={id} className="tk-tab" role="tab" id={`md-t-${id}`} aria-controls={`md-p-${id}`} aria-selected={tab === id} onClick={() => setTab(id)}>{label}{id === 'relations' && m.relations?.length ? ` ${m.relations.length}` : ''}{id === 'history' && m.related_experiments?.length ? ` ${m.related_experiments.length}` : ''}</button>)}
        </div>
        <div className="tk-tabpanel rs-detail__panel" role="tabpanel" id={`md-p-${tab}`} aria-labelledby={`md-t-${tab}`} tabIndex={0}>
          {tab === 'overview' && <Overview m={m} />}
          {tab === 'params' && <Params m={m} />}
          {tab === 'evidence' && <Evidence m={m} />}
          {tab === 'relations' && <Relations m={m} onOpen={onOpenMethod} />}
          {tab === 'history' && <History m={m} onOpen={onOpenExperiment} />}
        </div>
      </div>}
    </Dialog>
    {promote && m && <PromoteModal open onClose={() => setPromote(false)} method={m} />}
  </>;
}

function ExecutionNote({ m }: { m: MethodDetail }) {
  const info = EXECUTION[m.execution_status];
  const kind = m.execution_status === 'environment_unavailable' ? 'caution' : m.execution_status === 'immediately_executable' || m.execution_status === 'tool_integrated' ? 'tip' : 'warning';
  return <Callout kind={kind} title={`실행 상태: ${info?.label ?? m.execution_status}`}>
    <p>{info?.hint}</p>
    {m.unavailable_reason && <p><strong>사유:</strong> {m.unavailable_reason}</p>}
    {!!m.unsupported_params?.length && <p><strong>실행되지 않거나 대체되는 파라미터:</strong> {m.unsupported_params.join(', ')}</p>}
    {!!m.adapter_hints?.length && <p className="rs-muted">연결 후보 실행기: {m.adapter_hints.map(adapterLabel).join(', ')}</p>}
  </Callout>;
}

function Overview({ m }: { m: MethodDetail }) {
  const { label } = useTaxonomy();
  const c = m.compatibility ?? {};
  return <div className="rs-stack">
    {m.principle && <div><h4>원리</h4><p className="rs-prose">{m.principle}</p></div>}
    <div className="rs-two"><div><h4>기대 효과</h4><BulletList items={m.expected_effects ?? []} /></div><div><h4>부작용·트레이드오프</h4><BulletList items={m.side_effects ?? []} empty="알려진 부작용이 기록되지 않았습니다. 없다는 뜻은 아닙니다." /></div></div>
    <div><h4>호환 환경</h4>
      <dl className="tk-meta">
        <div><dt>하드웨어</dt><dd>{c.hardware?.length ? c.hardware.join(', ') : '제한 없음(기록 없음)'}</dd></div>
        <div><dt>런타임</dt><dd>{c.runtimes?.length ? c.runtimes.join(', ') : '기록 없음'}</dd></div>
        {!!c.requires?.length && <div><dt>필요 조건</dt><dd>{c.requires.join(', ')}</dd></div>}
        {c.notes && <div><dt>메모</dt><dd>{c.notes}</dd></div>}
      </dl></div>
    <div><h4>분류</h4>
      <dl className="tk-meta">{AXES.map(axis => {
        const key = ({ target: 'targets', layer: 'layers', goal: 'goals', intervention: 'interventions', research_method: 'research_methods' } as const)[axis];
        const codes = m[key] ?? [];
        return codes.length ? <div key={axis} className="rs-meta-row"><dt>{AXIS_LABEL[axis]}</dt><dd>{codes.map(code => <span key={code} className="rs-tag">{label(axis, code)}</span>)}</dd></div> : null;
      })}</dl></div>
    {!!m.metrics?.length && <div><h4>권장 측정 지표</h4><p>{m.metrics.map(k => <span key={k} className="rs-tag" title={k}>{metricLabel(k)}</span>)}</p></div>}
    {!!m.tags?.length && <p className="rs-muted">검색어: {m.tags.join(', ')}</p>}
  </div>;
}

function Params({ m }: { m: MethodDetail }) {
  if (!m.parameters?.length) return <p className="rs-muted">이 방법에는 조정 가능한 파라미터가 정의되어 있지 않습니다.{m.lifecycle_status === 'hypothesis' ? ' 가설 단계라 실험 프로토콜이 구체화되지 않았을 수 있습니다.' : ''}</p>;
  return <section className="tk-datatable tk-datatable--sticky-col" aria-label="파라미터 정의">
    <div className="tk-datatable__scroll" role="region" aria-label="파라미터 표 (가로로 스크롤)" tabIndex={0}>
      <table><thead><tr><th scope="col">파라미터</th><th scope="col">종류</th><th scope="col">기본값</th><th scope="col">범위·선택지</th><th scope="col">설명</th></tr></thead>
        <tbody>{m.parameters.map(p => <tr key={p.key}>
          <th scope="row"><span className="rs-param-name">{p.label}</span><br /><code className="tk-mono">{p.key}</code>{p.advanced && <> <span className="rs-tag">고급</span></>}{p.sweepable === false && <> <span className="rs-tag">고정만</span></>}</th>
          <td>{p.type}</td><td>{stringify(p.default)}{p.unit ? ` ${p.unit}` : ''}</td>
          <td>{p.options?.length ? p.options.join(' / ') : p.min != null || p.max != null ? `${p.min ?? '−∞'} ~ ${p.max ?? '∞'}` : '—'}</td>
          <td className="rs-wrapcell">{p.description || '—'}</td></tr>)}</tbody></table>
    </div></section>;
}

function Evidence({ m }: { m: MethodDetail }) {
  const lm = m.local_measurements;
  const summary = lm?.best_improvement_summary;
  return <div className="rs-stack">
    <section aria-labelledby="ev-lit"><h4 id="ev-lit">문헌에서 보고된 근거 <EvidenceBadge status={m.evidence_status} /></h4>
      <p className="rs-muted">논문·문서의 주장입니다. 따까리가 같은 조건으로 재현한 결과가 아닙니다.</p>
      {m.evidence?.length ? <ul className="rs-evidence">{m.evidence.map((e, i) => <li key={i}>
        <div>{safeLink(e.url) ? <a href={safeLink(e.url)} target="_blank" rel="noreferrer">{e.title || e.url}</a> : <strong>{e.title || '제목 없음'}</strong>}{e.year ? <span className="rs-muted"> · {e.year}</span> : null}{e.kind && <span className="rs-tag">{e.kind}</span>}</div>
        {e.claim && <p>{e.claim}</p>}</li>)}</ul> : <p className="rs-muted">기록된 문헌 근거가 없습니다{m.evidence_status === 'unverified' ? ' (미검증 가설)' : ''}.</p>}
    </section>
    <section aria-labelledby="ev-loc"><h4 id="ev-loc">따까리 실측 <MeasuredBadge runs={lm?.measured_run_count} /></h4>
      {lm?.locally_measured ? <>
        <p>현재 범위에서 {lm.measured_run_count}회 실행해 측정했습니다.</p>
        {summary && <dl className="tk-meta">{Object.entries(summary).map(([k, v]) => <div key={k} className="rs-meta-row"><dt>{metricLabel(k)}</dt><dd>{typeof v === 'number' ? (k.includes('pct') ? fmtPct(v) : v) : stringify(v)}</dd></div>)}</dl>}
      </> : <p className="rs-muted">이 환경에서 직접 측정한 기록이 아직 없습니다. 문헌의 효과를 이 환경의 효과로 읽지 마세요.</p>}
    </section>
  </div>;
}

function Relations({ m, onOpen }: { m: MethodDetail; onOpen: (slug: string) => void }) {
  const rels = m.relations ?? [];
  if (!rels.length) return <p className="rs-muted">연결된 조합·충돌·선행 방법이 기록되지 않았습니다. 조합 효과는 별도 실험으로 검증해야 합니다.</p>;
  const groups = Object.keys(RELATION).filter(t => rels.some(r => r.relation_type === t));
  return <div className="rs-stack">{groups.map(t => <section key={t} aria-label={RELATION[t].label}>
    <h4>{RELATION[t].label}</h4>
    <ul className="rs-rellist">{rels.filter(r => r.relation_type === t).map((r, i) => {
      const o = relationOther(r, m.id);
      const cond = (r.conditions as { when_parameter?: Record<string, unknown> } | undefined)?.when_parameter;
      return <li key={r.id ?? i}>
        <button type="button" className="tk-link" onClick={() => onOpen(o.slug)}>{o.name}</button>
        {o.status && <ExecutionStatusBadge status={o.status} />}
        {t === 'precedes' && <span className="rs-muted"> {o.outgoing ? '→ 이 방법이 먼저' : '→ 상대가 먼저'}</span>}
        {cond && <p className="rs-muted">조건: {Object.entries(cond).map(([k, v]) => `${k} = ${stringify(v)}`).join(', ')}</p>}
        {r.note && <p>{r.note}</p>}
      </li>;
    })}</ul></section>)}
    <p className="rs-muted">조합 효과는 단독 효과의 합이 아닙니다. 조합은 별도 실험으로 검증하세요.</p></div>;
}

function History({ m, onOpen }: { m: MethodDetail; onOpen: (studyId: string | undefined, experimentId: string) => void }) {
  const list = m.related_experiments ?? [];
  if (!list.length) return <p className="rs-muted">이 방법으로 진행한 실험이 아직 없습니다. 실패한 실험도 여기 남습니다.</p>;
  return <ul className="rs-rellist">{list.map(x => <li key={x.id}>
    <button type="button" className="tk-link" onClick={() => onOpen(x.study_id, x.id)}>{x.name || x.title || x.id.slice(0, 8)}</button>
    <span className="rs-muted"> {x.study_title ? `· ${x.study_title}` : ''}{x.strategy ? ` · ${STRATEGY[x.strategy as Strategy]?.label ?? x.strategy}` : ''}{x.state ? ` · ${x.state}` : ''}</span>
    {x.best_summary && <p>{x.best_summary}</p>}</li>)}</ul>;
}
