import { researchRequest } from '../../api/client';
import type {
  AdapterStatus, AdoptPayload, AnalysisSnapshot, BestResult, CreateExperimentPayload, Dashboard, Data, Experiment, ExperimentDetail, ExperimentPayload,
  ExternalReportPayload, Facets, Measurement, Method, MethodDetail, MethodInput, MethodList, MethodQuery, MethodRelation, PromotePayload, RecentRun, ResearchArtifact, ResourceEstimate,
  RunDetail, RunList, RunSummary, Snapshot, Study, Taxonomy, TaxonomyTerm, ValidateResult,
} from './types';

const PAGE = 50;

// 방법·대시보드 조회는 범위(personal/work)를 쿼리로 받는다. 연구는 자기 범위를 갖고, 연구를 고르지 않으면 화면의 범위 선택을 따른다.
export type ResearchScope = 'personal' | 'work';
let currentScope: ResearchScope = 'personal';
export const getResearchScope = () => currentScope;
export function setResearchScope(scope: ResearchScope) { currentScope = scope; }

function query(params: Record<string, string | number | string[] | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) { if (v.length) q.set(k, v.join(',')); } else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

const PLURAL_AXIS: Record<string, string> = { targets: 'target', layers: 'layer', goals: 'goal', interventions: 'intervention', research_methods: 'research_method' };

/** facets 는 축별 {코드: 건수} 또는 [{code,count}] 로 오고, 축 이름이 복수형(targets)일 수 있어 단수형 {축: {코드: 건수}} 로 맞춘다. */
export function normalizeFacets(raw: unknown): Facets {
  const out: Facets = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [axis, value] of Object.entries(raw as Data)) {
    const counts: Record<string, number> = {};
    if (Array.isArray(value)) {
      for (const row of value as Array<Data>) {
        const code = String(row.code ?? row.value ?? row.key ?? '');
        if (code) counts[code] = Number(row.count ?? row.n ?? 0);
      }
    } else if (value && typeof value === 'object') {
      for (const [code, n] of Object.entries(value as Data)) counts[code] = Number(n);
    }
    out[PLURAL_AXIS[axis] ?? axis] = counts;
  }
  return out;
}

export function normalizeAdapters(raw: Dashboard['host_readiness'] | undefined): AdapterStatus[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Object.entries(raw).map(([id, v]) => ({ ...v, adapter_id: v.adapter_id ?? id }));
}

// ---- 연구(기존 엔드포인트 유지) ----------------------------------------------------
export const listStudies = () => researchRequest<Study[]>('/studies');
export const getSnapshot = (studyId: string) => researchRequest<Snapshot>(`/studies/${studyId}/resume`);
export const createStudy = (body: { title: string; goal: string; scope: string; criteria: string[]; environment: Data }) => researchRequest<Study>('/studies', body);
export const updateStudy = (studyId: string, body: Data) => researchRequest<Study>(`/studies/${studyId}`, body, 'PATCH');
export const addSource = (studyId: string, body: Data) => researchRequest<{ units: { id: string }[] }>(`/studies/${studyId}/sources`, body);
export const addNode = (studyId: string, body: Data) => researchRequest<Data>(`/studies/${studyId}/nodes`, body);
export const addRelation = (studyId: string, body: Data) => researchRequest<Data>(`/studies/${studyId}/relations`, body);
export const discoverPapers = (q: string) => researchRequest<{ items: { source_key: string; title: string; locator: string; body: string }[] }>(`/discover?q=${encodeURIComponent(q)}`);

// ---- 대시보드·분류 ---------------------------------------------------------------
type RawRecent = Data & { run_id?: string; id?: string; experiment_title?: string };
type RawBest = Data & { best_result_id?: string; id?: string };

/** 대시보드 항목은 id 대신 run_id·best_result_id 를 주고 이름을 experiment_title 로 준다. 화면이 쓰는 이름으로 맞춘다. */
export async function getDashboard(studyId?: string | null): Promise<Dashboard> {
  const r = await researchRequest<Omit<Dashboard, 'recent_runs' | 'best_results'> & { recent_runs?: RawRecent[]; best_results?: RawBest[] }>(`/dashboard${query({ study_id: studyId, scope: currentScope })}`);
  const recent_runs = (r.recent_runs ?? []).map(x => ({ ...x, id: x.id ?? x.run_id ?? '', experiment_name: x.experiment_name ?? x.experiment_title }) as unknown as RecentRun);
  const best_results = (r.best_results ?? []).map(x => ({ ...x, id: x.id ?? x.best_result_id ?? '' }) as unknown as BestResult);
  return { ...r, counts: r.counts ?? ({} as Dashboard['counts']), recent_runs, best_results };
}
export async function getTaxonomy(): Promise<Taxonomy> {
  const r = await researchRequest<{ axes?: Taxonomy } | Taxonomy>('/taxonomy');
  return ((r as { axes?: Taxonomy }).axes ?? r) as Taxonomy;
}
export const saveTaxonomyTerm = (body: Pick<TaxonomyTerm, 'axis' | 'code' | 'label' | 'label_ko' | 'description'>) => researchRequest<TaxonomyTerm>('/taxonomy', body);

// ---- 방법론 ---------------------------------------------------------------------
export async function listMethods(q: MethodQuery, offset = 0, limit = PAGE): Promise<MethodList> {
  const r = await researchRequest<{ items: Method[]; total: number; facets?: unknown }>(`/methods${query({
    q: q.q, target: q.target, layer: q.layer, goal: q.goal, intervention: q.intervention, research_method: q.research_method,
    execution_status: q.execution_status, lifecycle_status: q.lifecycle_status, origin: q.origin, scope: currentScope, limit, offset,
  })}`);
  return { items: r.items ?? [], total: r.total ?? r.items?.length ?? 0, facets: normalizeFacets(r.facets) };
}

/** 상세는 이 방법에서 나가는 관계만, 상대 방법을 평평한 필드(to_method_slug 등)로 준다. 화면이 쓰는 관계 모양으로 푼다. */
export async function getMethod(idOrSlug: string): Promise<MethodDetail> {
  const r = await researchRequest<MethodDetail>(`/methods/${encodeURIComponent(idOrSlug)}${query({ scope: currentScope })}`);
  const relations: MethodRelation[] = (r.relations ?? []).map(rel => ({
    ...rel, from_method_id: rel.from_method_id ?? r.id,
    to_method: rel.to_method ?? (rel.to_method_slug ? { id: rel.to_method_id, slug: rel.to_method_slug, name_ko: rel.to_method_name_ko } : undefined),
  }));
  const lm = r.local_measurements;
  return {
    ...r, relations, related_experiments: r.related_experiments ?? [],
    local_measurements: lm ? { ...lm, measured_run_count: lm.measured_run_count ?? lm.succeeded_runs ?? 0 } : undefined,
  };
}
export const createMethod = (body: MethodInput) => researchRequest<Method>(`/methods${query({ scope: currentScope })}`, body);
export const patchMethod = (id: string, body: Partial<MethodInput> & { create_new_version?: boolean }) => researchRequest<Method>(`/methods/${id}${query({ scope: currentScope })}`, body, 'PATCH');
export const promoteMethod = (id: string, body: PromotePayload) => researchRequest<Method>(`/methods/${id}/promote`, body);
export const addMethodRelation = (id: string, body: { to_method_id: string; relation_type: string; conditions?: Data; note?: string }) => researchRequest<MethodRelation>(`/methods/${id}/relations${query({ scope: currentScope })}`, body);

// ---- 실험 설계·실행 ---------------------------------------------------------------
type RawEstimate = Partial<ResourceEstimate> & { estimated_total_seconds?: number };
function normalizeEstimate(e: RawEstimate | null | undefined): ResourceEstimate | null {
  if (!e || !Object.keys(e).length) return null;
  return { ...e, estimated_seconds: e.estimated_seconds ?? e.estimated_total_seconds ?? 0, estimated_memory_mb: e.estimated_memory_mb ?? 0 };
}

/** 서버 모델은 알 수 없는 필드를 거부한다(extra=forbid). 보내는 필드를 하나씩 적는다. */
export async function validateExperiment(b: ExperimentPayload): Promise<ValidateResult> {
  const r = await researchRequest<ValidateResult & { resource_estimate?: RawEstimate }>('/experiments/validate', {
    study_id: b.study_id, method_id: b.method_id, compared_method_ids: b.compared_method_ids, adapter_id: b.adapter_id, strategy: b.strategy,
    search_space: b.search_space, fixed_inputs: b.fixed_inputs, primary_metric: b.primary_metric, budget: b.budget, seed: b.seed ?? 42,
  });
  return { ...r, errors: r.errors ?? [], warnings: r.warnings ?? [], expanded_configurations: r.expanded_configurations ?? [], resource_estimate: normalizeEstimate(r.resource_estimate) };
}

const DEFAULT_BUDGET = { max_runs: 20, max_total_seconds: 300, max_memory_mb: 4096 };
/** 서버는 실험 정의를 평평하게 주고 이름을 title 로 준다. 화면이 쓰는 name 으로 맞춘다. */
function toExperiment(raw: Data): Experiment {
  return {
    ...(raw as object), name: String(raw.name ?? raw.title ?? ''), adapter_id: String(raw.adapter_id ?? raw.adapter ?? ''), strategy: (raw.strategy ?? 'single') as Experiment['strategy'],
    compared_method_ids: (raw.compared_method_ids as string[]) ?? [], secondary_metrics: (raw.secondary_metrics as string[]) ?? [], search_space: (raw.search_space as Data) ?? {},
    fixed_inputs: (raw.fixed_inputs as Data) ?? {}, primary_metric: String(raw.primary_metric ?? ''), budget: { ...DEFAULT_BUDGET, ...((raw.budget as Data) ?? {}) },
  } as Experiment;
}
function splitExperiment(raw: Data) {
  const { configurations, runs, measurements, latest_analysis, artifacts, experiment, ...flat } = raw as Data & { experiment?: Data };
  return { experiment: toExperiment((experiment as Data) ?? flat), configurations: (configurations as ExperimentDetail['configurations']) ?? [], runs: (runs as RunSummary[]) ?? [], measurements: measurements as Measurement[] | undefined, latest_analysis: (latest_analysis as AnalysisSnapshot | null) ?? null, artifacts: (artifacts as ResearchArtifact[]) ?? [] };
}

export async function createExperiment(studyId: string, b: CreateExperimentPayload) {
  const raw = await researchRequest<Data>(`/studies/${studyId}/experiments`, {
    name: b.name, hypothesis: b.hypothesis ?? '', rationale: b.rationale ?? '', adapter_id: b.adapter_id, method_id: b.method_id, compared_method_ids: b.compared_method_ids,
    strategy: b.strategy, search_space: b.search_space, fixed_inputs: b.fixed_inputs, primary_metric: b.primary_metric, secondary_metrics: b.secondary_metrics ?? [],
    budget: b.budget, seed: b.seed ?? 42, auto_start: !!b.auto_start,
  });
  const s = splitExperiment(raw);
  return { experiment: s.experiment, configurations: s.configurations, runs: s.runs };
}

// 끝난 실행의 측정값은 바뀌지 않는다. 실험 상세가 측정값을 주지 않으면 실행별로 한 번만 받아 둔다.
const finishedMeasurements = new Map<string, Measurement[]>();
async function measurementsOf(runs: RunSummary[]): Promise<Measurement[]> {
  const ok = runs.filter(r => r.status === 'succeeded');
  const lists = await Promise.all(ok.map(async r => {
    const hit = finishedMeasurements.get(r.id);
    if (hit) return hit;
    const detail = await researchRequest<RunDetail>(`/runs/${r.id}`);
    const ms = detail.measurements ?? [];
    finishedMeasurements.set(r.id, ms);
    return ms;
  }));
  return lists.flat();
}

export async function getExperiment(id: string): Promise<ExperimentDetail> {
  const raw = await researchRequest<Data>(`/experiments/${id}`);
  const s = splitExperiment(raw);
  const measurements = s.measurements ?? await measurementsOf(s.runs);
  return { ...s, measurements };
}
export const runExperiment = (id: string, configurationIds: string[] | null) => researchRequest<{ runs: RunSummary[] }>(`/experiments/${id}/run`, { configuration_ids: configurationIds });
export const listRuns = (p: { study_id?: string | null; experiment_id?: string | null; status?: string | null; limit?: number }) => researchRequest<RunList>(`/runs${query({ ...p, limit: p.limit ?? 50 })}`);
export const getRun = (id: string) => researchRequest<RunDetail>(`/runs/${id}`);
export const cancelRun = (id: string, reason: string) => researchRequest<{ cancelled: boolean; run_id: string }>(`/runs/${id}/cancel`, { reason });
export const addExternalReport = (experimentId: string, body: ExternalReportPayload) => researchRequest<Data>(`/experiments/${experimentId}/external-report`, body);

// ---- 비교·분석 ------------------------------------------------------------------
export const analyzeExperiment = (id: string, body: { baseline_configuration_id: string | null; pareto_x_metric?: string; pareto_y_metric?: string }) => researchRequest<AnalysisSnapshot>(`/experiments/${id}/analyze`, body);

// ---- 채택·리포트 -----------------------------------------------------------------
export const adoptBestResult = (studyId: string, body: AdoptPayload) => researchRequest<Data & { status?: string }>(`/studies/${studyId}/best-results`, body);
export const exportReport = (studyId: string, body: { experiment_ids: string[]; promote_to_library: boolean }) => researchRequest<{ artifact_id?: string; label?: string; promoted_to_library?: boolean; preview?: string }>(`/studies/${studyId}/export-report`, body);

export function errorText(e: unknown) { return e instanceof Error ? e.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.'; }
