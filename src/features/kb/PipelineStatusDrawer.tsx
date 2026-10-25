import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isKbUnsupported, kbJobs, kbRetryJob } from "../../api/kb";
import { KB_PIPELINE_STAGES } from "../../api/kbTypes";
import type { KbPipelineJob, KbPipelineStage, KbStageRow } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { failure, formatTime } from "./labels";
import { STAGE_LABEL, STAGE_STATUS_LABEL, formatDuration, isActiveJob, jobStatusLabel, jobTone, reasonText } from "./labelsV3";

/** 사람이 다시 시도해도 결과가 같은 보류 사유. 이때는 재시도 대신 안내만 보여 준다. */
const PERMANENT_HOLD = new Set(["ocr_required", "unsupported_legacy_office"]);

/** 계약의 stages[] 는 6단계가 모두 오지 않을 수 있다. 빠진 단계는 대기로 보여 주고 지어낸 시간·숫자는 쓰지 않는다. */
function fullStages(job: KbPipelineJob): KbStageRow[] {
  return KB_PIPELINE_STAGES.map((stage) => job.stages.find((s) => s.stage === stage) ?? { stage, status: "pending" });
}

/** 실패·보류가 난 단계. 없으면 작업의 현재 단계. */
function problemStage(job: KbPipelineJob): KbPipelineStage {
  return fullStages(job).find((s) => s.status === "failed" || s.status === "held")?.stage ?? job.current_stage;
}

export function StageTimeline({ job }: { job: KbPipelineJob }) {
  return <ol className="kb3-stages" aria-label="처리 단계">
    {fullStages(job).map((s) => <li key={s.stage} className="kb3-stage" data-status={s.status}>
      <span className="kb3-stage__dot" aria-hidden="true" />
      <span className="kb3-stage__name">{STAGE_LABEL[s.stage]}</span>
      <span className="kb3-stage__state">{STAGE_STATUS_LABEL[s.status]}{s.duration_ms ? ` · ${formatDuration(s.duration_ms)}` : ""}</span>
      {s.error_message && <span className="kb3-stage__error">{s.error_message}</span>}
    </li>)}
  </ol>;
}

function useRetry(job: KbPipelineJob) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (fromStage: string | null) => kbRetryJob(job.id, fromStage),
    onSuccess: () => Promise.all([
      cache.invalidateQueries({ queryKey: ["kb-jobs"] }), cache.invalidateQueries({ queryKey: ["kb-summary"] }),
      cache.invalidateQueries({ queryKey: ["kb-documents"] }), cache.invalidateQueries({ queryKey: ["kb-document"] }),
    ]),
  });
}

export function JobCard({ job, title, openDocument }: { job: KbPipelineJob; title?: string; openDocument?: (documentId: string, revisionId: string) => void }) {
  const retry = useRetry(job);
  const metrics = job.metrics ?? {};
  const reason = reasonText(job.hold_reason) ?? (job.status === "failed" ? job.error_detail || job.error_code : null);
  const stage = problemStage(job);
  const canRetry = job.status === "failed" || job.status === "degraded" || (job.status === "held" && !PERMANENT_HOLD.has(job.hold_reason ?? ""));
  const heading = title ?? job.document_title ?? `문서 ${job.document_id.slice(0, 8)}`;
  return <li className="kb3-job" data-status={job.status}>
    <div className="kb3-job__head">
      <p className="kb3-job__title">{heading}</p>
      <Badge tone={jobTone(job.status)}>{jobStatusLabel(job.status)}</Badge>
    </div>
    <StageTimeline job={job} />
    {(metrics.passage_count !== undefined || metrics.entity_count !== undefined || metrics.assertion_count !== undefined) && <p className="kb-note">
      {[metrics.passage_count !== undefined && `패시지 ${metrics.passage_count}`, metrics.entity_count !== undefined && `개념 ${metrics.entity_count}`,
        metrics.assertion_count !== undefined && `주장 ${metrics.assertion_count}`, metrics.conflict_count ? `충돌 ${metrics.conflict_count}` : false].filter(Boolean).join(" · ")}
    </p>}
    {job.status === "degraded" && <p className="kb-callout">AI 심층 추출이 일부 빠졌어요. 패시지 검색은 바로 쓸 수 있고, 규칙·사전 기반 개념은 이미 연결됐어요. 심층 추출만 다시 시도할 수 있어요.</p>}
    {job.status === "held" && reason && <p className="kb-callout" role="status">보류: {reason}</p>}
    {job.status === "failed" && <p className="tk-error" role="alert">{STAGE_LABEL[stage]} 단계에서 실패했어요.{reason ? ` ${reason}` : ""}</p>}
    <div className="kb-actions">
      {canRetry && job.status === "degraded" && <Button size="sm" busy={retry.isPending} onClick={() => retry.mutate("extracting")}>심층 추출만 다시</Button>}
      {canRetry && job.status !== "degraded" && <Button size="sm" variant="primary" busy={retry.isPending} onClick={() => retry.mutate(stage)}>{`${STAGE_LABEL[stage]} 단계부터 재시도`}</Button>}
      {canRetry && job.status === "failed" && <Button size="sm" variant="ghost" busy={retry.isPending} onClick={() => retry.mutate(null)}>처음부터 다시</Button>}
      {openDocument && <Button size="sm" variant="ghost" onClick={() => openDocument(job.document_id, job.revision_id)}>문서 열기</Button>}
    </div>
    {retry.isSuccess && <p className="kb-note" role="status">다시 대기열에 넣었어요.</p>}
    {retry.isError && <p className="tk-error" role="alert">{failure(retry.error)}</p>}
    {job.updated_at && <p className="kb-note">갱신 {formatTime(job.updated_at)}{job.attempt_count ? ` · 시도 ${job.attempt_count}${job.max_attempts ? `/${job.max_attempts}` : ""}` : ""}</p>}
  </li>;
}

type JobFilter = "all" | "active" | "failed" | "held" | "degraded";
const JOB_FILTERS: { id: JobFilter; label: string }[] = [
  { id: "all", label: "전체" }, { id: "active", label: "진행 중" }, { id: "failed", label: "실패" }, { id: "held", label: "보류" }, { id: "degraded", label: "부분 완료" },
];
const matches = (job: KbPipelineJob, f: JobFilter) => f === "all" || (f === "active" ? isActiveJob(job.status) : job.status === f);

/** 진행 중인 작업이 하나라도 있을 때만 3초마다 다시 읽는다. */
export function useKbJobs(enabled: boolean) {
  return useQuery({
    queryKey: ["kb-jobs"], queryFn: () => kbJobs({ limit: 50 }), enabled,
    refetchInterval: (q) => (q.state.data?.items.some((j) => isActiveJob(j.status)) ? 3000 : false),
  });
}

export function PipelineStatusDrawer({ open, onClose, openDocument }: { open: boolean; onClose: () => void; openDocument: (documentId: string, revisionId: string) => void }) {
  const [filter, setFilter] = useState<JobFilter>("all");
  const jobs = useKbJobs(open);
  const items = jobs.data?.items.filter((j) => matches(j, filter)) ?? [];
  return <Dialog open={open} onClose={onClose} size="lg" title="자동 처리 현황">
    <div className="kb3-jobs">
      <div className="kb-revisions" role="group" aria-label="처리 상태 보기">
        {JOB_FILTERS.map((f) => <button key={f.id} type="button" className="kb-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
      {jobs.isPending && <p className="kb-note" role="status">처리 현황을 읽는 중</p>}
      {jobs.isError && <div className="kb-error">
        <p className="tk-error" role="alert">{failure(jobs.error)}</p>
        {!isKbUnsupported(jobs.error) && <Button variant="ghost" onClick={() => void jobs.refetch()}>다시 시도</Button>}
      </div>}
      {jobs.data && items.length === 0 && <div className="kb-empty"><p>{filter === "all" ? "처리 중이거나 처리된 작업이 없어요." : "이 상태의 작업이 없어요."}</p></div>}
      {items.length > 0 && <ul className="kb3-joblist" aria-label="처리 작업">{items.map((j) => <JobCard key={j.id} job={j} openDocument={(d, r) => { onClose(); openDocument(d, r); }} />)}</ul>}
      {jobs.data?.items.some((j) => isActiveJob(j.status)) && <p className="kb-note" role="status">진행 중인 작업이 있어 3초마다 새로 읽어요.</p>}
    </div>
  </Dialog>;
}
