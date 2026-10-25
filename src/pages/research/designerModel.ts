import { buildSearchSpace, paramError, type ParamState } from './components/DynamicParameterForm';
import { relationOther } from './format';
import { ADAPTER, METRICS, adapterLabel } from './labels';
import type { Budget, ExperimentPayload, MethodDetail, ParamSpec, Strategy } from './types';

export interface DesignState {
  name: string; hypothesis: string; rationale: string; strategy: Strategy; adapterId: string; adapterTouched: boolean;
  params: ParamState; extra: Record<string, unknown>; inputs: Record<string, unknown>; primaryMetric: string; secondary: string[]; budget: Budget; repeats: number; seed: number; datasetVersion: string;
}
export const DEFAULT_BUDGET: Budget = { max_runs: 20, max_total_seconds: 300, max_memory_mb: 4096 };
export const initialDesign: DesignState = {
  name: '', hypothesis: '', rationale: '', strategy: 'ab', adapterId: '', adapterTouched: false, params: { values: {}, sweeps: {} }, extra: {}, inputs: {}, primaryMetric: '', secondary: [],
  budget: DEFAULT_BUDGET, repeats: 3, seed: 42, datasetVersion: '',
};

/** 방법이 정의하지 않았어도 실행기가 받는 핵심 옵션. 방법 스키마와 같은 키가 있으면 방법 쪽이 우선한다. */
export const ADAPTER_COMMON: Record<string, ParamSpec[]> = {
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

export function metricChoices(methods: MethodDetail[], adapterId: string): string[] {
  const keys = new Set<string>();
  const adapterDefault = ADAPTER[adapterId as keyof typeof ADAPTER]?.metric;
  if (adapterDefault) keys.add(adapterDefault);
  methods.forEach(m => (m.metrics ?? []).forEach(k => keys.add(k)));
  if (!keys.size) Object.keys(METRICS).forEach(k => keys.add(k));
  return [...keys];
}

export function suggestAdapter(methods: MethodDetail[], ready: (id: string) => boolean): string {
  const hint = methods[0]?.adapter_hints?.find(a => a !== 'external_report' && ready(a));
  if (hint) return hint;
  return methods[0]?.adapter_hints?.[0] ?? 'external_report';
}

export function buildPayload(studyId: string, methods: MethodDetail[], s: DesignState, specs: ParamSpec[]): ExperimentPayload {
  const inputs = { ...s.inputs } as Record<string, unknown>;
  for (const k of Object.keys(inputs)) if (inputs[k] === '' || inputs[k] === undefined) delete inputs[k];
  // 서버는 fixed_inputs 를 모든 설정의 파라미터에 합친다. 데이터셋 버전도 여기에 남겨 설정 비교에 같이 보이게 한다.
  if (s.datasetVersion.trim()) inputs.dataset_version = s.datasetVersion.trim();
  const budget = s.strategy === 'repeat' ? { ...s.budget, repetitions: Math.min(10, Math.max(1, s.repeats)) } : s.budget;
  return {
    study_id: studyId, method_id: methods[0]?.id ?? null, compared_method_ids: methods.slice(1).map(m => m.id), adapter_id: s.adapterId, strategy: s.strategy,
    search_space: { ...s.extra, ...buildSearchSpace(specs, s.params) }, fixed_inputs: inputs, primary_metric: s.primaryMetric, secondary_metrics: s.secondary.filter(k => k !== s.primaryMetric), budget, seed: s.seed,
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
