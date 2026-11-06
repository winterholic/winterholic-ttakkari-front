import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { storyboardRunAccept, storyboardRunCancel, storyboardRunGet, storyboardRunResume, storyboardRunStart } from "../../api/creativeV2";
import type { StoryboardRequest, StoryboardRunStart } from "../../api/creativeV2";
import { errorText } from "../../features/viewer/api";
import { Button } from "../../ui/Button";

const makeKey = () => globalThis.crypto?.randomUUID?.() ?? `storyboard-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function errorMessage(error: unknown) {
  const e = error as { status?: number; detail?: string; message?: string };
  if (e.status === 404) return "이 서버에는 storyboard API가 배포되지 않았습니다 (HTTP 404). 입력은 보존했으며 기본 구조화 경로를 아래에서 선택할 수 있습니다.";
  if (e.status === 503) return `storyboard 엔진을 지금 사용할 수 없습니다 (HTTP 503). ${e.detail ?? e.message ?? "엔진 또는 서버 상태를 확인해 주세요."}`;
  return errorText(error).message;
}

const STATUS: Record<string, string> = {
  queued: "대기 중", running: "구성 중", succeeded: "검토할 출력이 있습니다",
  failed: "실행 실패", cancelled: "취소됨", interrupted: "중단됨",
  invalid_output: "검토할 수 없는 출력", completed_needs_review: "검토 대기",
};

export function StoryboardCreateFlow({ onAccepted }: { onAccepted?: (planId: string) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [brief, setBrief] = useState("");
  const [extraLocator, setExtraLocator] = useState("");
  const [extraText, setExtraText] = useState("");
  const [run, setRun] = useState<StoryboardRunStart | null>(null);
  const [requestKey, setRequestKey] = useState(makeKey);
  const [resumeKey, setResumeKey] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useMemo<StoryboardRequest | null>(() => {
    const cleaned = brief.trim();
    if (!cleaned) return null;
    const sources: StoryboardRequest["sources"] = [{ id: "brief", locator: "사용자 요청", text: cleaned }];
    if (extraText.trim()) sources.push({ id: "source-1", locator: extraLocator.trim() || "사용자 제공 자료", text: extraText.trim() });
    return { brief: cleaned, sources, engine: "codex" };
  }, [brief, extraLocator, extraText]);

  const start = useMutation({ mutationFn: () => storyboardRunStart(request!, requestKey), onSuccess: (value) => { setRun(value); setReviewed(false); setNotice(""); } });
  const resume = useMutation({ mutationFn: (key: string) => storyboardRunResume(run!.run_id, key), onSuccess: (value) => { setRun(value); setResumeKey(""); setReviewed(false); setNotice(""); } });
  const cancel = useMutation({ mutationFn: () => storyboardRunCancel(run!.run_id), onSuccess: async (value) => { setNotice(`서버 응답: ${value.status}. 상태를 다시 확인합니다.`); await result.refetch(); } });
  const result = useQuery({
    queryKey: ["creative-storyboard-run", run?.run_id],
    queryFn: () => storyboardRunGet(run!.run_id),
    enabled: !!run?.run_id,
    refetchInterval: (query) => query.state.data?.status === "queued" || query.state.data?.status === "running" ? 1500 : false,
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => storyboardRunAccept(run!.run_id, result.data!.output_sha256!),
    onSuccess: async (plan) => {
      await qc.invalidateQueries({ queryKey: ["creative-plans"] });
      if (plan.approval) setNotice("서버가 승인 상태를 반환했습니다. 제작 작업으로 넘어가기 전에 승인 상태를 확인해 주세요.");
      onAccepted?.(plan.id);
      navigate(`/creative/plan/${plan.id}`);
    },
    onError: async (error) => {
      if ((error as { status?: number }).status === 409 || (error as { status?: number }).status === 422) {
        setReviewed(false);
        setNotice("출력 또는 검토 상태가 바뀌었습니다. 최신 서버 응답을 다시 확인해 주세요.");
        await result.refetch();
      }
    },
  });

  useEffect(() => { setReviewed(false); }, [result.data?.output_sha256]);

  const data = result.data;
  const phase = data?.phase ?? run?.status;
  const terminal = !!data && ["failed", "cancelled", "interrupted", "invalid_output"].includes(data.phase === "invalid_output" ? data.phase : data.status);

  function submit() {
    if (!request || start.isPending) return;
    start.mutate();
  }

  return <section className="creative-create creative-plan-create storyboard-create" aria-labelledby="storyboard-create-title">
    <div>
      <span className="creative-eyebrow">AI CREATIVE STUDIO</span>
      <h2 id="storyboard-create-title">어떤 영상을 만들까요?</h2>
      <p className="creative-hint">자유롭게 설명하면 AI가 장면 구성 초안을 만듭니다. 결과를 확인하고 직접 선택해야 미승인 계획으로 옮겨집니다.</p>
    </div>
    <div className="storyboard-create__form">
      <label className="creative-field">만들고 싶은 콘텐츠
        <textarea className="tk-textarea" value={brief} maxLength={6000} rows={5} required
          disabled={!!run}
          onChange={(event) => { setBrief(event.target.value); setRequestKey(makeKey()); setNotice(""); }}
          aria-label="만들고 싶은 콘텐츠" placeholder="주제, 전달할 내용, 분위기와 원하는 장면을 자유롭게 적어 주세요." />
      </label>
      <details className="creative-plan-create__duration storyboard-create__sources">
        <summary>추가 출처 본문 (선택)</summary>
        <p className="creative-hint">자동 검색은 하지 않습니다. 사용자가 제공한 자료의 위치와 본문을 직접 붙여 넣을 수 있습니다.</p>
        <label className="creative-field">출처 위치<input className="tk-input" value={extraLocator} disabled={!!run} onChange={(event) => { setExtraLocator(event.target.value); setRequestKey(makeKey()); }} placeholder="자료명 또는 URL" /></label>
        <label className="creative-field">출처 본문<textarea className="tk-textarea" value={extraText} disabled={!!run} maxLength={12000} rows={4} onChange={(event) => { setExtraText(event.target.value); setRequestKey(makeKey()); }} /></label>
      </details>
      <p className="creative-hint">요청은 codex storyboard API의 지원 필드만 보냅니다. 새 계획은 16:9로 고정됩니다. 계획 길이는 모델이 제안한 장면 길이의 합이며 입력 길이를 보장하지 않습니다. 먼저 장면과 도구 선택을 검토하며 제작이나 승인은 시작되지 않습니다.</p>
      {!run && <Button type="button" variant="primary" busy={start.isPending} disabled={!request} onClick={submit}>AI 장면 구성 만들기</Button>}
      {start.isError && <p className="tk-error" role="alert">{errorMessage(start.error)}</p>}
    </div>

    {run && <section className="storyboard-review" aria-labelledby="storyboard-review-title">
      <div className="storyboard-review__heading"><h3 id="storyboard-review-title">실행 상태 · {STATUS[phase ?? ""] ?? phase}</h3><span>{run.engine}{run.model ? ` · ${run.model}` : ""}</span></div>
      {result.isPending && <p role="status">서버 상태를 불러오는 중…</p>}
      {result.isError && <p className="tk-error" role="alert">{errorMessage(result.error)} <Button onClick={() => void result.refetch()}>상태 다시 확인</Button></p>}
      {data?.error && <p className="tk-error" role="alert">{data.error}</p>}
      {data && (data.status === "queued" || data.status === "running") && <div className="storyboard-review__actions">
        <p role="status">{STATUS[data.status]} · 실제 Run {data.run_id}</p>
        <Button busy={cancel.isPending} onClick={() => cancel.mutate()}>취소 요청</Button>
        {cancel.isError && <p className="tk-error" role="alert">{errorMessage(cancel.error)} 실행 중 Run은 서버가 취소를 거부할 수 있습니다.</p>}
      </div>}
      {data?.phase === "invalid_output" && <p className="creative-notice">모델 출력이 서버 검증을 통과하지 못했습니다. 출력은 계획으로 바꾸지 않았습니다.</p>}
      {terminal && <div className="storyboard-review__actions"><p>종료 상태에서 같은 요청 맥락으로 새 Run을 재개할 수 있습니다.</p><Button busy={resume.isPending} onClick={() => { const key = resumeKey || makeKey(); setResumeKey(key); resume.mutate(key); }}>이 Run 재개</Button>{resume.isError && <p role="alert" className="tk-error">{errorMessage(resume.error)}</p>}</div>}
      {resume.isError && <p role="alert" className="tk-error">{errorMessage(resume.error)}</p>}
      {data?.phase === "completed_needs_review" && data.storyboard && data.output_sha256 && <>
        <div className="creative-notice"><strong>검토 대기 · SHA-256 {data.output_sha256}</strong><p>이 출력은 아직 미승인입니다. 서버의 sources는 사용자 요청과 선택 입력이며 전문지식 검색·독립 검증 결과가 아닙니다.</p></div>
        <h4>구성 요약</h4><p>{data.storyboard.summary}</p>
        <div className="storyboard-review__sources"><h4>출처와 지식 적용</h4>{data.sources.map((source) => <article key={source.id}><strong>{source.locator === "사용자 요청" ? "사용자 요청" : source.locator}</strong><p>{source.text}</p>{data.storyboard!.knowledge.filter((item) => item.source_id === source.id).map((item, index) => <blockquote key={`${source.id}-${index}`}><p>“{item.quote}”</p><span>적용: {item.application}</span></blockquote>)}</article>)}</div>
        <div className="storyboard-review__scenes"><h4>장면 검토 · 합계 {data.storyboard.scenes.reduce((n, scene) => n + scene.seconds, 0).toFixed(1)}초</h4>{data.storyboard.scenes.map((scene, index) => <article className="storyboard-scene" key={scene.scene_id}>
          <div className="storyboard-scene__top"><h5>{String(index + 1).padStart(2, "0")} · {scene.title}</h5><span>{scene.seconds}초 · {scene.strategy}{scene.preset ? ` · ${scene.preset}` : ""}</span></div>
          <p>{scene.narration || "내레이션 없음"}</p><p><strong>선택 이유:</strong> {scene.rationale}</p>
          <div className="storyboard-scene__shots">{scene.shots.map((shot) => <div key={shot.shot_id}><strong>{shot.action}</strong><span>레이어 {shot.layers.join(" · ") || "없음"}</span><span>필요 도구 {shot.required_capabilities.join(" · ") || "없음"}</span></div>)}</div>
          <p><strong>대안:</strong> {scene.alternatives.map((alt) => `${alt.strategy} — ${alt.rationale}`).join(" / ")}</p>
        </article>)}</div>
        <label className="storyboard-review__accept"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> 출력 SHA {data.output_sha256}와 출처·장면·도구·근거·대안을 확인했습니다.</label>
        <p className="creative-hint">계획 이동 후에도 승인과 제작은 별도 단계입니다. 이 화면에서는 승인, dispatch, render를 호출하지 않습니다.</p>
        {notice && <p className="creative-notice" role="status">{notice}</p>}
        {accept.isError && <p className="tk-error" role="alert">{errorMessage(accept.error)}</p>}
        <Button variant="primary" busy={accept.isPending} disabled={!reviewed || accept.isPending} onClick={() => accept.mutate()}>이 출력으로 미승인 계획 만들기</Button>
      </>}
      {notice && !data?.storyboard && <p className="creative-notice" role="status">{notice}</p>}
      {data && data.status !== "queued" && data.status !== "running" && <Button onClick={() => { setRun(null); setNotice(""); }}>다른 요청 작성</Button>}
    </section>}
  </section>;
}
