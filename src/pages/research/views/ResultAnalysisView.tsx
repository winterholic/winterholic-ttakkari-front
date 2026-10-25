import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { Badge } from '../../../ui/Badge';
import { Select } from '../../../ui/Select';
import { analyzeExperiment, errorText, getCompareSeries, getExperiment } from '../api';
import { ArtifactList } from '../components/ArtifactList';
import { BestResultPanel } from '../components/BestResultPanel';
import { OriginBadge, ProxyBadge, RunStateBadge } from '../components/ExecutionStatusBadge';
import { Callout, Chip, Empty, Section, Skeleton } from '../components/parts';
import { DeltaBarChart } from '../charts/DeltaBarChart';
import { MetricComparisonBar } from '../charts/MetricComparisonBar';
import { ParetoScatterPlot } from '../charts/ParetoScatterPlot';
import { RepeatDistributionPlot } from '../charts/RepeatDistributionPlot';
import { SweepLineChart } from '../charts/SweepLineChart';
import type { ResearchCtx } from '../context';
import { DIRECTION_TEXT, fmtPct, fmtValue, shortId, stringify, verdictOf, VERDICT_TEXT } from '../format';
import { experimentName, KEY, useAdapters, useSnapshot, rk } from '../hooks';
import { adapterLabel, STRATEGY } from '../labels';
import { comparabilityCaveats, deriveSeries, failedRuns, localParetoReason, metricsOf, paretoFor, pickBaseline, stats, usableMeasurements, valuesByConfig } from '../series';
import type { Strategy } from '../types';

/** 결과 비교·분석: baseline 대비 개선·퇴보, 다지표, 반복 분포, trade-off, 설정 차이, 비교 불가 경고, 실패 실행, 채택까지. 원본 JSON 은 기본 화면에 없다. */
export function ResultAnalysisView({ ctx }: { ctx: ResearchCtx }) {
  const cache = useQueryClient();
  const snap = useSnapshot(ctx.studyId);
  const { dashboard } = useAdapters(ctx.studyId);
  const exps = snap.data?.experiments ?? [];
  const expId = ctx.experimentId;
  const detailQ = useQuery({ queryKey: [...rk(), 'experiment', expId], queryFn: () => getExperiment(expId as string), enabled: !!expId });
  const detail = detailQ.data;
  const [baselineChoice, setBaselineChoice] = useState<string | null>(null);
  const baselineId = detail ? pickBaseline(detail, baselineChoice) : null;
  const [metricChoice, setMetricChoice] = useState<string | null>(null);
  const [paretoX, setParetoX] = useState('');
  const [paretoY, setParetoY] = useState('');

  const usable = useMemo(() => (detail ? usableMeasurements(detail) : []), [detail]);
  const metrics = useMemo(() => metricsOf(usable), [usable]);
  const byCfg = useMemo(() => valuesByConfig(usable), [usable]);
  const primary = detail?.experiment.primary_metric ?? '';
  const metricKey = metricChoice && metrics.some(m => m.key === metricChoice) ? metricChoice : metrics.find(m => m.key === primary)?.key ?? metrics[0]?.key ?? '';
  const metric = metrics.find(m => m.key === metricKey);
  const caveats = detail ? comparabilityCaveats(detail, baselineId) : [];
  const bad = detail ? failedRuns(detail.runs) : [];
  const cfgLabel = (id: string) => detail?.configurations.find(c => c.id === id)?.label ?? shortId(id);
  const baselineLabel = baselineId ? cfgLabel(baselineId) : undefined;

  // 파레토 축 기본값: 주요 지표를 y 로, 낮을수록 좋은 다른 지표(비용·메모리)를 x 로
  const defaultY = metricKey;
  const defaultX = metrics.find(m => m.key !== defaultY && m.direction === 'lower_is_better')?.key ?? metrics.find(m => m.key !== defaultY)?.key ?? '';
  const px = metrics.some(m => m.key === paretoX) ? paretoX : defaultX;
  const py = metrics.some(m => m.key === paretoY) ? paretoY : defaultY;

  // 서버 compare-series 연결: experiment / baseline / 두 Pareto 축을 query key 및 질의 파라미터에 모두 포함
  const compareQ = useQuery({
    queryKey: [...rk(), 'compare-series', expId, baselineId, px, py],
    queryFn: () => getCompareSeries(expId as string, { baselineId, paretoX: px || undefined, paretoY: py || undefined }),
    enabled: !!expId && !!detail,
  });

  // 실제 성공 응답이 구형 형태(null)였던 경우에만 로컬 계산을 대체로 쓴다.
  // 초기 대기·비활성·새 key 대기·최초 오류는 로컬 비교 결과로 채우지 않는다.
  const isServerSeries = !!compareQ.data;
  const hasSuccessfulLegacyResponse = compareQ.data === null && compareQ.dataUpdatedAt > 0;
  const series = compareQ.data ?? (hasSuccessfulLegacyResponse && detail ? deriveSeries(detail, baselineId) : null);

  const analyze = useMutation({
    mutationFn: () => analyzeExperiment(expId as string, { baseline_configuration_id: baselineId, pareto_x_metric: px || undefined, pareto_y_metric: py || undefined }),
    // KEY 하나가 detail·compare-series 를 모두 덮는다. 활성 질의는 이 호출에서 한 번만 다시 받는다.
    onSuccess: () => { void cache.invalidateQueries({ queryKey: KEY }); },
  });

  if (!exps.length && !expId) return <Empty title="분석할 실험이 없습니다" action={<Button variant="primary" onClick={() => ctx.go({ view: 'designer' })}>실험 설계하기</Button>}>
    {ctx.studyId ? '이 연구에는 아직 실험이 없습니다. 실험을 만들고 실행하면 결과를 여기서 비교합니다.' : '연구를 고르면 그 연구의 실험 결과를 비교할 수 있습니다.'}</Empty>;

  const rowsStat = (cfgId: string, key: string) => stats(byCfg.get(cfgId)?.get(key) ?? []);
  const bestOf = (key: string) => {
    const m = metrics.find(x => x.key === key); if (!m || !detail) return null;
    const vals = detail.configurations.map(c => ({ id: c.id, v: rowsStat(c.id, key).mean })).filter((x): x is { id: string; v: number } => x.v !== null);
    if (vals.length < 2) return null;
    return vals.reduce((a, b) => ((m.direction === 'higher_is_better' ? b.v > a.v : b.v < a.v) ? b : a)).id;
  };
  const adopted = (dashboard?.best_results ?? []).filter(b => (b.experiment_id ? b.experiment_id === expId : b.experiment_title === detail?.experiment.name));
  const deltas = series?.delta_bars.filter(d => d.metric_key === metricKey) ?? [];

  return <div className="rs-analysis">
    <div className="rs-analysis__bar">
      <div className="tk-field rs-analysis__sel"><label className="tk-label" id="an-exp-l" htmlFor="an-exp">분석할 실험</label>
        <Select id="an-exp" labelledBy="an-exp-l" value={expId ?? ''} options={[{ value: '', label: '실험을 고르세요' }, ...exps.map(x => ({ value: x.id, label: experimentName(x) }))]} onChange={v => { setBaselineChoice(null); setMetricChoice(null); ctx.go({ experiment: v || null }, { replace: true }); }} /></div>
      {detail && <div className="tk-field rs-analysis__sel"><label className="tk-label" id="an-base-l" htmlFor="an-base">Baseline (기준 설정)</label>
        <Select id="an-base" labelledBy="an-base-l" value={baselineId ?? ''} options={[{ value: '', label: '지정 안 함' }, ...detail.configurations.map(c => ({ value: c.id, label: c.label }))]} onChange={v => setBaselineChoice(v || null)} /></div>}
    </div>

    {!expId && <Empty title="실험을 고르세요">위에서 실험을 고르면 설정별 결과를 비교합니다.</Empty>}
    {expId && detailQ.isPending && <Skeleton rows={4} />}
    {detailQ.error && <Callout kind="caution">{errorText(detailQ.error)} <Button size="sm" onClick={() => void detailQ.refetch()}>다시 불러오기</Button></Callout>}
    {compareQ.error && <Callout kind="caution" title={compareQ.dataUpdatedAt > 0 ? '이전 비교 결과' : undefined}>
      {compareQ.dataUpdatedAt > 0 && <p>아래 비교는 마지막으로 성공한 응답입니다. 최신 결과를 받지 못했습니다.</p>}
      <p>{errorText(compareQ.error)} <Button size="sm" onClick={() => void compareQ.refetch()}>비교 데이터 다시 불러오기</Button></p>
    </Callout>}

    {detail && <header className="rs-analysis__head">
        <h2>{detail.experiment.name}</h2>
        <p className="rs-muted">{adapterLabel(detail.experiment.adapter_id)} · {STRATEGY[detail.experiment.strategy as Strategy]?.label ?? detail.experiment.strategy} · 주요 지표 {metrics.find(m => m.key === primary)?.label ?? primary} · 설정 {detail.configurations.length}개 · 실행 {detail.runs.length}개</p>
        <div className="rs-detail__badges">{[...new Set(detail.runs.map(r => r.execution_origin))].map(o => <OriginBadge key={o} origin={o} />)}</div>
      </header>}

    {detail && <>
      {caveats.length > 0 && <Section title="비교 전에 확인하세요">
        <ul className="rs-checks">{caveats.map((c, i) => <li key={i} data-tone={c.tone === 'danger' ? 'danger' : c.tone === 'warning' ? 'warning' : 'info'}><span className="rs-checks__mark" aria-hidden="true">{c.tone === 'danger' ? '✕' : c.tone === 'warning' ? '!' : 'i'}</span><span>{c.text}</span></li>)}</ul>
      </Section>}

      {detail.latest_analysis?.recommendation_ko && <Callout kind="tip" title="자동 수치 요약">
        <p>{detail.latest_analysis.recommendation_ko}</p><p className="rs-muted">규칙으로 만든 수치 요약입니다. 원인을 해석한 것이 아니며, 입력·환경이 같은 비교일 때만 의미가 있습니다.</p></Callout>}

      {series ? <>
      {!usable.length ? <Callout kind="warning" title="비교할 측정값이 없습니다">성공한 실행의 측정이 없어 차트를 그리지 않았습니다. {bad.length ? '실패·취소한 실행은 아래에 있습니다.' : '실행을 마친 뒤 다시 확인하세요.'}</Callout> : <>
        <Section title="설정별 결과" hint="평균은 성공한 실행만 센 값입니다. ★ 는 그 지표 하나에서의 최고이며 전면 최적이 아닙니다.">
          <div className="tk-datatable tk-datatable--sticky-col">
            <div className="tk-datatable__scroll" role="region" aria-label="설정별 결과 표 (가로로 스크롤)" tabIndex={0}>
              <table><thead><tr><th scope="col">설정</th><th scope="col">성공 n</th>{metrics.map(m => <th key={m.key} scope="col" className="tk-datatable__num" title={DIRECTION_TEXT[m.direction]}>{m.label}{m.unit ? ` (${m.unit})` : ''}{m.is_proxy ? ' · 간접' : ''}</th>)}</tr></thead>
                <tbody>{detail.configurations.map(c => {
                  const n = detail.runs.filter(r => r.configuration_id === c.id && r.status === 'succeeded').length;
                  const base = c.id === baselineId;
                  return <tr key={c.id} aria-selected={base}>
                    <th scope="row" className="tk-datatable__clip" title={c.label}>{c.label}{base && <> <Badge tone="info">기준</Badge></>}{c.role === 'ablation_drop' && <> <Badge>제거</Badge></>}</th>
                    <td className="tk-datatable__num">{n}</td>
                    {metrics.map(m => {
                      const s = rowsStat(c.id, m.key); const b = baselineId ? rowsStat(baselineId, m.key).mean : null;
                      // 서버 시리즈가 있으면 서버 delta 만 쓴다(없는 칸은 —). 로컬 계산은 legacy 성공(null) 응답일 때만.
                      const serverDelta = isServerSeries ? series?.delta_bars.find(d => d.configuration_id === c.id && d.metric_key === m.key) : undefined;
                      const rel = isServerSeries ? serverDelta?.rel_delta_pct ?? null : !base && s.mean !== null && b ? ((s.mean - b) / Math.abs(b)) * 100 : null;
                      const v = verdictOf(rel, m.direction);
                      return <td key={m.key} className="tk-datatable__num" data-best={bestOf(m.key) === c.id ? 'true' : undefined}>
                        {s.mean === null ? <span className="rs-muted">측정 없음</span> : <>{fmtValue(s.mean)}{bestOf(m.key) === c.id ? ' ★' : ''}
                          {s.n >= 2 && s.std !== null ? <span className="rs-muted"> ±{fmtValue(s.std)}</span> : <span className="rs-muted"> · 변동성 미상</span>}
                          {!base && rel !== null && <span className="rs-delta" data-verdict={v}> {VERDICT_TEXT[v].mark} {fmtPct(rel)} {VERDICT_TEXT[v].word}</span>}
                          {!base && rel === null && isServerSeries && <span className="rs-muted"> —</span>}</>}</td>;
                    })}</tr>;
                })}</tbody></table>
            </div></div>
        </Section>

        <Section title="Baseline 대비 변화" actions={<div className="tk-chips" role="group" aria-label="지표 선택">{metrics.map(m => <Chip key={m.key} pressed={m.key === metricKey} onClick={() => setMetricChoice(m.key)}>{m.label}</Chip>)}</div>}>
          {metric?.is_proxy && <Callout kind="warning" title="간접 지표입니다"><p>{metric.label}은(는) 목표 품질을 직접 재지 않습니다. 예를 들어 STT 재인식 오류율은 발음 명료도의 대리 지표이고, 실제 청취 품질·자연스러움은 직접 들어서 판단해야 합니다. <ProxyBadge metricKey={metric.key} /></p></Callout>}
          {detail.experiment.strategy === 'ablation' && <Callout kind="note">Ablation 실험입니다. 요소를 뺀 설정이 나빠지는 것은 정상이며, 많이 나빠질수록 그 요소의 기여가 크다는 뜻입니다. 요소별 기여는 아래 ‘Ablation 영향’에서 봅니다.</Callout>}
          {!baselineId ?<Callout kind="note">위에서 Baseline 을 지정하면 개선·퇴보를 계산합니다.</Callout> : metric && <DeltaBarChart items={deltas} metricLabel={metric.label} direction={metric.direction} baselineLabel={baselineLabel} />}
        </Section>

        <Section title="지표별 비교" hint="지표마다 단위와 좋은 방향이 달라 따로 그립니다.">
          <div className="rs-chartgrid">{series.metric_bars.map(g => <MetricComparisonBar key={g.metric_key} group={g} baselineId={baselineId} />)}</div>
        </Section>

        {metric && <Section title="반복 분포" hint="같은 설정을 여러 번 실행했을 때의 흩어짐입니다. 실행이 1회뿐이면 변동성을 알 수 없다고 표시합니다.">
          <RepeatDistributionPlot items={series.repeat_distributions.filter(d => d.metric_key === metricKey)} metricLabel={metric.label} unit={metric.unit} direction={metric.direction} />
        </Section>}

        {metrics.length >= 1 && <Section title="Trade-off · Pareto" hint="속도를 얻으면 메모리나 품질을 잃는 식의 상충을 봅니다. 축을 바꿔 보세요."
          actions={<div className="rs-axes"><div className="tk-field"><label className="tk-label" id="px-l" htmlFor="px">가로축</label><Select id="px" labelledBy="px-l" size="sm" value={px} options={metrics.map(m => ({ value: m.key, label: m.label }))} onChange={setParetoX} /></div>
            <div className="tk-field"><label className="tk-label" id="py-l" htmlFor="py">세로축</label><Select id="py" labelledBy="py-l" size="sm" value={py} options={metrics.map(m => ({ value: m.key, label: m.label }))} onChange={setParetoY} /></div></div>}>
          {(() => {
            if (isServerSeries && series) {
              if (series.pareto_status === 'unavailable') {
                return <Callout kind="note">{series.pareto_unavailable_reason || '두 축을 서로 다른 지표로 고르고, 두 지표가 모두 측정된 설정이 있어야 그릴 수 있습니다.'}</Callout>;
              }
              if (series.pareto && series.pareto.points.length > 0) {
                return <ParetoScatterPlot series={series.pareto} />;
              }
              return <Callout kind="note">{series.pareto_unavailable_reason || '두 축을 서로 다른 지표로 고르고, 두 지표가 모두 측정된 설정이 있어야 그릴 수 있습니다.'}</Callout>;
            }
            const localPareto = detail && px && py && px !== py ? paretoFor(detail, px, py) : null;
            if (localPareto && localPareto.points.length > 0) {
              return <ParetoScatterPlot series={localPareto} />;
            }
            const fallbackReason = localParetoReason(metrics.length, px, py) || '두 축을 서로 다른 지표로 고르고, 두 지표가 모두 측정된 설정이 있어야 그릴 수 있습니다.';
            return <Callout kind="note">{fallbackReason}</Callout>;
          })()}
        </Section>}

        {series.sweep_lines.filter(s => s.metric_key === metricKey).length > 0 && <Section title="파라미터 민감도 (Sweep)" hint="파라미터 값을 바꿀 때 지표의 변화입니다. 다른 파라미터가 함께 달라진 설정은 평균으로 묶였습니다.">
          <div className="rs-chartgrid">{series.sweep_lines.filter(s => s.metric_key === metricKey).slice(0, 4).map(s => <SweepLineChart key={`${s.parameter}-${s.metric_key}`} series={s} />)}</div>
        </Section>}

        {series.ablation_impacts.length > 0 && <Section title="Ablation 영향" hint="요소를 하나 뺐을 때 지표가 얼마나 나빠졌는지입니다. 클수록 그 요소가 기여했다는 뜻입니다.">
          {metric && <DeltaBarChart title={`${metric.label} — 요소 제거 시 기여도`} sub="오른쪽(▲)일수록 그 요소를 빼면 더 나빠집니다" metricLabel={metric.label} direction="higher_is_better"
            items={series.ablation_impacts.filter(a => a.metric_key === metricKey).map(a => ({ configuration_id: a.factor, label: a.factor, metric_key: a.metric_key, metric_label: a.metric_label ?? metric.label, rel_delta_pct: a.rel_impact_pct ?? null, abs_delta: a.impact, direction: 'higher_is_better', unit: a.unit }))} />}
        </Section>}

        {series.config_diff_table && <Section title="설정 차이" hint="설정마다 달라진 값만 강조합니다. 같은 값은 흐리게 보입니다.">
          <div className="tk-datatable tk-datatable--sticky-col tk-datatable--compact"><div className="tk-datatable__scroll" role="region" aria-label="설정 차이 표 (가로로 스크롤)" tabIndex={0}>
            <table><thead><tr><th scope="col">설정</th>{series.config_diff_table.keys.map(k => <th key={k} scope="col" data-changed={series.config_diff_table?.changed_keys?.includes(k) ? 'true' : undefined}>{k}</th>)}</tr></thead>
              <tbody>{series.config_diff_table.rows.map(r => <tr key={r.configuration_id}><th scope="row" className="tk-datatable__clip" title={r.label}>{r.label}</th>
                {series.config_diff_table?.keys.map(k => <td key={k} data-changed={series.config_diff_table?.changed_keys?.includes(k) ? 'true' : undefined}>{stringify(r.values?.[k])}</td>)}</tr>)}</tbody></table>
          </div></div>
        </Section>}
      </>}
      </> : compareQ.isPending ? <Skeleton rows={4} /> : null}

      <Section title="실패·취소한 실행" hint="결과에서 숨기지 않습니다. 실패 원인도 연구 자산입니다.">
        {bad.length ? <ul className="rs-rellist">{bad.map(r => <li key={r.id}><RunStateBadge status={r.status} /> <strong>{cfgLabel(r.configuration_id)}</strong> <span className="rs-muted">반복 {r.repeat_index}</span>
          <p className="rs-reason">{r.error_code ? `${r.error_code}: ` : ''}{r.error_message || '원인이 기록되지 않았습니다.'}</p>
          <Button size="xs" variant="ghost" onClick={() => ctx.go({ view: 'monitor', run: r.id })}>실행 상세</Button></li>)}</ul> : <p className="rs-muted">실패하거나 취소된 실행이 없습니다.</p>}
      </Section>

      {detail.artifacts.length > 0 && <Section title="결과물" hint="음성 샘플은 설정별로 직접 들어 보고 비교하세요. 자동 지표가 청취 품질을 대신하지 않습니다.">
        {detail.configurations.map(c => { const arts = detail.artifacts.filter(a => detail.runs.some(r => r.id === a.run_id && r.configuration_id === c.id)); return arts.length ? <div key={c.id} className="rs-artgroup"><h4>{c.label}</h4><ArtifactList artifacts={arts} onChanged={() => void detailQ.refetch()} /></div> : null; })}
        {detail.artifacts.filter(a => !a.run_id || !detail.runs.some(r => r.id === a.run_id)).length > 0 && <ArtifactList artifacts={detail.artifacts.filter(a => !a.run_id || !detail.runs.some(r => r.id === a.run_id))} />}
      </Section>}

      <Section title="최선 결과 채택" hint="‘최고’는 목표·지표·제약에 따라 달라집니다. 무엇에 대해 최적인지 적어야 기록할 수 있습니다.">
        {ctx.studyId && metrics.length > 0 ? <BestResultPanel key={detail.experiment.id} studyId={ctx.studyId} detail={detail} metrics={metrics} primaryMetric={metricKey} studyGoal={ctx.study?.goal}
          adopted={adopted} valueOf={(cfg, key) => rowsStat(cfg, key).mean} /> : <p className="rs-muted">측정값이 있어야 채택할 수 있습니다.</p>}
      </Section>

      <div className="rs-actions rs-analysis__foot">
        <Button onClick={() => analyze.mutate()} busy={analyze.isPending}>분석 스냅샷 갱신</Button>
        <Button variant="ghost" onClick={() => ctx.go({ view: 'monitor' })}>실행 모니터로</Button>
        {analyze.error && <span className="rs-reason">{errorText(analyze.error)}</span>}
      </div>
    </>}
  </div>;
}
