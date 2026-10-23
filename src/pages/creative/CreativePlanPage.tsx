import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  intentRunGet,
  intentRunResume,
  intentRunStart,
  intentValidate,
  planCatalog,
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
  productionUpload,
} from "../../api/creativeV2";
import type { CreativeCatalog } from "../../api/creativeV2";
import { cancelRun } from "../../api/client";
import type {
  CreativePlan,
  CreativeIntent,
  DurationAlternative,
  DurationRequest,
  DurationStatus,
  MatchResult,
  PlanScene,
  ProductionState,
  ProductionView,
  RenderPlan,
  SceneEditBody,
} from "../../api/creativeV2";
import { errorText } from "../../features/viewer/api";
import { PageHeader } from "../../shell/PageHeader";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { DurationPicker } from "./DurationPicker";
import type { DurationState } from "./duration";
import { INITIAL_DURATION, MAX_SECONDS, PRESETS, clock, describeRequest, formatSeconds, toRequest } from "./duration";
import "../creative.css";
import "./creativePlan.css";

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

function requestToDurationState(request: DurationRequest | null | undefined): DurationState {
  if (!request || request.mode === "auto") return INITIAL_DURATION;
  const seconds = request.seconds ?? (request.platform === "youtube_shorts" ? 180 : null);
  if (seconds == null) return INITIAL_DURATION;
  const choice = PRESETS.includes(seconds as (typeof PRESETS)[number]) ? String(seconds) as DurationState["choice"] : "custom";
  return {
    choice,
    custom: choice === "custom" ? String(seconds) : "",
    strictness: request.mode === "exact" ? "exact" : request.mode === "platform_cap" ? "cap" : "soft",
    capKind: request.platform === "youtube_shorts" ? "youtube_shorts" : "custom",
    capSource: request.source ?? "",
  };
}

function errorLine(error: unknown) {
  return errorText(error).message;
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

function IntentEditor({
  value,
  catalog,
  onChange,
}: {
  value: CreativeIntent;
  catalog?: CreativeCatalog;
  onChange: (intent: CreativeIntent) => void;
}) {
  const entries = Object.entries(catalog?.catalogs ?? {});
  const patchSelection = (index: number, patch: Partial<CreativeIntent["selections"][number]>) =>
    onChange({
      ...value,
      selections: value.selections.map((selection, i) =>
        i === index ? { ...selection, ...patch, source: "user_explicit" } : selection,
      ),
    });
  const patchConstraint = (index: number, patch: Partial<CreativeIntent["constraints"][number]>) =>
    onChange({
      ...value,
      constraints: value.constraints.map((constraint, i) =>
        i === index ? { ...constraint, ...patch, source: "user_explicit" } : constraint,
      ),
    });
  const patchInfo = (index: number, patch: Partial<CreativeIntent["info_items"][number]>) =>
    onChange({
      ...value,
      info_items: value.info_items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });

  return (
    <div className="creative-intent-editor">
      <fieldset className="creative-intent-editor__group">
        <legend>제작 유형과 선호</legend>
        <p className="creative-hint">AI가 고른 항목은 모두 선호 초안입니다. 바꾸거나 필수로 표시하면 사용자가 결정한 값으로 기록돼요.</p>
        {value.selections.map((selection, index) => (
          <div className="creative-intent-editor__row" key={`${selection.entry_id}-${index}`}>
            <label className="creative-field">
              콘텐츠 형식
              <select
                className="tk-input"
                aria-label="콘텐츠 형식"
                value={selection.entry_id}
                onChange={(event) => patchSelection(index, { entry_id: event.target.value })}
              >
                <option value="">선택해 주세요</option>
                {entries.map(([key, group]) => (
                  <optgroup key={key} label={group.name}>
                    {group.entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="creative-field">
              중요도
              <select
                className="tk-input"
                aria-label="중요도"
                value={selection.strength}
                onChange={(event) => patchSelection(index, { strength: event.target.value as "hard" | "soft" })}
              >
                <option value="soft">선호</option>
                <option value="hard">필수</option>
              </select>
            </label>
            <label className="creative-field creative-intent-editor__evidence">
              근거 문구
              <input
                className="tk-input"
                value={selection.evidence[0]?.quote ?? ""}
                onChange={(event) => patchSelection(index, { evidence: event.target.value ? [{ quote: event.target.value }] : [] })}
                placeholder="브리프에서 그대로 인용"
              />
            </label>
              <Button size="xs" variant="ghost" aria-label={`선택 항목 ${index + 1} 삭제`}
              onClick={() => onChange({ ...value, selections: value.selections.filter((_, i) => i !== index) })}>
              삭제
            </Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => onChange({
          ...value,
          selections: [...value.selections, { entry_id: "", role: "secondary", strength: "soft", confidence: 1, source: "user_explicit", evidence: [] }],
        })}>유형 추가</Button>
      </fieldset>

      <fieldset className="creative-intent-editor__group">
        <legend>제약</legend>
        {value.constraints.map((constraint, index) => (
          <div className="creative-intent-editor__row creative-intent-editor__row--constraint" key={constraint.id}>
            <label className="creative-field">
              제약 유형
              <select className="tk-input" aria-label="제약 유형" value={constraint.kind}
                onChange={(event) => patchConstraint(index, { kind: event.target.value as CreativeIntent["constraints"][number]["kind"] })}>
                {[["duration", "길이"], ["aspect", "화면 비율"], ["platform", "플랫폼"], ["budget", "예산"], ["resource", "리소스"], ["style", "스타일"], ["content", "내용"], ["legal", "법률"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="creative-field">
              제약 내용
              <input className="tk-input" value={constraint.statement} onChange={(event) => patchConstraint(index, { statement: event.target.value })} />
            </label>
            <label className="creative-field">
              중요도
              <select className="tk-input" aria-label="제약 중요도" value={constraint.hard ? "hard" : "soft"}
                onChange={(event) => patchConstraint(index, { hard: event.target.value === "hard" })}>
                <option value="soft">선호</option><option value="hard">필수</option>
              </select>
            </label>
            <label className="creative-field creative-intent-editor__evidence">
              제약 근거
              <input className="tk-input" value={constraint.evidence[0]?.quote ?? ""}
                onChange={(event) => patchConstraint(index, { evidence: event.target.value ? [{ quote: event.target.value }] : [] })}
                placeholder="브리프에서 그대로 인용" />
            </label>
              <Button size="xs" variant="ghost" aria-label={`${constraint.statement || "제약"} 삭제`}
              onClick={() => onChange({ ...value, constraints: value.constraints.filter((_, i) => i !== index) })}>삭제</Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => onChange({
          ...value,
          constraints: [...value.constraints, { id: `c${Date.now().toString(36)}`, kind: "content", hard: false, statement: "", source: "user_explicit", evidence: [] }],
        })}>제약 추가</Button>
      </fieldset>

      <fieldset className="creative-intent-editor__group">
        <legend>전달할 내용</legend>
        {value.info_items.map((item, index) => (
          <div className="creative-intent-editor__row creative-intent-editor__row--info" key={item.id}>
            <label className="creative-field">항목 제목
              <input className="tk-input" value={item.title} onChange={(event) => patchInfo(index, { title: event.target.value })} />
            </label>
            <label className="creative-field creative-intent-editor__evidence">전달할 내용
              <textarea className="tk-textarea" rows={2} value={item.narration} onChange={(event) => patchInfo(index, { narration: event.target.value })} />
            </label>
            <label className="creative-field creative-intent-editor__evidence">전달 근거
              <input className="tk-input" value={item.evidence[0]?.quote ?? ""}
                onChange={(event) => patchInfo(index, { evidence: event.target.value ? [{ quote: event.target.value }] : [] })}
                placeholder="브리프에서 그대로 인용" />
            </label>
            <label className="creative-field">중요도
              <input className="tk-input" type="number" min="0" max="10" step="0.1" value={item.weight}
                onChange={(event) => patchInfo(index, { weight: event.target.value ? Number(event.target.value) : 0 })} />
            </label>
            <label className="creative-intent-editor__check">
              <input type="checkbox" checked={item.essential} onChange={(event) => patchInfo(index, { essential: event.target.checked })} />
              꼭 전달
            </label>
              <Button size="xs" variant="ghost" aria-label={`${item.title || `전달 항목 ${index + 1}`} 삭제`}
              onClick={() => onChange({ ...value, info_items: value.info_items.filter((_, i) => i !== index) })}>삭제</Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => onChange({
          ...value,
          info_items: [...value.info_items, { id: `i${Date.now().toString(36)}`, title: "", narration: "", weight: 1, essential: false, evidence: [] }],
        })}>전달 항목 추가</Button>
      </fieldset>

      {value.open_questions.length > 0 && (
        <fieldset className="creative-intent-editor__group">
          <legend>아직 결정되지 않은 점</legend>
          <p className="creative-hint">각 질문을 읽고 해결한 뒤 목록에서 닫아 주세요. 남은 질문이 있으면 의도를 확정할 수 없어요.</p>
          {value.open_questions.map((question, index) => (
            <div className="creative-intent-editor__question" key={`${question}-${index}`}>
              <label className="creative-field">확인할 질문 {index + 1}
                <textarea className="tk-textarea" rows={2} value={question}
                  onChange={(event) => onChange({ ...value, open_questions: value.open_questions.map((q, i) => i === index ? event.target.value : q) })} />
              </label>
              <Button size="sm" variant="ghost" onClick={() => onChange({ ...value, open_questions: value.open_questions.filter((_, i) => i !== index) })}>확인하고 닫기</Button>
            </div>
          ))}
        </fieldset>
      )}
    </div>
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
  const dispatch = useMutation({ mutationFn: () => productionDispatch(plan.id, plan.revision), onSuccess: done });
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
  const view = q.data;
  const error = dispatch.error ?? generate.error ?? start.error ?? upload.error ?? media.error ?? (q.isError ? q.error : null);
  const dispatched = view && view.state !== "not_dispatched" && view.state !== "stale_revision";
  const missing = new Set(view?.assets.missing_scene_ids ?? []);
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
          {view.state === "not_dispatched" && view.dispatchable && (
            <Button variant="primary" busy={dispatch.isPending} onClick={() => dispatch.mutate()}>
              제작 시작 준비
            </Button>
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
                </li>
              ))}
            </ol>
          )}
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
            렌더는 현재 v1 FFmpeg 정지 이미지 슬라이드쇼로 실행돼요. R21 자동 생성은 Comfy 장면 영상, 장면별 Supertonic 음성, ACE-Step 음악을 만들고 엔진별 실행 또는 캐시 출처를 제작 기록에 남겨요.
          </p>
        </>
      )}
    </section>
  );
}

function ApprovalPanel({ plan, onApprove, busy }: { plan: CreativePlan; onApprove: () => void; busy: boolean }) {
  const approved = plan.approval && plan.approval.revision === plan.revision;
  return (
    <section className="creative-panel" aria-labelledby="plan-approval">
      <h2 id="plan-approval">렌더 전 확인</h2>
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
  const approve = useMutation({ mutationFn: () => planApprove(id, q.data!.revision), onSuccess: done });
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
              <ApprovalPanel plan={plan} busy={approve.isPending} onApprove={() => approve.mutate()} />
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
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["creative-plans"], queryFn: planList });
  const catalog = useQuery({ queryKey: ["creative-catalog"], queryFn: planCatalog });
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const briefRef = useRef(brief);
  const intentRevisionRef = useRef(0);
  const [intentRevision, setIntentRevision] = useState(0);
  const bumpIntentRevision = () => { intentRevisionRef.current += 1; setIntentRevision(intentRevisionRef.current); };
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [aspectTouched, setAspectTouched] = useState(false);
  const [durationTouched, setDurationTouched] = useState(false);
  const [intentOverride, setIntentOverride] = useState<CreativeIntent | null>(null);
  const [intentReviewed, setIntentReviewed] = useState(false);
  const runId = searchParams.get("intent_run") ?? "";
  const startKey = searchParams.get("intent_request") ?? "";
  const resumeKey = searchParams.get("intent_resume_request") ?? "";
  const run = useQuery({
    queryKey: ["creative-intent-run", runId], queryFn: () => intentRunGet(runId), enabled: Boolean(runId),
    refetchInterval: (query) => ["queued", "running"].includes(query.state.data?.status ?? "") ? 1200 : false,
  });
  const start = useMutation({
    mutationFn: ({ brief: submittedBrief, key }: { brief: string; key: string; revision: number }) => intentRunStart(submittedBrief, key),
    onSuccess: (result, variables) => {
      if (variables.brief !== briefRef.current.trim() || variables.revision !== intentRevisionRef.current) {
        void cancelRun(result.run_id).catch(() => undefined);
        return;
      }
      setIntentOverride(null); setIntentReviewed(false);
      setSearchParams({ intent_run: result.run_id, intent_session: result.session_id });
    },
  });
  const resume = useMutation({
    mutationFn: ({ key }: { key: string; brief: string; revision: number }) => intentRunResume(runId, key),
    onSuccess: (result, variables) => {
      if (variables.brief !== briefRef.current.trim() || variables.revision !== intentRevisionRef.current) {
        void cancelRun(result.run_id).catch(() => undefined);
        return;
      }
      setIntentOverride(null); setSearchParams({ intent_run: result.run_id, intent_session: result.session_id });
    },
  });
  const cancel = useMutation({ mutationFn: () => cancelRun(runId), onSuccess: () => void run.refetch() });
  const intentDraft = intentOverride ?? (run.data?.status === "succeeded" ? run.data.intent : null);
  const validation = useMutation({
    mutationFn: async ({ intent, brief: submittedBrief }: { intent: CreativeIntent; brief: string; revision: number }) => {
      const confirmed: CreativeIntent = {
        ...intent,
        duration: durationTouched ? toRequest(duration, today()).request ?? intent.duration : intent.duration,
        aspect: aspectTouched ? aspect : intent.aspect,
        extraction: { method: "user_structured", model: null },
      };
      return { candidate: confirmed, validation: await intentValidate(submittedBrief, confirmed) };
    },
    onSuccess: ({ candidate, validation: result }, variables) => {
      if (variables.brief !== briefRef.current.trim() || variables.revision !== intentRevisionRef.current) return;
      const accepted = Boolean(result?.valid && !result.needs_confirmation);
      setIntentReviewed(accepted);
      if (accepted) setIntentOverride(candidate);
    },
  });
  const [duration, setDuration] = useState<DurationState>(INITIAL_DURATION);
  const displayedDuration = durationTouched ? duration : requestToDurationState(intentDraft?.duration);
  const resolved = durationTouched ? toRequest(duration, today()) : { request: intentDraft?.duration ?? toRequest(duration, today()).request, error: null };
  const displayedAspect = aspectTouched ? aspect : intentDraft?.aspect ?? aspect;
  const validationMatchesCurrent = validation.variables?.brief === brief.trim()
    && validation.variables.revision === intentRevision;
  const create = useMutation({
    mutationFn: () => planCreate({
      brief, name, aspect: displayedAspect, duration: resolved.request!,
      intent: { ...intentDraft!, duration: resolved.request!, aspect: displayedAspect, extraction: { method: "user_structured", model: null } },
    }),
    onSuccess: (plan) => { void qc.invalidateQueries({ queryKey: ["creative-plans"] }); navigate(`/creative/plan/${plan.id}`); },
  });
  const ready = brief.trim().length > 0 && resolved.request !== null && Boolean(intentDraft && intentReviewed
    && intentDraft.selections.some((item) => item.entry_id.startsWith("C01.") && item.role === "primary")
    && intentDraft.open_questions.length === 0);
  const updateIntent = (intent: CreativeIntent) => { bumpIntentRevision(); setIntentOverride(intent); setIntentReviewed(false); validation.reset(); };
  const makeManualIntent = () => {
    bumpIntentRevision();
    setIntentOverride({
      schema_version: 1,
      selections: [{ entry_id: "", role: "primary", source: "user_explicit", strength: "soft", confidence: 1, evidence: [] }],
      constraints: [], duration: resolved.request ?? { mode: "auto", seconds: null, platform: null, source: null, as_of: null },
      aspect: aspect as CreativeIntent["aspect"], info_items: [], music_seconds: null, open_questions: [], extraction: { method: "user_structured", model: null },
    });
    setIntentReviewed(false); setSearchParams({});
  };
  const startIntent = () => {
    bumpIntentRevision();
    const key = startKey || crypto.randomUUID();
    const submittedBrief = brief.trim();
    if (!startKey) setSearchParams({ intent_request: key });
    start.mutate({ key, brief: submittedBrief, revision: intentRevisionRef.current });
  };
  const resumeIntent = () => {
    bumpIntentRevision();
    const key = resumeKey || crypto.randomUUID();
    if (!resumeKey) setSearchParams({ intent_run: runId, intent_session: searchParams.get("intent_session") ?? "", intent_resume_request: key });
    resume.mutate({ key, brief: brief.trim(), revision: intentRevisionRef.current });
  };
  return (
    <div className="tk-screen">
      <PageHeader title="제작 계획" meta="아이디어에서 예상 길이와 장면 구성까지, 렌더 전에 확인해요" actions={<Link className="tk-button" to="/creative">콘텐츠 스튜디오</Link>} />
      <div className="tk-screen__body"><div className="tk-container creative-plan">
        <form className="creative-create" onSubmit={(e) => { e.preventDefault(); if (ready) create.mutate(); }}>
          <label className="creative-field">계획 이름
            <input className="tk-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="비워 두면 내용에서 정해요" />
          </label>
          <label className="creative-field">만들고 싶은 콘텐츠
            <textarea className="tk-textarea" value={brief} maxLength={6000} rows={4}
              onChange={(e) => { briefRef.current = e.target.value; bumpIntentRevision(); setBrief(e.target.value); setIntentOverride(null); setIntentReviewed(false); validation.reset(); start.reset(); setSearchParams({}); }}
              placeholder="주제, 분위기, 전달할 내용을 적어 주세요." />
          </label>
          <div className="creative-intent-actions">
            <Button type="button" busy={start.isPending} disabled={!brief.trim()} onClick={startIntent}>{start.isError && startKey ? "같은 요청 다시 확인" : "AI로 의도 분석"}</Button>
            <Button type="button" variant="ghost" disabled={!brief.trim()} onClick={makeManualIntent}>직접 의도 작성</Button>
            <span>AI 제안은 초안입니다. 근거와 선택을 직접 확인해야 계획에 반영돼요.</span>
          </div>
          {start.isError && start.variables?.brief === brief.trim() && <p className="tk-error" role="alert">{errorLine(start.error)} 요청 결과가 불명확하면 같은 키로 다시 요청해 기존 Run을 확인합니다.</p>}
          {runId && <section className="creative-intent-run" aria-live="polite">
            <div><strong>의도 분석 Run</strong><span>{run.data?.status ?? "상태 조회 중"} · {run.data?.engine ?? "qwen-local"} · {run.data?.model ?? ""}</span></div>
            {run.isError && <p className="tk-error">{errorLine(run.error)} <Button type="button" onClick={() => void run.refetch()}>상태 다시 확인</Button></p>}
            {run.data?.error && <p className="tk-error" role="alert">{run.data.error}</p>}
            {["queued", "running"].includes(run.data?.status ?? "") && <Button type="button" variant="ghost" busy={cancel.isPending} onClick={() => cancel.mutate()}>분석 취소</Button>}
            {["failed", "cancelled", "interrupted"].includes(run.data?.status ?? "") && <Button type="button" busy={resume.isPending} onClick={resumeIntent}>{resume.isError ? "같은 재개 요청 다시 확인" : "같은 대화에서 재개"}</Button>}
            {resume.isError && <p className="tk-error" role="alert">{errorLine(resume.error)} 같은 요청 키로 재시도해 이미 접수된 Run인지 확인할 수 있어요.</p>}
            {run.data?.status === "succeeded" && !run.data.intent && <p className="tk-error">모델 응답이 의도 스키마 검증을 통과하지 못했습니다. 초안은 만들어지지 않았어요.</p>}
          </section>}
          {intentDraft && <section className="creative-intent-preview" aria-labelledby="creative-intent-title">
            <div><h3 id="creative-intent-title">{intentDraft.extraction.method === "llm" ? "AI 의도 초안" : "구조화한 의도"}</h3>
              <p>브리프 근거를 확인하고 항목을 수정하세요. 사용자가 확인하기 전까지 AI 추정은 계획에 적용되지 않습니다.</p></div>
            {run.data?.validation?.warnings?.length ? (
              <ul className="creative-hint" role="status" aria-label="AI 초안 검토 안내">
                {run.data.validation.warnings.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
              </ul>
            ) : null}
            <IntentEditor value={intentDraft} catalog={catalog.data} onChange={updateIntent} />
            <label className="creative-field">음악 길이(초)
              <input className="tk-input" type="number" min="1" max="900" value={intentDraft.music_seconds ?? ""}
                onChange={(event) => updateIntent({ ...intentDraft, music_seconds: event.target.value ? Number(event.target.value) : null })} />
            </label>
            <div className="creative-intent-actions">
              <Button type="button" busy={validation.isPending} onClick={() => validation.mutate({ intent: intentDraft, brief: brief.trim(), revision: intentRevisionRef.current })}>의도 검증 후 확인</Button>
              {intentReviewed && <span role="status">검증을 통과했고 사용자가 확인했습니다.</span>}
            </div>
            {validationMatchesCurrent && validation.data?.validation && (validation.data.validation.errors.length > 0 || validation.data.validation.warnings.length > 0) &&
              <ul className={validation.data.validation.errors.length ? "tk-error" : "creative-hint"} role={validation.data.validation.errors.length ? "alert" : "status"}>
                {[...validation.data.validation.errors, ...validation.data.validation.warnings].map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
              </ul>}
          </section>}
          <DurationPicker value={displayedDuration} onChange={(value) => { setDuration(value); setDurationTouched(true); }} idPrefix="plan-new-picker" />
          <label className="creative-field">화면 비율
            <select className="tk-input" value={displayedAspect} onChange={(e) => { setAspect(e.target.value as "16:9" | "9:16" | "1:1"); setAspectTouched(true); }}><option>16:9</option><option>9:16</option><option>1:1</option></select>
          </label>
          {create.isError && <p className="tk-error" role="alert">{errorLine(create.error)}</p>}
          <Button type="submit" variant="primary" busy={create.isPending} disabled={!ready}>계획 만들기</Button>
        </form>
        <h2>내 제작 계획</h2>
        {list.isPending && <p role="status">계획을 불러오는 중</p>}
        {list.isError && <p className="tk-error" role="alert">{errorLine(list.error)} <Button onClick={() => void list.refetch()}>다시 불러오기</Button></p>}
        {list.data?.length === 0 && <div className="tk-empty tk-empty--boxed"><h3>아직 계획이 없어요</h3><p>콘텐츠를 설명하면 예상 길이와 장면 구성을 먼저 보여드려요.</p></div>}
        <div className="creative-projects">{list.data?.map((p) => <Link key={p.id} className="creative-project" to={`/creative/plan/${p.id}`}>
          <div><strong>{p.name}</strong><span>{p.duration.planned_seconds == null ? "길이 충돌" : formatSeconds(p.duration_check?.total_seconds ?? p.duration.planned_seconds)} · 장면 {p.scenes.length}개 · {p.approval && p.approval.revision === p.revision ? "승인됨" : "확인 전"}</span></div>
        </Link>)}</div>
      </div></div>
    </div>
  );
}
