// AI Research Lab v2(/api/research/*) 레이아웃·스크린샷 검사용 합성 응답. 실제 연구·측정 데이터가 아니다.
// 모양은 back-research-v2 의 실제 API 구현을 따른다(평평한 실험 상세, 복수형 facets, 이름만 있는 대시보드 항목).
// 모르는 경로는 undefined 를 돌려 stub.mjs 가 다음 규칙으로 넘긴다.
const NOW = '2026-10-25T03:00:00Z';
const ago = (m) => new Date(Date.parse(NOW) - m * 60000).toISOString();

const P = (key, label, type, extra = {}) => ({ key, label, type, default: null, required: false, min: null, max: null, step: null, options: null, unit: null, description: '', advanced: false, sweepable: true, ...extra });

const TERMS = {
  target: [['llm', 'LLM'], ['rag', 'RAG·검색'], ['tts', 'TTS'], ['stt', 'STT'], ['embedding', '임베딩'], ['vlm', '멀티모달'], ['agent', '에이전트']],
  layer: [['attention_kv_cache', 'KV 캐시·어텐션'], ['decoding_sampling', '디코딩·샘플링'], ['runtime_hardware', '런타임·하드웨어'], ['retrieval_index', '검색 색인'], ['preprocessing_chunking', '전처리·청킹'], ['tokenizer_normalizer', '토크나이저·정규화'], ['postprocessing_reranking', '후처리·재정렬'], ['model_weights', '모델 가중치'], ['serving_scheduling', '서빙·스케줄링']],
  goal: [['latency_ttft', '지연·TTFT'], ['throughput_tps', '처리량'], ['memory_vram', '메모리·VRAM'], ['accuracy_quality', '정확도·품질'], ['pronunciation_prosody', '발음·운율'], ['stability_hallucination', '안정성'], ['reproducibility', '재현성']],
  intervention: [['quantization', '양자화'], ['caching', '캐싱'], ['algorithm_swap', '알고리즘 교체'], ['parameter_tuning', '파라미터 변경'], ['dictionary_rule_injection', '사전·규칙 주입'], ['hybrid_ensemble', '하이브리드'], ['speculative_execution', '추측 실행']],
  research_method: [['ab_test', 'A/B'], ['grid_search', 'Grid'], ['ablation', 'Ablation'], ['baseline', 'Baseline'], ['sensitivity', '민감도']],
};
const taxonomy = { axes: Object.fromEntries(Object.entries(TERMS).map(([axis, list]) => [axis, list.map(([code, label_ko], i) => ({ id: axis + code, axis, code, label: code, label_ko, description: '', parent_code: null, sort_order: i, is_system: true }))])) };

const base = (o) => ({ scope: 'system', version: 1, supersedes_id: null, origin: 'system_seed', lifecycle_status: 'validated', category: 'general', principle: '', interventions: [], research_methods: [], parameters: [], compatibility: { hardware: [], runtimes: [], notes: '' }, metrics: [], expected_effects: [], side_effects: [], evidence: [], evidence_status: 'source_reported', adapter_hints: [], tags: [], unavailable_reason: null, unsupported_params: [], created_at: ago(9000), updated_at: ago(9000), ...o });
const KV_PARAMS = [P('cache_type_k', 'K 캐시 양자화 타입', 'enum', { default: 'f16', options: ['f16', 'q8_0', 'q4_0'], description: 'KV 캐시 Key 텐서의 데이터 타입. q8_0/q4_0 사용 시 메모리 절감.' }), P('cache_type_v', 'V 캐시 양자화 타입', 'enum', { default: 'f16', options: ['f16', 'q8_0', 'q4_0'] }), P('flash_attn', 'Flash Attention', 'enum', { default: 'auto', options: ['on', 'off', 'auto'] }), P('ctx_size', '컨텍스트 길이', 'integer', { default: 4096, min: 512, max: 131072, unit: '토큰', advanced: true }), P('gpu_layers', 'GPU 레이어 수', 'integer', { default: 99, min: 0, max: 999, advanced: true })];
const methods = [
  base({ id: 'm-kv', slug: 'kv-cache-quantization', name: 'KV Cache Quantization', name_ko: 'KV 캐시 양자화', summary: 'KV 캐시를 8/4비트로 줄여 긴 컨텍스트의 메모리를 아낀다', principle: '어텐션이 읽는 Key·Value 텐서를 낮은 정밀도로 저장해 메모리 대역폭과 용량을 줄입니다. 정밀도 손실이 출력 품질에 미치는 영향은 모델마다 다릅니다.', targets: ['llm'], layers: ['attention_kv_cache'], goals: ['memory_vram', 'throughput_tps'], interventions: ['quantization'], research_methods: ['grid_search', 'ab_test'], parameters: KV_PARAMS, compatibility: { hardware: ['apple_silicon', 'cuda'], runtimes: ['llama_cpp'], notes: 'q4_0 은 flash_attn 이 켜져 있어야 동작하는 빌드가 있다' }, metrics: ['decode_tps', 'prefill_tps', 'swap_peak_growth_mb'], expected_effects: ['긴 컨텍스트에서 KV 메모리 약 50%(q8_0) ~ 75%(q4_0) 감소'], side_effects: ['q4_0 에서 장문 일관성 저하 가능', '일부 커널에서 디코드 속도 하락'], evidence: [{ kind: 'paper', title: 'KIVI: A Tuning-Free Asymmetric 2bit Quantization for KV Cache', url: 'https://arxiv.org/abs/2402.02750', year: 2024, claim: '2비트 KV 캐시로 품질 손실 없이 메모리 2.6배 절감' }], adapter_hints: ['llm_inference'], tags: ['kv', 'cache', 'quantization'], execution_status: 'tool_integrated' }),
  base({ id: 'm-fa', slug: 'flash-attention', name: 'Flash Attention', name_ko: 'Flash Attention', summary: '어텐션을 타일 단위로 계산해 메모리 이동을 줄인다', targets: ['llm', 'vlm'], layers: ['attention_kv_cache', 'runtime_hardware'], goals: ['latency_ttft', 'memory_vram'], interventions: ['algorithm_swap'], research_methods: ['ab_test'], parameters: [KV_PARAMS[2]], compatibility: { hardware: ['apple_silicon', 'cuda'], runtimes: ['llama_cpp'] }, metrics: ['prefill_tps', 'decode_tps'], expected_effects: ['긴 프롬프트의 프리필 시간 단축'], side_effects: ['짧은 프롬프트에서는 차이가 거의 없다'], evidence: [{ kind: 'paper', title: 'FlashAttention-2', url: 'https://arxiv.org/abs/2307.08691', year: 2023, claim: '어텐션 2배 가속' }], adapter_hints: ['llm_inference'], execution_status: 'tool_integrated' }),
  base({ id: 'm-spec', slug: 'speculative-decoding', name: 'Speculative Decoding', name_ko: '추측 디코딩', summary: '작은 모델·n-gram 이 초안을 쓰고 큰 모델이 한 번에 검증한다', targets: ['llm'], layers: ['decoding_sampling'], goals: ['latency_ttft', 'throughput_tps'], interventions: ['speculative_execution'], research_methods: ['ab_test'], parameters: [P('spec_type', '추측 방식', 'enum', { default: 'none', options: ['none', 'ngram-mod'] }), P('draft_model', '초안 모델', 'model', { sweepable: false })], compatibility: { hardware: ['apple_silicon', 'cuda'], runtimes: ['llama_cpp'] }, metrics: ['decode_tps'], expected_effects: ['반복이 많은 출력에서 디코드 속도 향상'], side_effects: ['초안 적중률이 낮으면 오히려 느려진다'], evidence_status: 'widely_practiced', adapter_hints: ['llm_inference'], execution_status: 'partially_supported', unsupported_params: ['draft_model'], unavailable_reason: '초안 모델(draft_model)은 지원하지 않고 n-gram 추측(ngram-mod)만 실행됩니다' }),
  base({ id: 'm-fuse', slug: 'kernel-fusion', name: 'Kernel Fusion', name_ko: '커널 융합', summary: '연속한 연산을 한 GPU 커널로 묶어 메모리 왕복을 줄인다', targets: ['llm'], layers: ['runtime_hardware'], goals: ['latency_ttft'], interventions: ['algorithm_swap'], parameters: [], metrics: ['decode_tps'], evidence_status: 'widely_practiced', adapter_hints: [], execution_status: 'adapter_required', unavailable_reason: '이 서버에 커널을 직접 바꿔 실행하는 어댑터가 없습니다. 외부에서 측정한 결과를 등록할 수 있습니다' }),
  base({ id: 'm-cg', slug: 'cuda-graphs', name: 'CUDA Graphs', name_ko: 'CUDA 그래프', summary: '커널 실행 오버헤드를 줄이는 CUDA 전용 최적화', targets: ['llm'], layers: ['runtime_hardware'], goals: ['latency_ttft'], interventions: ['algorithm_swap'], compatibility: { hardware: ['cuda'] }, metrics: ['decode_tps'], adapter_hints: ['llm_inference'], execution_status: 'environment_unavailable', unavailable_reason: 'CUDA 전용 기법이라 Apple Silicon 호스트에서 실행할 수 없습니다' }),
  base({ id: 'm-bm25', slug: 'bm25', name: 'BM25', name_ko: 'BM25 검색', summary: '단어 빈도와 문서 길이로 순위를 매기는 어휘 검색', targets: ['rag', 'embedding'], layers: ['retrieval_index'], goals: ['accuracy_quality'], interventions: ['algorithm_swap', 'parameter_tuning'], research_methods: ['grid_search', 'sensitivity'], parameters: [P('bm25_k1', 'k1', 'number', { default: 1.2, min: 0.1, max: 3, step: 0.1, description: '단어 빈도 포화 속도' }), P('bm25_b', 'b', 'number', { default: 0.75, min: 0, max: 1, step: 0.05, description: '문서 길이 정규화 강도' }), P('k', '평가 k', 'integer', { default: 5, min: 1, max: 50 })], compatibility: { hardware: ['cpu'], runtimes: ['python'] }, metrics: ['recall_at_k', 'mrr_at_k', 'ndcg_at_k', 'query_latency_ms_mean'], expected_effects: ['희귀어가 많은 질의에서 강하다'], side_effects: ['동의어·표현 차이에 약하다'], evidence: [{ kind: 'paper', title: 'The Probabilistic Relevance Framework: BM25 and Beyond', url: 'https://example.com/bm25', year: 2009, claim: 'k1 ≈ 1.2, b ≈ 0.75 가 널리 쓰이는 기본값' }], adapter_hints: ['retrieval_eval'], execution_status: 'immediately_executable', tags: ['검색', 'lexical'] }),
  base({ id: 'm-rrf', slug: 'hybrid-rrf', name: 'Hybrid RRF', name_ko: '하이브리드 검색 (RRF)', summary: '어휘 검색과 임베딩 검색의 순위를 역순위 합으로 합친다', targets: ['rag'], layers: ['retrieval_index'], goals: ['accuracy_quality'], interventions: ['hybrid_ensemble'], research_methods: ['grid_search'], parameters: [P('retriever_mode', '검색 방식', 'enum', { default: 'hybrid_rrf', options: ['bm25', 'dense_hash', 'hybrid_rrf', 'hybrid_linear'] }), P('rrf_k', 'RRF k', 'integer', { default: 60, min: 1, max: 200 }), P('hybrid_alpha', '결합 가중치', 'number', { default: 0.5, min: 0, max: 1, advanced: true })], compatibility: { hardware: ['cpu'] }, metrics: ['recall_at_k', 'mrr_at_k'], adapter_hints: ['retrieval_eval'], execution_status: 'immediately_executable' }),
  base({ id: 'm-nr', slug: 'neural-reranker', name: 'Neural reranker', name_ko: '신경망 재정렬', summary: 'Cross-Encoder 로 상위 후보를 다시 채점한다', targets: ['rag'], layers: ['postprocessing_reranking'], goals: ['accuracy_quality'], interventions: ['model_swap'], parameters: [P('rerank_mode', '재정렬 방식', 'enum', { default: 'token_overlap_top_n', options: ['none', 'token_overlap_top_n', 'cross_encoder'] }), P('rerank_window', '재정렬 창', 'integer', { default: 20, min: 5, max: 50 })], metrics: ['ndcg_at_k'], adapter_hints: ['retrieval_eval'], execution_status: 'partially_supported', unsupported_params: ['cross_encoder'], unavailable_reason: 'Cross-Encoder 가중치가 설치되지 않아 토큰 겹침 기반 대체 재정렬만 실행됩니다' }),
  base({ id: 'm-chunk', slug: 'chunking', name: 'Chunking', name_ko: '청킹 전략', summary: '문서를 어떤 단위로 잘라 색인할지 바꾼다', targets: ['rag'], layers: ['preprocessing_chunking'], goals: ['accuracy_quality'], interventions: ['parameter_tuning'], research_methods: ['grid_search', 'sensitivity'], parameters: [P('chunking_strategy', '청킹 방식', 'enum', { default: 'paragraph', options: ['none', 'paragraph', 'fixed_window'] }), P('chunk_size', '청크 크기', 'integer', { default: 500, min: 100, max: 2000, unit: '자' }), P('chunk_overlap', '겹침', 'integer', { default: 50, min: 0, max: 500, unit: '자', advanced: true })], metrics: ['recall_at_k', 'chunk_count'], adapter_hints: ['retrieval_eval'], execution_status: 'immediately_executable' }),
  base({ id: 'm-norm', slug: 'korean-text-normalization', name: 'Korean text normalization', name_ko: '한국어 텍스트 정규화', summary: '숫자·영문·단위를 소리 나는 한글로 바꿔 합성 오류를 줄인다', targets: ['tts'], layers: ['tokenizer_normalizer', 'preprocessing_chunking'], goals: ['pronunciation_prosody'], interventions: ['dictionary_rule_injection'], research_methods: ['ablation'], parameters: [P('convert_numbers', '숫자 읽기', 'boolean', { default: true }), P('read_latin', '영문 읽기', 'boolean', { default: true }), P('plain_text', '기호 제거', 'boolean', { default: false, advanced: true }), P('max_chunk_chars', '최대 청크 길이', 'integer', { default: 220, min: 80, max: 400, unit: '자', advanced: true })], metrics: ['rtf', 'stt_cer_vs_normalized', 'normalized_char_delta'], expected_effects: ['숫자·영문 약어 발음 오류 감소'], side_effects: ['원문과 다른 발음 표기가 들어가 STT 비교 기준이 둘이 된다'], adapter_hints: ['tts_synthesis'], execution_status: 'immediately_executable', tags: ['tts', '발음', 'g2p'] }),
  base({ id: 'm-dict', slug: 'pronunciation-dictionary', name: 'Pronunciation dictionary', name_ko: '발음사전 주입', summary: '자주 틀리는 단어를 사용자 사전으로 먼저 치환한다', targets: ['tts'], layers: ['tokenizer_normalizer'], goals: ['pronunciation_prosody'], interventions: ['dictionary_rule_injection'], research_methods: ['ablation', 'ab_test'], parameters: [P('custom_pronunciation_dict', '발음사전', 'text', { description: 'JSON 사전. 예: {"API": "에이피아이"}', sweepable: true })], metrics: ['stt_cer_vs_normalized'], adapter_hints: ['tts_synthesis'], execution_status: 'immediately_executable' }),
  base({ id: 'm-pros', slug: 'prosody-control', name: 'Prosody control', name_ko: '운율 제어', summary: '쉼과 억양 표지로 문장 리듬을 조절한다', targets: ['tts'], layers: ['postprocessing_reranking'], goals: ['pronunciation_prosody'], interventions: ['parameter_tuning'], lifecycle_status: 'candidate', evidence_status: 'unverified', parameters: [P('speed', '속도', 'number', { default: 1, min: 0.7, max: 1.5, step: 0.05 })], metrics: ['rtf'], adapter_hints: ['tts_synthesis'], execution_status: 'partially_supported', unsupported_params: ['pause_markers'], unavailable_reason: '쉼 표지(pause_markers)는 엔진이 받지 않아 속도(speed)만 실행됩니다' }),
  base({ id: 'm-hyp', slug: 'kernel-access-pattern', name: 'Kernel access pattern', name_ko: '커널 메모리 접근 패턴 변경', summary: '가중치 대신 GPU 커널의 메모리 접근 패턴을 바꿔 출력 속도를 올린다', principle: '가중치를 건드리지 않고 타일 순서만 바꿔 캐시 적중을 높이면 디코드가 빨라질 것이라는 가설.', scope: 'personal', origin: 'user_registered', lifecycle_status: 'hypothesis', evidence_status: 'unverified', targets: ['llm'], layers: ['runtime_hardware'], goals: ['throughput_tps'], interventions: ['algorithm_swap'], execution_status: 'hypothesis_stage' }),
];
const FILLER = ['Prefix Caching', 'Continuous Batching', 'Prompt Compression', 'LoRA', 'QLoRA', 'Context Compression', 'Query Expansion', 'Query Rewriting', 'Voice Activity Detection', 'Beam Search', 'Temperature Fallback', 'Diarization'];
const STATUSES = ['immediately_executable', 'tool_integrated', 'adapter_required', 'hypothesis_stage', 'partially_supported', 'environment_unavailable'];
const TG = ['llm', 'rag', 'tts', 'stt', 'embedding'];
for (let i = 0; i < 108; i++) {
  const n = FILLER[i % FILLER.length] + (i >= FILLER.length ? ' 변형 ' + Math.floor(i / FILLER.length) : '');
  const st = STATUSES[i % STATUSES.length];
  methods.push(base({ id: 'm-f' + i, slug: 'filler-' + i, name: n, name_ko: n, summary: n + '을 적용해 목표 지표를 개선한다. 합성 카탈로그 항목이며 실제 연구 데이터가 아니다.', targets: [TG[i % TG.length]], layers: [TERMS.layer[i % TERMS.layer.length][0]], goals: [TERMS.goal[i % TERMS.goal.length][0]], interventions: [TERMS.intervention[i % TERMS.intervention.length][0]], lifecycle_status: st === 'hypothesis_stage' ? 'hypothesis' : 'validated', evidence_status: st === 'hypothesis_stage' ? 'unverified' : 'widely_practiced', execution_status: st, unavailable_reason: st === 'environment_unavailable' ? '현재 환경에서는 실행할 수 없는 합성 사유' : st === 'adapter_required' ? '어댑터가 없는 합성 사유' : null }));
}

const facetsOf = (list) => {
  const f = { targets: {}, layers: {}, goals: {}, interventions: {}, research_methods: {}, execution_status: {}, lifecycle_status: {} };
  for (const m of list) {
    for (const [k, key] of [['targets', 'targets'], ['layers', 'layers'], ['goals', 'goals'], ['interventions', 'interventions'], ['research_methods', 'research_methods']]) for (const v of m[key]) f[k][v] = (f[k][v] ?? 0) + 1;
    f.execution_status[m.execution_status] = (f.execution_status[m.execution_status] ?? 0) + 1;
    f.lifecycle_status[m.lifecycle_status] = (f.lifecycle_status[m.lifecycle_status] ?? 0) + 1;
  }
  return f;
};

const studies = [
  { id: 's-llm', title: '로컬 LLM 추론 속도·메모리 균형 연구', goal: 'Mac Studio 의 4B 모델에서 KV 캐시 설정과 Flash Attention 으로 8GB 이내 메모리에서 디코드 속도를 최대화한다.\n긴 컨텍스트 품질 손실은 따로 확인한다.', scope: 'personal', phase: 'analysis', version: 3, environment: { 장비: 'Mac Studio M2 Ultra 64GB', 모델: 'qwen3.5-4b-q4_k_m', 런타임: 'llama.cpp (Metal)' }, criteria: ['decode tok/s', '스왑 증가', '메모리 피크'], next_actions: ['q8_0 KV + flash_attn 조합 5회 반복으로 변동성 확인', 'KV×Attention 상호작용 가설 등록'], primary_target: 'llm' },
  { id: 's-tts', title: '한국어 TTS 숫자·영문 발음 개선', goal: '정규화·발음사전이 숫자와 영문 약어 발음 오류를 얼마나 줄이는지 요소별로 분해한다.', scope: 'personal', phase: 'investigation', version: 2, environment: { 엔진: 'Supertonic 3 (ONNX CPU)' }, criteria: ['STT 재인식 CER(간접)', 'RTF', '직접 청취'], next_actions: ['직접 청취 평가 10문장'], primary_target: 'tts' },
  { id: 's-rag', title: 'KB 검색 정확도 아주 긴 연구 이름 VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', goal: '한국어 기술문서에서 어휘·하이브리드 검색의 Recall@5 와 MRR 을 비교한다.', scope: 'personal', phase: 'planning', version: 1, environment: {}, criteria: ['recall@5', 'MRR'], next_actions: [], primary_target: 'rag' },
];

const cfg = (id, exp, label, role, parameters, i, factor = null) => ({ id, experiment_id: exp, label, role, order_index: i, parameters, config_hash: id, ablation_factor: factor, created_at: ago(300) });
const run = (id, exp, c, study, adapter, status, rep, secs, extra = {}) => ({ id, experiment_id: exp, configuration_id: c, study_id: study, adapter_id: adapter, execution_origin: 'local_measured', repeat_index: rep, seed: 42 + rep - 1, status, progress: null, error_code: null, error_message: null, started_at: ago(200), finished_at: status === 'running' ? null : ago(190), wall_seconds: status === 'running' ? null : secs, created_at: ago(210), ...extra });
const meas = (r, c, key, label, value, unit, direction, proxy = false) => ({ run_id: r, configuration_id: c, metric_key: key, metric_label: label, value, unit, direction, is_proxy: proxy, aggregator: 'median', slice_key: 'overall' });

// 실험 1: LLM grid 6설정(마지막 하나는 OOM 실패)
const llmCfgs = [['f16', 'off'], ['f16', 'on'], ['q8_0', 'off'], ['q8_0', 'on'], ['q4_0', 'on'], ['q4_0', 'off']].map(([k, f], i) => cfg('c-l' + i, 'e-llm', '#' + (i + 1) + ' (cache_type_k=' + k + ', flash_attn=' + f + ')', i === 0 ? 'baseline' : 'candidate', { cache_type_k: k, flash_attn: f, ctx_size: 4096, prompt: '한국어 회의록 요약 프롬프트' }, i));
const llmVals = [[31.2, 410, 2900, 0], [34.8, 520, 2750, 0], [33.1, 430, 1900, 0], [37.5, 560, 1750, 0], [36.2, 545, 1100, 0], null];
const llmRuns = llmCfgs.map((c, i) => (llmVals[i] ? run('r-l' + i, 'e-llm', c.id, 's-llm', 'llm_inference', 'succeeded', 1, 28 + i) : run('r-l' + i, 'e-llm', c.id, 's-llm', 'llm_inference', 'failed', 1, 12, { error_code: 'host_gpu_swap_limit', error_message: '스왑 증가 상한(1.0GB)을 넘어 watchdog 이 서버를 종료했습니다' })));
const llmMeas = llmCfgs.flatMap((c, i) => (llmVals[i] ? [meas('r-l' + i, c.id, 'decode_tps', '디코드 속도', llmVals[i][0], 'tok/s', 'higher_is_better'), meas('r-l' + i, c.id, 'prefill_tps', '프리필 속도', llmVals[i][1], 'tok/s', 'higher_is_better'), meas('r-l' + i, c.id, 'swap_peak_growth_mb', '스왑 피크 증가', llmVals[i][2], 'MB', 'lower_is_better'), meas('r-l' + i, c.id, 'approx_prefill_ms', '근사 프리필 시간', 1000 * 600 / llmVals[i][1], 'ms', 'lower_is_better', true)] : []));

// 실험 2: TTS ablation 4설정
const ttsCfgs = [['Full (모두 켬)', 'baseline', { convert_numbers: true, read_latin: true, mode: 'synthesize_and_stt' }, null], ['Ablation: Drop convert_numbers', 'ablation_drop', { convert_numbers: false, read_latin: true, mode: 'synthesize_and_stt' }, 'convert_numbers'], ['Ablation: Drop read_latin', 'ablation_drop', { convert_numbers: true, read_latin: false, mode: 'synthesize_and_stt' }, 'read_latin'], ['Ablation: Drop dictionary', 'ablation_drop', { convert_numbers: true, read_latin: true, mode: 'synthesize_and_stt', custom_pronunciation_dict: '' }, 'custom_pronunciation_dict']].map(([l, role, p, f], i) => cfg('c-t' + i, 'e-tts', l, role, p, i, f));
const ttsVals = [[0.06, 0.31], [0.19, 0.30], [0.11, 0.30], [0.09, 0.31]];
const ttsRuns = ttsCfgs.map((c, i) => run('r-t' + i, 'e-tts', c.id, 's-tts', 'tts_synthesis', 'succeeded', 1, 22));
const ttsMeas = ttsCfgs.flatMap((c, i) => [meas('r-t' + i, c.id, 'stt_cer_vs_normalized', 'STT 재인식 CER (정규화 기준)', ttsVals[i][0], '', 'lower_is_better', true), meas('r-t' + i, c.id, 'rtf', 'RTF', ttsVals[i][1], '', 'lower_is_better')]);
const ttsArts = ttsCfgs.map((c, i) => ({ id: 'ra-t' + i, study_id: 's-tts', experiment_id: 'e-tts', run_id: 'r-t' + i, artifact_id: 'art-audio-' + i, role: 'audio_sample', label: c.label + ' 샘플', promoted_to_library: i === 0, created_at: ago(180) }));

// 실험 3: RAG A/B + 반복(설정당 3회)
const ragCfgs = [['Control (A)', 'baseline', 1.2], ['Treatment (B: bm25_k1=1.8)', 'treatment', 1.8]].map(([l, role, k], i) => cfg('c-r' + i, 'e-rag', l, role, { bm25_k1: k, bm25_b: 0.75, retriever_mode: 'bm25', k: 5 }, i));
const ragVals = { 0: [0.57, 0.6, 0.62], 1: [0.61, 0.66, 0.64] };
const ragRuns = ragCfgs.flatMap((c, i) => [1, 2, 3].map(rep => run('r-r' + i + rep, 'e-rag', c.id, 's-rag', 'retrieval_eval', 'succeeded', rep, 2.4)));
const ragMeas = ragCfgs.flatMap((c, i) => [1, 2, 3].flatMap(rep => [meas('r-r' + i + rep, c.id, 'recall_at_k', 'Recall@k', ragVals[i][rep - 1], '', 'higher_is_better'), meas('r-r' + i + rep, c.id, 'query_latency_ms_mean', '질의 지연 평균', 18 + i * 4 + rep, 'ms', 'lower_is_better')]));

// 실험 4: 외부 결과(CUDA)
const extCfg = cfg('c-x0', 'e-ext', 'External Report Config', 'candidate', {}, 0);
const extRun = run('r-x0', 'e-ext', 'c-x0', 's-llm', 'external_report', 'succeeded', 1, null, { execution_origin: 'external_report', started_at: ago(900), finished_at: ago(899) });
const extMeas = [meas('r-x0', 'c-x0', 'decode_tps', '디코드 속도', 61.4, 'tok/s', 'higher_is_better')];

const exp = (o) => ({ rationale: '', adapter: o.adapter_id, config: {}, environment: {}, budget: { seconds: 30, memory_mb: 256, max_runs: 20, max_total_seconds: 300 }, receipt: {}, method_ids: [], compared_method_ids: [], search_space: {}, fixed_inputs: {}, secondary_metrics: [], state: 'completed', created_at: ago(400), finished_at: ago(190), ...o });
const experiments = [
  exp({ id: 'e-llm', study_id: 's-llm', title: 'KV 캐시 타입 × Flash Attention Grid', hypothesis: 'q8_0 KV 와 flash_attn 을 함께 쓰면 속도 손실 없이 메모리를 줄인다', adapter_id: 'llm_inference', strategy: 'grid', method_id: 'm-kv', compared_method_ids: ['m-fa'], primary_metric: 'decode_tps', secondary_metrics: ['swap_peak_growth_mb'], baseline_configuration_id: 'c-l0', state: 'completed' }),
  exp({ id: 'e-tts', study_id: 's-tts', title: '정규화·사전 요소별 Ablation', hypothesis: '숫자 읽기가 발음 오류 감소의 대부분을 차지한다', adapter_id: 'tts_synthesis', strategy: 'ablation', method_id: 'm-norm', primary_metric: 'stt_cer_vs_normalized', secondary_metrics: ['rtf'], baseline_configuration_id: 'c-t0' }),
  exp({ id: 'e-rag', study_id: 's-rag', title: 'BM25 k1 A/B (반복 3회)', hypothesis: 'k1=1.8 이 Recall@5 를 올린다', adapter_id: 'retrieval_eval', strategy: 'ab', method_id: 'm-bm25', primary_metric: 'recall_at_k', secondary_metrics: ['query_latency_ms_mean'], baseline_configuration_id: 'c-r0' }),
  exp({ id: 'e-ext', study_id: 's-llm', title: 'CUDA Graphs (외부 A100 측정 보고)', hypothesis: 'CUDA 그래프가 디코드를 올린다', adapter_id: 'external_report', strategy: 'single', method_id: 'm-cg', primary_metric: 'decode_tps', baseline_configuration_id: 'c-x0' }),
];
const detailOf = (id) => {
  const pick = { 'e-llm': [llmCfgs, llmRuns, llmMeas, []], 'e-tts': [ttsCfgs, ttsRuns, ttsMeas, ttsArts], 'e-rag': [ragCfgs, ragRuns, ragMeas, []], 'e-ext': [[extCfg], [extRun], extMeas, []] }[id];
  if (!pick) return undefined;
  const e = experiments.find((x) => x.id === id);
  return { ...e, configurations: pick[0], runs: pick[1], latest_analysis: id === 'e-llm' ? { id: 'an1', experiment_id: id, primary_metric: 'decode_tps', summary: {}, recommendation_ko: '기준(#1)보다 디코드 속도가 가장 높은 설정은 #4(q8_0 + flash_attn on)로 +20.2% 입니다. #4 는 스왑 피크도 줄었습니다.' } : null, artifacts: pick[3] };
};

const snapshot = (sid) => {
  const study = studies.find((s) => s.id === sid);
  if (!study) return undefined;
  const nodes = sid === 's-llm' ? [
    { id: 'n1', study_id: sid, kind: 'hypothesis', title: 'KV 캐시 양자화와 Flash Attention 은 속도 손실 없이 메모리를 줄인다', summary: 'q8_0 KV 와 flash_attn=on 을 함께 쓰는 설정이 기준보다 빠르고 스왑이 적다.', conditions: { 모델: '4B Q4' }, details: {}, epistemic_status: 'unverified', created_at: ago(500) },
    { id: 'n2', study_id: sid, kind: 'finding', title: 'KIVI: 2비트 KV 캐시로 품질 손실 없이 메모리 절감', summary: '논문이 보고한 결과이며 따까리에서 재현하지 않았다.', conditions: {}, details: {}, epistemic_status: 'source_reported', evidence_id: 'ev1', created_at: ago(480) },
    { id: 'n3', study_id: sid, kind: 'decision', title: '최적 결과물 채택: #4 (q8_0, flash on)', summary: '메모리 8GB 이하 조건에서 디코드 속도 기준 최선', conditions: { objective: '8GB 이내 대화형 속도', primary_metric: 'decode_tps' }, details: {}, epistemic_status: 'validated', created_at: ago(120) },
  ] : [];
  return { study, nodes, relations: [], experiments: experiments.filter((e) => e.study_id === sid), timeline: [{ id: 't1', study_id: sid, kind: 'study_created', actor: 'me', payload: { goal: study.goal }, created_at: ago(900) }, { id: 't2', study_id: sid, kind: 'experiment_planned', actor: 'me', payload: { id: 'e-llm', title: 'KV 캐시 타입 × Flash Attention Grid' }, created_at: ago(400) }, { id: 't3', study_id: sid, kind: 'best_result_adopted', actor: 'me', payload: {}, created_at: ago(120) }], evidence: sid === 's-llm' ? [{ id: 'ev1', quote: '2비트 비대칭 양자화로 KV 캐시 메모리를 2.6배 줄이면서 정확도를 유지했다.', locator: 'https://arxiv.org/abs/2402.02750', revision_id: 'rev1', source_key: 'arxiv:2402.02750v2', sha256: 'f3a9' + 'c1'.repeat(28), active: true, start: 0, end: 40 }] : [], truncated: false, resume_contract: '' };
};

const best = [{ best_result_id: 'b1', study_id: 's-llm', experiment_title: 'KV 캐시 타입 × Flash Attention Grid', configuration_label: '#4 (cache_type_k=q8_0, flash_attn=on)', objective: '8GB 이내 대화형 응답 속도', primary_metric: 'decode_tps', constraints: { description: '스왑 피크 증가 2GB 이하, 이 장비에서만 확인', origin: 'local_measured' }, rationale: '디코드 속도가 기준 대비 +20% 이고 스왑 증가가 40% 줄었다. 장문 품질은 따로 확인하지 않았다.', status: 'adopted', created_at: ago(120) }];
const recent = [
  { run_id: 'r-l3', experiment_id: 'e-llm', experiment_title: 'KV 캐시 타입 × Flash Attention Grid', configuration_label: '#4 (q8_0, on)', adapter_id: 'llm_inference', status: 'succeeded', wall_seconds: 31, created_at: ago(210) },
  { run_id: 'r-l5', experiment_id: 'e-llm', experiment_title: 'KV 캐시 타입 × Flash Attention Grid', configuration_label: '#6 (q4_0, off)', adapter_id: 'llm_inference', status: 'failed', wall_seconds: 12, created_at: ago(209) },
  { run_id: 'r-t0', experiment_id: 'e-tts', experiment_title: '정규화·사전 요소별 Ablation', configuration_label: 'Full', adapter_id: 'tts_synthesis', status: 'succeeded', wall_seconds: 22, created_at: ago(180) },
  { run_id: 'r-r11', experiment_id: 'e-rag', experiment_title: 'BM25 k1 A/B (반복 3회)', configuration_label: 'Control (A)', adapter_id: 'retrieval_eval', status: 'running', wall_seconds: null, created_at: ago(2) },
  { run_id: 'r-x0', experiment_id: 'e-ext', experiment_title: 'CUDA Graphs (외부 A100 측정 보고)', configuration_label: 'External Report Config', adapter_id: 'external_report', status: 'succeeded', wall_seconds: null, created_at: ago(900) },
];

export function research(path, method, search) {
  if (!path.startsWith('research')) return undefined;
  const q = new URLSearchParams(search ?? '');
  const p = path.replace(/^research/, '') || '/';
  if (p === '/studies' && method === 'GET') return studies;
  const snap = p.match(/^\/studies\/([^/]+)\/resume$/);
  if (snap) return snapshot(snap[1]) ?? [];
  if (p === '/taxonomy') return taxonomy;
  if (p === '/dashboard') {
    const sid = q.get('study_id');
    const rs = sid ? recent.filter((r) => experiments.find((e) => e.id === r.experiment_id)?.study_id === sid) : recent;
    return { counts: { studies: studies.length, methods: methods.length, running_runs: 1, completed_runs: 14 }, host_readiness: { llm_inference: { ready: true, reason: null }, retrieval_eval: { ready: true, reason: null }, tts_synthesis: { ready: false, reason: 'Supertonic ONNX 모델이 설치되어 있지 않습니다 (.tts-runtime 확인 필요)' }, external_report: { ready: true, reason: null } }, recent_runs: rs, best_results: sid && sid !== 's-llm' ? [] : best, quick_start_templates: [] };
  }
  if (p === '/methods' && method === 'GET') {
    const one = (k) => (q.get(k) ?? '').split(',').filter(Boolean);
    let list = methods;
    const text = q.get('q');
    if (text) list = list.filter((m) => (m.name_ko + m.name + m.summary + m.slug).toLowerCase().includes(text.toLowerCase()));
    for (const [k, f] of [['target', 'targets'], ['layer', 'layers'], ['goal', 'goals'], ['intervention', 'interventions'], ['research_method', 'research_methods']]) { const v = one(k); if (v.length) list = list.filter((m) => v.some((x) => m[f].includes(x))); }
    const lc = one('lifecycle_status'); if (lc.length) list = list.filter((m) => lc.includes(m.lifecycle_status));
    const facets = facetsOf(list);
    const es = one('execution_status'); if (es.length) list = list.filter((m) => es.includes(m.execution_status));
    const offset = Number(q.get('offset') ?? 0); const limit = Number(q.get('limit') ?? 50);
    return { items: list.slice(offset, offset + limit), total: list.length, limit, offset, facets };
  }
  const md = p.match(/^\/methods\/([^/]+)$/);
  if (md && method === 'GET') {
    const m = methods.find((x) => x.slug === md[1] || x.id === md[1]);
    if (!m) return {};
    const rel = m.slug === 'kv-cache-quantization' ? [{ id: 'rl1', relation_type: 'combines_with', to_method_id: 'm-fa', to_method_slug: 'flash-attention', to_method_name_ko: 'Flash Attention', conditions: { when_parameter: { cache_type_k: 'q4_0' } }, note: 'q4_0 K 캐시는 flash_attn 이 켜져 있어야 한다' }, { id: 'rl2', relation_type: 'conflicts_with', to_method_id: 'm-cg', to_method_slug: 'cuda-graphs', to_method_name_ko: 'CUDA 그래프', conditions: {}, note: '현재 빌드에서 함께 쓸 수 없다' }, { id: 'rl3', relation_type: 'precedes', to_method_id: 'm-spec', to_method_slug: 'speculative-decoding', to_method_name_ko: '추측 디코딩', conditions: {}, note: '' }] : [];
    const exps = experiments.filter((e) => e.method_id === m.id);
    return { ...m, relations: rel, related_experiments: exps, local_measurements: m.id === 'm-kv' ? { total_runs: 6, succeeded_runs: 5, failed_runs: 1, locally_measured: true, best_improvement_summary: { decode_tps_rel_delta_pct: 20.2 } } : { total_runs: 0, succeeded_runs: 0, failed_runs: 0, locally_measured: false, best_improvement_summary: null } };
  }
  if (p === '/experiments/validate') {
    return { valid: true, errors: [], warnings: ['복수 방법론이 조합되었습니다. 조합 효과는 개별 기법의 단순 합과 다를 수 있으므로 별도 Ablation/단일 실험과의 비교가 권장됩니다.'], expanded_configurations: llmCfgs.slice(0, 5).map((c) => ({ label: c.label, role: c.role, parameters: c.parameters, config_hash: c.id })), resource_estimate: { total_runs: 5, estimated_total_seconds: 75, estimated_memory_mb: 4096, requires_gpu_lease: true } };
  }
  const ex = p.match(/^\/experiments\/([^/]+)$/);
  if (ex && method === 'GET') { const d = detailOf(ex[1]); if (!d) return {}; return d; }
  if (p === '/runs' && method === 'GET') {
    const e = q.get('experiment_id'); const s = q.get('study_id');
    const all = [...llmRuns, ...ttsRuns, ...ragRuns, extRun];
    const list = all.filter((r) => (!e || r.experiment_id === e) && (!s || r.study_id === s));
    return { runs: list.map((r) => (r.id === 'r-r11' ? { ...r, status: 'running', finished_at: null, wall_seconds: null } : r)) };
  }
  const rn = p.match(/^\/runs\/([^/]+)$/);
  if (rn && method === 'GET') {
    const all = [...llmRuns, ...ttsRuns, ...ragRuns, extRun]; const r = all.find((x) => x.id === rn[1]);
    if (!r) return {};
    const ms = [...llmMeas, ...ttsMeas, ...ragMeas, ...extMeas].filter((m) => m.run_id === r.id);
    return { ...r, raw_output: r.status === 'failed' ? {} : { generated_tokens: 128, wall_seconds: r.wall_seconds, device_evidence: ['ggml_metal_init: GPU name: Apple M2 Ultra', 'offloaded 33/33 layers to GPU'], output_preview: '회의에서는 다음 분기 계획과 예산 배정을 논의했고…' }, environment_snapshot: { os: 'darwin 27', adapter_version: '1.0', model: 'qwen3.5-4b-q4_k_m' }, measurements: ms, artifacts: ttsArts.filter((a) => a.run_id === r.id) };
  }
  return undefined;
}
