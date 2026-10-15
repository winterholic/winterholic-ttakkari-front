import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { deleteMeeting, getMeeting } from "../api/client";
import { MeetingBody, detailKey } from "../features/meetings/MeetingBody";
import { StatusBadge, isRunning, meetingWhen, scopeLabel } from "../features/meetings/shared";
import { errorText } from "../features/viewer/api";
import { ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { PageHeader } from "../shell/PageHeader";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { toast } from "../ui/toastStore";
import "../features/meetings/meetings.css";

/** 회의록 상세. 분석·전사가 진행 중이면 상태가 바뀌는 걸 따라 간다(2.5초). */
export function MeetingDetailPage() {
  const { meetingId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({
    queryKey: detailKey(meetingId),
    queryFn: () => getMeeting(meetingId),
    // 전사·분석·도서관 저장 중 하나라도 진행 중이면 따라간다.
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      const busy = isRunning(d.status) || d.vector?.status === "pending";
      return busy ? 2500 : false;
    },
  });
  const del = useMutation({
    mutationFn: () => deleteMeeting(meetingId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meetings"] });
      toast({ message: "회의록을 지웠어요. 승인해서 만든 기억은 그대로예요." });
      navigate("/meetings", { replace: true });
    },
  });
  const m = q.data;
  return (
    <div className="tk-screen">
      <PageHeader
        title={m?.title ?? "회의록"}
        meta={m ? <span className="mt-header-meta"><StatusBadge status={m.status} /><span>{meetingWhen(m)} · {scopeLabel(m.scope)}{m.project ? ` · ${m.project.name}` : ""}</span></span> : undefined}
        actions={
          <>
            <Link className="tk-icon-button" to="/meetings" aria-label="목록으로" title="목록으로"><Icon name="back" /></Link>
            {m && <button className="tk-icon-button" type="button" aria-label="회의록 지우기" title="회의록 지우기" onClick={() => setConfirm(true)}><Icon name="trash" /></button>}
          </>
        }
      />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--md">
          {q.isPending && <div className="mt-page"><ListSkeleton rows={3} label="회의록을 불러오는 중" /></div>}
          {q.isError && <div className="mt-page"><ErrorState error={q.error} what="회의록" onRetry={() => void q.refetch()} /></div>}
          {m && <MeetingBody m={m} />}
        </div>
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        modal
        title="회의록을 지울까요?"
        id="meeting-delete"
        footer={
          <>
            <button className="tk-button" type="button" onClick={() => setConfirm(false)}>취소</button>
            <button className="tk-button tk-button--danger" type="button" aria-busy={del.isPending || undefined} onClick={() => del.mutate()}>지우기</button>
          </>
        }
      >
        <p>항목과 제안이 함께 지워져요. 이미 승인해서 맥락 도서관에 들어간 기억과 보관함의 녹음 파일은 남아요.</p>
        {del.error && <p className="tk-error" role="alert">{errorText(del.error).message}</p>}
      </Dialog>
    </div>
  );
}
