import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isKbUnsupported, kbJobs, kbRetryJob } from "../../api/kb";
import { KB_PIPELINE_STAGES } from "../../api/kbTypes";
import type { KbJobList, KbPipelineJob, KbPipelineStage, KbRetryOut, KbStageRow } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { failure, formatTime } from "./labels";
import { PERMANENT_HOLD, STAGE_LABEL, STAGE_STATUS_LABEL, codeText, formatDuration, isActiveJob, jobStatusLabel, jobTone, reasonText, stageNote } from "./labelsV3";

/** 계약의 stages[] 는 6단계가 모두 오지만, 빠진 단계는 대기로 보여 주고 지어낸 시간·숫자는 쓰지 않는다. */
function fullStages(job: KbPipelineJob): KbStageRow[] {
  return KB_PIPELINE_STAGES.map((stage) => job.stages.find((s) => s.stage === stage) ?? { stage, status: "pending" });
}

/** 실패·보류가 난 단계. 없으면 작업의 현재 단계. */
function problemStage(job: KbPipelineJob): KbPipelineStage {
  return fullStages(job).find((s) => s.status === "failed" || s.status === "held")?.stage ?? job.current_stage;
}

export function StageTimeline({ job }: { job: KbPipelineJob }) {
  return <ol className="kb3-stages" aria-label="처리 단계">
    {fullStages(job).map((s) => {
      // 서버는 부분 완료·보류 단계의 error_message 에 l2_disabled 같은 코드를 그대로 담는다. 문장으로 바꾸고, 실패가 아니면 경고 색을 쓰지 않는다.
      const text = codeText(s.error_message) ?? (s.status === "degraded" || s.status === "held" ? stageNote(s.detail) : null);
      return <li key={s.stage} className="kb3-stage" data-status={s.status}>
        <span className="kb3-stage__dot" aria-hidden="true" />
        <span className="kb3-stage__name">{STAGE_LABEL[s.stage]}</span>
        <span className="kb3-stage__state">{STAGE_STATUS_LABEL[s.status] ?? s.status}{s.duration_ms ? ` · ${formatDuration(s.duration_ms)}` : ""}</span>
        {text && <span className="kb3-stage__error" data-tone={s.status === "failed" ? "danger" : "note"}>{text}</span>}
      </li>;
    })}
  </ol>;
}

type RetryNote = KbRetryOut["retry"];

function useRetry(job: KbPipelineJob, onRetried?: (job: KbPipelineJob, note: RetryNote) => void) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (fromStage: string | null) => kbRetryJob(job.id, fromStage),
    onSuccess: (out) => {
      onRetried?.(job, out.retry);
      return Promise.all([
        cache.invalidateQueries({ queryKey: ["kb-jobs"] }), cache.invalidateQueries({ queryKey: ["kb-summary"] }),
        cache.invalidateQueries({ queryKey: ["kb-documents"] }), cache.invalidateQueries({ queryKey: ["kb-document"] }),
      ]);
    },
  });
}

/** 재시도 결과 한 줄. 필터된 목록에서는 재시도한 작업이 곧 다른 상태로 옮겨 가서 카드째 사라지므로, 결과는 카드 밖에도 남겨 둔다. */
export function retryNoteText(job: KbPipelineJob, note: RetryNote): string {
  const title = job.document_title ?? `문서 ${job.document_id.slice(0, 8)}`;
  if (!note.requeued) return `${title}: 다시 넣지 않았어요${note.reason ? ` (${note.reason})` : ""}.`;
  const stage = note.from_stage ? `${STAGE_LABEL[note.from_stage as KbPipelineStage] ?? note.from_stage} 단계부터 ` : "";
  return `${title}: ${stage}다시 대기열에 넣었어요.`;
}

/** 작업 한 건. 단계 상태, 결과 숫자, 보류·실패·부분 완료 사유, 재시도를 보여 준다. 보류·실패를 성공처럼 보이게 하지 않는다. */
export function JobCard({ job, title, openDocument, onRetried }: {
  job: KbPipelineJob; title?: string; openDocument?: (documentId: string, revisionId: string) => void; onRetried?: (job: KbPipelineJob, note: RetryNote) => void;
}) {
  const retry = useRetry(job, onRetried);
  const metrics = job.metrics ?? {};
  const permanent = job.status === "held" && PERMANENT_HOLD.has(job.hold_reason ?? "");
  const reason = reasonText(job.hold_reason) ?? (job.status === "failed" ? job.error_detail || job.error_code : null);
  const degradeNote = job.status === "degraded" ? (codeText(job.hold_reason) ?? stageNote(job.stages.find((s) => s.status === "degraded")?.detail)) : null;
  const stage = problemStage(job);
  const canRetry = job.status === "failed" || job.status === "degraded" || (job.status === "held" && !permanent);
  const heading = title ?? job.document_title ?? `문서 ${job.document_id.slice(0, 8)}`;
  const counts = [
    metrics.passage_count !== undefined && `패시지 ${metrics.passage_count}`, metrics.entity_count !== undefined && `개념 ${metrics.entity_count}`,
    metrics.assertion_count !== undefined && `주장 ${metrics.assertion_count}`,
    metrics.relation_count !== undefined && `관계 ${metrics.relation_count}${metrics.relation_candidate_count ? ` (후보 ${metrics.relation_candidate_count})` : ""}`,
    metrics.conflict_count ? `열린 충돌 ${metrics.conflict_count}` : false,
  ].filter(Boolean).join(" · ");
  const result = retry.data?.retry;
  return <li className="kb3-job" data-status={job.status}>
    <div className="kb3-job__head">
      <p className="kb3-job__title">{heading}</p>
      <div className="kb-badges">
        {job.rev_no != null && <Badge mono>{`v${job.rev_no}`}</Badge>}
        <Badge tone={jobTone(job.status)}>{jobStatusLabel(job.status)}</Badge>
      </div>
    </div>
    <StageTimeline job={job} />
    {counts && <p className="kb-note">{counts}</p>}
    {job.status === "degraded" && <p className="kb-callout">{degradeNote ?? "AI 심층 추출이 일부 빠졌어요."} 패시지 검색은 바로 쓸 수 있고, 규칙·사전 기반 개념은 이미 연결됐어요. 심층 추출만 다시 시도할 수 있어요.</p>}
    {job.status === "held" && <p className="kb-callout kb3-callout--attention" role="status">보류: {reason ?? "사유가 기록되지 않았어요."}{permanent ? " 원본은 보관돼 있지만 지식으로는 만들어지지 않았어요. 이 사유는 다시 시도해도 같아서 재시도를 막아 뒀어요." : ""}</p>}
    {job.status === "failed" && <p className="tk-error" role="alert">{STAGE_LABEL[stage]} 단계에서 실패했어요.{reason ? ` ${reason}` : ""}</p>}
    <div className="kb-actions">
      {canRetry && job.status === "degraded" && <Button size="sm" busy={retry.isPending} onClick={() => retry.mutate("extracting")}>심층 추출만 다시</Button>}
      {canRetry && job.status !== "degraded" && <Button size="sm" variant="primary" busy={retry.isPending} onClick={() => retry.mutate(stage)}>{`${STAGE_LABEL[stage]} 단계부터 재시도`}</Button>}
      {canRetry && job.status !== "degraded" && <Button size="sm" variant="ghost" busy={retry.isPending} onClick={() => retry.mutate(null)}>처음부터 다시</Button>}
      {openDocument && <Button size="sm" variant="ghost" onClick={() => openDocument(job.document_id, job.revision_id)}>문서 열기</Button>}
    </div>
    {result?.requeued === true && <p className="kb-note" role="status">다시 대기열에 넣었어요{result.from_stage ? ` (${STAGE_LABEL[result.from_stage as KbPipelineStage] ?? result.from_stage}부터)` : ""}.</p>}
    {result?.requeued === false && <p className="kb-callout" role="status">다시 넣지 않았어요{result.reason ? `: ${result.reason}` : "."}</p>}
    {retry.isError && <p className="tk-error" role="alert">{failure(retry.error)}</p>}
    {job.updated_at && <p className="kb-note">갱신 {formatTime(job.updated_at)}{job.attempt_count ? ` · 시도 ${job.attempt_count}${job.max_attempts ? `/${job.max_attempts}` : ""}` : ""}</p>}
  </li>;
}

/** 서버 필터로 가져온다(status 는 작업 상태 하나 또는 active·attention 그룹). */
type JobFilter = "all" | "active" | "attention" | "failed" | "held" | "degraded" | "ready";
const JOB_FILTERS: { id: JobFilter; label: string }[] = [
  { id: "all", label: "전체" }, { id: "active", label: "진행 중" }, { id: "attention", label: "주의 필요" }, { id: "failed", label: "실패" },
  { id: "held", label: "보류" }, { id: "degraded", label: "부분 완료" }, { id: "ready", label: "완료" },
];
const PAGE = 30;

/** 진행 중인 작업이 불러온 쪽에 하나라도 있을 때만 3초마다 다시 읽는다. */
export function useKbJobs(filter: JobFilter, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["kb-jobs", "list", filter], enabled,
    queryFn: ({ pageParam }) => kbJobs({ status: filter === "all" ? undefined : filter, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last: KbJobList) => ((last.offset ?? 0) + last.items.length < last.total ? (last.offset ?? 0) + (last.limit ?? PAGE) : undefined),
    refetchInterval: (q) => (q.state.data?.pages.some((p) => p.items.some((j) => isActiveJob(j.status))) ? 3000 : false),
  });
}

export function PipelineStatusDrawer({ open, onClose, openDocument }: { open: boolean; onClose: () => void; openDocument: (documentId: string, revisionId: string) => void }) {
  const [filter, setFilter] = useState<JobFilter>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const jobs = useKbJobs(filter, open);
  const items = jobs.data?.pages.flatMap((p) => p.items) ?? [];
  const total = jobs.data?.pages[0]?.total ?? 0;
  return <Dialog open={open} onClose={onClose} size="lg" title="자동 처리 현황">
    <div className="kb3-jobs">
      <div className="kb-revisions" role="group" aria-label="처리 상태 보기">
        {JOB_FILTERS.map((f) => <button key={f.id} type="button" className="kb-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
      {notice && <p className="kb-callout" role="status">{notice}</p>}
      {jobs.isPending && <p className="kb-note" role="status">처리 현황을 읽는 중</p>}
      {jobs.isError && <div className="kb-error">
        <p className="tk-error" role="alert">{failure(jobs.error)}</p>
        {!isKbUnsupported(jobs.error) && <Button variant="ghost" onClick={() => void jobs.refetch()}>다시 시도</Button>}
      </div>}
      {jobs.data && items.length === 0 && <div className="kb-empty"><p>{filter === "all" ? "처리 중이거나 처리된 작업이 없어요." : "이 상태의 작업이 없어요."}</p></div>}
      {items.length > 0 && <>
        <p className="kb-note" role="status">{`${total.toLocaleString("ko-KR")}건 중 ${items.length.toLocaleString("ko-KR")}건`}</p>
        <ul className="kb3-joblist" aria-label="처리 작업">{items.map((j) => <JobCard key={j.id} job={j} onRetried={(job, note) => setNotice(retryNoteText(job, note))} openDocument={(d, r) => { onClose(); openDocument(d, r); }} />)}</ul>
      </>}
      {jobs.hasNextPage && <Button variant="ghost" busy={jobs.isFetchingNextPage} onClick={() => void jobs.fetchNextPage()}>작업 더 보기</Button>}
      {jobs.isError && jobs.data && <p className="tk-error" role="alert">{failure(jobs.error)}</p>}
      {items.some((j) => isActiveJob(j.status)) && <p className="kb-note" role="status">진행 중인 작업이 있어 3초마다 새로 읽어요.</p>}
    </div>
  </Dialog>;
}
