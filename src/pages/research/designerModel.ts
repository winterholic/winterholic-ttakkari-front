import { buildSearchSpace, paramError, type ParamState } from './components/DynamicParameterForm';
import { relationOther } from './format';
import { ADAPTER, ADAPTER_METRICS, METRICS, adapterLabel } from './labels';
import type { Budget, ExperimentPayload, MethodDetail, ParamSpec, Strategy } from './types';

export interface DesignState {
  name: string; hypothesis: string; rationale: string; strategy: Strategy; adapterId: string; adapterTouched: boolean;
  params: ParamState; extra: Record<string, unknown>; inputs: Record<string, unknown>; primaryMetric: string; secondary: string[]; budget: Budget; maxRunsTouched?: boolean; repeats: number; seed: number; datasetVersion: string;
}
export const DEFAULT_BUDGET: Budget = { max_runs: 20, max_total_seconds: 300, max_memory_mb: 4096 };
export const initialDesign: DesignState = {
  name: '', hypothesis: '', rationale: '', strategy: 'ab', adapterId: '', adapterTouched: false, params: { values: {}, sweeps: {} }, extra: {}, inputs: {}, primaryMetric: '', secondary: [],
  budget: DEFAULT_BUDGET, repeats: 3, seed: 42, datasetVersion: '',
};

/** 방법이 정의하지 않았어도 실행기가 받는 핵심 옵션. 방법 스키마와 같은 키가 있으면 방법 쪽이 우선한다. */
export const ADAPTER_COMMON: Record<string, ParamSpec[]> = {
  llm_inference: [
    {
      key: 'model',
      label: '모델 별칭',
      type: 'enum',
      default: 'qwen3.5-4b-q4_k_m',
      options: ['qwen3.5-4b-q4_k_m', 'qwen3.8-flash-next-q2k'],
      description: '호스트 GPU(llama-server)에서 실행할 사전 양자화 모델 별칭',
      sweepable: true,
    },
  ],
  tts_synthesis: [{ key: 'mode', label: '실행 모드', type: 'enum', default: 'synthesize', options: ['normalize_only', 'synthesize', 'synthesize_and_stt'], description: 'STT 재인식(synthesize_and_stt)은 발음 명료도의 간접 지표만 제공합니다. 청취 품질은 직접 들어야 합니다.', sweepable: true }],
  retrieval_eval: [{ key: 'retriever_mode', label: '검색 방식', type: 'enum', default: 'bm25', options: ['lexical_overlap', 'bm25', 'dense_hash', 'dense_e5', 'hybrid_rrf', 'hybrid_linear'], sweepable: true }, { key: 'k', label: '평가 k', type: 'integer', default: 5, min: 1, max: 50, sweepable: true }],
};

export function mergeSpecs(methods: MethodDetail[], adapterId: string) {
  const owners: Record<string, string> = {};
  const specs: ParamSpec[] = [];
  const seen = new Set<string>();
  for (const m of methods) for (const p of m.parameters ?? []) {
    if (seen.has(p.key)) continue;
    seen.add(p.key); specs.push(p); owners[p.key] = methods.length > 1 ? m.name_ko || m.name : '';
  }
  for (const p of ADAPTER_COMMON[adapterId] ?? []) if (!seen.has(p.key)) { seen.add(p.key); specs.push(p); owners[p.key] = '실행기 공통'; }
  return { specs, owners };
}

export interface MetricContext {
  params?: ParamState;
  inputs?: Record<string, unknown>;
}

export const TTS_MODE_METRICS: Record<string, string[]> = {
  normalize_only: ['normalized_char_delta', 'chunk_count', 'wall_seconds'],
  synthesize: ['rtf', 'synth_seconds', 'audio_seconds', 'load_seconds', 'peak_rss_mb', 'chunk_count', 'normalized_char_delta', 'wall_seconds'],
  synthesize_and_stt: [
    'rtf', 'synth_seconds', 'audio_seconds', 'load_seconds', 'peak_rss_mb',
    'chunk_count', 'normalized_char_delta',
    'stt_cer_vs_normalized', 'stt_cer_vs_raw', 'stt_wer_vs_normalized', 'stt_wer_vs_raw',
    'wall_seconds',
  ],
};

export function getAdapterMeasurableMetrics(adapterId: string, context?: MetricContext): { measurable: string[]; defaultMetric?: string; isSweepK?: boolean } {
  if (adapterId === 'retrieval_eval') {
    const p = context?.params;
    const inp = context?.inputs;
    const kParam = p?.values?.k ?? p?.values?.top_k ?? inp?.top_k ?? 5;
    const isSweep = !!(p?.sweeps?.k?.length || p?.sweeps?.top_k?.length);
    const common = ['query_latency_ms_mean', 'query_latency_ms_p95', 'chunk_count', 'wall_seconds'];
    if (isSweep) {
      const sweepList = ((p?.sweeps?.k ?? p?.sweeps?.top_k ?? []) as (number | string)[]).map(Number).filter(n => !isNaN(n));
      const kList = sweepList.length ? sweepList : [Number(kParam) || 5];
      const dynamicKeys: string[] = [];
      for (const k of kList) {
        dynamicKeys.push(`recall_at_${k}`, `mrr_at_${k}`, `ndcg_at_${k}`);
      }
      return {
        measurable: [...dynamicKeys, ...common],
        defaultMetric: dynamicKeys[0] ?? 'query_latency_ms_mean',
        isSweepK: true,
      };
    }
    const kVal = Number(kParam) || 5;
    const dynamicKeys = [`recall_at_${kVal}`, `mrr_at_${kVal}`, `ndcg_at_${kVal}`];
    return {
      measurable: [...dynamicKeys, ...common],
      defaultMetric: `recall_at_${kVal}`,
      isSweepK: false,
    };
  }

  if (adapterId === 'tts_synthesis') {
    const p = context?.params;
    const mode = String(p?.values?.mode ?? 'synthesize');
    const sweepModes = (p?.sweeps?.mode ?? []) as string[];
    if (sweepModes.length > 0) {
      const combined = new Set<string>();
      for (const m of sweepModes) {
        (TTS_MODE_METRICS[m] ?? TTS_MODE_METRICS.synthesize).forEach(k => combined.add(k));
      }
      return {
        measurable: [...combined],
        defaultMetric: combined.has('rtf') ? 'rtf' : combined.has('normalized_char_delta') ? 'normalized_char_delta' : [...combined][0],
      };
    }
    const metrics = TTS_MODE_METRICS[mode] ?? TTS_MODE_METRICS.synthesize;
    const defaultMetric = mode === 'normalize_only' ? 'normalized_char_delta' : 'rtf';
    return { measurable: [...metrics], defaultMetric };
  }

  if (adapterId === 'llm_inference') {
    const m = ADAPTER_METRICS.llm_inference ?? [];
    return { measurable: [...m], defaultMetric: ADAPTER.llm_inference.metric };
  }

  if (adapterId === 'external_report') {
    return { measurable: [], defaultMetric: '' };
  }

  const m = ADAPTER_METRICS[adapterId as keyof typeof ADAPTER_METRICS] ?? [];
  return { measurable: [...m], defaultMetric: ADAPTER[adapterId as keyof typeof ADAPTER]?.metric };
}

export function metricChoices(methods: MethodDetail[], adapterId: string, context?: MetricContext): string[] {
  if (adapterId === 'external_report') {
    const keys = new Set<string>();
    methods.forEach(m => (m.metrics ?? []).forEach(k => keys.add(k)));
    if (!keys.size) Object.keys(METRICS).forEach(k => keys.add(k));
    return [...keys];
  }

  const { measurable, defaultMetric } = getAdapterMeasurableMetrics(adapterId, context);
  const keys = new Set<string>();
  if (defaultMetric) keys.add(defaultMetric);

  methods.forEach(m => (m.metrics ?? []).forEach(k => {
    if (k === 'recall_at_k') measurable.filter(x => /^recall_at_\d+$/.test(x)).forEach(x => keys.add(x));
    else if (k === 'mrr') measurable.filter(x => /^mrr_at_\d+$/.test(x)).forEach(x => keys.add(x));
    else if (k === 'ndcg') measurable.filter(x => /^ndcg_at_\d+$/.test(x)).forEach(x => keys.add(x));
    else if (k === 'cer') measurable.filter(x => x.startsWith('stt_cer_')).forEach(x => keys.add(x));
    else if (k === 'wer') measurable.filter(x => x.startsWith('stt_wer_')).forEach(x => keys.add(x));
    else if (measurable.includes(k)) keys.add(k);
  }));

  measurable.forEach(k => keys.add(k));
  if (!keys.size) Object.keys(METRICS).forEach(k => keys.add(k));
  return [...keys];
}

/** 방법이 권장했지만 이 실행기는 측정 결과로 내지 않는 지표. 선택지에 넣으면 비교 화면에 값이 없는 지표를 고르게 된다. */
export function unmeasurableMetrics(methods: MethodDetail[], adapterId: string, context?: MetricContext): string[] {
  if (adapterId === 'external_report') return [];
  const { measurable } = getAdapterMeasurableMetrics(adapterId, context);
  if (!measurable.length) return [];

  const isMeasurable = (k: string) => {
    if (k === 'recall_at_k') return measurable.some(x => /^recall_at_\d+$/.test(x) || x === 'recall_at_k');
    if (k === 'mrr') return measurable.some(x => /^mrr_at_\d+$/.test(x) || x === 'mrr_at_k');
    if (k === 'ndcg') return measurable.some(x => /^ndcg_at_\d+$/.test(x) || x === 'ndcg_at_k');
    if (k === 'cer') return measurable.some(x => x.startsWith('stt_cer_'));
    if (k === 'wer') return measurable.some(x => x.startsWith('stt_wer_'));
    if (k === 'rtf') return measurable.includes('rtf');
    return measurable.includes(k);
  };

  return [...new Set(methods.flatMap(m => m.metrics ?? []).filter(k => !isMeasurable(k)))];
}

/** llm_inference 는 한 실험의 실행 수 하드 상한이 12 다. 사용자가 실행 수를 손대지 않았다면 상한을 넘는 기본값으로 시작해 첫 검증부터 막히지 않게 한다. */
export const RUN_CAP: Record<string, number> = { llm_inference: 12 };
export function effectiveBudget(s: DesignState): Budget {
  const cap = RUN_CAP[s.adapterId];
  return !s.maxRunsTouched && cap !== undefined && s.budget.max_runs > cap ? { ...s.budget, max_runs: cap } : s.budget;
}

export function suggestAdapter(methods: MethodDetail[], ready: (id: string) => boolean): string {
  const hint = methods[0]?.adapter_hints?.find(a => a !== 'external_report' && ready(a));
  if (hint) return hint;
  return methods[0]?.adapter_hints?.[0] ?? 'external_report';
}

export function buildPayload(studyId: string, methods: MethodDetail[], s: DesignState, specs: ParamSpec[]): ExperimentPayload {
  const inputs = { ...s.inputs } as Record<string, unknown>;
  if (s.adapterId === 'tts_synthesis' && !inputs.preset_id && !inputs.texts) {
    inputs.preset_id = 'ko_mixed_pronunciation_v1';
  }
  if (s.adapterId === 'retrieval_eval' && !inputs.preset_id && !inputs.corpus) {
    inputs.preset_id = 'ko_tech_docs_v1';
  }
  for (const k of Object.keys(inputs)) if (inputs[k] === '' || inputs[k] === undefined) delete inputs[k];
  // 서버는 fixed_inputs 를 모든 설정의 파라미터에 합친다. 데이터셋 버전도 여기에 남겨 설정 비교에 같이 보이게 한다.
  if (s.datasetVersion.trim()) inputs.dataset_version = s.datasetVersion.trim();
  const budget = s.strategy === 'repeat' ? { ...s.budget, repetitions: Math.min(10, Math.max(1, s.repeats)) } : s.budget;

  let primary = s.primaryMetric;
  let secondary = [...s.secondary];

  // retrieval_eval 에서 alias 정규화 (k 값 반영)
  if (s.adapterId === 'retrieval_eval') {
    const kVal = Number(s.params.values.k ?? s.params.values.top_k ?? inputs.top_k ?? 5) || 5;
    if (primary === 'recall_at_k') primary = `recall_at_${kVal}`;
    else if (primary === 'mrr_at_k' || primary === 'mrr') primary = `mrr_at_${kVal}`;
    else if (primary === 'ndcg_at_k' || primary === 'ndcg') primary = `ndcg_at_${kVal}`;

    secondary = secondary.map(k => {
      if (k === 'recall_at_k') return `recall_at_${kVal}`;
      if (k === 'mrr_at_k' || k === 'mrr') return `mrr_at_${kVal}`;
      if (k === 'ndcg_at_k' || k === 'ndcg') return `ndcg_at_${kVal}`;
      return k;
    });
  }

  // tts_synthesis 에서 mode별 지표 정합 정규화
  if (s.adapterId === 'tts_synthesis') {
    const { measurable, defaultMetric } = getAdapterMeasurableMetrics(s.adapterId, { params: s.params, inputs: s.inputs });
    if (!measurable.includes(primary) && defaultMetric) {
      primary = defaultMetric;
    }
    secondary = secondary.filter(k => measurable.includes(k));
  }

  if (!primary && s.adapterId !== 'external_report') {
    const choices = metricChoices(methods, s.adapterId, { params: s.params, inputs: s.inputs });
    primary = choices[0] ?? '';
  }

  return {
    study_id: studyId, method_id: methods[0]?.id ?? null, compared_method_ids: methods.slice(1).map(m => m.id), adapter_id: s.adapterId, strategy: s.strategy,
    search_space: { ...s.extra, ...buildSearchSpace(specs, s.params) }, fixed_inputs: inputs, primary_metric: primary, secondary_metrics: secondary.filter(k => k !== primary), budget, seed: s.seed,
  };
}

export interface Check { tone: 'danger' | 'warning' | 'info' | 'success'; text: string }

/** 선택한 방법끼리의 관계에서 충돌·선행·미검증 조합을 찾는다. 서버 검증과 별개로 설계 중에 바로 보여 준다. */
export function combinationChecks(methods: MethodDetail[]): Check[] {
  const out: Check[] = [];
  if (methods.length < 2) return out;
  const byId = new Map(methods.map(m => [m.id, m]));
  const nameOf = (id: string) => byId.get(id)?.name_ko || byId.get(id)?.name || id.slice(0, 8);
  const pair = new Set<string>();
  for (const m of methods) for (const r of m.relations ?? []) {
    const o = relationOther(r, m.id);
    if (!byId.has(o.id)) {
      if (r.relation_type === 'requires' && o.outgoing) out.push({ tone: 'warning', text: `「${nameOf(m.id)}」은(는) 「${o.name}」이(가) 먼저 필요합니다. 선택에 없습니다.` });
      continue;
    }
    const key = [m.id, o.id].sort().join('|') + r.relation_type;
    if (pair.has(key)) continue;
    pair.add(key);
    const a = o.outgoing ? m.id : o.id; const b = o.outgoing ? o.id : m.id;
    if (r.relation_type === 'conflicts_with') out.push({ tone: 'danger', text: `「${nameOf(a)}」와(과) 「${nameOf(b)}」는 충돌합니다.${r.note ? ` ${r.note}` : ''}` });
    else if (r.relation_type === 'requires') out.push({ tone: 'info', text: `「${nameOf(a)}」은(는) 「${nameOf(b)}」이(가) 먼저 필요합니다. 둘 다 선택되어 있어 충족됩니다.` });
    else if (r.relation_type === 'precedes') out.push({ tone: 'warning', text: `적용 순서: 「${nameOf(a)}」 → 「${nameOf(b)}」.${r.note ? ` ${r.note}` : ''}` });
    else if (r.relation_type === 'combines_with') out.push({ tone: 'success', text: `「${nameOf(a)}」 + 「${nameOf(b)}」는 조합 가능으로 기록돼 있습니다.${r.note ? ` ${r.note}` : ''}` });
    else if (r.relation_type === 'alternative_to') out.push({ tone: 'info', text: `「${nameOf(a)}」와(과) 「${nameOf(b)}」는 서로 대안입니다. 함께 쓰면 효과가 겹칠 수 있습니다.` });
  }
  const hasKnown = out.some(c => c.tone === 'success');
  if (!hasKnown) out.push({ tone: 'info', text: '이 조합이 함께 동작하는지 기록된 근거가 없습니다. 조합 효과는 단독 효과의 합이 아니므로 별도 실험으로 검증됩니다.' });
  return out;
}

/** 서버에 보내기 전에 화면에서 바로 잡을 수 있는 입력 오류. */
export function localErrors(s: DesignState, specs: ParamSpec[], methods: MethodDetail[]): string[] {
  const errs: string[] = [];
  if (!methods.length && s.adapterId !== 'external_report') errs.push('방법을 하나 이상 선택하세요.');
  if (!s.adapterId) errs.push('실행기를 선택하세요.');
  if (!s.primaryMetric && s.adapterId !== 'external_report') errs.push('주요 지표를 선택하세요.');
  if (s.adapterId === 'llm_inference' && !String(s.inputs.prompt ?? '').trim()) errs.push('LLM 추론 실험에는 프롬프트가 필요합니다.');
  for (const sp of specs) { if (s.params.sweeps[sp.key]) continue; const e = paramError(sp, s.params.values[sp.key]); if (e) errs.push(`${sp.label}: ${e}`); }
  return errs;
}

export const adapterNeeds = (id: string) => `${adapterLabel(id)} 실행기`;
