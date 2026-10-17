import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { deleteReverseJob, listReverseJobs, startReverseJob } from "../api/client";
import type { ReverseSummary } from "../api/reverseTypes";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { toast } from "../ui/toastStore";
import { EmptyState, ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { errorText } from "../features/viewer/api";
import "./reverse.css";

const KEY = ["reverse", "jobs"] as const;
const STATUS: Record<ReverseSummary["status"], string> = {
  queued: "대기 중", running: "진행 중", done: "완료", failed: "실패",
};

function shortTarget(target: string) {
  return target.length > 60 ? target.slice(0, 57) + "…" : target;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 더보기 > 리버스 엔지니어링. 저장소 분석 요청과 작업 목록(상세는 /reverse/:jobId). */
export function ReversePage() {
  const [target, setTarget] = useState("");
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: KEY, queryFn: listReverseJobs });
  const active = (jobs.data?.items ?? []).some((j) => j.status === "queued" || j.status === "running");
  const poll = useQuery({
    queryKey: [...KEY, "poll"], queryFn: listReverseJobs, refetchInterval: active ? 3000 : false, enabled: active,
  });
  const items = (active && poll.data ? poll.data.items : jobs.data?.items) ?? [];
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: KEY }); });
  const start = useMutation({
    mutationFn: () => startReverseJob(target.trim()),
    onSuccess: (job) => {
      setTarget("");
      void qc.invalidateQueries({ queryKey: KEY });
      toast({ message: "분석을 시작했어요. 목록에서 진행 상황을 볼 수 있어요.", tone: "success" });
      void job;
    },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteReverseJob(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const meta = jobs.data ? `작업 ${jobs.data.items.length}개` : "저장소를 뜯어보고 정리";
  return (
    <div className="tk-screen">
      <PageHeader title="리버스 엔지니어링" meta={meta} />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--lg">
          <div className="rv">
            <form className="rv-start" onSubmit={(e) => { e.preventDefault(); if (target.trim() && !start.isPending) start.mutate(); }}>
              <label className="rv-label" htmlFor="rv-target">GitHub 저장소(morluto/rea처럼 owner/repo)나 로컬 경로를 입력하세요. 코드는 실행하지 않고 읽기만 합니다.</label>
              <div className="rv-row">
                <input id="rv-target" value={target} onChange={(e) => setTarget(e.target.value)}
                  placeholder="morluto/rea" inputMode="url" autoComplete="off" aria-label="분석 대상" />
                <Button variant="primary" type="submit" busy={start.isPending} disabled={!target.trim()}>분석 시작</Button>
              </div>
            </form>
            {jobs.isPending ? <ListSkeleton label="작업 목록을 읽는 중" rows={3} />
              : jobs.isError ? <ErrorState what="리버스 작업 목록" error={jobs.error} onRetry={() => void jobs.refetch()} />
              : items.length === 0 ? <EmptyState icon="search" title="아직 분석한 저장소가 없어요">
                위 입력란에 GitHub 저장소를 적고 분석 시작을 눌러 보세요.
              </EmptyState>
              : <ul className="rv-list">
                {items.map((j) => (
                  <li key={j.id} className="rv-card" data-status={j.status}>
                    <div className="rv-card__head">
                      <span className="rv-chip" data-status={j.status}>{STATUS[j.status]}</span>
                      <span className="rv-time">{shortDate(j.updated_at)}</span>
                    </div>
                    <Link className="rv-card__title" to={`/reverse/${j.id}`}>{shortTarget(j.target)}</Link>
                    {j.overview && <p className="rv-card__excerpt">{j.overview}</p>}
                    {j.status === "failed" && j.error && <p className="tk-error" role="alert">{j.error}</p>}
                    <div className="rv-card__foot">
                      <span className="rv-note">{j.kind === "git_url" ? "GitHub 수집" : "로컬 경로"} · {j.revision ? `rev ${j.revision.slice(0, 12)}` : "rev 미정"}</span>
                      {(j.status === "done" || j.status === "failed") && (
                        <Button variant="ghost" size="sm" busy={remove.isPending} aria-label={`${shortTarget(j.target)} 지우기`}
                          onClick={() => remove.mutate(j.id)}>지우기</Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>}
          </div>
        </div>
      </div>
    </div>
  );
}
