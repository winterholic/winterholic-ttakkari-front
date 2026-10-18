import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { deleteReverseJob, listReverseJobs, listWorkspaces, startReverseJob } from "../api/client";
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
  queued: "대기 중", running: "진행 중", waiting: "모델 대기 중",
  partial: "부분 완료", done: "완료", failed: "실패", needs_input: "추가 설명 필요",
};

function shortTarget(target: string) {
  return target.length > 60 ? target.slice(0, 57) + "…" : target;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 자연어 대상 설명과 재현 작업 목록. */
export function ReversePage() {
  const [target, setTarget] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [workspaceId, setWorkspaceId] = useState("");
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => listWorkspaces() });
  const jobs = useQuery({
    queryKey: KEY, queryFn: listReverseJobs,
    refetchInterval: (q) => ((q.state.data?.items ?? []).some((j) => j.status === "queued" || j.status === "running" || j.status === "waiting") ? 3000 : false),
  });
  const items = jobs.data?.items ?? [];
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: KEY }); });
  const start = useMutation({
    mutationFn: () => startReverseJob({ description: target.trim(), workspace_id: workspaceId || undefined }),
    onSuccess: (job) => {
      setTarget("");
      void qc.invalidateQueries({ queryKey: KEY });
      toast({ message: "분석을 시작했어요. 목록에서 진행 상황을 볼 수 있어요.", tone: "success" });
      void navigate(`/reverse/${job.id}`);
    },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteReverseJob(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const meta = jobs.data ? `작업 ${jobs.data.items.length}개` : "대상 관찰부터 소스코드 재현까지";
  return (
    <div className="tk-screen">
      <PageHeader title="리버스 엔지니어링" meta={meta} />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--lg">
          <div className="rv">
            <form className="rv-start" onSubmit={(e) => { e.preventDefault(); if (target.trim() && !start.isPending) start.mutate(); }}>
              <h2 className="tk-heading-4">어떤 대상을 재현할까요?</h2>
              <p className="rv-note">대상의 화면·입출력·사용 흐름과 재현하고 싶은 범위를 채팅하듯 자세히 적어 주세요. 참고 링크나 파일 위치도 함께 적을 수 있어요.</p>
              <label className="rv-label" htmlFor="rv-target">분석할 대상과 재현 목표</label>
              <textarea id="rv-target" value={target} onChange={(e) => setTarget(e.target.value)} rows={7} maxLength={40000}
                placeholder={"예: 제가 쓰는 견적 계산기의 동작을 재현하고 싶어요.\n수량과 단가를 넣으면 합계에 부가세가 더해지고, 항목을 추가하거나 지울 수 있어요.\n이 흐름을 분석해서 우리 작업공간에 실행 가능한 웹앱 소스로 만들어 주세요."}
                autoComplete="off" aria-describedby="rv-help" />
              <label className="rv-label" htmlFor="rv-workspace">소스를 저장할 작업공간</label>
              <select id="rv-workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
                <option value="">기본 작업공간</option>
                {(workspaces.data ?? []).map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
              </select>
              {workspaces.isError && <p className="rv-note" role="status">작업공간 목록을 읽지 못했어요. 기본 작업공간으로 시작할 수 있습니다.</p>}
              <p id="rv-help" className="rv-note">관찰·가설·구현·독립 검증을 기록하고, 소스와 테스트·실행법을 작업공간에 저장합니다.</p>
              <Button variant="primary" type="submit" busy={start.isPending} disabled={!target.trim()}>분석·구현 시작</Button>
            </form>
            {jobs.isPending ? <ListSkeleton label="작업 목록을 읽는 중" rows={3} />
              : jobs.isError ? <ErrorState what="리버스 작업 목록" error={jobs.error} onRetry={() => void jobs.refetch()} />
              : items.length === 0 ? <EmptyState icon="search" title="아직 시작한 작업이 없어요">
                대상과 재현하고 싶은 동작을 설명하면 관찰부터 소스 작성·검증까지 진행합니다.
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
                      <span className="rv-note">{j.kind === "reconstruction" ? "소스코드 재현" : "이전 저장소 분석"}{j.revision ? ` · rev ${j.revision.slice(0, 12)}` : ""}</span>
                      {(j.status === "done" || j.status === "failed" || j.status === "partial" || j.status === "needs_input") && (
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
