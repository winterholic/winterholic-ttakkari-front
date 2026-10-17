import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { getReverseJob, retryReverseJob } from "../api/client";
import type { ReverseDetail, ReverseStage } from "../api/reverseTypes";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { PageHeader } from "../shell/PageHeader";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { toast } from "../ui/toastStore";
import { ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { errorText } from "../features/viewer/api";
import "./reverse.css";

const STAGE_STATE: Record<ReverseStage["status"], string> = {
  pending: "대기", running: "진행 중", waiting: "모델 대기 중", done: "완료", failed: "실패",
};
const RETRYABLE = new Set(["waiting", "partial", "failed"]);

function Timeline({ stages }: { stages: ReverseStage[] }) {
  return <ol className="rv-timeline">
    {stages.map((s, i) => (
      <li key={s.key} className="rv-step" data-state={s.status}>
        <span className="rv-step__dot" aria-hidden>{s.status === "done" ? "●" : s.status === "failed" ? "✕" : `${i + 1}`}</span>
        <div className="rv-step__body">
          <p className="rv-step__title">{s.label} <span className="rv-note">· {STAGE_STATE[s.status]}</span></p>
          {s.evidence.length > 0 && (
            <details className="rv-disclosure">
              <summary>근거 {s.evidence.length}건</summary>
              <ul>{s.evidence.map((e, k) => <li key={k}>{e}</li>)}</ul>
            </details>
          )}
          {s.notes.map((n, k) => <p key={k} className="rv-note">확인 필요: {n.replace(/^확인 필요:\s*/, "")}</p>)}
        </div>
      </li>
    ))}
  </ol>;
}

function Evidence({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return <details className="rv-disclosure"><summary>근거 {items.length}건</summary>
    <ul>{items.map((e, i) => <li key={i} className="rv-path">{e}</li>)}</ul></details>;
}

function Result({ result }: { result: NonNullable<ReverseDetail["result"]> }) {
  return <div className="rv-result">
    <section className="rv-section" aria-label="개요">
      <h2 className="tk-heading-4">개요</h2>
      <p className="rv-prose">{result.overview.text}</p>
      <Evidence items={result.overview.evidence} />
    </section>
    <section className="rv-section" aria-label="아키텍처">
      <h2 className="tk-heading-4">아키텍처</h2>
      {result.architecture.map((a, i) => <div key={i} className="rv-block">
        <h3>{a.title}</h3><p>{a.body}</p><Evidence items={a.evidence} />
      </div>)}
    </section>
    <section className="rv-section" aria-label="핵심 모듈">
      <h2 className="tk-heading-4">핵심 모듈</h2>
      <ul className="rv-list">{result.modules.map((m, i) => <li key={i} className="rv-item">
        <code className="rv-path">{m.path}</code><p>{m.role}</p><Evidence items={m.evidence} />
      </li>)}</ul>
    </section>
    {result.flows.length > 0 && (
      <section className="rv-section" aria-label="데이터·제어 흐름">
        <h2 className="tk-heading-4">데이터·제어 흐름</h2>
        {result.flows.map((f, i) => <div key={i} className="rv-block">
          <h3>{f.title}</h3>
          <ol className="rv-chain">{f.steps.map((s, k) => <li key={k}><code className="rv-path">{s}</code></li>)}</ol>
          <Evidence items={f.evidence} />
        </div>)}
      </section>
    )}
    {result.ideas.length > 0 && (
      <section className="rv-section" aria-label="차용할 아이디어">
        <h2 className="tk-heading-4">차용할 아이디어</h2>
        {result.ideas.map((idea, i) => <div key={i} className="rv-block">
          <h3>{idea.title}</h3><p>{idea.body}</p><Evidence items={idea.evidence} />
        </div>)}
      </section>
    )}
    <section className="rv-section" aria-label="한계와 확인 필요">
      <h2 className="tk-heading-4">한계·확인 필요</h2>
      <ul className="rv-limits">{result.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <p className="rv-note">파일 {result.stats.files}개({Math.round(result.stats.bytes / 1024).toLocaleString()} KiB) 중 {result.stats.files_parsed}개 파싱
        {result.stats.revision ? ` · rev ${result.stats.revision.slice(0, 12)}` : ""}</p>
      {result.stats.model && <p className="rv-note">모델 합성: {result.stats.model.engine}/{result.stats.model.model}
        {result.stats.model.account ? ` · 계정 ${result.stats.model.account}` : ""} · 발췌 {result.stats.model.files_read}개 읽음
        {result.stats.model.merged ? "" : " · 정적 정리"}</p>}
    </section>
  </div>;
}

/** 리버스 작업 상세: 과정 타임라인(A~Z 단계·근거)과 최종 정리 결과. */
export function ReverseDetailPage() {
  const { jobId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const job = useQuery({
    queryKey: ["reverse", "job", jobId], queryFn: () => getReverseJob(jobId),
    refetchInterval: (q) => (q.state.data?.status === "queued" || q.state.data?.status === "running" ? 2500 : false),
  });
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: ["reverse"] }); });
  const data = job.data ?? null;
  const active = data?.status === "queued" || data?.status === "running";
  const retry = useMutation({
    mutationFn: () => retryReverseJob(jobId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reverse"] });
      toast({ message: "분석을 다시 시작했어요.", tone: "success" });
    },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  return (
    <div className="tk-screen">
      <PageHeader title="분석 결과" meta={data ? data.target : "리버스 엔지니어링"}
        actions={<IconButton aria-label="목록으로" onClick={() => void navigate("/reverse")}><Icon name="back" /></IconButton>} />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--lg">
          <div className="rv">
            {job.isPending ? <ListSkeleton label="분석 결과를 읽는 중" rows={5} />
              : job.isError ? <ErrorState what="분석 결과" error={job.error} onRetry={() => void job.refetch()} />
              : data && <>
                {(data.status === "failed" || data.status === "waiting") && data.error && <p className="tk-error" role="alert">{data.error}</p>}
                {data.status === "partial" && <p className="rv-note" role="status">모델 합성 없이 정적 정리만 됐어요. 다시 시도하면 모델 합성을 붙일 수 있어요.</p>}
                {RETRYABLE.has(data.status) && (
                  <Button variant="primary" size="sm" busy={retry.isPending} onClick={() => retry.mutate()}>다시 시도</Button>
                )}
                <section className="rv-section" aria-label="과정 타임라인">
                  <h2 className="tk-heading-4">과정 타임라인</h2>
                  <Timeline stages={data.stages} />
                </section>
                {data.result ? <Result result={data.result} />
                  : <p className="rv-note">{active ? "분석이 진행 중입니다. 잠시 후 결과가 나옵니다." : "결과가 없습니다."}</p>}
              </>}
          </div>
        </div>
      </div>
    </div>
  );
}
