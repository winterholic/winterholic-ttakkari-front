// 실험 상세(configurations·runs·measurements)에서 비교 시리즈를 직접 계산한다.
// 서버 compare-series 는 주요 지표 한 개만 담고 필드 모양이 설계 문서와 달라, 화면은 이 계산을 쓴다.
import { fmtValue, type Direction } from './format';
import type {
  AblationImpact, CompareSeries, ConfigDiff, Configuration, DeltaBarItem, ExperimentDetail, Measurement, MetricBarGroup, ParetoSeries, RepeatDistributionItem, RunSummary, SweepLineSeries,
} from './types';

export interface MetricMeta { key: string; label: string; unit: string; direction: Direction; is_proxy: boolean }
export interface Stat { n: number; mean: number | null; median: number | null; std: number | null; min: number | null; max: number | null; values: number[] }

export function stats(values: number[]): Stat {
  const n = values.length;
  if (!n) return { n: 0, mean: null, median: null, std: null, min: null, max: null, values };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  // 표본 표준편차: n<2 면 변동성을 알 수 없다(null)
  const std = n < 2 ? null : Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return { n, mean, median, std, min: sorted[0], max: sorted[n - 1], values };
}

/** 성공한 실행의 측정만 쓴다. 실패·취소 실행은 별도로 보여 주되 평균에 섞지 않는다. */
export function usableMeasurements(detail: ExperimentDetail): Measurement[] {
  const ok = new Set(detail.runs.filter(r => r.status === 'succeeded').map(r => r.id));
  return detail.measurements.filter(m => ok.has(m.run_id) && (m.slice_key ?? 'overall') === 'overall');
}

export function metricsOf(measurements: Measurement[]): MetricMeta[] {
  const seen = new Map<string, MetricMeta>();
  for (const m of measurements) if (!seen.has(m.metric_key)) seen.set(m.metric_key, { key: m.metric_key, label: m.metric_label, unit: m.unit, direction: m.direction, is_proxy: m.is_proxy });
  return [...seen.values()];
}

/** 설정·지표별 실행 값 목록. 같은 실행에 같은 지표가 여럿이면 첫 값만 쓴다. */
export function valuesByConfig(measurements: Measurement[]): Map<string, Map<string, number[]>> {
  const perRun = new Map<string, number>();
  const out = new Map<string, Map<string, number[]>>();
  for (const m of measurements) {
    const rk = `${m.run_id}|${m.metric_key}`;
    if (perRun.has(rk)) continue;
    perRun.set(rk, m.value);
    const byMetric = out.get(m.configuration_id) ?? new Map<string, number[]>();
    byMetric.set(m.metric_key, [...(byMetric.get(m.metric_key) ?? []), m.value]);
    out.set(m.configuration_id, byMetric);
  }
  return out;
}

export function pickBaseline(detail: ExperimentDetail, chosen?: string | null): string | null {
  const ids = new Set(detail.configurations.map(c => c.id));
  if (chosen && ids.has(chosen)) return chosen;
  const fromExperiment = detail.experiment.baseline_configuration_id;
  if (fromExperiment && ids.has(fromExperiment)) return fromExperiment;
  return detail.configurations.find(c => c.role === 'baseline')?.id ?? null;
}

export function deriveSeries(detail: ExperimentDetail, baselineId: string | null): CompareSeries {
  const ms = usableMeasurements(detail);
  const metrics = metricsOf(ms);
  const byCfg = valuesByConfig(ms);
  const cfgs = [...detail.configurations].sort((a, b) => a.order_index - b.order_index);
  const stat = (cfgId: string, key: string) => stats(byCfg.get(cfgId)?.get(key) ?? []);

  const delta_bars: DeltaBarItem[] = [];
  const metric_bars: MetricBarGroup[] = [];
  const repeat_distributions: RepeatDistributionItem[] = [];
  for (const mt of metrics) {
    metric_bars.push({
      metric_key: mt.key, metric_label: mt.label, unit: mt.unit, direction: mt.direction, is_proxy: mt.is_proxy,
      values: cfgs.map(c => { const s = stat(c.id, mt.key); return { configuration_id: c.id, label: c.label, value: s.mean, n: s.n }; }),
    });
    const base = baselineId ? stat(baselineId, mt.key).mean : null;
    for (const c of cfgs) {
      const s = stat(c.id, mt.key);
      if (s.n) repeat_distributions.push({ configuration_id: c.id, label: c.label, metric_key: mt.key, metric_label: mt.label, unit: mt.unit, n: s.n, mean: s.mean, median: s.median, std: s.std, min: s.min, max: s.max, values: s.values, is_proxy: mt.is_proxy });
      if (c.id === baselineId) continue;
      const abs = s.mean !== null && base !== null ? s.mean - base : null;
      delta_bars.push({
        configuration_id: c.id, label: c.label, metric_key: mt.key, metric_label: mt.label, unit: mt.unit, direction: mt.direction, is_proxy: mt.is_proxy,
        abs_delta: abs, rel_delta_pct: abs !== null && base ? (abs / Math.abs(base)) * 100 : null,
      });
    }
  }

  return {
    delta_bars, metric_bars, repeat_distributions, pareto_points: [], pareto: null,
    sweep_lines: deriveSweeps(cfgs, byCfg, metrics),
    ablation_impacts: deriveAblation(cfgs, byCfg, metrics, baselineId),
    config_diff_table: deriveDiff(cfgs),
  };
}

function deriveSweeps(cfgs: Configuration[], byCfg: Map<string, Map<string, number[]>>, metrics: MetricMeta[]): SweepLineSeries[] {
  const keys = new Set<string>();
  cfgs.forEach(c => Object.keys(c.parameters ?? {}).forEach(k => keys.add(k)));
  const lines: SweepLineSeries[] = [];
  for (const key of keys) {
    const groups = new Map<number, string[]>();
    for (const c of cfgs) {
      const v = c.parameters?.[key];
      if (typeof v === 'number') groups.set(v, [...(groups.get(v) ?? []), c.id]);
    }
    if (groups.size < 3) continue; // 점 둘은 선이 아니라 비교다
    const xs = [...groups.keys()].sort((a, b) => a - b);
    for (const mt of metrics) {
      const points = xs.map(x => {
        const vals = (groups.get(x) ?? []).flatMap(id => byCfg.get(id)?.get(mt.key) ?? []);
        return { x, y: stats(vals).mean, n: vals.length };
      });
      if (points.some(p => p.y !== null)) lines.push({ parameter: key, metric_key: mt.key, metric_label: mt.label, unit: mt.unit, points });
    }
  }
  return lines;
}

function deriveAblation(cfgs: Configuration[], byCfg: Map<string, Map<string, number[]>>, metrics: MetricMeta[], baselineId: string | null): AblationImpact[] {
  const full = cfgs.find(c => c.id === baselineId) ?? cfgs.find(c => c.role === 'baseline');
  if (!full) return [];
  const out: AblationImpact[] = [];
  for (const c of cfgs.filter(x => x.role === 'ablation_drop')) {
    for (const mt of metrics) {
      const f = stats(byCfg.get(full.id)?.get(mt.key) ?? []).mean;
      const d = stats(byCfg.get(c.id)?.get(mt.key) ?? []).mean;
      if (f === null || d === null) continue;
      // 양수 = 이 요소를 빼면 나빠진다 = 요소가 기여한다
      const impact = mt.direction === 'higher_is_better' ? f - d : d - f;
      out.push({ factor: c.ablation_factor ?? c.label, metric_key: mt.key, metric_label: mt.label, full_value: f, drop_value: d, impact, rel_impact_pct: f ? (impact / Math.abs(f)) * 100 : null, unit: mt.unit });
    }
  }
  return out;
}

function deriveDiff(cfgs: Configuration[]): ConfigDiff | null {
  if (!cfgs.length) return null;
  const keys = [...new Set(cfgs.flatMap(c => Object.keys(c.parameters ?? {})))].sort();
  const changed = keys.filter(k => new Set(cfgs.map(c => JSON.stringify(c.parameters?.[k] ?? null))).size > 1);
  return { keys, changed_keys: changed, rows: cfgs.map(c => ({ configuration_id: c.id, label: c.label, role: c.role, values: c.parameters ?? {} })) };
}

/** 두 지표를 축으로 한 산점도 데이터. 파레토 최적은 두 축의 방향을 모두 고려한다. */
export function paretoFor(detail: ExperimentDetail, xKey: string, yKey: string): ParetoSeries | null {
  const ms = usableMeasurements(detail);
  const metrics = metricsOf(ms);
  const xm = metrics.find(m => m.key === xKey);
  const ym = metrics.find(m => m.key === yKey);
  if (!xm || !ym) return null;
  const byCfg = valuesByConfig(ms);
  const pts = detail.configurations.flatMap(c => {
    const x = stats(byCfg.get(c.id)?.get(xKey) ?? []).mean;
    const y = stats(byCfg.get(c.id)?.get(yKey) ?? []).mean;
    return x === null || y === null ? [] : [{ configuration_id: c.id, label: c.label, x, y, role: c.role, is_pareto_optimal: false }];
  });
  const better = (a: number, b: number, d: Direction) => (d === 'higher_is_better' ? a > b : a < b);
  for (const p of pts) {
    p.is_pareto_optimal = !pts.some(q => q !== p
      && (better(q.x, p.x, xm.direction) || q.x === p.x) && (better(q.y, p.y, ym.direction) || q.y === p.y)
      && (better(q.x, p.x, xm.direction) || better(q.y, p.y, ym.direction)));
  }
  return { x_metric: xKey, y_metric: yKey, x_label: xm.label, y_label: ym.label, x_unit: xm.unit, y_unit: ym.unit, x_direction: xm.direction, y_direction: ym.direction, points: pts };
}

export interface Caveat { tone: 'warning' | 'danger' | 'info'; text: string }

/** 비교 불가·주의 조건. 서버가 판정하지 않는 부분을 클라이언트가 보수적으로 알린다. */
export function comparabilityCaveats(detail: ExperimentDetail, baselineId: string | null): Caveat[] {
  const out: Caveat[] = [];
  const runs = detail.runs;
  const cfgs = detail.configurations;
  if (!cfgs.length) return out;
  if (!baselineId) out.push({ tone: 'warning', text: 'Baseline 설정이 지정되지 않아 개선·퇴보를 계산하지 않았습니다. 기준 설정을 고르세요.' });
  const okRuns = runs.filter(r => r.status === 'succeeded');
  if (!okRuns.length) out.push({ tone: 'warning', text: '성공한 실행이 없어 비교할 측정값이 없습니다.' });
  const origins = new Set(runs.map(r => r.execution_origin));
  if (origins.size > 1) out.push({ tone: 'warning', text: `실행 출처가 섞여 있습니다 (${[...origins].join(', ')}). 따까리 실측과 외부 보고를 같은 조건의 비교로 보지 마세요.` });
  if (origins.has('migrated_v1')) out.push({ tone: 'info', text: '이전 버전에서 이관된 실행은 환경·반복 정보가 없어 조건 동일성을 확인할 수 없습니다.' });
  const counts = new Map<string, number>();
  cfgs.forEach(c => counts.set(c.id, okRuns.filter(r => r.configuration_id === c.id).length));
  const nSet = new Set([...counts.values()].filter(n => n > 0));
  if (nSet.size > 1) out.push({ tone: 'warning', text: `설정마다 성공 실행 수가 다릅니다 (${[...nSet].sort().join('·')}회). 평균의 신뢰도가 서로 다릅니다.` });
  const bad = runs.filter(r => r.status === 'failed' || r.status === 'cancelled');
  if (bad.length) out.push({ tone: 'danger', text: `실패·취소된 실행이 ${bad.length}건 있습니다. 아래 목록에 그대로 남겨 두었고 평균에는 넣지 않았습니다.` });
  const none = cfgs.filter(c => !okRuns.some(r => r.configuration_id === c.id));
  if (none.length && okRuns.length) out.push({ tone: 'warning', text: `측정값이 없는 설정: ${none.map(c => c.label).join(', ')}` });
  if (!detail.experiment.dataset_version && detail.experiment.adapter_id !== 'external_report') out.push({ tone: 'info', text: '데이터셋 버전이 기록되지 않았습니다. 다른 입력으로 한 실험과 비교하려면 먼저 입력 동일성을 확인하세요.' });
  return out;
}

export function failedRuns(runs: RunSummary[]) { return runs.filter(r => r.status === 'failed' || r.status === 'cancelled'); }

export interface Narrative { text: string; ok: number; bad: number; total: number; bestLabel?: string; improved?: boolean | null }

/** 실험 한 건을 한 문단으로 요약한다. 수치만 쓰고 원인은 추정하지 않는다. */
export function narrate(detail: ExperimentDetail): Narrative {
  const runs = detail.runs;
  const ok = runs.filter(r => r.status === 'succeeded').length;
  const bad = runs.filter(r => r.status === 'failed' || r.status === 'cancelled').length;
  const head = `설정 ${detail.configurations.length}개, 실행 ${runs.length}회 중 성공 ${ok}회${bad ? `·실패/취소 ${bad}회` : ''}.`;
  if (!runs.length) return { text: '아직 실행하지 않았습니다.', ok, bad, total: 0 };
  if (!ok) return { text: `${head} 성공한 실행이 없어 비교할 결과가 없습니다.`, ok, bad, total: runs.length };
  const ms = usableMeasurements(detail);
  const metrics = metricsOf(ms);
  const m = metrics.find(x => x.key === detail.experiment.primary_metric) ?? metrics[0];
  if (!m) return { text: `${head} 측정값이 기록되지 않았습니다.`, ok, bad, total: runs.length };
  const byCfg = valuesByConfig(ms);
  const means = detail.configurations.map(c => ({ c, v: stats(byCfg.get(c.id)?.get(m.key) ?? []).mean })).filter((x): x is { c: Configuration; v: number } => x.v !== null);
  const baseId = pickBaseline(detail, null);
  const base = means.find(x => x.c.id === baseId);
  if (detail.experiment.strategy === 'ablation' && base) {
    // 요소를 뺀 설정은 나빠지는 것이 정상이다. 개선·퇴보가 아니라 요소별 기여를 말한다.
    const drops = means.filter(x => x.c.role === 'ablation_drop').map(x => ({ ...x, impact: m.direction === 'higher_is_better' ? base.v - x.v : x.v - base.v }));
    const top = drops.length ? drops.reduce((a, b) => (b.impact > a.impact ? b : a)) : null;
    const proxyNote = m.is_proxy ? ' (간접 지표)' : '';
    return { text: top ? `${head} ${m.label}${proxyNote} 기준으로 ‘${top.c.ablation_factor ?? top.c.label}’을(를) 뺐을 때 가장 크게 나빠졌습니다 (${fmtValue(base.v, m.unit)} → ${fmtValue(top.v, m.unit)}). 요소 ${drops.length}개를 하나씩 뺀 비교입니다.` : `${head} ${m.label}${proxyNote}: 전체 설정 ${fmtValue(base.v, m.unit)}. 제거 설정의 측정값이 없습니다.`, ok, bad, total: runs.length, bestLabel: base.c.label, improved: null };
  }
  const pick = <T extends { v: number }>(a: T, b: T): T => ((m.direction === 'higher_is_better' ? b.v > a.v : b.v < a.v) ? b : a);
  const best = means.length ? means.reduce(pick) : null;
  const proxy = m.is_proxy ? ' (간접 지표)' : '';
  if (!best) return { text: `${head} 주요 지표(${m.label}) 값이 없습니다.`, ok, bad, total: runs.length };
  if (base && best.c.id !== base.c.id && base.v) {
    const rel = ((best.v - base.v) / Math.abs(base.v)) * 100;
    const better = m.direction === 'higher_is_better' ? rel > 0 : rel < 0;
    return { text: `${head} ${m.label}${proxy}: 기준 「${base.c.label}」 ${fmtValue(base.v, m.unit)} → 최고 「${best.c.label}」 ${fmtValue(best.v, m.unit)} (${rel > 0 ? '+' : '−'}${Math.abs(rel).toFixed(1)}%, ${better ? '개선' : '퇴보'}).`, ok, bad, total: runs.length, bestLabel: best.c.label, improved: better };
  }
  if (base && best.c.id === base.c.id && means.length > 1) return { text: `${head} ${m.label}${proxy}에서 기준 「${base.c.label}」 ${fmtValue(base.v, m.unit)}이(가) 가장 좋았고, 변경한 설정은 개선하지 못했습니다.`, ok, bad, total: runs.length, bestLabel: base.c.label, improved: false };
  return { text: `${head} ${m.label}${proxy}: ${means.map(x => `「${x.c.label}」 ${fmtValue(x.v, m.unit)}`).join(', ')}.`, ok, bad, total: runs.length, bestLabel: best.c.label, improved: null };
}
