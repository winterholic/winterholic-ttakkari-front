import type { AdapterId, AxisKey, EvidenceStatus, ExecutionStatus, LifecycleStatus, QuickStart, RunStatus, Strategy } from './types';

export type Tone = 'info' | 'success' | 'warning' | 'danger';

export const VIEWS = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'library', label: '방법론' },
  { id: 'designer', label: '실험 설계' },
  { id: 'monitor', label: '실행 모니터' },
  { id: 'analysis', label: '결과 분석' },
  { id: 'records', label: '기록·결과물' },
] as const;
export type ViewId = (typeof VIEWS)[number]['id'];
export const isView = (v: string | null): v is ViewId => VIEWS.some(x => x.id === v);

export const AXIS_LABEL: Record<AxisKey | 'execution_status', string> = {
  target: '대상', layer: '계층', goal: '목표', intervention: '개입', research_method: '연구 방법', execution_status: '실행 상태',
};

// F축 6단계 한국어 배지와 의미(refactor-v2.md §3)
export const EXECUTION: Record<ExecutionStatus, { label: string; tone?: Tone; hint: string }> = {
  immediately_executable: { label: '즉시 실행 가능', tone: 'success', hint: '이 서버 안의 평가기로 바로 실행하고 측정합니다.' },
  tool_integrated: { label: '기존 도구 연동', tone: 'success', hint: '호스트 GPU·로컬 모델 같은 기존 도구를 호출해 실행합니다.' },
  partially_supported: { label: '일부 지원', tone: 'warning', hint: '일부 파라미터는 실행되지 않거나 대체 방식으로만 실행됩니다.' },
  adapter_required: { label: '어댑터 필요', tone: 'info', hint: '이 서버에서 실행할 어댑터가 없습니다. 외부에서 실행한 결과를 등록할 수 있습니다.' },
  hypothesis_stage: { label: '가설 단계', tone: 'info', hint: '실험 프로토콜이 구체화되지 않았습니다. 파라미터·지표를 정의하거나 외부 결과를 기록하세요.' },
  environment_unavailable: { label: '현재 환경 불가', tone: 'danger', hint: '어댑터는 있지만 지금 환경에서는 실행할 수 없습니다.' },
};
export const execLabel = (s: string) => EXECUTION[s as ExecutionStatus]?.label ?? s;

export const LIFECYCLE: Record<LifecycleStatus, { label: string; tone?: Tone }> = {
  hypothesis: { label: '가설', tone: 'info' },
  candidate: { label: '후보 (외부 결과만)', tone: 'warning' },
  validated: { label: '검증됨', tone: 'success' },
  deprecated: { label: '폐기' },
};

export const EVIDENCE: Record<EvidenceStatus, string> = {
  source_reported: '문헌 보고',
  widely_practiced: '널리 쓰임',
  unverified: '미검증',
};

export const ORIGIN: Record<string, string> = { system_seed: '기본 카탈로그', user_registered: '직접 등록', hypothesis_promoted: '가설에서 승격' };

export const RUN_STATUS: Record<RunStatus, string> = { queued: '대기', running: '실행 중', succeeded: '성공', failed: '실패', cancelled: '취소' };
export const RUN_BADGE: Record<RunStatus, 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'> = { queued: 'queued', running: 'running', succeeded: 'succeeded', failed: 'failed', cancelled: 'cancelled' };
export const ORIGIN_LABEL: Record<string, string> = { local_measured: '따까리 실측', external_report: '외부 보고', migrated_v1: '이전 버전 이관' };
// 외부 보고 실행이 어디서 온 값인지(Provenance). 따까리가 직접 측정한 값이 아니라는 점은 출처와 별개로 늘 표시한다.
export const PROVENANCE_LABEL: Record<string, string> = { external_benchmark: '외부 벤치마크', manual_evaluation: '사람이 직접 평가', imported_log: '로그에서 가져옴' };

// 실행기가 남기는 error_code 중 사용자가 취할 행동이 다른 것. 원문 메시지는 그대로 두고 이 설명을 먼저 보여 준다.
export const ERROR_CODE_NOTE: Record<string, string> = {
  GENERATION_REJECTED: '서버가 새 버전으로 바뀌는 중이라 이 실행을 시작하지 못했습니다. 설정이나 실행기의 문제가 아니니 잠시 뒤 같은 설정으로 다시 실행하세요.',
  cancelled: '사용자가 취소한 실행입니다.',
};
// 실행 모니터의 점유 중인 잠금 이름(서버 active_locks[].lock)
export const LOCK_LABEL: Record<string, string> = { host_gpu_lease: '호스트 GPU 임대', tts_lock: 'TTS 합성 잠금', cpu_lock: 'CPU 평가 잠금' };
export const errorCodeNote =(code?: string | null) => (code ? ERROR_CODE_NOTE[code] : undefined);

export const STRATEGY: Record<Strategy, { label: string; hint: string; supported: boolean }> = {
  single: { label: '단일 실행', hint: '설정 한 개를 한 번 실행합니다.', supported: true },
  baseline: { label: 'Baseline 측정', hint: '기준이 될 설정 한 개를 측정합니다.', supported: true },
  ab: { label: 'A/B 비교', hint: '기준(A)과 변경(B) 설정을 같은 입력으로 비교합니다.', supported: true },
  repeat: { label: '반복 측정', hint: '같은 설정을 여러 번 실행해 변동성을 봅니다 (최대 10회).', supported: true },
  grid: { label: 'Grid 탐색', hint: '지정한 후보 값의 모든 조합을 실행합니다. 조합 수는 예산 안이어야 합니다.', supported: true },
  random: { label: 'Random 탐색', hint: '탐색 공간에서 중복 없이 N개를 뽑아 실행합니다.', supported: true },
  bayesian: { label: 'Bayesian 탐색', hint: 'optuna 가 설치되어 있을 때만 실행됩니다. 없으면 검증 단계에서 막히며 다른 방식으로 대체하지 않습니다.', supported: true },
  ablation: { label: 'Ablation', hint: '모든 개입을 켠 설정에서 요소를 하나씩 빼며 각 요소의 기여를 봅니다.', supported: true },
};
// 탐색 후보(배열)를 받는 전략
export const SWEEP_STRATEGIES: Strategy[] = ['grid', 'random', 'bayesian', 'ab', 'ablation'];

export const ADAPTER: Record<AdapterId, { label: string; hint: string; metric: string; domains: string }> = {
  llm_inference: { label: '로컬 LLM 추론', hint: '호스트 GPU의 llama-server 로 속도·메모리를 측정합니다. 개인 범위에서만 실행됩니다.', metric: 'decode_tps', domains: 'LLM' },
  retrieval_eval: { label: '검색 평가', hint: '코퍼스와 질의로 Recall·MRR·nDCG·지연을 측정합니다. CPU 에서 실행됩니다.', metric: 'recall_at_k', domains: 'RAG·임베딩' },
  tts_synthesis: { label: 'TTS 합성', hint: '정규화·발음 처리 후 Supertonic 3 로 합성하고 RTF 와 음성 샘플을 남깁니다.', metric: 'rtf', domains: 'TTS' },
  external_report: { label: '외부 결과 등록', hint: '이 서버에서 실행할 수 없는 방법의 결과를 직접 입력합니다. 실측으로 취급되지 않습니다.', metric: '', domains: '모든 분야' },
};
/** 실행기가 측정 결과로 실제 내는 지표. 방법 카탈로그의 권장 지표(tokens_per_sec 등)는 이름이 달라 어댑터가 만들지 않으므로 선택지에서 걸러 낸다. 외부 결과는 사용자가 이름을 정한다. */
export const ADAPTER_METRICS: Partial<Record<AdapterId, string[]>> = {
  llm_inference: ['decode_tps', 'prefill_tps', 'approx_prefill_ms', 'wall_seconds', 'swap_peak_growth_mb'],
  retrieval_eval: ['recall_at_k', 'mrr_at_k', 'ndcg_at_k', 'query_latency_ms_mean', 'query_latency_ms_p95', 'chunk_count', 'wall_seconds'],
  tts_synthesis: ['rtf', 'synth_seconds', 'audio_seconds', 'load_seconds', 'peak_rss_mb', 'chunk_count', 'normalized_char_delta', 'stt_cer_vs_normalized', 'stt_cer_vs_raw', 'stt_wer_vs_normalized'],
};
export const adapterLabel = (id: string) => ADAPTER[id as AdapterId]?.label ?? id;

export const RELATION: Record<string, { label: string; tone?: Tone }> = {
  combines_with: { label: '조합 가능', tone: 'success' },
  conflicts_with: { label: '충돌', tone: 'danger' },
  requires: { label: '선행 필요', tone: 'warning' },
  precedes: { label: '먼저 적용', tone: 'warning' },
  alternative_to: { label: '대안' },
  specializes: { label: '세부 기법' },
};

export const PHASE: Record<string, string> = { planning: '연구 기획', investigation: '자료 조사', paused: '일시 중단', analysis: '결과 분석', completed: '완료', archived: '보관' };
export const KIND: Record<string, string> = { method: '방법론', claim: '주장', finding: '경험적 발견', hypothesis: '가설', observation: '관찰', interpretation: '해석', decision: '결정', constraint: '제약', artifact: '아티팩트' };
export const EPISTEMIC: Record<string, string> = { source_reported: '논문·원문 보고', locally_measured: '따까리 실측', unverified: '미검증' };
export const EVENT: Record<string, string> = {
  study_created: '연구를 시작했습니다', study_updated: '연구 계획을 고쳤습니다', source_imported: '원문을 확보했습니다', node_added: '연구 지식을 기록했습니다',
  relation_proposed: '연구 사이의 관계를 제안했습니다', selection_recorded: '방법론을 비교했습니다', experiment_planned: '실험을 설계했습니다',
  execution_started: '실행을 시작했습니다', execution_finished: '실행 결과가 나왔습니다', external_report_added: '외부 결과를 접수했습니다', experiment_control: '실험을 제어했습니다',
};

// 지표 사전: 서버가 label/direction 을 주지 않는 곳(설계실 지표 선택)에서만 쓴다. 측정 행에는 서버 값을 그대로 쓴다.
export interface MetricInfo { label: string; unit: string; direction: 'higher_is_better' | 'lower_is_better'; proxy?: string }
export const METRICS: Record<string, MetricInfo> = {
  decode_tps: { label: '디코드 속도', unit: 'tok/s', direction: 'higher_is_better' },
  prefill_tps: { label: '프리필 속도', unit: 'tok/s', direction: 'higher_is_better' },
  approx_prefill_ms: { label: '근사 프리필 시간', unit: 'ms', direction: 'lower_is_better', proxy: '비스트리밍 응답에서 역산한 근사값입니다. 실제 첫 토큰 시간(TTFT)이 아닙니다.' },
  wall_seconds: { label: '총 소요 시간', unit: 's', direction: 'lower_is_better' },
  swap_peak_growth_mb: { label: '스왑 피크 증가', unit: 'MB', direction: 'lower_is_better' },
  recall_at_k: { label: 'Recall@k', unit: '', direction: 'higher_is_better' },
  mrr_at_k: { label: 'MRR@k', unit: '', direction: 'higher_is_better' },
  ndcg_at_k: { label: 'nDCG@k', unit: '', direction: 'higher_is_better' },
  query_latency_ms_mean: { label: '질의 지연 평균', unit: 'ms', direction: 'lower_is_better' },
  query_latency_ms_p95: { label: '질의 지연 p95', unit: 'ms', direction: 'lower_is_better' },
  chunk_count: { label: '청크 수', unit: '개', direction: 'lower_is_better' },
  rtf: { label: 'RTF (합성시간/음성길이)', unit: '', direction: 'lower_is_better' },
  synth_seconds: { label: '합성 시간', unit: 's', direction: 'lower_is_better' },
  audio_seconds: { label: '음성 길이', unit: 's', direction: 'higher_is_better' },
  load_seconds: { label: '모델 로드 시간', unit: 's', direction: 'lower_is_better' },
  peak_rss_mb: { label: '메모리 피크', unit: 'MB', direction: 'lower_is_better' },
  normalized_char_delta: { label: '정규화 글자 수 변화', unit: '개', direction: 'lower_is_better' },
  stt_cer_vs_normalized: { label: 'STT 재인식 CER (정규화 기준)', unit: '', direction: 'lower_is_better', proxy: 'STT 재인식 오류율은 발음 명료도의 간접 지표입니다. 실제 청취 품질·자연스러움이 아닙니다.' },
  stt_cer_vs_raw: { label: 'STT 재인식 CER (원문 기준)', unit: '', direction: 'lower_is_better', proxy: 'STT 재인식 오류율은 발음 명료도의 간접 지표입니다. 실제 청취 품질·자연스러움이 아닙니다.' },
  stt_wer_vs_normalized: { label: 'STT 재인식 WER (정규화 기준)', unit: '', direction: 'lower_is_better', proxy: 'STT 재인식 오류율은 발음 명료도의 간접 지표입니다. 실제 청취 품질·자연스러움이 아닙니다.' },
};
export const PROXY_GENERIC = '간접 지표(proxy)입니다. 목표 품질을 직접 측정한 값이 아닙니다.';
export const metricLabel = (key: string, fallback?: string) => fallback || METRICS[key]?.label || key;
export const proxyNote = (key: string) => METRICS[key]?.proxy ?? PROXY_GENERIC;

// 빠른 시작 4종(시나리오 A~D). 서버 quick_start_templates 가 없을 때의 기본값.
export const QUICK_STARTS: QuickStart[] = [
  { id: 'A', title: 'LLM 추론 속도·메모리', description: 'KV 캐시 양자화, Flash Attention, 디코딩 방식으로 속도와 메모리 균형을 찾습니다.', view: 'library', filters: { target: ['llm'], goal: ['latency_ttft', 'memory_vram'] } },
  { id: 'B', title: 'TTS 한국어 발음', description: '숫자·영문 약어 정규화와 발음사전으로 발음 오류를 줄입니다.', view: 'library', filters: { target: ['tts'], goal: ['pronunciation_prosody'] } },
  { id: 'C', title: 'RAG 검색 정확도', description: 'BM25·하이브리드·재정렬을 비교해 Recall@k 와 MRR 을 올립니다.', view: 'library', filters: { target: ['rag'] } },
  { id: 'D', title: '새 방법·가설 등록', description: '카탈로그에 없는 아이디어를 가설로 등록하고, 실행기 연결이나 외부 결과로 검증합니다.', view: 'library', method: 'new' },
];
