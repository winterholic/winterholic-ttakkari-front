import { useQuery } from '@tanstack/react-query';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { errorText, listMethods } from '../api';
import { ExecutionStatusBadge, OriginBadge, RunStateBadge } from '../components/ExecutionStatusBadge';
import { Callout, Empty, Section, Skeleton, Stat } from '../components/parts';
import type { ResearchCtx } from '../context';
import { bestLabel, fmtPct, fmtTime } from '../format';
import { useAdapters, rk } from '../hooks';
import { adapterLabel, PHASE, QUICK_STARTS } from '../labels';
import type { QuickStart, RecentRun } from '../types';

function runName(r: RecentRun) { return r.experiment_name ?? '실험 ' + r.experiment_id.slice(0, 8); }

/** 대시보드: 열자마자 무엇을 연구 중이고, 어떤 방법을 시도할 수 있으며, 어떤 결과가 나왔는지 본다. */
export function DashboardView({ ctx }: { ctx: ResearchCtx }) {
  const { adapters, dashboard, isPending, error, refetch } = useAdapters(ctx.studyId);
  const hypo = useQuery({ queryKey: [...rk(), 'methods', 'dash-hypothesis'], queryFn: () => listMethods({ lifecycle_status: ['hypothesis'] }, 0, 5), staleTime: 60_000 });
  const all = useQuery({ queryKey: [...rk(), 'methods', 'dash-all'], queryFn: () => listMethods({}, 0, 1), staleTime: 60_000 });
  const cand = useQuery({ queryKey: [...rk(), 'methods', 'dash-candidate'], queryFn: () => listMethods({ lifecycle_status: ['candidate'] }, 0, 5), staleTime: 60_000 });
  const d = dashboard;
  const runs = d?.recent_runs ?? [];
  const best = (d?.best_results ?? []).filter(b => b.status === 'adopted');
  const active = ctx.studies.filter(s => s.phase !== 'completed' && s.phase !== 'archived');
  const ok = runs.filter(r => r.status === 'succeeded').length;
  const failed = runs.filter(r => r.status === 'failed');
  const failReasons = Object.entries(failed.reduce<Record<string, number>>((m, r) => { const k = r.error_code || '원인 미기록'; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const unverified = runs.filter(r => r.status === 'succeeded' && !!r.execution_origin && r.execution_origin !== 'local_measured');
  const experimentsSeen = [...new Map(runs.map(r => [r.experiment_id, r])).values()].slice(0, 6);
  // 서버 템플릿에 화면 이동 정보가 있을 때만 쓰고, 없으면 시나리오 A~D 기본값을 쓴다
  const quick: QuickStart[] = d?.quick_start_templates?.some(t => t.view || t.filters) ? d.quick_start_templates : QUICK_STARTS;
  const execStatus = all.data?.facets.execution_status ?? {};
  const executable = (execStatus.immediately_executable ?? 0) + (execStatus.tool_integrated ?? 0);
  const methodTotal = all.data?.total ?? d?.counts.methods;

  const startQuick = (q: QuickStart) => {
    if (q.method === 'new') { ctx.go({ view: 'library', method: 'new' }); return; }
    const patch: Record<string, string | null> = { view: q.view ?? 'library', method: q.method ?? null };
    for (const [axis, vals] of Object.entries(q.filters ?? {})) patch[axis === 'research_method' ? 'rmethod' : axis === 'execution_status' ? 'status' : axis] = vals?.join(',') ?? null;
    ctx.go(patch);
  };

  return <div className="rs-dash">
    {error && <Callout kind="caution">{errorText(error)} <Button size="sm" onClick={() => void refetch()}>다시 불러오기</Button></Callout>}

    <Section title="빠른 시작" hint="대표 연구 흐름에서 바로 시작합니다.">
      <div className="rs-quick">{quick.map(q => <button key={q.id} type="button" className="rs-quick__card" onClick={() => startQuick(q)}>
        <span className="rs-quick__id" aria-hidden="true">{q.id.length <= 2 ? q.id : '▶'}</span><span className="rs-quick__title">{q.title}</span>{q.description && <span className="rs-quick__desc">{q.description}</span>}</button>)}</div>
    </Section>

    {isPending ? <Skeleton rows={3} /> : d && <dl className="tk-stats rs-dash__stats" aria-label="연구소 현황">
      <Stat label="진행 중인 연구" value={active.length} />
      <Stat label="등록된 방법" value={methodTotal?.toLocaleString('ko-KR') ?? '—'} />
      <Stat label="지금 실행 가능한 방법" value={all.data ? executable.toLocaleString('ko-KR') : '—'} delta={all.data && methodTotal ? Math.round((executable / methodTotal) * 100) + '% · 나머지는 일부 지원·가설·어댑터 필요' : undefined} />
      <Stat label="실행 중" value={d.counts.running_runs ?? 0} tone={d.counts.running_runs ? 'warning' : 'neutral'} />
      <Stat label="완료한 실행" value={d.counts.completed_runs ?? 0} />
    </dl>}

    <div className="rs-dash__grid">
      <Section title="진행 중인 연구" actions={<Button size="sm" onClick={ctx.openStudyForm}>새 연구</Button>}>
        {!active.length ? <Empty title="진행 중인 연구가 없습니다">목표를 정해 연구를 시작하고 방법을 시도해 보세요.</Empty> :
          <ul className="rs-rellist">{active.slice(0, 6).map(s => <li key={s.id}><button type="button" className="tk-link" onClick={() => ctx.go({ study: s.id, view: 'records' })}>{s.title}</button> <Badge tone="info">{PHASE[s.phase] ?? s.phase}</Badge>
            <p className="rs-muted rs-clamp">{s.goal}</p></li>)}</ul>}
      </Section>

      <Section title="최근 실험">
        {!experimentsSeen.length ? <p className="rs-muted">아직 실행한 실험이 없습니다.</p> : <ul className="rs-rellist">{experimentsSeen.map(r => <li key={r.experiment_id}>
          <button type="button" className="tk-link" onClick={() => ctx.go({ view: 'analysis', experiment: r.experiment_id, ...(r.study_id ? { study: r.study_id } : {}) })}>{runName(r)}</button> <RunStateBadge status={r.status} />{r.execution_origin && <> <OriginBadge origin={r.execution_origin} /></>}
          <p className="rs-muted">{r.adapter_id ? adapterLabel(r.adapter_id) + ' · ' : ''}{r.configuration_label ? r.configuration_label + ' · ' : ''}{fmtTime(r.finished_at ?? r.started_at ?? r.created_at)}</p></li>)}</ul>}
      </Section>

      <Section title="주요 성능 변화" hint="채택한 결과의 기준 대비 변화입니다. 지표와 조건은 각 결과에 적혀 있습니다.">
        {!best.length ? <p className="rs-muted">채택한 결과가 아직 없습니다. 결과 분석에서 목표·지표·제약을 적고 채택하세요.</p> : <ul className="rs-rellist">{best.slice(0, 5).map(b => <li key={b.id}><strong>{b.study_title ?? b.experiment_title ?? bestLabel(b)}</strong>
          {b.rel_delta_pct !== null && b.rel_delta_pct !== undefined && <> <Badge tone={b.rel_delta_pct === 0 ? undefined : 'info'}>{b.metric_label ?? b.primary_metric ?? '지표'} {fmtPct(b.rel_delta_pct)}</Badge></>}
          <p className="rs-muted rs-clamp">{b.summary ?? b.rationale.split('\n')[0]}</p></li>)}</ul>}
      </Section>

      <Section title="성공·실패 요약" hint={runs.length ? `최근 실행 ${runs.length}건 기준` : undefined}>
        {!runs.length ? <p className="rs-muted">최근 실행이 없습니다.</p> : <>
          <dl className="tk-stats"><Stat label="성공" value={ok} tone="positive" /><Stat label="실패" value={failed.length} tone={failed.length ? 'negative' : 'neutral'} /><Stat label="진행·대기" value={runs.filter(r => r.status === 'running' || r.status === 'queued').length} /></dl>
          {failReasons.length > 0 && <><p className="rs-muted">자주 나온 실패 원인</p><ul className="rs-bullets">{failReasons.map(([k, n]) => <li key={k}>{k} · {n}건</li>)}</ul></>}</>}
      </Section>

      <Section title="실행기 상태" actions={<Button size="sm" variant="ghost" onClick={() => ctx.go({ view: 'monitor' })}>모니터</Button>}>
        <ul className="rs-adapterlist">{adapters.map(a => <li key={a.adapter_id}><span>{adapterLabel(a.adapter_id)}</span> {a.adapter_id === 'external_report' ? <Badge tone="warning">직접 입력</Badge> : a.ready ? <Badge tone="success">준비됨</Badge> : <Badge tone="danger">사용 불가</Badge>}{a.reason && !a.ready && <span className="rs-reason">{a.reason}</span>}</li>)}
          {!adapters.length && !isPending && <li className="rs-muted">실행기 상태를 받지 못했습니다.</li>}</ul>
      </Section>

      <Section title="최적 결과물" hint="‘최적’은 목표·지표·제약에 따라 다릅니다.">
        {!best.length ? <p className="rs-muted">아직 없습니다.</p> : <ul className="rs-rellist">{best.slice(0, 4).map(b => <li key={b.id}><button type="button" className="tk-link" onClick={() => ctx.go({ view: 'records', study: b.study_id })}>{bestLabel(b)}</button>
          <p className="rs-muted rs-clamp">{b.rationale.split('\n')[0]}</p></li>)}</ul>}
      </Section>

      <Section title="검증이 필요한 결과" hint="외부 보고이거나 직접 측정하지 않은 결과, 아직 후보인 방법입니다.">
        {!unverified.length && !cand.data?.items.length ? <p className="rs-muted">검증이 필요한 항목이 없습니다.</p> : <ul className="rs-rellist">
          {unverified.slice(0, 4).map(r => <li key={r.id}><button type="button" className="tk-link" onClick={() => ctx.go({ view: 'analysis', experiment: r.experiment_id, ...(r.study_id ? { study: r.study_id } : {}) })}>{runName(r)}</button> {r.execution_origin && <OriginBadge origin={r.execution_origin} />}<p className="rs-muted">따까리 실측이 아닙니다. 직접 실행으로 확인하세요.</p></li>)}
          {cand.data?.items.map(m => <li key={m.id}><button type="button" className="tk-link" onClick={() => ctx.go({ view: 'library', method: m.slug })}>{m.name_ko || m.name}</button> <Badge tone="warning">후보</Badge> <ExecutionStatusBadge status={m.execution_status} /></li>)}</ul>}
      </Section>

      <Section title="다음 연구 후보">
        {!hypo.data?.items.length && !active.some(s => s.next_actions.length) ? <p className="rs-muted">등록된 가설이나 다음 작업이 없습니다. ‘새 방법·가설’로 아이디어를 남겨 두세요.</p> : <ul className="rs-rellist">
          {hypo.data?.items.map(m => <li key={m.id}><button type="button" className="tk-link" onClick={() => ctx.go({ view: 'library', method: m.slug })}>{m.name_ko || m.name}</button> <Badge tone="info">가설</Badge><p className="rs-muted rs-clamp">{m.summary}</p></li>)}
          {active.filter(s => s.next_actions.length).slice(0, 3).map(s => <li key={s.id}><span>{s.next_actions[0]}</span><p className="rs-muted">{s.title}</p></li>)}</ul>}
      </Section>
    </div>
  </div>;
}
