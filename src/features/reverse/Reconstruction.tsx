import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { downloadLink, messageReverseJob, cancelRun } from "../../api/client";
import type { ReverseDetail } from "../../api/reverseTypes";
import { Button } from "../../ui/Button";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";

/** 기존 Run 기록을 보여주며 같은 소스 폴더에 설명과 수정 지시를 이어 붙인다. */
export function Reconstruction({ job, timeline }: { job: ReverseDetail; timeline?: ReactNode }) {
  const [prompt, setPrompt] = useState("");
  const qc = useQueryClient();
  const active = ["queued", "running", "waiting"].includes(job.status);
  const send = useMutation({
    mutationFn: () => messageReverseJob(job.id, prompt.trim()),
    onSuccess: () => { setPrompt(""); void qc.invalidateQueries({ queryKey: ["reverse"] }); },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const stop = useMutation({
    mutationFn: () => cancelRun(job.rounds![job.rounds!.length - 1].id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["reverse"] }); },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const download = async (id: string) => {
    try { const link = await downloadLink(id); window.location.assign(link.url); }
    catch (e) { toast({ message: errorText(e).message, tone: "danger" }); }
  };
  const result = job.reconstruction;
  return <>
    <section className="rv-section" aria-label="대상 설명">
      <h2 className="tk-heading-4">대상 설명과 작업공간</h2>
      <p className="rv-prose">{job.target}</p>
      <code className="rv-path">{job.output_path}</code>
      {job.session_id && <div className="rv-row rv-row--wrap">
        <Link to={`/chat/${job.session_id}`}>실행 대화·도구 기록</Link>
        <Link to={`/workspace/${job.session_id}`}>작업공간에서 소스 보기</Link>
        {job.verifier_session_id && <Link to={`/chat/${job.verifier_session_id}`}>독립 검증 기록</Link>}
      </div>}
      {active && <p className="rv-note" role="status">{job.waiting_reason || job.progress || "대상 조사·소스 작성이 진행 중입니다. 실행 대화에서 도구 사용 과정을 볼 수 있어요."}</p>}
      {active && !!job.rounds?.length && <Button variant="ghost" size="sm" busy={stop.isPending} onClick={() => stop.mutate()}>작업 중지</Button>}
    </section>
    {timeline && <details className="rv-section" open={active}>
      <summary className="rv-phase-summary">관찰·구현·검증 과정</summary>{timeline}
    </details>}
    {result && <section className="rv-section" aria-label="재현 소스와 검증">
      <h2 className="tk-heading-4">재현 소스와 검증</h2>
      <p className="rv-prose">{result.summary}</p>
      <p className="rv-note">{job.status === "needs_input" ? "대상에 접근할 방법이나 동작 설명을 보충해 주세요" : result.verification === "passed" ? "독립 검증 통과" : result.verification === "failed" ? "독립 검증에서 차이가 발견됐어요" : "독립 검증이 남아 있어요"}</p>
      <ul className="rv-list">{result.source_files.map((file) => <li key={file}><code className="rv-path">{file}</code></li>)}</ul>
      {result.observations.map((o, i) => <div className="rv-block" key={i}><p>{o.finding}</p><p className="rv-note">근거: {o.evidence}</p></div>)}
      {result.checks.map((c, i) => <div className="rv-block" key={i}><code className="rv-path">{c.command}</code><p className="rv-note">종료 코드 {c.exit_code} · 로그 {c.log}</p></div>)}
      {result.limitations.length > 0 && <ul className="rv-limits">{result.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </section>}
    {!!job.outputs?.length && <section className="rv-section" aria-label="소스와 산출물 다운로드"><h2 className="tk-heading-4">소스·산출물</h2>
      {job.outputs.map((a) => <Button variant="ghost" key={a.id} disabled={!a.downloadable} onClick={() => void download(a.id)}>{a.filename} 내려받기</Button>)}
    </section>}
    {!!job.activity?.length && <section className="rv-section" aria-label="실행 과정"><h2 className="tk-heading-4">실행 과정</h2>
      <ol className="rv-timeline">{job.activity.map((ev, i) => <li className="rv-step" key={i}><p className="rv-prose">{ev.text}</p></li>)}</ol>
    </section>}
    {(job.rounds ?? []).filter((r) => r.result_text || r.error).map((r, i) => <section className="rv-section" key={r.id} aria-label={`작업 보고 ${i + 1}`}>
      <h2 className="tk-heading-4">{r.role === "verify" ? "독립 검증" : "분석·구현"} 보고</h2>
      <p className="rv-note">{r.engine}{r.model ? ` / ${r.model}` : ""}</p>
      <p className="rv-prose">{r.result_text || r.error}</p>
    </section>)}
    <form className="rv-start" onSubmit={(e) => { e.preventDefault(); if (!active && prompt.trim() && !send.isPending) send.mutate(); }}>
      <label className="rv-label" htmlFor="rv-followup">추가 설명이나 수정 요청</label>
      <textarea id="rv-followup" rows={4} maxLength={40000} value={prompt} onChange={(e) => setPrompt(e.target.value)}
        placeholder="대상 동작을 보충하거나, 재현 소스에서 바꿀 부분을 적어 주세요." />
      <p className="rv-note">{active ? "진행 중인 작업을 마치거나 중지하면 이어서 지시할 수 있어요." : "같은 소스 폴더와 작업 기록을 이어서 사용합니다."}</p>
      <Button type="submit" variant="primary" busy={send.isPending} disabled={active || !prompt.trim()}>이어서 지시</Button>
    </form>
  </>;
}
