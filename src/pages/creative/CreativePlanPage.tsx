import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import {
  planApprove,
  planCreate,
  planEdit,
  planGet,
  planList,
  intentExtract,
} from "../../api/creativeV2";
import type {
  CreativePlan,
  CreativeIntent,
  DurationAlternative,
  DurationRequest,
  DurationStatus,
  MatchResult,
  PlanScene,
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
      <p className="creative-hint">렌더 실행 연결은 다음 단계에서 붙어요. 지금 승인은 계획 확정까지만 의미해요.</p>
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
  const list = useQuery({ queryKey: ["creative-plans"], queryFn: planList });
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [intentDraft, setIntentDraft] = useState<CreativeIntent | null>(null);
  const [intentReviewed, setIntentReviewed] = useState(false);
  const extract = useMutation({
    mutationFn: () => intentExtract(brief.trim()),
    onSuccess: (result) => {
      setIntentDraft(result.intent);
      setIntentReviewed(false);
    },
  });
  const [duration, setDuration] = useState<DurationState>(INITIAL_DURATION);
  const resolved = toRequest(duration, today());
  const create = useMutation({
    mutationFn: () => planCreate({
      brief,
      name,
      aspect,
      duration: resolved.request!,
      ...(intentDraft && intentReviewed ? { intent: intentDraft } : {}),
    }),
    onSuccess: (plan) => {
      void qc.invalidateQueries({ queryKey: ["creative-plans"] });
      navigate(`/creative/plan/${plan.id}`);
    },
  });
  const ready = brief.trim().length > 0 && resolved.request !== null && (!intentDraft || intentReviewed);
  return (
    <div className="tk-screen">
      <PageHeader
        title="제작 계획"
        meta="아이디어에서 예상 길이와 장면 구성까지, 렌더 전에 확인해요"
        actions={
          <Link className="tk-button" to="/creative">
            콘텐츠 스튜디오
          </Link>
        }
      />
      <div className="tk-screen__body">
        <div className="tk-container creative-plan">
          <form
            className="creative-create"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) create.mutate();
            }}
          >
            <label className="creative-field">
              계획 이름
              <input className="tk-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="비워 두면 내용에서 정해요" />
            </label>
            <label className="creative-field">
              만들고 싶은 콘텐츠
              <textarea
                className="tk-textarea"
                value={brief}
                maxLength={6000}
                rows={4}
                onChange={(e) => {
                  setBrief(e.target.value);
                  setIntentDraft(null);
                  setIntentReviewed(false);
                  extract.reset();
                }}
                placeholder="주제, 분위기, 전달할 내용을 적어 주세요."
              />
            </label>
            <div className="creative-intent-actions">
              <Button type="button" busy={extract.isPending} disabled={!brief.trim()} onClick={() => extract.mutate()}>
                AI로 의도 분석
              </Button>
              <span>분석 결과는 초안으로 제안되며, 확인해야 계획에 반영돼요.</span>
            </div>
            {extract.isError && (
              <p className="tk-error" role="alert">
                {errorLine(extract.error)} <Button type="button" onClick={() => extract.mutate()}>다시 시도</Button>
              </p>
            )}
            {extract.data && intentDraft && (
              <section className="creative-intent-preview" aria-labelledby="creative-intent-title">
                <div>
                  <h3 id="creative-intent-title">AI 의도 초안</h3>
                  <p>모델의 추정은 모두 선호로 표시돼요. 인용이 브리프와 맞는지 확인해 주세요.</p>
                </div>
                {extract.data.selection_labels.length > 0 ? (
                  <ul className="creative-intent-preview__items">
                    {extract.data.selection_labels.map((item) => {
                      const selection = intentDraft.selections.find((s) => s.entry_id === item.entry_id);
                      return (
                        <li key={item.entry_id}>
                          <span>{item.catalog}</span>
                          <strong>{item.name}</strong>
                          {selection?.evidence[0] && <q>{selection.evidence[0].quote}</q>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>뚜렷한 유형을 고르지 못했어요. 계획 전에 브리프를 구체화해 주세요.</p>
                )}
                {intentDraft.constraints.length > 0 && (
                  <div>
                    <strong>제약 제안</strong>
                    <ul className="creative-intent-preview__items">
                      {intentDraft.constraints.map((constraint) => (
                        <li key={constraint.id}>
                          <span>선호</span>
                          <strong>{constraint.statement}</strong>
                          {constraint.evidence[0] && <q>{constraint.evidence[0].quote}</q>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(intentDraft.duration.mode !== "auto" || intentDraft.aspect || intentDraft.music_seconds) && (
                  <p>
                    기타 제안:{" "}
                    {intentDraft.duration.seconds != null && `희망 ${formatSeconds(intentDraft.duration.seconds)}`}
                    {intentDraft.aspect && ` · 화면 비율 ${intentDraft.aspect}`}
                    {intentDraft.music_seconds && ` · 음악 ${formatSeconds(intentDraft.music_seconds)}`}
                  </p>
                )}
                {intentDraft.info_items.length > 0 && (
                  <div>
                    <strong>전달할 내용</strong>
                    <ul className="creative-intent-preview__questions">
                      {intentDraft.info_items.map((item) => <li key={item.id}>{item.title || item.narration}</li>)}
                    </ul>
                  </div>
                )}
                {intentDraft.open_questions.length > 0 && (
                  <ul className="creative-intent-preview__questions">
                    {intentDraft.open_questions.map((question) => <li key={question}>{question}</li>)}
                  </ul>
                )}
                <label className="creative-intent-review">
                  <input type="checkbox" checked={intentReviewed} onChange={(e) => setIntentReviewed(e.target.checked)} />
                  AI 분석 결과를 확인하고 계획에 반영
                </label>
              </section>
            )}
            <DurationPicker value={duration} onChange={setDuration} idPrefix="plan-new-picker" />
            <label className="creative-field">
              화면 비율
              <select className="tk-input" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                <option>16:9</option>
                <option>9:16</option>
                <option>1:1</option>
              </select>
            </label>
            {create.isError && (
              <p className="tk-error" role="alert">
                {errorLine(create.error)}
              </p>
            )}
            <Button type="submit" variant="primary" busy={create.isPending} disabled={!ready}>
              계획 만들기
            </Button>
          </form>
          <h2>내 제작 계획</h2>
          {list.isPending && <p role="status">계획을 불러오는 중</p>}
          {list.isError && (
            <p className="tk-error" role="alert">
              {errorLine(list.error)} <Button onClick={() => void list.refetch()}>다시 불러오기</Button>
            </p>
          )}
          {list.data?.length === 0 && (
            <div className="tk-empty tk-empty--boxed">
              <h3>아직 계획이 없어요</h3>
              <p>콘텐츠를 설명하면 예상 길이와 장면 구성을 먼저 보여드려요.</p>
            </div>
          )}
          <div className="creative-projects">
            {list.data?.map((p) => (
              <Link key={p.id} className="creative-project" to={`/creative/plan/${p.id}`}>
                <div>
                  <strong>{p.name}</strong>
                  <span>
                    {p.duration.planned_seconds == null ? "길이 충돌" : formatSeconds(p.duration_check?.total_seconds ?? p.duration.planned_seconds)} · 장면 {p.scenes.length}개 · {p.approval && p.approval.revision === p.revision ? "승인됨" : "확인 전"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
