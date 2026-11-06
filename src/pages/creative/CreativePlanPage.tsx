import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import {
  planApprove,
  planCreate,
  planEdit,
  planGet,
  planList,
  productionDispatch,
  productionGet,
  productionRender,
  productionGenerateAssets,
  productionMediaUrl,
  productionResultUrl,
  productionRevision,
  productionReview,
  productionRepairPlan,
  productionRepairApply,
  productionUpload,
} from "../../api/creativeV2";
import { creativeList } from "../../api/creative";
import type { CreativeProject } from "../../api/creative";
import type {
  CreativePlan,
  DurationAlternative,
  DurationRequest,
  DurationStatus,
  MatchResult,
  PlanScene,
  ProductionState,
  ProductionView,
  ProductionRevision,
  QualityDefect,
  RenderPlan,
  SceneEditBody,
} from "../../api/creativeV2";
import { errorText } from "../../features/viewer/api";
import { PageHeader } from "../../shell/PageHeader";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { DurationPicker } from "./DurationPicker";
import type { DurationState } from "./duration";
import { INITIAL_DURATION, MAX_SECONDS, clock, describeRequest, formatSeconds, toRequest } from "./duration";
import "../creative.css";
import "./creativePlan.css";
import { StoryboardCreateFlow } from "./StoryboardCreateFlow";

type Tone = "info" | "success" | "warning" | "danger" | undefined;

const STATUS_LABEL: Record<DurationStatus, { text: string; tone: Tone }> = {
  auto: { text: "자동 결정", tone: "info" },
  target_met: { text: "희망에 맞춤", tone: "success" },
  deviated: { text: "희망과 차이", tone: "warning" },
  strict_met: { text: "지정 길이 충족", tone: "success" },
  conflict: { text: "길이 충돌", tone: "danger" },
};

const MATCH_LABEL: Record<MatchResult["status"], { text: string; tone: Tone; note: string }> = {
  ready: { text: "제작 가능", tone: "success", note: "필수 능력이 모두 실행 기록을 갖고 있어요." },
  ready_unverified: {
    text: "검증 필요",
    tone: "warning",
    note: "필수 능력이 설치돼 있지만 일부는 이 조합으로 실행한 기록이 없어요.",
  },
  blocked: { text: "지금은 만들 수 없음", tone: "danger", note: "필수 능력이 없어서 제작을 시작할 수 없어요." },
  needs_user_decision: { text: "결정 필요", tone: "warning", note: "충돌이나 미결정 항목을 먼저 정해야 해요." },
};

const SCOPE_LABEL = {
  studio_runtime: "스튜디오 제작 런타임에서 실행",
  lab_manual: "lab에서 수동 실행하는 수준(스튜디오 렌더에는 아직 연결되지 않음)",
  none: "실행 불가",
} as const;

const STATE_LABEL: Record<PlanScene["duration_state"], string> = {
  ok: "적정",
  compressed: "압축됨",
  stretched: "늘어남",
};

const today = () => new Date().toISOString().slice(0, 10);

function errorLine(error: unknown) {
  return errorText(error).message;
}

function qualityVerdict(value: string) {
  return ({ pass: "통과", fail: "실패", unknown: "미확인", needs_review: "추가 검수 필요" } as Record<string, string>)[value] ?? value;
}

type CaptionMode = "narration" | "title_only";
const captionModeKey = (planId: string) => `creative-caption-mode:${planId}`;
function readCaptionMode(planId: string): CaptionMode | null {
  try {
    const value = sessionStorage.getItem(captionModeKey(planId));
    return value === "narration" || value === "title_only" ? value : null;
  } catch {
    return null;
  }
}
function rememberCaptionMode(planId: string, value: CaptionMode | null | undefined) {
  if (!value) return;
  try { sessionStorage.setItem(captionModeKey(planId), value); } catch { /* session persistence is optional */ }
}
function consumedCaptionField(scene: PlanScene | undefined, mode: CaptionMode): "title" | "narration" {
  return mode === "title_only" || !scene?.narration ? "title" : "narration";
}

function NeededBar({ plan }: { plan: CreativePlan }) {
  const { needed, request, planned_seconds: planned } = plan.duration;
  const high = Math.max(needed.max_seconds, request.seconds ?? 0, planned ?? 0) * 1.05 || 1;
  const pos = (v: number) => `${Math.min(100, (v / high) * 100)}%`;
  return (
    <div className="creative-range" role="group" aria-label="콘텐츠 필요 길이 범위">
      <div className="creative-range__track">
        <span
          className="creative-range__span"
          style={{ left: pos(needed.min_seconds), width: `calc(${pos(needed.max_seconds)} - ${pos(needed.min_seconds)})` }}
        />
        <span className="creative-range__mark creative-range__mark--ideal" style={{ left: pos(needed.ideal_seconds) }} />
        {planned != null && (
          <span className="creative-range__mark creative-range__mark--plan" style={{ left: pos(planned) }} />
        )}
        {request.seconds != null && (
          <span className="creative-range__mark creative-range__mark--ask" style={{ left: pos(request.seconds) }} />
        )}
      </div>
      <dl className="creative-range__legend">
        <div>
          <dt>정보를 지우지 않는 최소</dt>
          <dd>{formatSeconds(needed.min_seconds)}</dd>
        </div>
        <div>
          <dt>내용에 맞는 길이</dt>
          <dd>{formatSeconds(needed.ideal_seconds)}</dd>
        </div>
        <div>
          <dt>반복 없이 늘릴 한계</dt>
          <dd>{formatSeconds(needed.max_seconds)}</dd>
        </div>
      </dl>
    </div>
  );
}

function RuntimeCard({
  plan,
  onRequest,
  busy,
}: {
  plan: CreativePlan;
  onRequest: (request: DurationRequest) => void;
  busy: boolean;
}) {
  const d = plan.duration;
  const status = STATUS_LABEL[d.status];
  const shown = plan.duration_check?.total_seconds ?? d.planned_seconds;
  const apply = (alt: DurationAlternative) => {
    if (alt.seconds != null) onRequest({ mode: "preferred", seconds: alt.seconds });
  };
  return (
    <section className="creative-panel" aria-labelledby="plan-runtime">
      <h2 id="plan-runtime">예상 러닝타임</h2>
      <div className="creative-runtime">
        <strong className="creative-runtime__value" aria-label={shown == null ? "계획 없음" : formatSeconds(shown)}>
          {shown == null ? "—" : clock(shown)}
        </strong>
        <div className="creative-runtime__meta">
          <Badge tone={status.tone}>{status.text}</Badge>
          <span>요청: {describeRequest(d.request)}</span>
          {shown != null && (
            <span>
              {Math.round(shown * d.fps)}프레임 · {d.fps}fps
            </span>
          )}
        </div>
      </div>
      <NeededBar plan={plan} />
      <ul className="creative-reasons">
        {d.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {d.warnings.length > 0 && (
        <ul className="creative-reasons creative-reasons--warn" aria-label="주의">
          {d.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {d.alternatives.length > 0 && (
        <div className="creative-alternatives">
          <h3>선택지</h3>
          <ul>
            {d.alternatives.map((alt) => (
              <li key={alt.kind + alt.label} data-feasible={alt.feasible}>
                <div>
                  <strong>{alt.label}</strong>
                  {!alt.feasible && <Badge tone="warning">현실적이지 않음</Badge>}
                  <p>{alt.detail}</p>
                </div>
                {alt.kind === "relax_to_feasible" && alt.seconds != null && (
                  <Button size="sm" busy={busy} onClick={() => apply(alt)}>
                    {`${formatSeconds(alt.seconds)}로 다시 계획`}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface DraftScene {
  id: string;
  title: string;
  narration: string;
  seconds: string;
  info_weight: number;
  essential: boolean;
}

const draftOf = (s: PlanScene): DraftScene => ({
  id: s.scene_id,
  title: s.title,
  narration: s.narration,
  seconds: String(s.seconds),
  info_weight: s.info_weight,
  essential: s.essential,
});

function parseSceneSeconds(text: string): number | null {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) && n > 0 && n <= MAX_SECONDS ? n : null;
}

function SceneEditor({
  plan,
  onSave,
  busy,
}: {
  plan: CreativePlan;
  onSave: (scenes: SceneEditBody[]) => void;
  busy: boolean;
}) {
  const [rows, setRows] = useState<DraftScene[]>(() => plan.scenes.map(draftOf));
  const byId = new Map(plan.scenes.map((s) => [s.scene_id, s]));
  const parsed = rows.map((r) => parseSceneSeconds(r.seconds));
  const invalid = parsed.some((v) => v === null);
  const total = parsed.reduce<number>((n, v) => n + (v ?? 0), 0);
  const dirty =
    rows.length !== plan.scenes.length ||
    rows.some((r, i) => {
      const s = plan.scenes[i];
      return !s || r.id !== s.scene_id || r.title !== s.title || r.narration !== s.narration || parseSceneSeconds(r.seconds) !== s.seconds;
    });
  const patch = (i: number, change: Partial<DraftScene>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
  const addScene = () =>
    setRows((rs) => [
      ...rs,
      { id: `n${Date.now().toString(36)}`, title: "새 장면", narration: "", seconds: "5", info_weight: 1, essential: true },
    ]);
  const save = () =>
    onSave(
      rows.map((r, i) => ({
        id: r.id,
        title: r.title,
        narration: r.narration,
        seconds: parsed[i] ?? 0,
        info_weight: r.info_weight,
        essential: r.essential,
      })),
    );
  const check = plan.duration_check;
  return (
    <section className="creative-panel" aria-labelledby="plan-scenes">
      <h2 id="plan-scenes">장면 구성</h2>
      <p className="creative-hint">
        장면 길이는 대사를 다 말할 수 있는 바닥 아래로 줄일 수 없어요. 저장하면 전체 길이를 프레임 단위로 다시 계산해요.
      </p>
      <ol className="creative-scenes">
        {rows.map((row, i) => {
          const need = byId.get(row.id);
          const seconds = parsed[i];
          const cut = need && seconds !== null && seconds < need.floor;
          return (
            <li key={row.id} className="creative-scene">
              <span className="creative-scene__index">{i + 1}</span>
              <div className="creative-scene__body">
                <label className="creative-field">
                  제목
                  <input className="tk-input" value={row.title} maxLength={160} onChange={(e) => patch(i, { title: e.target.value })} />
                </label>
                <label className="creative-field">
                  대사
                  <textarea
                    className="tk-textarea"
                    rows={2}
                    value={row.narration}
                    maxLength={4000}
                    onChange={(e) => patch(i, { narration: e.target.value })}
                    placeholder="이 장면에서 말할 내용"
                  />
                </label>
              </div>
              <div className="creative-scene__time">
                <label className="creative-field">
                  길이(초)
                  <input
                    className="tk-input"
                    inputMode="decimal"
                    value={row.seconds}
                    aria-invalid={seconds === null || cut ? true : undefined}
                    onChange={(e) => patch(i, { seconds: e.target.value })}
                  />
                </label>
                {need ? (
                  <span className="creative-scene__range">
                    바닥 {formatSeconds(need.floor)} · 이상 {formatSeconds(need.ideal)} · 한계 {formatSeconds(need.ceiling)}
                  </span>
                ) : (
                  <span className="creative-scene__range">저장하면 필요 길이를 계산해요</span>
                )}
                {need && <Badge tone={need.duration_state === "ok" ? undefined : "warning"}>{STATE_LABEL[need.duration_state]}</Badge>}
                {need && (
                  <>
                    <p className="creative-scene__evidence">
                      목적: {need.narrative_goal} · 대사 예상 {formatSeconds(need.speech_seconds)} · {need.essential ? "필수 장면" : "선택 장면"}
                    </p>
                    {[
                      ["필수 기술", need.required_skills],
                      ["선택 도구", need.selected_tools],
                      ["선택 모델", need.selected_models],
                      ["품질 검사 목표", need.quality_checks],
                      ["인물", need.characters],
                      ["환경", need.environment],
                      ["카메라", need.camera],
                      ["움직임", need.motion],
                      ["오디오", need.audio],
                      ["의존 장면", need.dependencies],
                      ["출력 자산", need.output_assets],
                    ].some(([, values]) => Array.isArray(values) && values.length > 0) && (
                      <details className="creative-scene__basis">
                        <summary>장면 근거·목표 검사</summary>
                        <dl>
                          {[
                            ["필수 기술", need.required_skills], ["선택 도구", need.selected_tools],
                            ["선택 모델", need.selected_models], ["품질 검사 목표", need.quality_checks],
                            ["인물", need.characters], ["환경", need.environment], ["카메라", need.camera],
                            ["움직임", need.motion], ["오디오", need.audio], ["의존 장면", need.dependencies],
                            ["출력 자산", need.output_assets],
                          ].filter(([, values]) => Array.isArray(values) && values.length > 0).map(([label, values]) => (
                            <div key={String(label)}><dt>{String(label)}</dt><dd>{(values as string[]).join(", ")}</dd></div>
                          ))}
                          {need.style_dna && <div><dt>Style DNA</dt><dd>{need.style_dna}</dd></div>}
                        </dl>
                      </details>
                    )}
                  </>
                )}
                {cut && (
                  <span className="tk-error" role="alert">
                    대사가 잘려요
                  </span>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={rows.length <= 1}
                  aria-label={`${row.title || i + 1}번 장면 삭제`}
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                >
                  삭제
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="creative-scenes__footer">
        <Button size="sm" onClick={addScene}>
          장면 추가
        </Button>
        <span className="creative-scenes__total" aria-live="polite">
          입력한 길이 합계 {invalid ? "—" : formatSeconds(total)} ({invalid ? "올바르지 않은 길이가 있어요" : `${Math.round(total * plan.duration.fps)}프레임`})
        </span>
        <Button variant="primary" busy={busy} disabled={!dirty || invalid} onClick={save}>
          변경 저장·다시 계산
        </Button>
      </div>
      {check && (
        <div className="creative-check" data-status={check.status}>
          <strong>{check.status === "ok" ? "재계산 결과: 규칙을 지켜요" : "재계산 결과: 고쳐야 할 점이 있어요"}</strong>
          <span>
            전체 {formatSeconds(check.total_seconds)}
            {check.target_delta_seconds != null && ` (요청과 ${check.target_delta_seconds >= 0 ? "+" : ""}${check.target_delta_seconds}초)`}
          </span>
          {check.errors.length > 0 && (
            <ul role="alert">
              {check.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {check.warnings.length > 0 && (
            <ul>
              {check.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function MatchPanel({ plan }: { plan: CreativePlan }) {
  const m = plan.match;
  const label = MATCH_LABEL[m.status];
  const recipe = m.candidates.find((c) => c.recipe_id === m.primary_recipe);
  return (
    <section className="creative-panel" aria-labelledby="plan-match">
      <h2 id="plan-match">제작 방식 판정</h2>
      <div className="creative-runtime__meta">
        <Badge tone={label.tone}>{label.text}</Badge>
        <span>{SCOPE_LABEL[m.execution_scope]}</span>
      </div>
      <p className="creative-hint">{label.note}</p>
      {recipe ? (
        <p>
          선택한 레시피: <strong>{recipe.recipe_id} {recipe.name}</strong>
          {m.auxiliary_recipes.length > 0 && ` · 보조 ${m.auxiliary_recipes.join(", ")}`}
        </p>
      ) : (
        <p>이 요청에 맞는 레시피를 찾지 못했어요. 콘텐츠 유형과 스타일을 더 구체적으로 알려 주세요.</p>
      )}
      {plan.intent_status === "unconfirmed_hint" && (
        <p className="creative-notice" role="status">
          의도를 아직 확인하지 않았어요. 단어 힌트로 만든 초안이라 이 판정을 결정으로 쓰지 않아요.
        </p>
      )}
      {m.conflicts.length > 0 && (
        <div>
          <h3>충돌</h3>
          <ul className="creative-reasons">
            {m.conflicts.map((c) => (
              <li key={c.a + c.b}>
                {c.a} × {c.b}: {c.rationale}
              </li>
            ))}
          </ul>
        </div>
      )}
      {m.gaps.filter((g) => g.priority !== "prefer").length > 0 && (
        <div>
          <h3>부족하거나 검증되지 않은 능력</h3>
          <ul className="creative-reasons">
            {m.gaps
              .filter((g) => g.priority !== "prefer")
              .map((g) => (
                <li key={g.options.join("|")}>
                  <strong>{g.options.join(" / ")}</strong> ({g.status === "missing" ? "없음" : "미검증"}): {g.why}
                  {g.alternatives.length > 0 && ` · 대안: ${g.alternatives.join(", ")}`}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function RenderPlanDetails({ renderPlan }: { renderPlan: RenderPlan }) {
  return (
    <details className="creative-details">
      <summary>
        분할 렌더 계획 · {renderPlan.segments.length}개 구간{renderPlan.requires_split ? " (한 번에 렌더할 수 없는 길이)" : ""}
      </summary>
      <p className="creative-hint">아직 실행된 구간은 없어요. 구간 키가 같으면 이어 하기에서 다시 렌더하지 않는 기준이에요.</p>
      {renderPlan.warnings.length > 0 && (
        <ul className="creative-reasons creative-reasons--warn" aria-label="렌더러 한도 경고">
          {renderPlan.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <ol aria-label="렌더 구간">
        {renderPlan.segments.map((seg) => (
          <li key={seg.id}>
            {seg.id} · 장면 {seg.scene_ids.length}개 · {formatSeconds(seg.seconds)} · 키 {seg.input_sha256.slice(0, 8)}
          </li>
        ))}
      </ol>
    </details>
  );
}

const PRODUCTION_LABEL: Record<ProductionState, string> = {
  not_dispatched: "아직 엔진으로 보내지 않음",
  stale_revision: "계획이 바뀌어 이전 제작은 무효",
  awaiting_assets: "이미지·음악 자산을 기다리는 중",
  ready_to_render: "렌더 준비 완료",
  rendering: "렌더 중",
  failed: "렌더 실패",
  qa_failed: "검사 실패",
  succeeded: "렌더 완료·검사 통과",
};

const PRODUCTION_TONE: Record<ProductionState, "info" | "success" | "warning" | "danger"> = {
  not_dispatched: "info",
  stale_revision: "warning",
  awaiting_assets: "warning",
  ready_to_render: "info",
  rendering: "info",
  failed: "danger",
  qa_failed: "danger",
  succeeded: "success",
};

const SEGMENT_LABEL: Record<string, string> = {
  pending: "대기",
  queued: "큐 대기",
  running: "렌더 중",
  succeeded: "완료",
  failed: "실패",
  stale: "엔진 프로젝트 유실",
};

function ProductionPanel({ plan }: { plan: CreativePlan }) {
  const qc = useQueryClient();
  const [assetGenerationRequested, setAssetGenerationRequested] = useState(false);
  const [repairDrafts, setRepairDrafts] = useState<Record<string, string>>({});
  const [comparison, setComparison] = useState<{ revision: ProductionRevision; url: string; expires_at: string } | null>(null);
  const [currentResultLink, setCurrentResultLink] = useState<{ url: string; sha256: string; expires_at: string } | null>(null);
  const [segmentLinks, setSegmentLinks] = useState<Record<string, { url: string; sha256: string; expires_at: string; pending?: boolean; error?: boolean }>>({});
  const key = ["creative-production", plan.id, plan.revision];
  const q = useQuery({
    queryKey: key,
    queryFn: () => productionGet(plan.id),
    refetchInterval: (query) => {
      if (query.state.data?.state === "rendering") return 2000;
      const generation = query.state.data?.asset_generation;
      return assetGenerationRequested && generation?.status !== "succeeded" && generation?.status !== "failed" ? 2000 : false;
    },
  });
  const done = (view: ProductionView) => qc.setQueryData(key, view);
  const dispatch = useMutation({
    mutationFn: () => {
      const mode = view?.caption_mode ?? readCaptionMode(plan.id) ?? "narration";
      rememberCaptionMode(plan.id, mode);
      return productionDispatch(plan.id, plan.revision, mode);
    },
    onSuccess: done,
  });
  const start = useMutation({ mutationFn: () => productionRender(plan.id, plan.revision), onSuccess: done });
  const generate = useMutation({
    mutationFn: () => productionGenerateAssets(plan.id, plan.revision),
    onSuccess: () => {
      setAssetGenerationRequested(true);
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const upload = useMutation({
    mutationFn: (v: { kind: "scene" | "music"; file: File; sceneId?: string }) => productionUpload(plan.id, v.kind, v.file, v.sceneId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const media = useMutation({ mutationFn: (mediaId: string) => productionMediaUrl(plan.id, mediaId) });
  const review = useMutation({
    mutationFn: () => productionReview(plan.id, plan.revision),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const repair = useMutation({
    mutationFn: (defects: QualityDefect[]) => productionRepairPlan(plan.id, plan.revision, defects),
    onSuccess: (proposal) => qc.setQueryData<ProductionView>(key, (old) => old ? { ...old, repair_plan: proposal } : old),
  });
  const applyRepair = useMutation({
    mutationFn: (input: { proposal: NonNullable<ProductionView["repair_plan"]>; captionMode: CaptionMode; updates: Array<{ scene_id: string; shot_id?: string | null; layer: "captions"; field: "title" | "narration"; text: string }> }) =>
      productionRepairApply(plan.id, plan.revision, input.proposal.proposal_sha256!, input.updates),
    onSuccess: (result, input) => {
      rememberCaptionMode(plan.id, input.captionMode);
      qc.setQueryData(["creative-repair-result", plan.id], result);
      void qc.invalidateQueries({ queryKey: ["creative-plan", plan.id] });
      void qc.invalidateQueries({ queryKey: ["creative-plans"] });
    },
  });
  const compareRevision = useMutation({
    mutationFn: async (revision: number) => {
      const previous = await productionRevision(plan.id, revision);
      if (!previous.final.id || !previous.final.sha256) throw new Error("이 revision에는 재생 가능한 결과가 없습니다.");
      const link = await productionResultUrl(plan.id, revision, "final");
      if (link.sha256 !== previous.final.sha256 || link.revision !== revision || link.result_id !== "final") throw new Error("revision 결과 SHA가 링크 발급 정보와 일치하지 않습니다.");
      return { revision: previous, url: link.url, expires_at: link.expires_at };
    },
    onSuccess: setComparison,
  });
  const view = q.data;
  const error = dispatch.error ?? generate.error ?? start.error ?? upload.error ?? media.error ?? review.error ?? repair.error ?? applyRepair.error ?? compareRevision.error ?? (q.isError ? q.error : null);
  const dispatched = view && view.state !== "not_dispatched" && view.state !== "stale_revision";
  const missing = new Set(view?.assets.missing_scene_ids ?? []);
  const segmentFor = (sceneId: string) => view?.segments.find((segment) => segment.scene_ids.includes(sceneId));
  return (
    <section className="creative-panel" aria-labelledby="plan-production">
      <h2 id="plan-production">제작 연결</h2>
      {q.isPending && <p role="status">제작 상태를 불러오는 중</p>}
      {error && (
        <p className="tk-error" role="alert">
          {errorLine(error)}
        </p>
      )}
      {view && (
        <>
          <p role="status">
            <Badge tone={PRODUCTION_TONE[view.state]}>{PRODUCTION_LABEL[view.state] ?? view.state}</Badge>
            {view.engine && ` · 엔진 ${view.engine.adapter}${view.engine.version ? ` (${view.engine.version})` : ""}`}
          </p>
          {view.reasons.length > 0 && (
            <ul className="creative-reasons creative-reasons--warn" aria-label="제작을 진행할 수 없는 이유">
              {view.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <ol className="creative-production-timeline" aria-label="장면 타임라인">
            {plan.scenes.map((scene) => <li key={scene.scene_id}>
              <span>{clock(scene.start_time)}–{clock(scene.end_time)}</span>
              <strong>{scene.title || scene.scene_id}</strong>
              {scene.selected_engine && <small>{scene.strategy ?? "전략 미지정"} · {scene.selected_engine}</small>}
              {scene.shots?.map((shot) => <small key={shot.shot_id}>{shot.shot_id}: {shot.action} · {shot.selected_providers?.join(", ") || "공급자 근거 없음"}</small>)}
              {scene.strategy_rationale?.reason && <small>선택 근거: {scene.strategy_rationale.reason}</small>}
            </li>)}
          </ol>
          <div>
            <h3>장면별 상태</h3>
            <ol className="creative-scene-status" aria-label="장면별 제작 상태">
              {plan.scenes.map((scene) => {
                const segment = segmentFor(scene.scene_id);
                const generatedImage = view.asset_generation?.assets.scenes[scene.scene_id];
                const generatedVoice = view.asset_generation?.assets.voices[scene.scene_id];
                const status = segment
                  ? SEGMENT_LABEL[segment.status] ?? segment.status
                  : missing.has(scene.scene_id) ? "이미지 필요" : "대기";
                return <li key={scene.scene_id}>
                  <strong>{scene.title || scene.scene_id}</strong><span>{status}</span>
                  {segment?.error && <span className="tk-error" role="status">{segment.error}</span>}
                  {generatedImage && <span>생성 이미지 · {generatedImage.id} · SHA {generatedImage.sha256.slice(0, 8)}</span>}
                  {generatedVoice && <span>장면 음성 · {generatedVoice.id} · SHA {generatedVoice.sha256.slice(0, 8)}</span>}
                </li>;
              })}
            </ol>
            <p className="creative-hint">장면별 미디어 원본·썸네일 조회 API는 아직 없습니다. 서버에서 받은 자산 ID와 해시만 표시하며, 자산이 실제 미리보기되는 것처럼 보이지 않습니다.</p>
          </div>
          {view.state === "not_dispatched" && view.dispatchable && (
            <><p className="creative-hint">dispatch caption mode: {view.caption_mode ?? readCaptionMode(plan.id) ?? "narration"} · 승인한 revision의 기존 모드를 유지합니다.</p><Button variant="primary" busy={dispatch.isPending} onClick={() => dispatch.mutate()}>
              제작 시작 준비
            </Button></>
          )}
          {dispatched && (
            <div>
              {plan.match.primary_recipe === "R21" && !view.assets.complete && (
                <div>
                  <Button
                    variant="primary"
                    busy={generate.isPending || view.asset_generation?.status === "running"}
                    disabled={view.asset_generation?.status === "running"}
                    onClick={() => generate.mutate()}
                  >
                    {view.asset_generation?.status === "failed" ? "생성 다시 시도" : "장면 이미지·음성·음악 자동 생성"}
                  </Button>
                  {view.asset_generation && (
                    <p role="status">
                      자동 자산 생성: {view.asset_generation.status === "running" ? "실행 중" : view.asset_generation.status === "succeeded" ? "완료" : "실패"}
                      {view.asset_generation.status === "succeeded" && ` · 장면별 음성 ${Object.keys(view.asset_generation.assets.voices ?? {}).length}/${plan.scenes.length}개`}
                      {view.asset_generation.error ? ` · ${view.asset_generation.error}` : ""}
                    </p>
                  )}
                  <p className="creative-hint">현재는 R21 기본 레시피만 지원합니다. 다른 레시피는 슬라이드쇼로 바꾸지 않습니다. 음성 캐시 재사용 여부 등 엔진별 출처는 제작 기록에 남아요.</p>
                </div>
              )}
              {plan.match.primary_recipe !== "R21" && (
                <>
                  <p className="creative-hint">이 레시피의 자동 자산 생성 어댑터는 아직 없습니다. 현재 계획을 슬라이드쇼로 바꾸지 않으며 자산을 직접 준비해야 합니다.</p>
                  {view.asset_generation_blockers?.map((reason) => <p key={reason} className="tk-error" role="status">{reason}</p>)}
                </>
              )}
              <h3>이미지·음악 올리기</h3>
              <p className="creative-hint">
                장면 {view.assets.scenes_with_asset}/{view.assets.scenes_total}개에 이미지가 있어요. 장면 이미지를 바꾸면 그 장면이 속한 구간만 다시 렌더해요.
              </p>
              <ul className="creative-assets" aria-label="장면 이미지">
                {plan.scenes.map((sc) => (
                  <li key={sc.scene_id}>
                    <label>
                      <span>
                        {sc.title || sc.scene_id} {missing.has(sc.scene_id) ? "(이미지 없음)" : "(올림)"}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        aria-label={"장면 " + sc.scene_id + " 이미지"}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) upload.mutate({ kind: "scene", file, sceneId: sc.scene_id });
                        }}
                      />
                    </label>
                  </li>
                ))}
              </ul>
              <label>
                <span>
                  음악 {view.assets.music ? `(${view.assets.music.name}${view.assets.music.duration ? ` · ${view.assets.music.duration.toFixed(1)}초` : ""})` : "(없음)"}
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  aria-label="음악 파일"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload.mutate({ kind: "music", file });
                  }}
                />
              </label>
            </div>
          )}
          {(view.state === "ready_to_render" || view.state === "failed") && (
            <Button variant="primary" busy={start.isPending} onClick={() => start.mutate()}>
              {view.state === "failed" ? "실패한 구간 다시 시도" : view.outdated_segments.length > 0 && view.final ? "바뀐 구간 다시 렌더" : "렌더 시작"}
            </Button>
          )}
          {view.segments.length > 0 && (
            <ol aria-label="제작 구간">
              {view.segments.map((seg) => (
                <li key={seg.id}>
                  {seg.id} · 장면 {seg.scene_ids.length}개 · {formatSeconds(seg.seconds)} · {SEGMENT_LABEL[seg.status] ?? seg.status}
                  {seg.attempts > 0 && ` · ${seg.attempts}회 실행`}
                  {seg.metrics?.cached_scenes ? ` · 장면 ${seg.metrics.cached_scenes}개 재사용` : ""}
                  {seg.error && ` · ${seg.error}`}
                  {seg.output_sha256 && <><Button variant="ghost" busy={Boolean(segmentLinks[seg.id]?.pending)} onClick={async () => {
                    setSegmentLinks((current) => ({ ...current, [seg.id]: { ...current[seg.id], pending: true } }));
                    try {
                      const resultId = seg.result_id ?? seg.id;
                      const link = await productionResultUrl(plan.id, view.plan_revision, resultId);
                      if (link.sha256 !== seg.output_sha256 || link.revision !== view.plan_revision || link.result_id !== resultId) throw new Error("구간 결과 link metadata가 일치하지 않습니다.");
                      setSegmentLinks((current) => ({ ...current, [seg.id]: link }));
                    } catch {
                      setSegmentLinks((current) => ({ ...current, [seg.id]: { ...current[seg.id], error: true } }));
                    }
                  }}>이 구간 영상 열기</Button>{segmentLinks[seg.id]?.url && <video controls src={segmentLinks[seg.id].url} aria-label={`${seg.id} 결과 영상`} style={{ maxWidth: "100%" }} />}{segmentLinks[seg.id]?.error && <span className="tk-error">구간 임시 링크를 발급하지 못했습니다.</span>}{segmentLinks[seg.id]?.sha256 && <small>결과 SHA {segmentLinks[seg.id].sha256.slice(0, 12)} · 임시 링크 만료 {segmentLinks[seg.id].expires_at}</small>}</>}
                </li>
              ))}
            </ol>
          )}
          {view.quality_report && <section className="creative-quality" aria-labelledby="creative-quality-title">
            <h3 id="creative-quality-title">품질 판정</h3>
            <p><strong>전체 판정: {qualityVerdict(view.quality_report.overall_verdict)}</strong></p>
            <ul>
              <li>기계 검사: {qualityVerdict(view.quality_report.machine_qa.verdict)}{view.quality_report.machine_qa.reason ? ` · ${view.quality_report.machine_qa.reason}` : ""}</li>
              <li>내용 검수: {qualityVerdict(view.quality_report.semantic_qa.verdict)}{view.quality_report.semantic_qa.reason ? ` · ${view.quality_report.semantic_qa.reason}` : ""}</li>
              <li>시청·청취 검수: {qualityVerdict(view.quality_report.viewing_qa.verdict)}{view.quality_report.viewing_qa.reason ? ` · ${view.quality_report.viewing_qa.reason}` : ""}</li>
            </ul>
            {view.quality_report.rubric?.criteria && <details><summary>서버 품질 목표 · {view.quality_report.rubric.criteria.length}개 기준</summary><ul>{view.quality_report.rubric.criteria.map((criterion) => <li key={criterion.id}>{criterion.stage} · {criterion.description ?? criterion.id}</li>)}</ul></details>}
            {view.quality_report.defects.length > 0 && <>
              <h4>발견한 결함</h4>
              <ul>{view.quality_report.defects.map((defect, i) => <li key={`${defect.scene_id}-${defect.code}-${i}`}>{defect.scene_id}{defect.shot_id ? `/${defect.shot_id}` : ""} · {defect.code} · {defect.layer}{defect.summary ? ` · ${defect.summary}` : ""}{defect.evidence?.map((e, j) => <span key={j}> · 증거 {e.kind ?? "파일"}{e.start_time != null ? ` ${clock(e.start_time)}${e.end_time != null ? `–${clock(e.end_time)}` : ""}` : ""}{e.sha256 ? ` SHA ${e.sha256.slice(0, 8)}` : ""}</span>)}</li>)}</ul>
              <Button busy={repair.isPending} onClick={() => repair.mutate(view.quality_report!.defects)}>수정 영향 계산</Button>
            </>}
            <Button variant="ghost" busy={review.isPending} disabled={!view.final?.id} onClick={() => review.mutate()}>서버 검수 요청</Button>
            {review.data?.status === "not_connected" && <p className="creative-hint">검수 연결 상태: not_connected · 의미·시청 판정은 미확인으로 유지됩니다.</p>}
            {view.review_execution?.status === "not_connected" && <p className="creative-hint">서버 검수 연결 상태: not_connected · semantic/viewing은 unknown입니다.</p>}
            {!view.review_execution && view.quality_report.semantic_qa.verdict === "unknown" && <p className="creative-hint">현재 기본 검수는 not_connected/unknown입니다. independent 입력이나 fixture 결과로 PASS 처리하지 않습니다.</p>}
          </section>}
          {view.repair_plan && <section className="creative-repair" aria-label="부분 수정 제안">
            <h3>부분 수정 제안 · {view.repair_plan.status}</h3>
            {applyRepair.data?.status === "blocked" && <p className="tk-error" role="alert">서버가 이 수정 적용을 차단했습니다. 제안된 차단 사유를 확인하세요.</p>}
            <p>영향 장면 {view.repair_plan.invalidate.scene_ids.join(", ") || "없음"} · 무효화 구간 {view.repair_plan.invalidate.segment_ids.join(", ") || "없음"}</p>
            <p>보존 장면 {view.repair_plan.preserve.scene_ids.join(", ") || "없음"} · 기존 구간 run key {Object.keys(view.repair_plan.preserve.segment_run_keys).length}개 유지</p>
            {view.repair_plan.blocked.map((item, i) => <p className="tk-error" key={i}>{item.reason}</p>)}
            {view.repair_plan.actions.map((action) => {
              const scene = plan.scenes.find((s) => s.scene_id === action.scene_id);
              const mode = view.repair_plan?.caption_mode ?? view.caption_mode ?? readCaptionMode(plan.id) ?? "narration";
              const field = action.layer === "captions" ? consumedCaptionField(scene, mode) : null;
              const text = field ? (repairDrafts[`${action.scene_id}:${field}`] ?? (field === "title" ? scene?.title : scene?.narration) ?? "") : "";
              const previousScene = comparison?.revision.scenes?.find((candidate) => candidate.scene_id === action.scene_id);
              const previousText = field === "title" ? previousScene?.title : previousScene?.narration;
              const currentText = field === "title" ? scene?.title : scene?.narration;
              const previousRepairTexts = [...new Set((comparison?.revision.repairs.flatMap((entry) => {
                const changes = (entry as { changes?: Array<{ scene_id: string; shot_id?: string | null; layer?: string; field: string; before: string }> }).changes ?? [];
                return changes
                  .filter((change) => change.scene_id === action.scene_id && change.shot_id === action.shot_id && change.layer === "captions" && change.field === field && change.before !== currentText)
                  .map((change) => change.before);
              }) ?? []))];
              const hasMatchingProposal = view.repair_plan?.actions.some((candidate) => candidate.scene_id === action.scene_id && candidate.shot_id === action.shot_id && candidate.layer === "captions");
              const voiceExists = Boolean(view.asset_generation?.assets.voices?.[action.scene_id]);
              const fixedProducer = ["frame_animation_2d", "scene_3d", "code_motion"].includes(scene?.strategy ?? "");
              const supportedCode = ["text_legibility", "fake_text"].includes(action.code);
              return <div key={`${action.scene_id}:${action.code}`} className="creative-repair__action">
                <span>{action.scene_id}{action.shot_id ? `/${action.shot_id}` : ""} · {action.code} → {action.strategy}</span>
                {field && !fixedProducer && !(field === "narration" && voiceExists) && supportedCode ? <>
                  <textarea className="tk-textarea" aria-label={`수정 문구 ${action.scene_id}`} value={text} onChange={(e) => setRepairDrafts((current) => ({ ...current, [`${action.scene_id}:${field}`]: e.target.value }))} />
                  <small>전: {field === "title" ? scene?.title : scene?.narration}</small><small>후: {text}</small>
                  {typeof previousText === "string" && previousText !== (field === "title" ? scene?.title : scene?.narration) && hasMatchingProposal && <Button variant="ghost" onClick={() => setRepairDrafts((current) => ({ ...current, [`${action.scene_id}:${field}`]: previousText }))}>이전 문구를 수정 초안에 불러오기</Button>}
                  {hasMatchingProposal && previousRepairTexts.map((beforeText, index) => <Button key={`${action.scene_id}:${field}:before:${index}`} variant="ghost" onClick={() => setRepairDrafts((current) => ({ ...current, [`${action.scene_id}:${field}`]: beforeText }))}>수정 전 문구를 수정 초안에 불러오기</Button>)}
                </> : <small>{fixedProducer ? "고정 producer 장면의 caption 수정은 지원되지 않습니다." : field === "narration" && voiceExists ? "음성 자산이 있는 narration 수정은 음성 재생성이 필요해 지원되지 않습니다." : "이 layer/code는 caption text 수정 계약에 포함되지 않습니다."}</small>}
              </div>;
            })}
            <Button busy={applyRepair.isPending} disabled={!view.repair_plan.proposal_sha256 || view.repair_plan.actions.length === 0 || view.repair_plan.blocked.length > 0 || view.repair_plan.actions.some((action) => {
              const scene = plan.scenes.find((s) => s.scene_id === action.scene_id);
              const mode = view.repair_plan?.caption_mode ?? view.caption_mode ?? readCaptionMode(plan.id) ?? "narration";
              const field = consumedCaptionField(scene, mode);
              const original = (field === "title" ? scene?.title : scene?.narration) ?? "";
              const text = repairDrafts[`${action.scene_id}:${field}`] ?? original;
              return action.layer !== "captions" || !["text_legibility", "fake_text"].includes(action.code) || ["frame_animation_2d", "scene_3d", "code_motion"].includes(scene?.strategy ?? "") || (field === "narration" && Boolean(view.asset_generation?.assets.voices?.[action.scene_id])) || !text.trim() || text.trim() === original.trim();
            })} onClick={() => {
              const mode = view.repair_plan?.caption_mode ?? view.caption_mode ?? readCaptionMode(plan.id) ?? "narration";
              rememberCaptionMode(plan.id, mode);
              applyRepair.mutate({ proposal: view.repair_plan!, captionMode: mode, updates: view.repair_plan!.actions.map((action) => {
              const field = consumedCaptionField(plan.scenes.find((s) => s.scene_id === action.scene_id), mode);
              const scene = plan.scenes.find((s) => s.scene_id === action.scene_id);
              return { scene_id: action.scene_id, shot_id: action.shot_id, layer: "captions" as const, field, text: repairDrafts[`${action.scene_id}:${field}`] ?? (field === "title" ? scene?.title : scene?.narration) ?? "" };
            }) });
            }}>문구 수정 적용 · 새 revision</Button>
            <p className="creative-hint">수정 결과는 applied_needs_approval입니다. 새 revision의 승인 버튼을 직접 눌러야 하며, 이어서 기존 제작 시작 준비(같은 caption mode)와 렌더를 실행합니다. 독립 검수는 기본 not_connected/unknown입니다.</p>
          </section>}
          {view.final?.qa && (
            <div>
              <h3>결과 검사</h3>
              <ul className="creative-reasons" aria-label="결과 검사 항목">
                {view.final.qa.checks.map((c) => (
                  <li key={c.id}>
                    {c.passed ? "통과" : "실패"} · {c.detail} · 측정 {typeof c.measured === "object" ? JSON.stringify(c.measured) : String(c.measured)}
                  </li>
                ))}
              </ul>
              {view.final.duration && (
                <p className="creative-hint">
                  요청 길이 {view.final.duration.requested.seconds != null ? formatSeconds(view.final.duration.requested.seconds) : "자동"} · 계획 {formatSeconds(view.final.duration.planned_seconds)} ({view.final.duration.plan_status}) · 실제{" "}
                  {view.final.duration.measured_seconds != null ? formatSeconds(view.final.duration.measured_seconds) : "측정 못함"}
                </p>
              )}
              {view.state === "succeeded" && view.final.id && (
                <>
                  <Button busy={media.isPending} onClick={() => media.mutate(view.final!.id!)}>
                    결과 영상 열기
                  </Button>
                  {media.data && <video controls src={media.data} aria-label="결과 영상" style={{ maxWidth: "100%" }} />}
                </>
              )}
            </div>
          )}
            {view.final?.id && view.history?.some((item) => item.revision < view.plan_revision && item.snapshot_available && item.final_sha256) && <section className="creative-revisions" aria-label="결과 revision 비교">
            <h3>전후 결과 비교</h3>
            <Button busy={compareRevision.isPending} onClick={() => {
              void productionResultUrl(plan.id, view.plan_revision, "final").then((link) => {
                if (link.sha256 !== view.final?.sha256 || link.revision !== view.plan_revision || link.result_id !== "final") throw new Error("현재 결과 링크의 revision/SHA가 일치하지 않습니다.");
                setCurrentResultLink(link);
              }).catch(() => setCurrentResultLink(null));
              const revisions = view.history!.filter((item) => item.revision < view.plan_revision && item.snapshot_available && item.final_sha256).map((item) => item.revision);
              if (revisions.length) compareRevision.mutate(Math.max(...revisions));
            }}>직전 결과와 비교</Button>
            {comparison && <div className="creative-revisions__compare"><article><h4>이전 r{comparison.revision.revision} · 읽기 전용</h4><video controls src={comparison.url} aria-label={`이전 revision ${comparison.revision.revision} 결과`} /><p>SHA {comparison.revision.final.sha256?.slice(0, 12)} · 임시 링크 만료 {comparison.expires_at}</p><p>장면 snapshot: {comparison.revision.snapshot_available ? `${comparison.revision.scenes?.length ?? 0}개` : "미보존"}</p></article><article><h4>현재 r{view.plan_revision}</h4>{currentResultLink ? <video controls src={currentResultLink.url} aria-label={`현재 revision ${view.plan_revision} 결과`} /> : <p>현재 결과 링크를 불러오지 못했습니다.</p>}<p>SHA {view.final.sha256?.slice(0, 12)} · 링크 SHA {currentResultLink?.sha256.slice(0, 12) ?? "미발급"}{currentResultLink?.expires_at ? ` · 임시 링크 만료 ${currentResultLink.expires_at}` : ""}</p></article>
              <section className="creative-revisions__changes" aria-label="장면 snapshot 비교"><h4>장면 snapshot 전후</h4>{comparison.revision.snapshot_available && comparison.revision.scenes ? <ol>{comparison.revision.scenes.map((oldScene) => {
                const currentScene = plan.scenes.find((scene) => scene.scene_id === oldScene.scene_id);
                return <li key={oldScene.scene_id}><strong>{oldScene.scene_id} · {oldScene.title}</strong><p>이전 제목: {oldScene.title} → 현재: {currentScene?.title ?? "없음"}</p><p>이전 narration: {oldScene.narration} → 현재: {currentScene?.narration ?? "없음"}</p></li>;
              })}</ol> : <p>이전 revision의 scene snapshot이 보존되지 않아 장면 diff를 표시할 수 없습니다.</p>}</section>
              <section className="creative-revisions__changes" aria-label="과거 caption 변경 근거"><h4>과거 수정 기록 · 초안 입력만</h4>{comparison.revision.repairs.flatMap((entry, index) => {
                const changes = (entry as { changes?: Array<{ scene_id: string; field: string; before: string; after: string; layer?: string }> }).changes ?? [];
                return changes.map((change, changeIndex) => <p key={`${index}-${changeIndex}`}>{change.scene_id} · {change.layer ?? "layer 미상"}/{change.field}: {change.before} → {change.after}</p>);
              })}<p>이전 문구 불러오기는 현재 revision에 같은 caption repair proposal이 있을 때만 초안으로 입력됩니다. 자동 복원, 승인, 렌더는 하지 않습니다.</p></section></div>}
          </section>}
          {view.style && view.style.ignored.length > 0 && (
            <details className="creative-details">
              <summary>
                Style DNA 적용 · {Object.keys(view.style.applied).length}개 반영, {view.style.ignored.length}개 미반영
              </summary>
              <ul>
                {view.style.ignored.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="creative-hint">
            {view.engine
              ? `현재 제작 기록의 엔진: ${view.engine.adapter}${view.engine.version ? ` · ${view.engine.version}` : ""}${view.engine.mode ? ` · ${view.engine.mode}` : ""}. 실제 실행 결과와 자산 생성 엔진은 위 제작 기록에서 확인해 주세요.`
              : view.asset_generation
                ? `현재 기록된 자산 생성 엔진: ${view.asset_generation.engine.id} · ${view.asset_generation.engine.version}. 최종 렌더 엔진은 아직 선택되지 않았습니다.`
                : "아직 제작 실행 엔진이 선택되지 않았습니다. 승인과 제작 준비가 끝난 뒤 서버가 기록한 엔진과 실행 상태를 표시합니다."}
          </p>
        </>
      )}
    </section>
  );
}

function ApprovalPanel({ plan, onApprove, busy, repairResult }: { plan: CreativePlan; onApprove: () => void; busy: boolean; repairResult?: { status: string; revision?: number } }) {
  const approved = plan.approval && plan.approval.revision === plan.revision;
  return (
    <section className="creative-panel" aria-labelledby="plan-approval">
      <h2 id="plan-approval">렌더 전 확인</h2>
      {repairResult?.status === "applied_needs_approval" && repairResult.revision === plan.revision && !approved && <p className="creative-hint" role="status">수정 내용이 r{plan.revision}에 적용됐습니다. 상태: applied_needs_approval · 이 revision을 승인해야 제작이 가능합니다.</p>}
      {approved ? (
        <p role="status">
          <Badge tone="success">승인됨</Badge> r{plan.revision} · {formatSeconds(plan.approval!.planned_seconds)} ({plan.approval!.planned_frames}프레임). 장면이나 길이를 바꾸면 다시 승인해야 해요.
        </p>
      ) : (
        <>
          {plan.render_blockers.length > 0 ? (
            <ul className="creative-reasons creative-reasons--warn" aria-label="승인할 수 없는 이유">
              {plan.render_blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="creative-hint">예상 길이와 장면 구성을 확인했다면 승인해 주세요. 렌더는 승인한 버전에만 묶여요.</p>
          )}
          <Button variant="primary" busy={busy} disabled={plan.render_blockers.length > 0} onClick={onApprove}>
            이 예상 길이로 승인
          </Button>
        </>
      )}
      {plan.render_plan && <RenderPlanDetails renderPlan={plan.render_plan} />}
      {plan.render_gate ? (
        <p className="creative-hint">승인한 버전은 아래 제작 연결에서 엔진으로 실행돼요.</p>
      ) : (
        <>
          {approved && plan.render_gate_reasons && plan.render_gate_reasons.length > 0 && (
            <ul className="creative-reasons creative-reasons--warn" aria-label="스튜디오 렌더러로 실행할 수 없는 이유">
              {plan.render_gate_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p className="creative-hint">렌더 게이트가 닫혀 있으면 승인은 계획 확정까지만 의미해요.</p>
        </>
      )}
    </section>
  );
}

export function CreativePlanDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const repairResult = qc.getQueryData<{ status: string; revision?: number }>(["creative-repair-result", id]);
  const q = useQuery({ queryKey: ["creative-plan", id], queryFn: () => planGet(id) });
  const [picker, setPicker] = useState<DurationState>(INITIAL_DURATION);
  const done = (plan: CreativePlan) => {
    qc.setQueryData(["creative-plan", id], plan);
    void qc.invalidateQueries({ queryKey: ["creative-plans"] });
  };
  const edit = useMutation({
    mutationFn: (body: { scenes?: SceneEditBody[]; duration?: DurationRequest }) => planEdit(id, { revision: q.data!.revision, ...body }),
    onSuccess: done,
  });
  const approve = useMutation({ mutationFn: () => planApprove(id, q.data!.revision), onSuccess: (value) => { done(value); qc.removeQueries({ queryKey: ["creative-repair-result", id] }); } });
  const resolved = toRequest(picker, today());
  const plan = q.data;
  return (
    <div className="tk-screen">
      <PageHeader
        title={plan?.name ?? "제작 계획"}
        meta="예상 길이와 제작 가능 여부를 렌더 전에 확인해요"
        actions={
          <Link className="tk-button" to="/creative/plan">
            새 계획
          </Link>
        }
      />
      <div className="tk-screen__body">
        <div className="tk-container creative-plan">
          {q.isPending && <p role="status">계획을 불러오는 중</p>}
          {q.isError && (
            <p className="tk-error" role="alert">
              {errorLine(q.error)} <Button onClick={() => void q.refetch()}>다시 불러오기</Button>
            </p>
          )}
          {plan && (
            <>
              {(edit.isError || approve.isError) && (
                <p className="tk-error" role="alert">
                  {errorLine(edit.error ?? approve.error)}{" "}
                  <Button onClick={() => void q.refetch()}>최신 상태 불러오기</Button>
                </p>
              )}
              {plan.notes.length > 0 && (
                <ul className="creative-notice" aria-label="계획 메모">
                  {plan.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              <RuntimeCard plan={plan} busy={edit.isPending} onRequest={(request) => edit.mutate({ duration: request })} />
              {plan.history.length > 0 && (
                <details className="creative-details">
                  <summary>계획 변경 이력 · {plan.history.length}개 revision</summary>
                  <p className="creative-hint">서버가 제공하는 변경 종류·길이·상태 요약입니다. 이전 장면의 문구 비교는 API가 제공하지 않습니다.</p>
                  <ol aria-label="계획 revision 이력">
                    {plan.history.map((item) => <li key={item.revision}>r{item.revision} · {item.kind} · {item.total_seconds == null ? "길이 미정" : formatSeconds(item.total_seconds)} · {item.status}</li>)}
                  </ol>
                </details>
              )}
              <section className="creative-panel" aria-labelledby="plan-duration">
                <h2 id="plan-duration">길이 요청 바꾸기</h2>
                <DurationPicker value={picker} onChange={setPicker} idPrefix="plan-duration-picker" />
                <Button
                  busy={edit.isPending}
                  disabled={!resolved.request}
                  onClick={() => resolved.request && edit.mutate({ duration: resolved.request })}
                >
                  이 길이로 다시 계획
                </Button>
              </section>
              <SceneEditor key={plan.revision} plan={plan} busy={edit.isPending} onSave={(scenes) => edit.mutate({ scenes })} />
              <MatchPanel plan={plan} />
              <ApprovalPanel plan={plan} busy={approve.isPending} repairResult={repairResult} onApprove={() => approve.mutate()} />
              {plan.render_gate && plan.approval && <ProductionPanel plan={plan} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function CreativePlanNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["creative-plans"], queryFn: planList });
  const projects = useQuery({ queryKey: ["creative"], queryFn: creativeList });
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [duration, setDuration] = useState<DurationState>(INITIAL_DURATION);
  const durationRequest = toRequest(duration, today());
  const create = useMutation({
    mutationFn: () => planCreate({
      brief: brief.trim(),
      name: name.trim(),
      aspect,
      duration: durationRequest.request ?? { mode: "auto", seconds: null, platform: null, source: null, as_of: null },
    }),
    onSuccess: (plan) => {
      void qc.invalidateQueries({ queryKey: ["creative-plans"] });
      navigate(`/creative/plan/${plan.id}`);
    },
  });
  const canCreate = brief.trim().length > 0 && durationRequest.request !== null;
  return (
    <div className="tk-screen">
      <PageHeader
        title="콘텐츠 스튜디오"
        meta="아이디어에서 계획을 만들고, 장면을 확인해 영상으로 완성해요"
        actions={<><Link className="tk-button" to="/creative/legacy">기존 프로젝트 편집기</Link><Link className="tk-button" to="/creative/records">제작 기록</Link></>}
      />
      <div className="tk-screen__body"><div className="tk-container creative-plan">
        <StoryboardCreateFlow />

        <details className="creative-plan-structured">
        <summary>구조화 계획 입력 (보조 경로)</summary>
        <section className="creative-create creative-plan-create" aria-labelledby="creative-create-title">
          <div>
            <span className="creative-eyebrow">AI CREATIVE STUDIO</span>
            <h2 id="creative-create-title">어떤 영상을 만들까요?</h2>
            <p className="creative-hint">내용을 적으면 장면 계획과 필요한 제작 도구를 먼저 확인할 수 있어요. 이름·길이·비율은 선택 사항입니다.</p>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); if (canCreate) create.mutate(); }}>
            <label className="creative-field">만들고 싶은 콘텐츠
              <textarea className="tk-textarea" value={brief} maxLength={6000} rows={5} required
                onChange={(event) => setBrief(event.target.value)}
                placeholder="주제, 전달할 내용, 분위기와 원하는 장면을 자유롭게 적어 주세요." />
            </label>
            <div className="creative-plan-create__options">
              <label className="creative-field">계획 이름 <span className="creative-hint">선택</span>
                <input className="tk-input" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="비워 두면 내용에서 정해요" />
              </label>
              <label className="creative-field">화면 비율 <span className="creative-hint">선택</span>
                <select className="tk-input" aria-label="화면 비율" value={aspect} onChange={(event) => setAspect(event.target.value as typeof aspect)}>
                  <option value="16:9">16:9 · 가로</option><option value="9:16">9:16 · 세로</option><option value="1:1">1:1 · 정사각형</option>
                </select>
              </label>
            </div>
            <details className="creative-plan-create__duration">
              <summary>원하는 길이 (선택)</summary>
              <DurationPicker value={duration} onChange={setDuration} idPrefix="plan-new-picker" />
            </details>
            <p className="creative-hint">계획을 검토·승인한 뒤 제작 준비에서 장면별 이미지와 음악을 올리거나, 지원 레시피의 자동 생성을 요청할 수 있어요. 별도 품질 목표는 아직 입력할 수 없으며, 계획의 제작 도구·실제 결과 검사에서 서버가 제공하는 기준을 확인합니다.</p>
            {create.isError && <p className="tk-error" role="alert">{errorLine(create.error)}</p>}
            <Button type="submit" variant="primary" busy={create.isPending} disabled={!canCreate}>장면 계획 만들기</Button>
          </form>
        </section>
        </details>

        <section aria-labelledby="my-plans-title">
          <div className="creative-section-heading"><h2 id="my-plans-title">제작 계획</h2><span>장면 검토부터 렌더·결과 검사까지</span></div>
          {plans.isPending && <p role="status">계획을 불러오는 중</p>}
          {plans.isError && <p className="tk-error" role="alert">{errorLine(plans.error)} <Button onClick={() => void plans.refetch()}>다시 불러오기</Button></p>}
          {plans.data?.length === 0 && <div className="tk-empty tk-empty--boxed"><h3>아직 계획이 없어요</h3><p>콘텐츠를 적으면 장면 구성부터 시작합니다.</p></div>}
          <div className="creative-projects">{plans.data?.map((plan) => <Link key={plan.id} className="creative-project" to={`/creative/plan/${plan.id}`}>
            <div><strong>{plan.name}</strong><span>{plan.duration.planned_seconds == null ? "길이 확인 필요" : formatSeconds(plan.duration_check?.total_seconds ?? plan.duration.planned_seconds)} · 장면 {plan.scenes.length}개 · {plan.approval?.revision === plan.revision ? "승인됨" : "검토 중"}</span></div>
          </Link>)}</div>
        </section>

        <section aria-labelledby="legacy-projects-title">
          <div className="creative-section-heading"><h2 id="legacy-projects-title">기존 프로젝트</h2><span>기존 URL과 편집 데이터를 그대로 엽니다</span></div>
          {projects.isPending && <p role="status">프로젝트를 불러오는 중</p>}
          {projects.isError && <p className="tk-error" role="alert">{errorLine(projects.error)} <Button onClick={() => void projects.refetch()}>다시 불러오기</Button></p>}
          {projects.data?.length === 0 && <p className="creative-hint">기존 편집기 프로젝트가 없습니다.</p>}
          <div className="creative-projects">{projects.data?.map((project: CreativeProject) => <Link key={project.id} className="creative-project" to={`/creative/${project.id}`}>
            <div><strong>{project.name}</strong><span>{clock(project.duration)} · 장면 {project.scenes.length}개 · {project.render_jobs.some((job) => job.status === "succeeded") ? "완성 영상 있음" : "제작 중"}</span></div>
          </Link>)}</div>
        </section>
      </div></div>
    </div>
  );
}
