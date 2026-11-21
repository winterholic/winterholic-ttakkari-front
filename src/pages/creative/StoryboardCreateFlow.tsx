import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { storyboardRunAccept, storyboardRunCancel, storyboardRunGet, storyboardRunResume, storyboardRunStart } from "../../api/creativeV2";
import type { IntentSpecV2, StoryboardDraft, StoryboardRequest, StoryboardRunStart } from "../../api/creativeV2";
import { errorText } from "../../features/viewer/api";
import { Button } from "../../ui/Button";

const makeKey = () => globalThis.crypto?.randomUUID?.() ?? `storyboard-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function errorMessage(error: unknown) {
  const e = error as { status?: number; detail?: string; message?: string };
  if (e.status === 404) return "이 서버에서는 AI 장면 구성을 아직 쓸 수 없어요 (HTTP 404). 입력은 그대로 두었어요. 위의 '이 의도로 계획 만들기'로 계속할 수 있어요.";
  if (e.status === 503) return `AI 장면 구성 엔진을 지금 사용할 수 없어요 (HTTP 503). ${e.detail ?? e.message ?? "잠시 뒤 다시 시도해 주세요."}`;
  return errorText(error).message;
}

const STATUS: Record<string, string> = {
  queued: "대기 중", running: "구성 중", succeeded: "검토할 출력이 있습니다",
  failed: "실행 실패", cancelled: "취소됨", interrupted: "중단됨",
  invalid_output: "검토할 수 없는 출력", completed_needs_review: "검토 대기",
};

type ReferenceDocument = {
  id: string;
  file: File;
  status: "loading" | "ready" | "error";
  text: string;
  error?: string;
};

const characterCount = (value: string) => Array.from(value).length;
const newDocumentId = () => `file-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

/** 제작 워크스페이스에서 확정한 의도를 이어받는다. 요약은 사용자 제공 자료 하나로 요청에 실린다. */
export type StoryboardSeed = { brief: string; intentSummary: string; intent?: IntentSpecV2 };

type StoryboardScene = StoryboardDraft["scenes"][number];

function SceneCard({ scene, index }: { scene: StoryboardScene; index: number }) {
  return <article className="storyboard-scene">
    <div className="storyboard-scene__top"><h5>{String(index + 1).padStart(2, "0")} · {scene.title}</h5><span>{scene.seconds}초 · {scene.strategy}{scene.preset ? ` · ${scene.preset}` : ""}</span></div>
    <p>{scene.narration || "내레이션 없음"}</p><p><strong>선택 이유:</strong> {scene.rationale}</p>
    <div className="storyboard-scene__shots">{scene.shots.map((shot) => <div key={shot.shot_id}><strong>{shot.action}</strong><span>레이어 {shot.layers.join(" · ") || "없음"}</span><span>필요 도구 {shot.required_capabilities.join(" · ") || "없음"}</span></div>)}</div>
    <p><strong>대안:</strong> {scene.alternatives.map((alt) => `${alt.strategy} — ${alt.rationale}`).join(" / ")}</p>
  </article>;
}

/** 시퀀스가 있으면 장면 순서는 그대로 두고 묶음 제목만 얹는다. 어느 시퀀스에도 없는 장면은 마지막 묶음에 모아 조용히 버리지 않는다. */
function SceneList({ draft }: { draft: StoryboardDraft }) {
  const order = new Map(draft.scenes.map((scene, index) => [scene.scene_id, index]));
  const sequences = draft.sequences ?? [];
  if (sequences.length === 0) return <>{draft.scenes.map((scene, index) => <SceneCard key={scene.scene_id} scene={scene} index={index} />)}</>;
  const placed = new Set(sequences.flatMap((sequence) => sequence.scene_ids));
  const orphans = draft.scenes.filter((scene) => !placed.has(scene.scene_id));
  const groups = [...sequences.map((sequence) => ({ key: sequence.sequence_id, title: sequence.title, purpose: sequence.purpose ?? "", ids: sequence.scene_ids })),
    ...(orphans.length ? [{ key: "__unassigned", title: "묶음 없음", purpose: "", ids: orphans.map((scene) => scene.scene_id) }] : [])];
  return <>{groups.map((group, groupIndex) => {
    const scenes = group.ids.flatMap((id) => order.has(id) ? [draft.scenes[order.get(id)!]] : []);
    return <section className="storyboard-sequence" key={group.key} aria-label={`시퀀스 ${groupIndex + 1} ${group.title}`}>
      <h5 className="storyboard-sequence__title">시퀀스 {String(groupIndex + 1).padStart(2, "0")} · {group.title} <span>{scenes.length}장면</span></h5>
      {group.purpose && <p className="creative-hint">{group.purpose}</p>}
      {scenes.map((scene) => <SceneCard key={scene.scene_id} scene={scene} index={order.get(scene.scene_id)!} />)}
    </section>;
  })}</>;
}

export function StoryboardCreateFlow({ onAccepted, seed }: { onAccepted?: (planId: string) => void; seed?: StoryboardSeed }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [brief, setBrief] = useState(seed?.brief ?? "");
  const [extraLocator, setExtraLocator] = useState("");
  const [extraText, setExtraText] = useState("");
  const [qualityGoal, setQualityGoal] = useState("");
  const [documents, setDocuments] = useState<ReferenceDocument[]>([]);
  const [run, setRun] = useState<StoryboardRunStart | null>(null);
  const [requestKey, setRequestKey] = useState(makeKey);
  const [resumeKey, setResumeKey] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [notice, setNotice] = useState("");
  const { request, inputError } = useMemo(() => {
    const cleaned = brief.trim();
    const goal = qualityGoal.trim();
    const sourceBrief = goal
      ? `사용자 요청:\n${cleaned}\n\n사용자 품질 목표 (보장 아님):\n${goal}`
      : cleaned;
    const sources: StoryboardRequest["sources"] = cleaned
      ? [{ id: "brief", locator: "사용자 요청", text: sourceBrief }]
      : [];
    if (cleaned && seed?.intentSummary) sources.push({ id: "intent", locator: "확정한 제작 의도", text: seed.intentSummary });
    if (extraText.trim()) sources.push({ id: "source-1", locator: extraLocator.trim() || "사용자 제공 자료", text: extraText.trim() });
    for (const document of documents) {
      if (document.status === "ready") sources.push({ id: document.id, locator: document.file.name, text: document.text });
    }

    let error = "";
    if (documents.some((document) => document.status === "loading")) error = "참고 문서 읽기가 끝날 때까지 기다려 주세요.";
    else if (documents.some((document) => document.status === "error")) error = "오류가 있는 참고 문서를 제거하거나 다시 선택해 주세요.";
    else if (cleaned && characterCount(sourceBrief) > 6000) error = "요청과 품질 목표를 합쳐 6,000자 이하여야 합니다.";
    else if (extraText.trim() && characterCount(extraText.trim()) > 12000) error = "추가 출처 본문은 12,000자 이하여야 합니다.";
    else if (extraText.trim() && characterCount(extraLocator.trim() || "사용자 제공 자료") > 500) error = "출처 위치는 500자 이하여야 합니다.";
    else if (sources.length > 10) error = "요청 출처는 사용자 요청을 포함해 10개 이하여야 합니다. 참고 문서를 제거해 주세요.";

    const request: StoryboardRequest | null = cleaned && !error
      ? { brief: seed?.intent ? brief : sourceBrief, sources, engine: "codex", intent_v2: seed?.intent }
      : null;
    return { request, inputError: error };
  }, [brief, extraLocator, extraText, qualityGoal, documents, seed]);

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
      if (plan.approval) setNotice("계획에 승인 상태가 이미 있어요. 제작으로 넘어가기 전에 승인 상태를 확인해 주세요.");
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
  const frozen = !!run || start.isPending;

  function submit() {
    if (!request || start.isPending || run) return;
    start.mutate();
  }

  function addDocuments(files: File[]) {
    if (!files.length) return;
    const usedIds = new Set(["brief", "intent", "source-1", ...documents.map((document) => document.id)]);
    const entries = files.map((file) => {
      let id = newDocumentId();
      while (usedIds.has(id)) id = newDocumentId();
      usedIds.add(id);
      return { id, file, status: "loading" as const, text: "" };
    });
    setDocuments((current) => [...current, ...entries]);
    setRequestKey(makeKey());
    setNotice("");
    for (const entry of entries) {
      if (!/\.(txt|md)$/i.test(entry.file.name)) {
        setDocuments((current) => current.map((item) => item.id === entry.id
          ? { ...item, status: "error", error: "지원하지 않는 형식입니다. .txt 또는 .md 파일을 선택해 주세요." }
          : item));
        continue;
      }
      if (characterCount(entry.file.name) > 500) {
        setDocuments((current) => current.map((item) => item.id === entry.id
          ? { ...item, status: "error", error: "파일명(출처 위치)은 500자 이하여야 합니다." }
          : item));
        continue;
      }
      if (entry.file.size > 48003) {
        setDocuments((current) => current.map((item) => item.id === entry.id
          ? { ...item, status: "error", error: "문서가 12,000자 한도를 넘을 수 있는 크기입니다. 파일을 줄여 주세요." }
          : item));
        continue;
      }
      void Promise.resolve().then(() => entry.file.text()).then((text) => {
        setDocuments((current) => current.map((item) => item.id !== entry.id ? item : !text.trim()
          ? { ...item, status: "error", error: "문서가 비어 있습니다. 내용이 있는 .txt 또는 .md 파일을 선택해 주세요." }
          : characterCount(text) > 12000
            ? { ...item, status: "error", error: "문서가 12,000자 한도를 초과했습니다. 파일을 줄여 주세요." }
            : { ...item, status: "ready", text }));
      }).catch(() => {
        setDocuments((current) => current.map((item) => item.id === entry.id
          ? { ...item, status: "error", error: "파일을 읽지 못했습니다. 다시 선택해 주세요." }
          : item));
      });
    }
  }

  return <section className="creative-create creative-plan-create storyboard-create" aria-labelledby="storyboard-create-title">
    <div>
      <span className="creative-eyebrow">AI CREATIVE STUDIO</span>
      <h2 id="storyboard-create-title">{seed ? "AI 장면 구성 초안" : "어떤 영상을 만들까요?"}</h2>
      <p className="creative-hint">{seed ? "확정한 의도를 바탕으로 AI가 장면 구성 초안을 만듭니다. " : "자유롭게 설명하면 AI가 장면 구성 초안을 만듭니다. "}결과를 확인하고 직접 선택해야 미승인 계획으로 옮겨집니다.</p>
    </div>
    <div className="storyboard-create__form">
      <label className="creative-field">만들고 싶은 콘텐츠
        <textarea className="tk-textarea" value={brief} rows={5} required
          disabled={frozen} readOnly={!!seed?.intent}
          onChange={(event) => { setBrief(event.target.value); setRequestKey(makeKey()); setNotice(""); }}
          aria-label="만들고 싶은 콘텐츠" placeholder="주제, 전달할 내용, 분위기와 원하는 장면을 자유롭게 적어 주세요." />
      </label>
      <label className="creative-field">품질 목표 (선택)
        <textarea className="tk-textarea" value={qualityGoal} rows={2} disabled={frozen}
          onChange={(event) => { setQualityGoal(event.target.value); setRequestKey(makeKey()); setNotice(""); }}
          aria-label="품질 목표 (선택)" placeholder="예: 초보자도 핵심 기능을 바로 이해하도록 구성" />
      </label>
      <details className="creative-plan-create__duration storyboard-create__sources">
        <summary>추가 출처 본문 (선택)</summary>
        <p className="creative-hint">자동 검색은 하지 않습니다. 사용자가 제공한 자료의 위치와 본문을 직접 붙여 넣을 수 있습니다.</p>
        <label className="creative-field">출처 위치<input className="tk-input" value={extraLocator} disabled={frozen} onChange={(event) => { setExtraLocator(event.target.value); setRequestKey(makeKey()); }} placeholder="자료명 또는 URL" /></label>
        <label className="creative-field">출처 본문<textarea className="tk-textarea" value={extraText} disabled={frozen} rows={4} onChange={(event) => { setExtraText(event.target.value); setRequestKey(makeKey()); }} /></label>
      </details>
      <div className="storyboard-create__sources">
        <label className="creative-field">텍스트 참고 문서 (.txt, .md)
          <input className="tk-input" type="file" accept=".txt,.md,text/plain,text/markdown" multiple disabled={frozen}
            aria-label="텍스트 참고 문서 (.txt, .md)" onChange={(event) => { addDocuments(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        </label>
        <p className="creative-hint">선택한 문서는 이 브라우저에서 텍스트로 읽습니다. 제출할 때만 요청에 포함되며 파일 자체는 업로드하지 않아요. 이미지·영상·음악·PDF는 아직 읽지 못해요.</p>
        {documents.length > 0 && <ul aria-label="선택한 참고 문서">
          {documents.map((document) => <li key={document.id}>
            <span>{document.file.name}</span> · {document.status === "loading" ? "읽는 중" : document.status === "ready" ? "읽기 완료" : "오류"}
            {document.error && <span className="tk-error" role="alert"> {document.error}</span>}
            <Button type="button" disabled={frozen} onClick={() => { setDocuments((current) => current.filter((item) => item.id !== document.id)); setRequestKey(makeKey()); setNotice(""); }}>{document.file.name} 제거</Button>
          </li>)}
        </ul>}
      </div>
      {inputError && <p className="tk-error" role="alert">{inputError}</p>}
      <p className="creative-hint">계획 길이는 AI가 제안한 장면 길이의 합이라 입력한 길이를 보장하지 않아요. 먼저 장면과 도구 선택을 검토하며, 제작이나 승인은 시작되지 않아요.</p>
      <details className="creative-hint"><summary>기술 정보</summary><p>요청은 장면 구성 API가 지원하는 필드(brief, sources, engine=codex)만 보냅니다. 이 경로로 만든 계획의 화면 비율은 16:9로 고정됩니다.</p></details>
      {!run && <Button type="button" variant="primary" busy={start.isPending} disabled={!request || start.isPending} onClick={submit}>AI 장면 구성 만들기</Button>}
      {start.isError && <p className="tk-error" role="alert">{errorMessage(start.error)}</p>}
    </div>

    {run && <section className="storyboard-review" aria-labelledby="storyboard-review-title">
      <div className="storyboard-review__heading"><h3 id="storyboard-review-title">실행 상태 · {STATUS[phase ?? ""] ?? phase}</h3><details className="creative-hint"><summary>상세 보기</summary><span>엔진 {run.engine}{run.model ? ` · ${run.model}` : ""} · 작업 {run.run_id}</span></details></div>
      {result.isPending && <p role="status">서버 상태를 불러오는 중…</p>}
      {result.isError && <p className="tk-error" role="alert">{errorMessage(result.error)} <Button onClick={() => void result.refetch()}>상태 다시 확인</Button></p>}
      {data?.error && <p className="tk-error" role="alert">{data.error}</p>}
      {data && (data.status === "queued" || data.status === "running") && <div className="storyboard-review__actions">
        <p role="status">{STATUS[data.status]}</p>
        <Button busy={cancel.isPending} onClick={() => cancel.mutate()}>취소 요청</Button>
        {cancel.isError && <p className="tk-error" role="alert">{errorMessage(cancel.error)} 실행 중인 작업은 서버가 취소를 거부할 수 있어요.</p>}
      </div>}
      {data?.phase === "invalid_output" && <p className="creative-notice">모델 출력이 서버 검증을 통과하지 못했습니다. 출력은 계획으로 바꾸지 않았습니다.</p>}
      {terminal && <div className="storyboard-review__actions"><p>종료된 작업은 같은 요청 맥락으로 새로 이어서 실행할 수 있어요.</p><Button busy={resume.isPending} onClick={() => { const key = resumeKey || makeKey(); setResumeKey(key); resume.mutate(key); }}>이 작업 이어서 실행</Button>{resume.isError && <p role="alert" className="tk-error">{errorMessage(resume.error)}</p>}</div>}
      {resume.isError && <p role="alert" className="tk-error">{errorMessage(resume.error)}</p>}
      {data?.phase === "completed_needs_review" && data.storyboard && data.output_sha256 && <>
        <div className="creative-notice"><strong>검토 대기</strong><p>이 출력은 아직 미승인입니다. 아래 출처는 내가 입력한 내용이며 전문지식 검색이나 독립 검증 결과가 아닙니다.</p><details><summary>상세 보기 (기술 정보)</summary><p>출력 SHA-256 {data.output_sha256}</p></details></div>
        <h4>구성 요약</h4><p>{data.storyboard.summary}</p>
        <div className="storyboard-review__sources"><h4>입력한 내용과 적용 방식</h4>{data.sources.map((source) => <article key={source.id}><strong>{source.locator === "사용자 요청" ? "사용자 요청" : source.locator}</strong><p>{source.text}</p>{data.storyboard!.knowledge.filter((item) => item.source_id === source.id).map((item, index) => <blockquote key={`${source.id}-${index}`}><p>“{item.quote}”</p><span>적용: {item.application}</span></blockquote>)}</article>)}</div>
        <div className="storyboard-review__scenes"><h4>장면 검토 · 합계 {data.storyboard.scenes.reduce((n, scene) => n + scene.seconds, 0).toFixed(1)}초</h4><SceneList draft={data.storyboard} /></div>
        <label className="storyboard-review__accept"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> 출처·장면·도구·근거·대안을 확인했습니다. (승인할 출력은 위 상세 보기의 기술 정보로 고정돼요)</label>
        <p className="creative-hint">계획 이동 후에도 승인과 제작은 별도 단계입니다. 이 화면에서는 승인이나 제작을 시작하지 않아요.</p>
        {notice && <p className="creative-notice" role="status">{notice}</p>}
        {accept.isError && <p className="tk-error" role="alert">{errorMessage(accept.error)}</p>}
        <Button variant="primary" busy={accept.isPending} disabled={!reviewed || accept.isPending} onClick={() => accept.mutate()}>이 출력으로 미승인 계획 만들기</Button>
      </>}
      {notice && !data?.storyboard && <p className="creative-notice" role="status">{notice}</p>}
      {data && data.status !== "queued" && data.status !== "running" && <Button onClick={() => { setRun(null); setRequestKey(makeKey()); setNotice(""); }}>다른 요청 작성</Button>}
    </section>}
  </section>;
}
