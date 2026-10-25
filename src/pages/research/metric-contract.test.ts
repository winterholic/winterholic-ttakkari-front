import { expect, it } from 'vitest';
import { buildPayload, getAdapterMeasurableMetrics, initialDesign, localErrors, metricChoices } from './designerModel';
import type { MethodDetail, ParamSpec } from './types';

it('uses the adapter top_k precedence when the common k default is also present', () => {
  const specs: ParamSpec[] = [
    { key: 'k', label: '평가 k', type: 'integer', default: 5 },
    { key: 'top_k', label: '검색 수', type: 'integer', default: 20 },
  ];
  const params = { values: { k: 5, top_k: 20 }, sweeps: {} };
  const state = { ...initialDesign, adapterId: 'retrieval_eval', primaryMetric: 'recall_at_k', params };
  const payload = buildPayload('s1', [], state, specs);
  // RetrievalEvalAdapter gives top_k precedence over k.
  expect(metricChoices([], 'retrieval_eval', { params })).toContain('recall_at_20');
  expect(payload.primary_metric).toBe('recall_at_20');
});

it('normalizes a stale concrete metric and secondary metric to the effective top_k', () => {
  const state = {
    ...initialDesign,
    adapterId: 'retrieval_eval', primaryMetric: 'recall_at_5', secondary: ['mrr_at_5'],
    params: { values: { k: 5 }, sweeps: {} }, inputs: { top_k: 20 },
  };
  const payload = buildPayload('s1', [], state, []);
  expect(payload.primary_metric).toBe('recall_at_20');
  expect(payload.secondary_metrics).toEqual(['mrr_at_20']);
});

it('follows a top_k sweep and ignores a shadowed k sweep', () => {
  const shadowed = getAdapterMeasurableMetrics('retrieval_eval', {
    params: { values: { k: 5, top_k: 20 }, sweeps: { k: [5, 10] } },
  });
  expect(shadowed.isSweepK).toBe(false);
  expect(shadowed.measurable).toContain('recall_at_20');
  expect(shadowed.measurable).not.toContain('recall_at_5');

  const active = getAdapterMeasurableMetrics('retrieval_eval', {
    params: { values: { k: 5, top_k: 20 }, sweeps: { top_k: [10, 20] } },
  });
  expect(active.isSweepK).toBe(true);
  expect(active.measurable).toContain('recall_at_10');
  expect(active.measurable).toContain('recall_at_20');
});

it('uses a JSON-only top_k setting when creating a payload', () => {
  const state = {
    ...initialDesign,
    adapterId: 'retrieval_eval', primaryMetric: 'recall_at_k',
    params: { values: { k: 5 }, sweeps: {} }, extra: { top_k: 20 },
  };
  const payload = buildPayload('s1', [], state, []);
  expect(payload.search_space.top_k).toBe(20);
  expect(payload.primary_metric).toBe('recall_at_20');
});

it('blocks creation with localErrors when top_k is fixed but k sweep is requested (shadowed k sweep)', () => {
  const dummyMethod: MethodDetail = {
    id: 'm1', slug: 'hybrid-retrieval', name: 'Hybrid Retrieval', name_ko: '하이브리드 검색',
    summary: 'hybrid test', scope: 'personal', version: 1, origin: 'user_registered',
    lifecycle_status: 'candidate', execution_status: 'immediately_executable',
    evidence_status: 'unverified', targets: [], layers: [], goals: [], interventions: [],
    research_methods: [], parameters: [
      { key: 'k', label: '평가 k', type: 'integer', default: 5, sweepable: true },
      { key: 'top_k', label: '검색 수', type: 'integer', default: 20, sweepable: true },
    ],
    compatibility: {}, metrics: ['recall_at_k'], expected_effects: [], side_effects: [],
    evidence: [], adapter_hints: ['retrieval_eval'], tags: [], relations: [], related_experiments: [],
  };
  const specs: ParamSpec[] = [
    { key: 'k', label: '평가 k', type: 'integer', default: 5, sweepable: true },
    { key: 'top_k', label: '검색 수', type: 'integer', default: 20, sweepable: true },
  ];
  const state = {
    ...initialDesign,
    adapterId: 'retrieval_eval',
    primaryMetric: 'recall_at_20',
    params: { values: { k: 5, top_k: 20 }, sweeps: { k: [5, 20] } },
  };

  const errs = localErrors(state, specs, [dummyMethod]);
  expect(errs.some(e => e.includes('top_k가 설정된 상태에서는 k 탐색(sweep)이 백엔드 우선순위에 의해 무시됩니다'))).toBe(true);

  // 무시되는 arm을 몰래 지워버리지 않음을 증명: buildPayload는 여전히 k sweep을 search_space에 유지 (하지만 localErrors로 폼 제출 차단)
  const payload = buildPayload('s1', [dummyMethod], state, specs);
  expect(payload.search_space.k).toEqual([5, 20]);
  expect(payload.search_space.top_k).toBe(20);
});

it('blocks creation with localErrors when advanced JSON extra.top_k is fixed and extra.k is a sweep array', () => {
  const dummyMethod: MethodDetail = {
    id: 'm1', slug: 'hybrid-retrieval', name: 'Hybrid Retrieval', name_ko: '하이브리드 검색',
    summary: 'hybrid test', scope: 'personal', version: 1, origin: 'user_registered',
    lifecycle_status: 'candidate', execution_status: 'immediately_executable',
    evidence_status: 'unverified', targets: [], layers: [], goals: [], interventions: [],
    research_methods: [], parameters: [], compatibility: {}, metrics: ['recall_at_k'],
    expected_effects: [], side_effects: [], evidence: [], adapter_hints: ['retrieval_eval'],
    tags: [], relations: [], related_experiments: [],
  };
  const state = {
    ...initialDesign,
    adapterId: 'retrieval_eval',
    primaryMetric: 'recall_at_20',
    params: { values: {}, sweeps: {} },
    extra: { top_k: 20, k: [5, 20] },
  };

  const errs = localErrors(state, [], [dummyMethod]);
  expect(errs.some(e => e.includes('top_k가 설정된 상태에서는 k 탐색(sweep)이 백엔드 우선순위에 의해 무시됩니다'))).toBe(true);
});

it('allows top_k sweep without shadowed error', () => {
  const dummyMethod: MethodDetail = {
    id: 'm1', slug: 'hybrid-retrieval', name: 'Hybrid Retrieval', name_ko: '하이브리드 검색',
    summary: 'hybrid test', scope: 'personal', version: 1, origin: 'user_registered',
    lifecycle_status: 'candidate', execution_status: 'immediately_executable',
    evidence_status: 'unverified', targets: [], layers: [], goals: [], interventions: [],
    research_methods: [], parameters: [
      { key: 'k', label: '평가 k', type: 'integer', default: 5, sweepable: true },
      { key: 'top_k', label: '검색 수', type: 'integer', default: 20, sweepable: true },
    ],
    compatibility: {}, metrics: ['recall_at_k'], expected_effects: [], side_effects: [],
    evidence: [], adapter_hints: ['retrieval_eval'], tags: [], relations: [], related_experiments: [],
  };
  const specs: ParamSpec[] = [
    { key: 'k', label: '평가 k', type: 'integer', default: 5, sweepable: true },
    { key: 'top_k', label: '검색 수', type: 'integer', default: 20, sweepable: true },
  ];
  const state = {
    ...initialDesign,
    adapterId: 'retrieval_eval',
    primaryMetric: 'recall_at_10',
    params: { values: { k: 5 }, sweeps: { top_k: [10, 20] } },
  };

  const errs = localErrors(state, specs, [dummyMethod]);
  expect(errs.some(e => e.includes('top_k가 설정된 상태에서는 k 탐색'))).toBe(false);
});

it('preserves source study/experiment/configuration/run IDs in buildPayload and does not discard them', () => {
  const dummyMethod: MethodDetail = {
    id: 'm1', slug: 'bm25-retrieval', name: 'BM25', name_ko: 'BM25',
    summary: 'bm25', scope: 'personal', version: 1, origin: 'user_registered',
    lifecycle_status: 'validated', execution_status: 'immediately_executable',
    evidence_status: 'unverified', targets: [], layers: [], goals: [], interventions: [],
    research_methods: [], parameters: [], compatibility: {}, metrics: ['recall_at_5'],
    expected_effects: [], side_effects: [], evidence: [], adapter_hints: ['retrieval_eval'],
    tags: [], relations: [], related_experiments: [],
  };
  const state = {
    ...initialDesign,
    adapterId: 'retrieval_eval',
    primaryMetric: 'recall_at_5',
    inputs: { top_k: 20 },
    source_study_id: '11111111-1111-1111-1111-111111111111',
    source_experiment_id: '22222222-2222-2222-2222-222222222222',
    source_configuration_id: '33333333-3333-3333-3333-333333333333',
    source_run_id: '44444444-4444-4444-4444-444444444444',
  };
  const payload = buildPayload('target-study', [dummyMethod], state, []);
  expect(payload.source_study_id).toBe('11111111-1111-1111-1111-111111111111');
  expect(payload.source_experiment_id).toBe('22222222-2222-2222-2222-222222222222');
  expect(payload.source_configuration_id).toBe('33333333-3333-3333-3333-333333333333');
  expect(payload.source_run_id).toBe('44444444-4444-4444-4444-444444444444');
  expect(payload.fixed_inputs.top_k).toBe(20);
});
