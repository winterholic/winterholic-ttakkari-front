import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { Badge } from '../../../ui/Badge';
import { Dialog } from '../../../ui/Dialog';
import { toast } from '../../../ui/toastStore';
import { errorText, exportReport, getExperiment, getRun, listMethods } from '../api';
import { ArtifactList } from '../components/ArtifactList';
import { RecordArchive } from '../components/RecordArchive';
import { OriginBadge } from '../components/ExecutionStatusBadge';
import { Callout, Empty, FactList, Section, Skeleton } from '../components/parts';
import { DiscoverModal, NodeFormModal, PlanEditModal, RelationFormModal, SourceFormModal } from '../components/RecordForms';
import type { ResearchCtx } from '../context';
import { adoptionBasis, bestLabel, fmtTime, safeLink, stringify } from '../format';
import { experimentName, KEY, useAdapters, useSnapshot, rk } from '../hooks';
import { adapterLabel, EPISTEMIC, EVENT, KIND, PHASE, STRATEGY } from '../labels';
import { narrate } from '../series';
import type { ExperimentDetail, KnowledgeNode, Strategy } from '../types';

type Modal = null | 'plan' | 'node' | 'source' | 'relation' | 'discover';

/** 연구 기록·결과물. 노드·근거·타임라인은 그대로 보존하되, 연구의 이야기(무엇을 왜 시도했고 무엇이 나왔나)로 읽히게 다시 엮는다. */
export function StudyRecordsView({ ctx }: { ctx: ResearchCtx }) {
  const cache = useQueryClient();
  const snap = useSnapshot(ctx.studyId);
  const { dashboard } = useAdapters(ctx.studyId);
  const [modal, setModal] = useState<Modal>(null);
  const [lastUnit, setLastUnit] = useState('');
  const [report, setReport] = useState(false);
  const data = snap.data;
  const exps = (data?.experiments ?? []).slice(0, 12);
  const detailQs = useQueries({ queries: exps.map(x => ({ queryKey: [...rk(), 'experiment', x.id], queryFn: () => getExperiment(x.id), staleTime: 30_000 })) });
  const details = detailQs.flatMap(q => (q.data ? [q.data] : [])) as ExperimentDetail[];
  const adopted = (data?.best_results ?? dashboard?.best_results ?? []).filter(b => b.study_id === ctx.studyId || !b.study_id);
  const wins = adopted.filter(b => b.status === 'adopted');
  const rejected = adopted.filter(b => b.status === 'rejected');
  const winDetail = wins[0];
  const winRun = useQuery({ queryKey: [...rk(), 'run', winDetail?.run_id], queryFn: () => getRun(winDetail?.run_id as string), enabled: !!winDetail?.run_id });
  const hypoMethods = useQuery({ queryKey: [...rk(), 'methods', 'hypothesis-open'], queryFn: () => listMethods({ lifecycle_status: ['hypothesis', 'candidate'] }, 0, 6), staleTime: 60_000 });
  const exportM = useMutation({
    mutationFn: (promote: boolean) => exportReport(ctx.studyId as string, { experiment_ids: exps.map(x => x.id), promote_to_library: promote }),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: KEY }); toast({ message: '리포트를 만들어 결과물에 연결했습니다.', tone: 'success' }); setReport(false); },
    onError: e => toast({ message: errorText(e), tone: 'danger' }),
  });

  if (!ctx.studyId) return <Empty title="기록을 볼 연구를 고르세요" action={<Button variant="primary" onClick={ctx.openStudyForm}>새 연구 만들기</Button>}>위의 연구 선택에서 연구를 고르면 목표, 시도한 방법, 결과, 결론을 한 흐름으로 봅니다.</Empty>;
  if (snap.isPending) return <Skeleton rows={5} />;
  if (snap.error || !data) return <Callout kind="caution">{errorText(snap.error)} <Button size="sm" onClick={() => void snap.refetch()}>다시 불러오기</Button></Callout>;

  const { study, nodes, evidence, relations, timeline } = data;
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const hypotheses = nodes.filter(n => n.kind === 'hypothesis');
  const evidenceNodes = nodes.filter(n => n.kind === 'claim' || n.kind === 'finding' || n.evidence_id);
  const decisions = nodes.filter(n => n.kind === 'decision');
  const detailOf = (id: string) => details.find(d => d.experiment.id === id);
  const failures = details.flatMap(d => d.runs.filter(r => r.status === 'failed').map(r => ({ d, r })));
  const artifacts = details.flatMap(d => d.artifacts.map(a => ({ ...a, exp: d.experiment.name })));
  const followHypo = hypotheses.filter(h => !exps.some(x => x.hypothesis_node_id === h.id));
  const nodeCard = (n: KnowledgeNode) => {
    const ev = evidence.find(e => e.id === n.evidence_id);
    return <article className="rs-note" key={n.id}>
      <div className="rs-detail__badges"><Badge>{KIND[n.kind] ?? n.kind}</Badge><Badge tone={n.epistemic_status === 'locally_measured' ? 'success' : n.epistemic_status === 'unverified' ? undefined : 'info'}>{EPISTEMIC[n.epistemic_status] ?? n.epistemic_status}</Badge>{n.supersedes_id && <Badge tone="warning">기존 기록 정정</Badge>}</div>
      <h4>{n.title}</h4>{n.summary && <p className="rs-prose">{n.summary}</p>}
      {ev && <blockquote className="rs-quote"><p>{ev.quote}</p><footer>{safeLink(ev.locator) ? <a href={safeLink(ev.locator)} target="_blank" rel="noreferrer">{ev.source_key}</a> : ev.source_key}{!ev.active && ' · 이전 원문 버전'}<details><summary>출처 지문</summary><code className="tk-mono">{ev.sha256}</code></details></footer></blockquote>}
      {Object.keys(n.conditions ?? {}).length > 0 && <details className="rs-advanced"><summary>적용 조건</summary><FactList data={n.conditions} /></details>}
    </article>;
  };

  return <div className="rs-records">
    <header className="rs-records__head">
      <div className="rs-detail__badges"><Badge tone="info">{PHASE[study.phase] ?? study.phase}</Badge><Badge>{study.scope === 'work' ? '회사' : '개인'}</Badge></div>
      <h2>{study.title}</h2>
      <p className="rs-prose rs-prewrap">{study.goal}</p>
      {study.criteria.length > 0 && <div className="tk-chips tk-chips--wrap" aria-label="평가 기준">{study.criteria.map(c => <span key={c} className="rs-tag">{c}</span>)}</div>}
      <div className="rs-actions">
        <Button size="sm" onClick={() => setModal('plan')}>단계·다음 작업 편집</Button>
        <Button size="sm" onClick={() => setModal('discover')}>논문 찾기</Button>
        <Button size="sm" onClick={() => setModal('source')}>원문 연결</Button>
        <Button size="sm" onClick={() => setModal('node')}>지식 기록</Button>
        {nodes.length > 1 && <Button size="sm" onClick={() => setModal('relation')}>관계 연결</Button>}
        <Button size="sm" variant="primary" disabled={!exps.length} onClick={() => setReport(true)}>리포트 만들기</Button>
      </div>
      {data.truncated && <Callout kind="warning">요약에는 일부 기록만 표시됩니다. 아래 ‘전체 기록 찾아보기’에서 이어서 볼 수 있습니다.</Callout>}
    </header>

    <Section title="시도한 방법과 결과" hint={`${exps.length}개 실험 · 실패한 시도도 그대로 둡니다`}>
      {!exps.length && <p className="rs-muted">아직 실험이 없습니다. 방법론 탭에서 방법을 고르고 실험을 설계하세요. 실행하지 않은 실험은 결과로 표시하지 않습니다.</p>}
      {exps.map((x, i) => {
        const d = detailOf(x.id); const q = detailQs[i];
        const n = d ? narrate(d) : null;
        return <article className="rs-note" key={x.id}>
          <h4>{experimentName(x)}</h4>
          <p className="rs-muted">{adapterLabel(x.adapter_id ?? x.adapter ?? '')} · {STRATEGY[x.strategy as Strategy]?.label ?? x.strategy ?? '단일'}{x.hypothesis_node_id && nodeById.get(x.hypothesis_node_id) ? ` · 가설: ${nodeById.get(x.hypothesis_node_id)?.title}` : ''}</p>
          {x.hypothesis && <p className="rs-prose">가설: {x.hypothesis}</p>}
          {q?.isPending && <Skeleton rows={1} />}
          {n && <p className="rs-prose">{n.text}</p>}
          {d && <div className="rs-detail__badges">{[...new Set(d.runs.map(r => r.execution_origin))].map(o => <OriginBadge key={o} origin={o} />)}{n?.improved === true && <Badge tone="success">▲ 개선</Badge>}{n?.improved === false && <Badge tone="danger">▼ 개선 없음·퇴보</Badge>}</div>}
          {d?.latest_analysis?.recommendation_ko && <p className="rs-muted">{d.latest_analysis.recommendation_ko}</p>}
          <div className="rs-actions"><Button size="xs" onClick={() => ctx.go({ view: 'analysis', experiment: x.id })}>결과 분석</Button><Button size="xs" variant="ghost" onClick={() => ctx.go({ view: 'monitor', experiment: x.id })}>실행 기록</Button></div>
        </article>;
      })}
    </Section>

    <Section title="가설과 검증 상태">
      {!hypotheses.length ? <p className="rs-muted">기록된 가설이 없습니다. 실험을 설계할 때 가설을 적으면 여기에 남습니다.</p> : hypotheses.map(h => {
        const linked = exps.filter(x => x.hypothesis_node_id === h.id);
        return <article className="rs-note" key={h.id}><h4>{h.title}</h4>{h.summary && <p className="rs-prose">{h.summary}</p>}
          <p className="rs-muted">{linked.length ? `검증 실험 ${linked.length}개: ${linked.map(experimentName).join(', ')}` : '아직 이 가설을 검증하는 실험이 없습니다.'}</p></article>;
      })}
    </Section>

    <Section title="성공과 실패의 근거" hint="무엇이 나아졌고 무엇이 안 되었는지, 그 근거가 된 기록입니다.">
      <div className="rs-two">
        <div><h4>잘 된 것</h4>{wins.length ? <ul className="rs-rellist">{wins.map(b => <li key={b.id}><strong>{bestLabel(b)}</strong>{adoptionBasis(b).map(t => <span key={t} className="rs-muted"> · {t}</span>)}<p className="rs-prose rs-prewrap">{b.rationale}</p></li>)}</ul> : <p className="rs-muted">채택된 결과가 아직 없습니다.</p>}
          {decisions.filter(d => !wins.some(w => w.decision_node_id === d.id)).map(nodeCard)}</div>
        <div><h4>안 된 것·기각</h4>
          {rejected.map(b => <p key={b.id} className="rs-prose"><strong>기각</strong> · {bestLabel(b)}<br /><span className="rs-prewrap">{b.rationale}</span></p>)}
          {failures.map(({ d, r }) => <p key={r.id} className="rs-prose"><strong>{d.experiment.name}</strong> · 실행 실패<br /><span className="rs-reason">{r.error_code ? `${r.error_code}: ` : ''}{r.error_message || '원인이 기록되지 않았습니다.'}</span></p>)}
          {details.filter(d => narrate(d).improved === false).map(d => <p key={d.experiment.id} className="rs-prose"><strong>{d.experiment.name}</strong> · 개선 없음<br /><span className="rs-muted">{narrate(d).text}</span></p>)}
          {!rejected.length && !failures.length && !details.some(d => narrate(d).improved === false) && <p className="rs-muted">기록된 실패·기각이 없습니다. 없다는 뜻이 아니라 아직 시도하지 않았다는 뜻일 수 있습니다.</p>}</div>
      </div>
    </Section>

    <Section title="논문과 근거" hint="논문·원문의 주장과 따까리가 직접 측정한 결과를 구분해 표시합니다.">
      {!evidenceNodes.length && <p className="rs-muted">연결된 원문이 없습니다. ‘논문 찾기’나 ‘원문 연결’로 근거를 추가하세요.</p>}
      {evidenceNodes.map(nodeCard)}
    </Section>

    <Section title="결론과 채택한 설정">
      {!wins.length ? <p className="rs-muted">아직 채택한 설정이 없습니다. 결과 분석에서 목표·지표·제약을 적고 채택하면 여기에 결론으로 남습니다.</p> : wins.map(b => {
        const d = b.experiment_id ? detailOf(b.experiment_id) : details.find(x => x.experiment.name === b.experiment_title);
        const cfg = d?.configurations.find(c => (b.configuration_id ? c.id === b.configuration_id : c.label === b.configuration_label));
        return <article className="rs-note rs-note--win" key={b.id}>
          <h4>{b.configuration_label ?? cfg?.label ?? bestLabel(b)}</h4>
          {adoptionBasis(b).length > 0 && <ul className="rs-bullets">{adoptionBasis(b).map(t => <li key={t}>{t}</li>)}</ul>}
          <p className="rs-prose rs-prewrap">{b.rationale}</p>
          {cfg && <dl className="tk-meta">{Object.entries(cfg.parameters).map(([k, v]) => <div key={k} className="rs-meta-row"><dt>{k}</dt><dd className="tk-mono">{stringify(v)}</dd></div>)}</dl>}
          <p className="rs-muted">{fmtTime(b.created_at)} 기록 · {d ? d.experiment.name : ''}</p>
          {b.experiment_id && b.configuration_id && <div className="rs-actions">
            <Button size="sm" variant="ghost" onClick={() => ctx.go({
              view: 'designer',
              study: ctx.studyId,
              reuse_study: b.study_id || ctx.studyId,
              reuse_experiment: b.experiment_id ?? null,
              reuse_configuration: b.configuration_id ?? null,
              reuse_run: b.run_id || null,
            })}>채택한 설정으로 후속 실험</Button>
          </div>}
        </article>;
      })}
    </Section>

    <Section title="결과물" hint="음성·리포트·측정 표입니다. 원본은 파일 보관함에서 관리됩니다.">
      {!artifacts.length ? <p className="rs-muted">연결된 결과물이 없습니다.</p> : details.filter(d => d.artifacts.length).map(d => <div key={d.experiment.id} className="rs-artgroup"><h4>{d.experiment.name}</h4><ArtifactList artifacts={d.artifacts} onChanged={() => void cache.invalidateQueries({ queryKey: KEY })} /></div>)}
    </Section>

    <Section title="재현 환경" hint="결과를 다시 만들려면 필요한 조건입니다.">
      <h4>연구 환경</h4><FactList data={study.environment} empty="연구 환경이 기록되지 않았습니다." />
      {winRun.data && <><h4>채택한 실행의 환경</h4><FactList data={winRun.data.environment_snapshot} empty="채택한 실행의 환경이 기록되지 않았습니다." /></>}
    </Section>

    <Section title="후속 연구 후보" actions={<Button size="sm" variant="ghost" onClick={() => setModal('plan')}>편집</Button>}>
      {study.next_actions.length ? <ol className="rs-bullets">{study.next_actions.map((a, i) => <li key={i}>{a}</li>)}</ol> : <p className="rs-muted">다음에 확인할 질문과 필요한 검증을 남겨 두세요.</p>}
      {followHypo.length > 0 && <><h4>아직 검증하지 않은 가설</h4><ul className="rs-bullets">{followHypo.map(h => <li key={h.id}>{h.title}</li>)}</ul></>}
      {!!hypoMethods.data?.items.length && <><h4>카탈로그의 가설·후보 방법</h4><ul className="rs-rellist">{hypoMethods.data.items.map(m => <li key={m.id}><button type="button" className="tk-link" onClick={() => ctx.go({ view: 'library', method: m.slug })}>{m.name_ko || m.name}</button></li>)}</ul></>}
    </Section>

    <Section title="연구의 흐름" hint="변경할 수 없는 기록입니다.">
      <ol className="tk-timeline">{timeline.map(t => <li key={t.id} data-state="succeeded"><span className="tk-timeline__node" aria-hidden="true" />
        <div className="tk-timeline__body"><span className="tk-timeline__title">{EVENT[t.kind] ?? t.kind}</span><span className="tk-timeline__meta"><time dateTime={t.created_at}>{fmtTime(t.created_at)}</time> · {t.actor}</span>
          {Object.keys(t.payload ?? {}).length > 0 && <details className="rs-advanced"><summary>세부 기록</summary><FactList data={t.payload} /></details>}</div></li>)}</ol>
      {!timeline.length && <p className="rs-muted">기록된 이벤트가 없습니다.</p>}
    </Section>

    {nodes.length > 0 && <details className="rs-ledger"><summary>요약에 포함된 지식 {nodes.length}개 · 관계 {relations.length}개</summary>
      {nodes.map(nodeCard)}
      {relations.map(r => <p key={r.id} className="rs-prose"><strong>{nodeById.get(r.from_id)?.title ?? r.from_id}</strong> <span className="rs-tag">{r.predicate}</span> <strong>{nodeById.get(r.to_id)?.title ?? r.to_id}</strong><br /><span className="rs-muted">{r.rationale} · 조건부 관계 제안, 인과 확정 아님</span></p>)}
    </details>}
    <RecordArchive key={study.id} studyId={study.id} onExperiment={id => ctx.go({ view: 'analysis', experiment: id })} />

    {modal === 'plan' && <PlanEditModal study={study} onClose={() => setModal(null)} />}
    {modal === 'node' && <NodeFormModal studyId={study.id} unitId={lastUnit} onClose={() => setModal(null)} />}
    {modal === 'source' && <SourceFormModal studyId={study.id} onClose={() => setModal(null)} onSaved={setLastUnit} />}
    {modal === 'relation' && <RelationFormModal studyId={study.id} nodes={nodes} onClose={() => setModal(null)} />}
    {modal === 'discover' && <DiscoverModal studyId={study.id} onClose={() => setModal(null)} onSaved={setLastUnit} />}
    {report && <ReportDialog count={exps.length} pending={exportM.isPending} onClose={() => setReport(false)} onGo={p => exportM.mutate(p)} />}
  </div>;
}

function ReportDialog({ count, pending, onClose, onGo }: { count: number; pending: boolean; onClose: () => void; onGo: (promote: boolean) => void }) {
  const [promote, setPromote] = useState(false);
  return <Dialog open onClose={onClose} size="sm" title="연구 리포트 만들기" modal footer={<><Button variant="ghost" onClick={onClose}>닫기</Button><Button variant="primary" busy={pending} onClick={() => onGo(promote)}>만들기</Button></>}>
    <div className="rs-form"><p>이 연구의 실험 {count}개를 요약한 Markdown 리포트를 만들어 결과물에 연결합니다.</p>
      <label className="tk-checkbox"><input type="checkbox" checked={promote} onChange={e => setPromote(e.target.checked)} /> 파일 보관함에도 보관</label>
      <p className="rs-muted">보관하지 않으면 연구에만 연결되어 파일 보관함이 어지러워지지 않습니다.</p></div>
  </Dialog>;
}
