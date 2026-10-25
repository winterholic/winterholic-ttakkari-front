import { expect, it } from 'vitest';
import { buildPayload, getAdapterMeasurableMetrics, initialDesign, metricChoices } from './designerModel';
import type { ParamSpec } from './types';

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
