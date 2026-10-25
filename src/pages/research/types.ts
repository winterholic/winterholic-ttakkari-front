// AI Research Lab v2 API 계약(back-research-v2/docs/research-lab/refactor-v2.md §2~§7).
// 계약에 필드 모양이 적혀 있지 않은 응답(compare-series, dashboard 내부 항목 등)은 선택 필드로 두고 api.ts 가 정규화한다.

export type Data = Record<string, unknown>;

// ---- 분류 축 -----------------------------------------------------------------
export type AxisKey = 'target' | 'layer' | 'goal' | 'intervention' | 'research_method';
export const AXES: AxisKey[] = ['target', 'layer', 'goal', 'intervention', 'research_method'];

export interface TaxonomyTerm { id?: string; axis: string; code: string; label: string; label_ko: string; description?: string; parent_code?: string | null; sort_order?: number; is_system?: boolean }
export type Taxonomy = Record<string, TaxonomyTerm[]>;

// ---- F축: 실행 가능 상태 ---------------------------------------------------------
export type ExecutionStatus = 'hypothesis_stage' | 'adapter_required' | 'environment_unavailable' | 'partially_supported' | 'tool_integrated' | 'immediately_executable';
export const EXECUTION_STATUSES: ExecutionStatus[] = ['immediately_executable', 'tool_integrated', 'partially_supported', 'adapter_required', 'hypothesis_stage', 'environment_unavailable'];

// ---- 파라미터 스키마 11종 ---------------------------------------------------------
export type ParamType = 'number' | 'integer' | 'range' | 'enum' | 'boolean' | 'multi_enum' | 'model' | 'dataset' | 'file' | 'environment' | 'text';
export interface ParamSpec {
  key: string; label: string; type: ParamType;
  default?: unknown; required?: boolean;
  min?: number | null; max?: number | null; step?: number | null;
  options?: string[] | null; unit?: string | null; description?: string;
  /** 서버 시드가 선택지를 {value,label} 로 줄 때 api.ts 가 값은 options 로, 표시 이름은 여기로 푼다. */
  option_labels?: Record<string, string> | null;
  advanced?: boolean; sweepable?: boolean;
}

// ---- 방법론 ------------------------------------------------------------------
export type LifecycleStatus = 'hypothesis' | 'candidate' | 'validated' | 'deprecated';
export type EvidenceStatus = 'source_reported' | 'widely_practiced' | 'unverified';
export interface EvidenceItem { kind?: string; title?: string; url?: string; year?: number | null; claim?: string; kb_evidence_id?: string | null }
export interface LocalMeasurements { locally_measured: boolean; measured_run_count: number; total_runs?: number; succeeded_runs?: number; failed_runs?: number; best_improvement_summary?: Data | null }
export interface Compatibility { requires?: string[]; hardware?: string[]; runtimes?: string[]; notes?: string }

export interface Method {
  id: string; scope: string; slug: string; version: number; supersedes_id?: string | null;
  origin: 'system_seed' | 'user_registered' | 'hypothesis_promoted' | string;
  lifecycle_status: LifecycleStatus; name: string; name_ko: string; summary: string; principle?: string; category?: string;
  targets: string[]; layers: string[]; goals: string[]; interventions: string[]; research_methods: string[];
  parameters: ParamSpec[]; compatibility: Compatibility; metrics: string[];
  expected_effects: string[]; side_effects: string[]; evidence: EvidenceItem[]; evidence_status: EvidenceStatus;
  adapter_hints: string[]; tags: string[];
  source_study_id?: string | null; source_node_id?: string | null; promoted_from_run_id?: string | null;
  created_at?: string; updated_at?: string;
  // 런타임 계산(§3). 저장값이 아니다.
  execution_status: ExecutionStatus; unavailable_reason?: string | null; unsupported_params?: string[];
  local_measurements?: LocalMeasurements;
}
export interface MethodRelation {
  id?: string; relation_type: 'combines_with' | 'conflicts_with' | 'requires' | 'precedes' | 'alternative_to' | 'specializes' | string;
  from_method_id: string; to_method_id: string; conditions?: Data; note?: string;
  from_method?: MethodRef; to_method?: MethodRef; other_method?: MethodRef;
  // 상세 응답은 이 방법에서 나가는 관계만 주고 상대 방법을 평평한 필드로 푼다. api.ts 가 to_method 로 정규화한다.
  to_method_slug?: string; to_method_name_ko?: string;
}
export interface MethodRef { id: string; slug: string; name?: string; name_ko?: string; execution_status?: ExecutionStatus }
export interface MethodDetail extends Method { relations: MethodRelation[]; related_experiments: RelatedExperiment[] }
export interface RelatedExperiment { id: string; study_id?: string; name?: string; title?: string; strategy?: string; state?: string; study_title?: string; created_at?: string; best_summary?: string }

export type Facets = Record<string, Record<string, number>>;
export interface MethodList { items: Method[]; total: number; facets: Facets }
export interface MethodQuery {
  q?: string; target?: string[]; layer?: string[]; goal?: string[]; intervention?: string[]; research_method?: string[];
  execution_status?: string[]; lifecycle_status?: string[]; origin?: string[];
}
export interface MethodInput {
  slug: string; name: string; name_ko: string; summary: string; principle: string;
  targets: string[]; layers: string[]; goals: string[]; interventions: string[]; research_methods: string[];
  parameters: ParamSpec[]; compatibility: Compatibility; metrics: string[];
  expected_effects: string[]; side_effects: string[]; evidence: EvidenceItem[];
  lifecycle_status: LifecycleStatus; source_study_id?: string | null; source_node_id?: string | null;
  adapter_hints?: string[]; tags?: string[];
}

// ---- 어댑터·대시보드 ----------------------------------------------------------------
export interface AdapterStatus {
  adapter_id: string; ready: boolean; execution_mode?: string; reason?: string | null;
  available_models?: string[]; details?: Data; name_ko?: string; version?: string; domains?: string[];
  supported_parameters?: string[]; required_inputs?: string[];
}
export interface ResourceEstimate { estimated_seconds: number; estimated_memory_mb: number; total_runs?: number; requires_gpu_lease?: boolean; requires_tts_lock?: boolean; requires_cpu_lock?: boolean }
export interface BestResult {
  id: string; study_id: string; decision_node_id?: string | null;
  status: 'adopted' | 'superseded' | 'rejected'; rationale: string; created_at: string;
  // 채택 기준: 무엇에 대해 최적인가
  objective?: string; primary_metric?: string; constraints?: Data;
  // 대시보드 응답은 id 대신 이름만 준다. 이름으로 짝을 찾는다.
  experiment_id?: string; configuration_id?: string; run_id?: string; experiment_title?: string; configuration_label?: string;
  study_title?: string; metric_label?: string; rel_delta_pct?: number | null; summary?: string;
}
export interface QuickStart { id: string; title: string; description?: string; view?: string; filters?: Partial<Record<AxisKey | 'execution_status', string[]>>; method?: string; adapter_id?: string; strategy?: string; target?: string }
/** 대시보드의 최근 실행: 실행 목록과 달리 일부 필드가 없다. */
export type RecentRun = Partial<RunSummary> & { id: string; experiment_id: string; status: RunStatus };
export interface Dashboard {
  // executable_methods 는 실행을 시작할 수 있는 방법(일부 지원 포함), fully_executable_methods 는 파라미터가 모두 매핑되는 방법만 센다.
  counts: { studies: number; methods: number; running_runs: number; completed_runs: number; executable_methods?: number; fully_executable_methods?: number } & Record<string, number>;
  host_readiness: Record<string, AdapterStatus & { lease?: Data }> | AdapterStatus[];
  gpu_lease?: { held?: boolean } | null;
  recent_runs: RecentRun[]; best_results: BestResult[]; quick_start_templates?: QuickStart[];
}

// ---- 연구(기존 v1 구조 유지) ------------------------------------------------------------
export interface Study { id: string; title: string; goal: string; scope: string; phase: string; version: number; environment: Data; criteria: string[]; next_actions: string[]; primary_target?: string | null }
export interface KnowledgeNode { id: string; kind: string; title: string; summary: string; conditions: Data; details: Data; epistemic_status: string; evidence_id?: string; supersedes_id?: string; created_at?: string }
export interface Relation { id: string; from_id: string; to_id: string; predicate: string; rationale: string; conditions: Data }
export interface EvidenceQuote { id: string; quote: string; locator: string; source_key: string; sha256: string; active: boolean }
export interface TimelineEvent { id: string; kind: string; actor: string; payload: Data; created_at: string }
// v1 snapshot 의 experiments 와 v2 definition 이 모두 올 수 있다.
export interface SnapshotExperiment {
  id: string; title?: string; name?: string; hypothesis?: string; state?: string; adapter?: string; adapter_id?: string;
  strategy?: string; method_id?: string | null; compared_method_ids?: string[]; primary_metric?: string; hypothesis_node_id?: string | null;
  receipt?: Data; created_at?: string; started_at?: string | null; finished_at?: string | null;
  source_study_id?: string | null; source_experiment_id?: string | null; source_configuration_id?: string | null; source_run_id?: string | null;
}
export interface Snapshot {
  study: Study; nodes: KnowledgeNode[]; relations: Relation[]; experiments: SnapshotExperiment[]; timeline: TimelineEvent[]; evidence: EvidenceQuote[]; truncated: boolean;
  best_results?: BestResult[]; artifacts?: ResearchArtifact[];
  pagination?: { offset: number; limit: number; totals: Record<'nodes' | 'relations' | 'experiments' | 'timeline', number>; has_more: boolean };
}

// ---- 실험·실행 --------------------------------------------------------------------
export type Strategy = 'single' | 'baseline' | 'ab' | 'repeat' | 'grid' | 'random' | 'bayesian' | 'ablation';
export const STRATEGIES: Strategy[] = ['single', 'baseline', 'ab', 'repeat', 'grid', 'random', 'bayesian', 'ablation'];
export type AdapterId = 'llm_inference' | 'retrieval_eval' | 'tts_synthesis' | 'external_report';
export const ADAPTER_IDS: AdapterId[] = ['llm_inference', 'retrieval_eval', 'tts_synthesis', 'external_report'];

export interface Budget { max_runs: number; max_total_seconds: number; max_memory_mb: number; repetitions?: number }
export interface ExperimentPayload {
  study_id: string; method_id: string | null; compared_method_ids: string[]; adapter_id: string; strategy: Strategy;
  search_space: Record<string, unknown>; fixed_inputs: Record<string, unknown>; primary_metric: string; secondary_metrics?: string[]; budget: Budget; seed?: number;
  source_study_id?: string | null; source_experiment_id?: string | null; source_configuration_id?: string | null; source_run_id?: string | null;
}
export interface CreateExperimentPayload extends ExperimentPayload { name: string; hypothesis?: string; rationale?: string; auto_start?: boolean }
export interface ConfigPreview { label: string; role?: string; parameters: Data; config_hash?: string; ablation_factor?: string | null }
export interface ValidateResult { valid: boolean; errors: string[]; warnings: string[]; expanded_configurations: ConfigPreview[]; resource_estimate?: ResourceEstimate | null }

export interface Experiment {
  id: string; study_id: string; name: string; hypothesis_node_id?: string | null; dataset_version?: string; seed?: number; state?: string;
  method_id?: string | null; compared_method_ids: string[]; adapter_id: string; strategy: Strategy; search_space: Data; fixed_inputs: Data;
  primary_metric: string; secondary_metrics: string[]; budget: Budget; baseline_configuration_id?: string | null;
  started_at?: string | null; finished_at?: string | null; receipt?: Data;
  source_study_id?: string | null; source_experiment_id?: string | null; source_configuration_id?: string | null; source_run_id?: string | null;
}
export interface Configuration { id: string; experiment_id: string; label: string; role: 'baseline' | 'treatment' | 'candidate' | 'ablation_drop' | string; order_index: number; parameters: Data; config_hash: string; ablation_factor?: string | null }
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type ExecutionOrigin = 'local_measured' | 'external_report' | 'migrated_v1';
export interface RunSummary {
  id: string; experiment_id: string; configuration_id: string; study_id: string; adapter_id: string; execution_origin: ExecutionOrigin | string;
  repeat_index: number; seed?: number; status: RunStatus; progress: number | null;
  error_code?: string | null; error_message?: string | null; started_at?: string | null; finished_at?: string | null; wall_seconds?: number | null; created_at?: string;
  // 외부 보고 실행의 결과 출처. 외부 보고가 아니면 없다.
  provenance?: Provenance | string;
  // 선택: 서버가 목록 편의로 붙일 수 있는 표시용 이름
  experiment_name?: string; configuration_label?: string; study_title?: string;
}
export interface RunDetail extends RunSummary { raw_output: Data; environment_snapshot: Data; measurements?: Measurement[]; artifacts?: ResearchArtifact[] }
export interface Measurement {
  id?: string; run_id: string; experiment_id?: string; configuration_id: string; metric_key: string; metric_label: string; value: number; unit: string;
  direction: 'higher_is_better' | 'lower_is_better'; is_proxy: boolean; aggregator: string; slice_key: string; meta?: Data; created_at?: string;
}
export interface ResearchArtifact { id: string; study_id?: string; experiment_id?: string | null; run_id?: string | null; artifact_id: string; role: string; label: string; promoted_to_library?: boolean; created_at?: string; mime_type?: string; filename?: string }
export interface AnalysisSnapshot {
  id?: string; experiment_id: string; baseline_configuration_id?: string | null; best_configuration_id?: string | null; primary_metric: string;
  summary: Data; recommendation_ko: string; created_at?: string;
}
export interface ExperimentDetail {
  experiment: Experiment; configurations: Configuration[]; runs: RunSummary[]; measurements: Measurement[];
  latest_analysis?: AnalysisSnapshot | null; artifacts: ResearchArtifact[];
}
export interface RunList { runs: RunSummary[]; host_gpu_status?: Data | null; active_locks?: Array<string | Data> }

// ---- compare-series(정규화 시리즈) -----------------------------------------------------
export interface DeltaBarItem { configuration_id: string; label: string; metric_key: string; metric_label: string; unit?: string; abs_delta: number | null; rel_delta_pct: number | null; direction: 'higher_is_better' | 'lower_is_better'; is_proxy?: boolean; is_baseline?: boolean }
export interface MetricBarGroup { metric_key: string; metric_label: string; unit?: string; direction: 'higher_is_better' | 'lower_is_better'; is_proxy?: boolean; values: Array<{ configuration_id: string; label: string; value: number | null; n?: number }> }
export interface RepeatDistributionItem { configuration_id: string; label: string; metric_key: string; metric_label: string; unit?: string; n: number; mean: number | null; median: number | null; std: number | null; min: number | null; max: number | null; values?: number[]; is_proxy?: boolean }
export interface ParetoPoint { configuration_id: string; label: string; x: number; y: number; x_metric?: string; y_metric?: string; is_pareto_optimal?: boolean; role?: string }
export interface ParetoSeries { x_metric: string; y_metric: string; x_label: string; y_label: string; x_unit?: string; y_unit?: string; x_direction: 'higher_is_better' | 'lower_is_better'; y_direction: 'higher_is_better' | 'lower_is_better'; points: ParetoPoint[] }
export interface SweepLineSeries { parameter: string; metric_key: string; metric_label: string; unit?: string; points: Array<{ x: number | string; y: number | null; configuration_id?: string; n?: number }> }
export interface AblationImpact { factor: string; metric_key: string; metric_label?: string; full_value: number | null; drop_value: number | null; impact: number | null; rel_impact_pct?: number | null; unit?: string }
export interface ConfigDiffRow { configuration_id: string; label: string; role?: string; values: Data }
export interface ConfigDiff { keys: string[]; rows: ConfigDiffRow[]; changed_keys?: string[] }
export interface CompareSeries {
  delta_bars: DeltaBarItem[]; metric_bars: MetricBarGroup[]; repeat_distributions: RepeatDistributionItem[];
  pareto_points: ParetoPoint[]; pareto?: ParetoSeries | null; sweep_lines: SweepLineSeries[]; ablation_impacts: AblationImpact[]; config_diff_table: ConfigDiff | null;
  // 서버가 Pareto 를 그릴 수 없으면 pareto 는 null 이고 이유가 여기에 온다(지표가 2개 미만 등). 직접 계산한 시리즈에는 없다.
  pareto_status?: 'available' | 'unavailable'; pareto_unavailable_reason?: string | null;
}

// ---- 외부 결과·채택·리포트 -------------------------------------------------------------
export type Provenance = 'external_benchmark' | 'manual_evaluation' | 'imported_log';
export interface ExternalMetric { metric_key: string; metric_label: string; value: number; unit: string; direction: 'higher_is_better' | 'lower_is_better'; is_proxy?: boolean; aggregator?: string; slice_key?: string }
export interface ExternalReportPayload { configuration_id: string; provenance: Provenance; source_title?: string; source_url?: string; environment_snapshot: Data; metrics: ExternalMetric[]; raw_output: Data }
export interface AdoptPayload { experiment_id: string; configuration_id: string; run_id: string; objective: string; primary_metric: string; constraints: Data; status: 'adopted' | 'rejected'; rationale: string; promote_method: boolean }
/** 채택 응답의 method_promotion. 승격을 요청하지 않았으면 not_requested, 사용자 방법이면 promoted(method_id·lifecycle_status), 그 밖의 요청은 skipped + reason. */
export interface MethodPromotion { requested?: boolean; status?: string; reason?: string; method_id?: string; lifecycle_status?: string }
export type AdoptResponse = Data & { status?: string; method_promotion?: MethodPromotion | null }
export interface PromotePayload { run_id: string; decision_note: string; target_status: 'candidate' | 'validated' }
