import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { intentFacets, planCapabilities, planCatalog, planCreate } from "../../../api/creativeV2";
import type { IntentConditionV2, IntentConflictV2, IntentSpecV2 } from "../../../api/creativeV2";
import { errorText } from "../../../features/viewer/api";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { StoryboardCreateFlow, type StoryboardSeed } from "../StoryboardCreateFlow";
import { ConditionPicker } from "./ConditionPicker";
import type { ConditionActions } from "./ConditionPicker";
import { ConflictCards } from "./ConflictCards";
import { FeasibilitySummary } from "./FeasibilitySummary";
import { AdvancedSettingsDialog, GroupCards } from "./DynamicGroups";
import { OutputPanel } from "./OutputPanel";
import { ProposalPanel } from "./ProposalPanel";
import { blockingText, buildLabels, dimensionOf, isConfirmed, selectionRole, summarizeIntent } from "./intentModel";
import { useIntentWorkspace } from "./useIntentWorkspace";
import "./workspace.css";

const BRIEF_MAX = 6000;

export type IntentLinkState = { linked: boolean; revision: number };

export async function createPlanFromIntent(intent: IntentSpecV2, brief: string, labels: Parameters<typeof summarizeIntent>[1]) {
  const plan = await planCreate({
    brief: intent.brief || brief.trim() || summarizeIntent(intent, labels),
    intent_v2: intent,
  });
  const link: IntentLinkState = { linked: plan.intent_v2?.revision === intent.revision, revision: intent.revision };
  return { plan, link };
}

export function IntentWorkspace() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ws = useIntentWorkspace();
  const catalog = useQuery({ queryKey: ["creative-v2-catalog"], queryFn: planCatalog, staleTime: Infinity, retry: false });
  const facets = useQuery({ queryKey: ["creative-v2-intent-facets"], queryFn: intentFacets, staleTime: Infinity, retry: false });
  // 제작 가능 여부는 보조 정보다. 못 받아도 조건 선택은 막지 않고, 배지가 없는 것이 가능이라는 뜻이 아님을 알린다.
  const capabilities = useQuery({ queryKey: ["creative-v2-capabilities"], queryFn: planCapabilities, staleTime: 60_000, retry: false });
  const labels = useMemo(() => buildLabels(catalog.data, facets.data, capabilities.data), [catalog.data, facets.data, capabilities.data]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [storyboardSeed, setStoryboardSeed] = useState<StoryboardSeed>();
  const { result, busy } = ws;
  const intent = result?.intent;

  const actions: ConditionActions = {
    select: (id, dimension) => ws.send({ structured: { selections: [{ id, role: selectionRole(intent, id, dimension) }] } }),
    // 확정은 selections로 보낸다. 직전 문장에서 읽은 값이 그새 사라졌어도 사용자가 누른 값은 유지된다.
    confirm: (ids) => ws.send({
      structured: { selections: ids.map((id) => {
        const c = intent?.conditions.find((x) => x.id === id);
        return { id, role: c?.role ?? "secondary", strength: c?.strength ?? "preferred" };
      }) },
    }),
    remove: (id) => ws.send({ reject: [id] }),
    setStrength: (c: IntentConditionV2, strength) => ws.send({ structured: { selections: [{ id: c.id, role: c.role, strength }] } }),
    replace: (oldId, newId, dimension) => ws.send({ reject: [oldId], structured: { selections: [{ id: newId, role: selectionRole(intent, newId, dimension) }] } }),
  };
  const answer = (fieldId: string, values: string[]) => ws.send({ answers: [{ field_id: fieldId, values }] });
  const resolveConflict = (conflict: IntentConflictV2, choice: string) => ws.send({ resolutions: [{ conflict_id: conflict.id, choice }] });

  const create = useMutation({
    // 문장을 고친 직후에는 화면의 intent가 낡았다. 최신 문장으로 다시 풀고, 그 결과가 계획 가능할 때만 만든다.
    mutationFn: async () => {
      const fresh = await ws.settle();
      if (!fresh) throw new Error("바뀐 문장을 다시 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      if (!fresh.result.ready_for_plan) return null;
      return createPlanFromIntent(fresh.result.intent, fresh.brief, labels);
    },
    onSuccess: (made) => {
      if (!made) return;
      const { plan, link } = made;
      void qc.invalidateQueries({ queryKey: ["creative-plans"] });
      navigate(`/creative/plan/${plan.id}`, { state: { intentLink: link } });
    },
  });

  const setupFailed = catalog.isError || facets.isError;
  const notSupported = [catalog.error, facets.error].some((e) => (e as { status?: number } | null)?.status === 404);
  const ready = !!result?.ready_for_plan && !busy;
  const conflicts = result?.layout.conflicts ?? [];
  async function openStoryboard() {
    const fresh = await ws.settle();
    if (!fresh?.result.ready_for_plan) return;
    const { intent } = fresh.result;
    const summary = summarizeIntent(intent, labels);
    setStoryboardSeed({ brief: intent.brief || fresh.brief.trim() || summary, intentSummary: summary, intent });
  }

  return (
    <div className="cw" data-busy={busy || undefined}>
      <div className="cw__main">
        <section className="tk-card cw-step" aria-labelledby="cw-step-1">
          <header className="cw-step__head"><Badge tone="info">1</Badge><h2 id="cw-step-1">의도 입력</h2></header>
          <label className="tk-field">만들고 싶은 콘텐츠
            <textarea className="tk-textarea" rows={5} maxLength={BRIEF_MAX} value={ws.brief} aria-label="만들고 싶은 콘텐츠"
              onChange={(e) => ws.setBrief(e.target.value)}
              placeholder="주제, 분위기, 길이, 원하는 장면을 자유롭게 적어 주세요. 아래에서 조건을 직접 골라도 같이 읽어요." />
          </label>
          <p className="cw-hint">쓰는 동안 문장에서 조건을 읽어 아래에 보여 드려요. 읽은 값은 직접 확정해야 계획에 쓰여요. 조건마다 실제로 제작되는지 배지로 알려 드려요.</p>
        </section>

        <section className="tk-card cw-step" aria-labelledby="cw-step-2">
          <header className="cw-step__head"><Badge tone="info">2</Badge><h2 id="cw-step-2">조건 조합·보완</h2>
            {(busy || ws.stale) && <span className="cw-busy" role="status"><span className="tk-spinner" aria-hidden="true" />다시 계산 중</span>}
          </header>
          {setupFailed && (
            <p className="tk-error" role="alert">
              {notSupported ? "이 서버는 아직 제작 의도 v2를 지원하지 않아요. 조건 선택을 쓸 수 없습니다." : `조건 목록을 불러오지 못했어요. ${errorText(catalog.error ?? facets.error).message}`}{" "}
              <Button size="xs" onClick={() => { void catalog.refetch(); void facets.refetch(); }}>다시 불러오기</Button>
            </p>
          )}
          {!setupFailed && (catalog.isPending || facets.isPending) && <p role="status">조건 목록을 불러오는 중…</p>}
          {!setupFailed && catalog.data && facets.data && (
            <>
              <ConditionPicker intent={intent} labels={labels} actions={actions} />
              {ws.error != null && <p className="tk-error" role="alert">{errorText(ws.error).message}</p>}
              {result && intent ? (
                <>
                  <ConflictCards conflicts={conflicts} disabled={busy} onResolve={resolveConflict} />
                  <GroupCards layout={result.layout} labels={labels} disabled={busy} onAnswer={answer} />
                  <OutputPanel key={`${intent.revision}:${intent.duration?.mode}:${intent.duration?.seconds}`} intent={intent} length={result.length} disabled={busy}
                    onDuration={(mode, seconds) => ws.send({ structured: { duration: { mode, seconds } }, forget: ["duration"] })}
                    onAspect={(aspect) => ws.send({ structured: { aspect }, forget: ["aspect"] })} />
                  <div className="cw-advanced-open">
                    <Button onClick={() => setAdvancedOpen(true)}>
                      <Icon name="settings" />전문 설정 열기{result.layout.available_groups.length ? ` · 꺼 둔 묶음 ${result.layout.available_groups.length}개` : ""}
                    </Button>
                    <span className="cw-hint">지금 조합에 필요 없는 설정은 숨겼어요. 전문 설정에서 직접 열 수 있어요.</span>
                  </div>
                  <AdvancedSettingsDialog open={advancedOpen} onClose={() => setAdvancedOpen(false)} layout={result.layout} labels={labels} intent={intent}
                    disabled={busy} onAnswer={answer} actions={actions} />
                </>
              ) : (
                <div className="tk-empty tk-empty--boxed"><h3>조건을 고르면 설정이 나타나요</h3><p>문장을 쓰거나 위에서 유형·장르·화풍·톤을 고르면, 그 조합에 맞는 설정과 질문만 보여 드려요.</p></div>
              )}
            </>
          )}
        </section>
      </div>

      <aside className="cw__side" aria-label="AI 제작 제안과 다음 단계">
        {result && intent
          ? <ProposalPanel result={result} labels={labels} />
          : <section className="tk-card cw-proposal"><h3>AI 제작 제안</h3><p className="cw-hint">의도를 입력하면 AI가 제안을 여기에 보여 드려요.</p></section>}
        <section className="tk-card cw-next" aria-labelledby="cw-next-title">
          <h3 id="cw-next-title">다음 단계</h3>
          {result && !result.ready_for_plan && (
            <ul className="tk-checks" aria-label="다음으로 가기 전에 필요한 것">
              {result.blocking.map((id) => <li key={id} data-result="fail"><Icon name="circle-x" /><span>{blockingText(id, result)}</span></li>)}
            </ul>
          )}
          {result?.ready_for_plan && <p className="tk-status tk-status--success"><Icon name="circle-check" />의도가 확정됐어요. 제작 가능하다는 뜻은 아니에요.</p>}
          {intent && <FeasibilitySummary intent={intent} labels={labels} loading={capabilities.isPending} failed={capabilities.isError || (capabilities.isSuccess && !labels.feasibilityKnown)} />}
          {!result && <p className="cw-hint">콘텐츠 유형을 확정하면 계획을 만들 수 있어요.</p>}
          {create.isError && <p className="tk-error" role="alert">{errorText(create.error).message}</p>}
          <Button variant="primary" block busy={create.isPending} disabled={!ready || create.isPending} onClick={() => create.mutate()}>이 의도로 계획 만들기</Button>
          <Button block disabled={!ready} onClick={() => void openStoryboard()}>AI 장면 구성 초안으로 이어가기</Button>
          <p className="cw-hint">계획을 만든 뒤 장면 검토, 제작, 결과 검수로 이어져요. 승인 전에는 제작이 시작되지 않아요.</p>
        </section>
      </aside>

      {storyboardSeed && (
        <div className="cw__wide">
          <StoryboardCreateFlow key={storyboardSeed.intent?.revision} seed={storyboardSeed} />
        </div>
      )}
    </div>
  );
}

export { isConfirmed, dimensionOf };
