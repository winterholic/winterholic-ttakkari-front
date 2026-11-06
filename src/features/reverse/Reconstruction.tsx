import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { cancelRun, contentBlob, downloadLink, messageReverseJob, patchReverseJob, resolveArtifactLink, retryReverseJob } from "../../api/client";
import { reverseEvidenceLabel, reverseV2FromDetail, type ReverseComparison, type ReverseDetail, type ReverseMode, type ReverseSnapshot, type ReverseTargetType } from "../../api/reverseTypes";
import { Button } from "../../ui/Button";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";

function json(value: unknown) { return value == null ? "기록 없음" : JSON.stringify(value, null, 2); }
function visualLabel(value?: string | null) {
  if (value === "match" || value === "passed") return "시각 평가: 일치";
  if (value === "mismatch" || value === "failed") return "시각 평가: 차이 발견";
  return "시각 평가: 미검증";
}
function statusLabel(value?: string | null) {
  if (value === "verified" || value === "passed" || value === "match") return "확인됨";
  if (value === "mismatch") return "차이 발견";
  if (value === "failed") return "실패";
  if (value === "pending" || value === "running") return "진행 중";
  if (value === "unverified") return "미검증";
  return "기록 없음";
}
function outputArtifactPath(path: string, outputPath?: string) {
  if (!outputPath || path.startsWith("/")) return path;
  return `${outputPath.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
function countComparisons(snapshot: ReverseSnapshot | null | undefined) {
  const summary = snapshot?.direct_comparison;
  if (summary) return summary;
  const comparisons = snapshot?.comparisons ?? [];
  return { status: "unverified" as const, count: comparisons.length,
    matched: comparisons.filter((c) => c.result === "match").length,
    mismatched: comparisons.filter((c) => c.result === "mismatch").length,
    unverified: comparisons.filter((c) => c.result === "unverified").length };
}
function ResultSide({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  return <div className="rv-compare-side"><h4>{label}</h4>{value == null ? <p className="rv-note">원본을 실행할 수 없어 결과가 없습니다.</p> : <>
    <div className="rv-result-fields">{["argv", "stdin", "stdout", "stderr", "exit_code", "request", "response", "url", "method", "body", "status", "status_code", "events", "dom", "screenshot", "environment", "at"].map((key) => value[key] !== undefined && <div key={key}><span>{key}</span><pre>{typeof value[key] === "string" ? String(value[key]) : json(value[key])}</pre></div>)}</div>
    <details className="rv-disclosure"><summary>{label} 전체 기록</summary><pre className="rv-code-block">{json(value)}</pre></details>
  </>}</div>;
}
function Comparison({ item }: { item: ReverseComparison }) {
  const functional = item.functional_result ?? item.result;
  const label = functional === "match" ? "기능: 일치" : functional === "mismatch" ? "기능: 불일치" : "기능: 미검증";
  const visualEvidence = item.evidence?.filter((e) => e.kind === "visual_assessment") ?? [];
  return <article className="rv-comparison" data-result={item.result}>
    <header className="rv-comparison__head"><div><span className="rv-compare-chip" data-result={functional}>{label}</span><h3>{item.behavior || item.id}</h3></div>
      <span className="rv-note">근거 수준: {reverseEvidenceLabel(item.evidence_level)}</span></header>
    {item.difference && <p className="rv-difference"><strong>차이</strong> {json(item.difference)}</p>}
    {(item.visual_result || visualEvidence.length > 0) && <div className="rv-visual-assessment" aria-label="시각 평가">
      <strong>{visualLabel(item.visual_result)}</strong><p className="rv-note">시각 평가는 기능 결과와 별도로 기록됩니다.</p>
      {item.visual_assessment && <pre className="rv-code-block">{json(item.visual_assessment)}</pre>}
      {visualEvidence.map((e) => <code className="rv-path" key={e.path}>{e.path}</code>)}
    </div>}
    <div className="rv-compare-grid"><ResultSide label="원본 결과" value={item.original} /><ResultSide label="재현 결과" value={item.replica} /></div>
    <details className="rv-disclosure rv-raw-disclosure"><summary>입력·환경·증거·Run 세부 정보</summary>
      <dl className="rv-meta-grid"><dt>입력 (stdin / argv / request)</dt><dd><pre>{json(item.input)}</pre></dd>
        <dt>사전 상태</dt><dd><pre>{json(item.pre_state)}</pre></dd><dt>환경</dt><dd><pre>{json(item.environment)}</pre></dd>
        <dt>확인 시각</dt><dd>{item.verified_at || "미기록"}</dd><dt>Run ID</dt><dd><code>{item.run_id || "미기록"}</code></dd>
        <dt>증거 경로</dt><dd>{item.evidence?.length ? item.evidence.map((e) => <code className="rv-path" key={e.path}>{e.kind}: {e.path}{e.sha256 ? ` · sha256 ${e.sha256}` : ""}</code>) : "증거 없음"}</dd>
      </dl>
    </details>
  </article>;
}

/** V2 comparison evidence and existing workspace controls for reconstruction runs. */
export function Reconstruction({ job, timeline }: { job: ReverseDetail; timeline?: ReactNode }) {
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState(job.title ?? "");
  const [targetType, setTargetType] = useState<ReverseTargetType>(job.target_type ?? "auto");
  const [mode, setMode] = useState<ReverseMode>(job.mode ?? "auto");
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [readingPath, setReadingPath] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();
  const active = ["queued", "running", "waiting"].includes(job.status);
  const send = useMutation({ mutationFn: () => messageReverseJob(job.id, prompt.trim()),
    onSuccess: () => { setPrompt(""); void qc.invalidateQueries({ queryKey: ["reverse"] }); },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const retry = useMutation({ mutationFn: () => retryReverseJob(job.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["reverse"] }),
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const saveSettings = useMutation({ mutationFn: (body: { title?: string; target_type?: ReverseTargetType; mode?: ReverseMode }) => patchReverseJob(job.id, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["reverse"] }); toast({ message: "작업 설정을 저장했어요.", tone: "success" }); },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const stop = useMutation({ mutationFn: () => cancelRun(job.rounds![job.rounds!.length - 1].id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["reverse"] }),
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const download = async (id: string) => { try { const link = await downloadLink(id); window.location.assign(link.url); }
    catch (e) { toast({ message: errorText(e).message, tone: "danger" }); } };
  const result = job.reconstruction;
  const v2 = reverseV2FromDetail(job);
  const latest = v2?.latest;
  const history = v2?.history ?? [];
  const counts = countComparisons(latest);
  const independent = latest?.independent_verification ?? (job.verifier_session_id
    ? { status: result?.verification ?? "pending", verdict: result?.verification ?? null }
    : undefined);
  const mismatches = latest?.comparisons?.filter((c) => c.result === "mismatch") ?? [];
  const unknowns = latest?.comparisons?.filter((c) => c.result === "unverified") ?? [];
  const suggestions = counts.mismatched > 0 ? ["불일치 차이 수정", "경계·오류 입력 추가 검사"]
    : independent?.status !== "passed" ? ["독립 검증 또는 추가 검사 요청", "대상 설명과 반례 보충"] : ["새 반례 탐색", "설명 보충"];
  const ask = (text: string) => { setPrompt(text); requestAnimationFrame(() => promptRef.current?.focus()); };
  const readWorkspaceFile = async (path: string) => {
    if (fileContents[path] !== undefined || readingPath) return;
    setReadingPath(path); setFileErrors((current) => ({ ...current, [path]: "" }));
    try {
      const artifact = await resolveArtifactLink({ path: outputArtifactPath(path, job.output_path), workspace_id: job.workspace_id, session_id: job.session_id });
      const body = await contentBlob(artifact.id).then((blob) => blob.text());
      setFileContents((current) => ({ ...current, [path]: body }));
    } catch (error) {
      const message = errorText(error).message;
      setFileErrors((current) => ({ ...current, [path]: message }));
      toast({ message, tone: "danger" });
    } finally { setReadingPath(null); }
  };
  const switchToReconstruct = () => saveSettings.mutate({ mode: "reconstruct" });
  const statusCopy = job.status === "done" ? "작업이 종료되었습니다. 직접 비교와 독립 검증은 별도 근거로 표시합니다."
    : job.status === "needs_input" ? "대상 접근이나 동작 정보가 필요합니다. 설명을 보충해 주세요."
      : job.status === "partial" ? "일부 단계가 끝나지 않았습니다. 실패한 검사와 미확인 항목을 확인하세요."
        : job.status === "failed" ? "실행에 실패했습니다. 오류와 회차 기록을 확인하세요."
          : "작업 진행 중입니다. 현재 확인된 결과만 표시합니다.";
  return <>
    <section className="rv-summary" aria-label="작업 결과 요약">
      <div className="rv-summary__main"><span className="rv-eyebrow">결과 요약 · {job.status.replace("_", " ")}</span>
        <h2>{job.title || result?.summary || job.target}</h2><p>{result?.summary || job.overview || statusCopy}</p>
        <p className="rv-note">{statusCopy}</p></div>
      <div className="rv-metrics" aria-label="직접 비교 결과">
        <div><strong>{counts.count}</strong><span>비교 사례</span></div><div><strong>{counts.matched}</strong><span>일치</span></div>
        <div><strong>{counts.mismatched}</strong><span>불일치</span></div><div><strong>{counts.unverified}</strong><span>미검증</span></div>
      </div>
      <div className="rv-summary__meta"><span>직접 비교: <b>{statusLabel(counts.status)}</b></span>
        <span>독립 검증: <b>{statusLabel(independent?.status ?? independent?.verdict)}</b></span>
        {job.verifier_session_id && <Link to={`/chat/${job.verifier_session_id}`}>검증 대화 보기</Link>}
        {independent?.run_id && <span>검증 Run ID: <code>{independent.run_id}</code></span>}
        {!v2 && result?.verification && <span>기존 검증 보고: <b>{result.verification}</b> · 독립 Run 근거 미확인</span>}
      </div>
      {(mismatches.length > 0 || unknowns.length > 0) && <div className="rv-summary__findings">
        {mismatches.slice(0, 3).map((c) => <p key={c.id}><strong>불일치</strong> {c.behavior}: {json(c.difference)}</p>)}
        {unknowns.slice(0, 3).map((c) => <p key={c.id}><strong>미검증</strong> {c.behavior}: {String(c.difference?.reason ?? "원본 결과 또는 증거 확인 필요")}</p>)}
      </div>}
      <div className="rv-action-row"><Button variant="primary" disabled={active} onClick={() => promptRef.current?.focus()}>후속 요청 작성</Button>
        {job.status === "failed" || job.status === "partial" || job.status === "waiting" ? <Button variant="ghost" busy={retry.isPending} onClick={() => retry.mutate()}>재시도</Button> : null}
        {active && !!job.rounds?.length && <Button variant="ghost" busy={stop.isPending} onClick={() => stop.mutate()}>작업 중지</Button>}
      </div>
    </section>

    <section className="rv-section" aria-label="작업 설정">
      <h2 className="tk-heading-4">작업 설정</h2>
      <div className="rv-settings-grid">
        <label className="rv-label">작업 제목<input className="tk-input" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="rv-label">대상 유형<select className="tk-input" value={targetType} onChange={(event) => setTargetType(event.target.value as ReverseTargetType)}>
          {[["auto", "자동"], ["cli", "CLI"], ["api", "API"], ["web", "웹"], ["source", "소스"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="rv-label">실행 방식<select className="tk-input" value={mode} onChange={(event) => setMode(event.target.value as ReverseMode)}>
          {[["auto", "자동"], ["analyze", "분석"], ["reconstruct", "재현"], ["analyze_reconstruct", "분석 후 재현"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <Button variant="ghost" disabled={active || saveSettings.isPending} busy={saveSettings.isPending} onClick={() => saveSettings.mutate({ title: title.trim(), target_type: targetType, mode })}>변경 저장</Button>
      </div>
    </section>

    <section className="rv-section" aria-label="대상과 작업공간">
      <h2 className="tk-heading-4">대상과 작업공간</h2><p className="rv-prose">{job.target}</p>
      {job.output_path && <code className="rv-path">{job.output_path}</code>}
      {job.session_id && <div className="rv-row rv-row--wrap"><Link to={`/chat/${job.session_id}`}>실행 대화·도구 기록</Link><Link to={`/workspace/${job.session_id}`}>작업공간에서 소스 보기</Link>
        {job.verifier_session_id && <Link to={`/chat/${job.verifier_session_id}`}>독립 검증 기록</Link>}</div>}
      {active && <p className="rv-note" role="status">{job.waiting_reason || job.progress || "대상 조사·소스 작성 중"}</p>}
    </section>

    {latest && <section className="rv-section" aria-label="직접 비교">
      <div className="rv-section__heading"><div><h2 className="tk-heading-4">원본과 재현 결과 비교</h2><p className="rv-note">비교 사례 수는 전체 정확도 점수가 아닙니다. 원본 결과가 없거나 근거가 부족하면 미검증으로 남습니다.</p></div></div>
      {latest.comparisons?.length ? <div className="rv-comparisons">{latest.comparisons.map((item) => <Comparison item={item} key={item.id} />)}</div>
        : <p className="rv-empty-inline">비교 사례가 없습니다. 직접 비교는 0건이며 결과는 미검증입니다.</p>}
    </section>}

    {result && <section className="rv-section" aria-label="소스·관찰·검증">
      <h2 className="tk-heading-4">재현 소스와 실행 증거</h2><p className="rv-prose">{result.summary}</p>
      <div className="rv-evidence-columns"><div><h3>소스 파일</h3>{result.source_files.length ? <ul className="rv-source-list">{result.source_files.map((file) => <li key={file}><code className="rv-path">{file}</code>
          <div className="rv-row rv-row--wrap"><Button variant="ghost" size="sm" aria-label={`${file} 미리보기`} disabled={readingPath !== null || !job.workspace_id && !job.session_id} busy={readingPath === file} onClick={() => void readWorkspaceFile(file)}>미리보기</Button>
            {job.session_id ? <Link to={`/workspace/${job.session_id}`} aria-label={`${file} 작업공간에서 보기`}>Workspace 열기</Link> : null}</div>
          {fileErrors[file] && <p className="tk-error" role="alert">파일 읽기 실패: {fileErrors[file]}</p>}
          {fileContents[file] !== undefined && <details className="rv-file-preview" open><summary><code>{file}</code> 내용</summary><pre className="rv-code-block">{fileContents[file]}</pre></details>}</li>)}</ul> : <p className="rv-note">소스 파일 목록이 없습니다.</p>}
          {result.source_preview?.length ? <details className="rv-disclosure"><summary>응답에 포함된 미리보기 {result.source_preview.length}건</summary>
            {result.source_preview.map((file) => <div className="rv-file-preview" key={file.path}><h3><code>{file.path}</code></h3><pre className="rv-code-block">{file.content}</pre></div>)}</details> : null}</div>
        <div><h3>검사·실행</h3>{result.checks.length ? result.checks.map((check, i) => {
          return <div className="rv-check" key={`${check.command}-${i}`}>
            <code>{check.command}</code><span>종료 코드 {check.exit_code}</span>
            <Button variant="ghost" size="sm" disabled={readingPath !== null || !job.workspace_id && !job.session_id} busy={readingPath === check.log} onClick={() => void readWorkspaceFile(check.log)}>로그 읽기</Button>
            {fileErrors[check.log] && <p className="tk-error" role="alert">로그 읽기 실패: {fileErrors[check.log]}</p>}
            {fileContents[check.log] !== undefined && <details className="rv-disclosure" open><summary>{check.log} 본문</summary><pre className="rv-code-block">{fileContents[check.log]}</pre></details>}
          </div>;
        }) : <p className="rv-note">실행 검사가 기록되지 않았습니다.</p>}</div></div>
      <div><h3>관찰·참고 기록</h3>{result.observations.length ? result.observations.map((o, i) => <div className="rv-block" key={i}><p><span className="rv-evidence-level">{reverseEvidenceLabel(o.evidence_level)}</span> {o.finding}</p><p className="rv-note">출처·근거: {o.evidence}</p></div>) : <p className="rv-note">관찰 기록이 없습니다.</p>}</div>
      {result.hypotheses?.length ? <div><h3>추론·가설</h3>{result.hypotheses.map((o, i) => <div className="rv-block" key={i}><p><span className="rv-evidence-level">{reverseEvidenceLabel(o.evidence_level ?? "inferred")}</span> {o.finding}</p><p className="rv-note">근거: {o.evidence || "미기록"}</p></div>)}</div> : null}
      {(result.unknowns?.length || result.limitations.length) ? <div><h3>미확인·한계</h3><ul className="rv-limits">{[...(result.unknowns ?? []), ...result.limitations].map((l, i) => <li key={i}>{l}</li>)}</ul></div> : <p className="rv-note">추가 미확인 항목 없음(응답 기록 기준)</p>}
    </section>}

    {v2?.plan?.length ? <section className="rv-section" aria-label="추천과 실행 계획"><h2 className="tk-heading-4">추천과 조사 계획</h2>
      {v2.recommendation && <p className="rv-note">추천 유형 {v2.recommendation.target_type} · 방식 {v2.recommendation.mode} · {v2.recommendation.reasons.join(" / ")}</p>}
      <ol>{v2.plan.map((step, i) => <li key={i}>{step}</li>)}</ol></section> : null}

    {latest && <section className="rv-section" aria-label="재현 상태별 결과"><h2 className="tk-heading-4">소스·실행·검증 상태</h2>
      <div className="rv-state-grid">{[["소스", latest.source], ["실행 검사", latest.execution], ["직접 비교", latest.direct_comparison], ["독립 검증", latest.independent_verification]].map(([label, state]) => <div key={String(label)}>
        <strong>{String(label)}</strong><span>{statusLabel((state as { status?: string } | undefined)?.status)}</span>
        {label === "실행 검사" && (latest.execution?.checks?.length ? <ul>{latest.execution.checks.map((c, i) => <li key={i}><code>{c.command}</code>: {c.exit_code ?? "미실행"}{c.reason ? ` · ${c.reason}` : ""}</li>)}</ul> : <p>검사 기록 없음</p>)}
      </div>)}</div></section>}

    {!!history.length && <section className="rv-section" aria-label="이전 비교 회차"><h2 className="tk-heading-4">이전 결과</h2>
      <div className="rv-history">{history.map((snapshot, i) => { const c = countComparisons(snapshot); return <details key={snapshot.run_id || i}>
        <summary>{snapshot.created_at || snapshot.run_id || `이전 회차 ${i + 1}`} · 비교 {c.count}건 · 일치 {c.matched} · 불일치 {c.mismatched} · 미검증 {c.unverified}</summary>
        {snapshot.comparisons?.length ? snapshot.comparisons.map((item) => <Comparison item={item} key={item.id} />) : <p className="rv-note">저장된 비교 사례가 없습니다.</p>}
      </details>; })}</div></section>}

    {!!job.outputs?.length && <section className="rv-section" aria-label="소스와 산출물 다운로드"><h2 className="tk-heading-4">소스·산출물</h2>
      {job.outputs.map((a) => <Button variant="ghost" key={a.id} disabled={!a.downloadable} onClick={() => void download(a.id)}>{a.filename} 내려받기</Button>)}</section>}
    {timeline && <details className="rv-section" open={active}><summary className="rv-phase-summary">관찰·수정·재검증 활동 단계</summary>{timeline}</details>}
    {!!job.activity?.length && <details className="rv-section"><summary className="rv-phase-summary">활동 로그 {job.activity.length}건</summary>
      <ol className="rv-timeline">{job.activity.map((ev, i) => <li className="rv-step" key={i}><time className="rv-note">{ev.at}</time><p className="rv-prose">{ev.text}</p></li>)}</ol></details>}
    {(job.rounds ?? []).filter((r) => r.result_text || r.error).length > 0 && <details className="rv-section"><summary className="rv-phase-summary">실행·검증 보고 {job.rounds!.filter((r) => r.result_text || r.error).length}건</summary>
      {(job.rounds ?? []).filter((r) => r.result_text || r.error).map((r, i) => <details className="rv-report" key={r.id} open={i === job.rounds!.filter((x) => x.result_text || x.error).length - 1}>
        <summary>{r.role === "verify" ? "독립 검증" : "분석·구현"} · {r.status} · {r.engine}{r.model ? ` / ${r.model}` : ""}</summary><p className="rv-prose">{r.result_text || r.error}</p></details>)}</details>}

    <section className="rv-start" aria-label="후속 작업"><h2 className="tk-heading-4">다음 작업</h2>
      <div className="rv-action-row">{suggestions.map((s) => <Button key={s} variant="ghost" disabled={active} onClick={() => ask(s === "불일치 차이 수정" ? `직접 비교에서 불일치한 항목을 근거와 함께 확인하고 수정해 주세요.\n${mismatches.map((c) => `- ${c.behavior}: ${json(c.difference)}`).join("\n")}` : s)}>{s}</Button>)}
        {job.mode === "analyze" && <Button variant="ghost" busy={saveSettings.isPending} disabled={active || saveSettings.isPending} onClick={switchToReconstruct}>분석에서 재현으로 전환</Button>}</div>
      <label className="rv-label" htmlFor="rv-followup">추가 설명·검사·수정 요청</label>
      <textarea ref={promptRef} id="rv-followup" rows={4} maxLength={40000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="차이를 고치거나, 추가 검사를 요청하거나, 관찰된 사실과 추론을 보충해 주세요." />
      <p className="rv-note">{active ? "진행 중인 작업을 마치거나 중지하면 이어서 지시할 수 있어요." : "같은 작업공간과 기록을 이어서 사용합니다."}</p>
      <Button type="button" variant="primary" busy={send.isPending} disabled={active || !prompt.trim()} onClick={() => send.mutate()}>이어서 지시</Button>
    </section>
  </>;
}
