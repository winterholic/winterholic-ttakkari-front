// 연구소 화면 테스트용 가짜 서버. 응답 모양은 back-research-v2 의 실제 API 구현(평평한 실험 상세, 복수형 facets, 이름만 있는 대시보드 항목)을 따른다.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { researchRequest } from '../../api/client';
import { ResearchPage } from '../ResearchPage';

export const study = { id: 's1', title: 'KB 검색 정확도', goal: '한국어 문서 검색의 Recall@5 를 높인다', scope: 'personal', phase: 'investigation', version: 1, environment: { 장비: 'Mac Studio' }, criteria: ['recall@5'], next_actions: ['BM25 파라미터 스윕'] };

const params = (key: string, extra: Record<string, unknown> = {}) => ({ key, label: key, type: 'number', default: 1, sweepable: true, ...extra });
export const methodList = [
  { id: 'm1', scope: 'system', slug: 'bm25', version: 1, origin: 'system_seed', lifecycle_status: 'validated', name: 'BM25', name_ko: 'BM25 검색', summary: '단어 빈도 기반 순위', targets: ['rag'], layers: ['retrieval_index'], goals: ['accuracy_quality'], interventions: ['algorithm_swap'], research_methods: ['grid_search'],
    parameters: [params('bm25_k1', { label: 'k1', min: 0.1, max: 3, default: 1.2 }), params('bm25_b', { label: 'b', min: 0, max: 1, default: 0.75 })], compatibility: { hardware: ['cpu'] }, metrics: ['recall_at_k', 'mrr_at_k'], expected_effects: ['희귀어 질의 개선'], side_effects: ['동의어에 약함'],
    evidence: [{ kind: 'paper', title: 'Okapi at TREC-3', url: 'https://example.com/trec3', year: 1994, claim: '단순 TF-IDF 보다 낫다' }], evidence_status: 'source_reported', adapter_hints: ['retrieval_eval'], tags: [], execution_status: 'immediately_executable', unavailable_reason: null, unsupported_params: [] },
  { id: 'm2', scope: 'system', slug: 'kv-q4', version: 1, origin: 'system_seed', lifecycle_status: 'validated', name: 'KV cache q4', name_ko: 'KV 캐시 4비트 양자화', summary: 'KV 캐시를 4비트로 줄여 메모리를 아낀다', targets: ['llm'], layers: ['attention_kv_cache'], goals: ['memory_vram'], interventions: ['quantization'], research_methods: ['ab_test'],
    parameters: [{ key: 'cache_type_k', label: 'K 캐시 타입', type: 'enum', default: 'f16', options: ['f16', 'q8_0', 'q4_0'], sweepable: true }, { key: 'flash_attn', label: 'Flash Attention', type: 'boolean', default: false, sweepable: true }], compatibility: { hardware: ['cuda'] }, metrics: ['decode_tps'], expected_effects: [], side_effects: [], evidence: [], evidence_status: 'unverified', adapter_hints: ['llm_inference'], tags: [], execution_status: 'environment_unavailable', unavailable_reason: 'CUDA 전용 기법이라 이 장비에서 실행할 수 없습니다', unsupported_params: [] },
  { id: 'm3', scope: 'personal', slug: 'kernel-access', version: 1, origin: 'user_registered', lifecycle_status: 'hypothesis', name: 'Kernel access pattern', name_ko: '커널 메모리 접근 패턴 변경', summary: '가중치 대신 접근 패턴을 바꿔 속도를 올린다', targets: ['llm'], layers: ['runtime_hardware'], goals: ['throughput_tps'], interventions: ['algorithm_swap'], research_methods: [],
    parameters: [], compatibility: {}, metrics: [], expected_effects: [], side_effects: [], evidence: [], evidence_status: 'unverified', adapter_hints: [], tags: [], execution_status: 'hypothesis_stage', unavailable_reason: null, unsupported_params: [] },
];

export const taxonomy = { axes: {
  target: [{ axis: 'target', code: 'llm', label: 'LLM', label_ko: 'LLM' }, { axis: 'target', code: 'rag', label: 'RAG', label_ko: 'RAG 검색' }],
  layer: [{ axis: 'layer', code: 'retrieval_index', label: 'Retrieval', label_ko: '검색 색인' }, { axis: 'layer', code: 'attention_kv_cache', label: 'KV', label_ko: 'KV 캐시' }],
  goal: [{ axis: 'goal', code: 'accuracy_quality', label: 'Accuracy', label_ko: '정확도' }, { axis: 'goal', code: 'memory_vram', label: 'Memory', label_ko: '메모리' }],
} };

const facets = { targets: { llm: 2, rag: 1 }, layers: { retrieval_index: 1, attention_kv_cache: 1, runtime_hardware: 1 }, goals: { accuracy_quality: 1, memory_vram: 1, throughput_tps: 1 }, interventions: {}, research_methods: {}, execution_status: { immediately_executable: 1, environment_unavailable: 1, hypothesis_stage: 1 }, lifecycle_status: { validated: 2, hypothesis: 1 } };

export const methodDetail = { ...methodList[0], principle: '문서 길이로 정규화한 TF-IDF 변형', relations: [{ id: 'r1', relation_type: 'combines_with', to_method_id: 'm9', to_method_slug: 'dense-hash', to_method_name_ko: '해시 임베딩 검색', conditions: {}, note: 'RRF 로 결합' }],
  local_measurements: { total_runs: 2, succeeded_runs: 2, failed_runs: 0, locally_measured: true, best_improvement_summary: null }, related_experiments: [{ id: 'e1', study_id: 's1', title: 'BM25 k1 스윕', strategy: 'grid', state: 'completed' }] };

export const cfgs = [
  { id: 'c1', experiment_id: 'e1', label: 'Baseline (k1=1.2)', role: 'baseline', order_index: 0, parameters: { bm25_k1: 1.2, bm25_b: 0.75 }, config_hash: 'a' },
  { id: 'c2', experiment_id: 'e1', label: '#2 (k1=1.8)', role: 'candidate', order_index: 1, parameters: { bm25_k1: 1.8, bm25_b: 0.75 }, config_hash: 'b' },
  { id: 'c3', experiment_id: 'e1', label: '#3 (k1=2.4)', role: 'candidate', order_index: 2, parameters: { bm25_k1: 2.4, bm25_b: 0.75 }, config_hash: 'c' },
];
export const runs = [
  { id: 'r1', experiment_id: 'e1', configuration_id: 'c1', study_id: 's1', adapter_id: 'retrieval_eval', execution_origin: 'local_measured', repeat_index: 1, status: 'succeeded', progress: null, wall_seconds: 2.1 },
  { id: 'r2', experiment_id: 'e1', configuration_id: 'c2', study_id: 's1', adapter_id: 'retrieval_eval', execution_origin: 'local_measured', repeat_index: 1, status: 'succeeded', progress: null, wall_seconds: 2.3 },
  { id: 'r3', experiment_id: 'e1', configuration_id: 'c3', study_id: 's1', adapter_id: 'retrieval_eval', execution_origin: 'local_measured', repeat_index: 1, status: 'failed', progress: null, error_code: 'oom', error_message: '메모리 한도를 넘었습니다', wall_seconds: 1 },
];
const m = (run_id: string, configuration_id: string, key: string, label: string, value: number, direction = 'higher_is_better', is_proxy = false, unit = '') => ({ run_id, configuration_id, metric_key: key, metric_label: label, value, unit, direction, is_proxy, aggregator: 'single', slice_key: 'overall' });
export const runMeasurements: Record<string, ReturnType<typeof m>[]> = {
  r1: [m('r1', 'c1', 'recall_at_k', 'Recall@k', 0.5), m('r1', 'c1', 'query_latency_ms_mean', '질의 지연 평균', 20, 'lower_is_better', false, 'ms'), m('r1', 'c1', 'stt_cer_vs_normalized', 'STT 재인식 CER', 0.2, 'lower_is_better', true)],
  r2: [m('r2', 'c2', 'recall_at_k', 'Recall@k', 0.625), m('r2', 'c2', 'query_latency_ms_mean', '질의 지연 평균', 30, 'lower_is_better', false, 'ms'), m('r2', 'c2', 'stt_cer_vs_normalized', 'STT 재인식 CER', 0.18, 'lower_is_better', true)],
};
export const experiment = { id: 'e1', study_id: 's1', title: 'BM25 k1 스윕', hypothesis: 'k1 을 올리면 Recall 이 오른다', rationale: '', adapter: 'retrieval_eval', adapter_id: 'retrieval_eval', strategy: 'grid', primary_metric: 'recall_at_k', secondary_metrics: ['query_latency_ms_mean'], state: 'completed', budget: { max_runs: 20 }, baseline_configuration_id: 'c1', method_id: 'm1', compared_method_ids: [], search_space: {}, fixed_inputs: {} };

export const validateOk = { valid: true, errors: [], warnings: ['조합 효과는 단순 합과 다를 수 있습니다'], expanded_configurations: cfgs.map(c => ({ label: c.label, role: c.role, parameters: c.parameters, config_hash: c.config_hash })), resource_estimate: { total_runs: 3, estimated_total_seconds: 9, estimated_memory_mb: 512, requires_cpu_lock: true } };

export type Handler = (path: string, body?: unknown, method?: string) => unknown;
export const calls: string[] = [];

export function defaultHandler(path: string, body?: unknown): unknown {
  const url = new URL(path, 'http://x');
  const p = url.pathname;
  if (p === '/studies') return [study];
  if (p === '/studies/s1/resume') return { study, nodes: [{ id: 'n1', kind: 'hypothesis', title: 'k1 을 올리면 개선', summary: '', conditions: {}, details: {}, epistemic_status: 'unverified' }], relations: [], experiments: [experiment], timeline: [{ id: 't1', kind: 'study_created', actor: 'me', payload: {}, created_at: '2026-10-25T00:00:00Z' }], evidence: [], truncated: false };
  if (p === '/taxonomy') return taxonomy;
  if (p === '/methods') {
    const target = url.searchParams.get('target');
    const q = url.searchParams.get('q');
    let items = methodList;
    if (target) items = items.filter(x => target.split(',').some(t => x.targets.includes(t)));
    if (q) items = items.filter(x => (x.name_ko + x.summary + x.slug).includes(q));
    return { items, total: items.length, limit: 50, offset: 0, facets };
  }
  if (p === '/methods/bm25') return methodDetail;
  if (p === '/dashboard') return { counts: { studies: 1, methods: 3, running_runs: 0, completed_runs: 2 }, host_readiness: { llm_inference: { ready: false, reason: '개인 전용' }, retrieval_eval: { ready: true, reason: null }, tts_synthesis: { ready: true, reason: null }, external_report: { ready: true, reason: null } },
    recent_runs: [{ run_id: 'r1', experiment_id: 'e1', experiment_title: 'BM25 k1 스윕', configuration_label: 'Baseline', adapter_id: 'retrieval_eval', status: 'succeeded', wall_seconds: 2, created_at: '2026-10-25T00:00:00Z' }], best_results: [], quick_start_templates: [] };
  if (p === '/experiments/validate') return validateOk;
  if (p === '/experiments/e1') return { ...experiment, configurations: cfgs, runs, latest_analysis: null, artifacts: [] };
  const run = p.match(/^\/runs\/(r\d)$/);
  if (run) return { ...runs.find(r => r.id === run[1]), raw_output: {}, environment_snapshot: {}, measurements: runMeasurements[run[1]] ?? [], artifacts: [] };
  if (p === '/runs') return { runs };
  if (p === '/studies/s1/experiments') return { ...experiment, id: 'e2', configurations: cfgs, runs: [] };
  void body;
  return {};
}

export function setup(handler: Handler = defaultHandler) {
  calls.length = 0;
  vi.mocked(researchRequest).mockImplementation(async (path: string, body?: unknown, method?: string) => {
    calls.push((method ?? (body === undefined ? 'GET' : 'POST')) + ' ' + path);
    return handler(path, body, method) as never;
  });
}

export function mount(url: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    <MemoryRouter initialEntries={[url]}><ResearchPage /></MemoryRouter>
  </QueryClientProvider>);
}
