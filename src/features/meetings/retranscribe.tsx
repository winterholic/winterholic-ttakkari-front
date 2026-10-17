import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { ApiError, listMeetingSttJobs, listMeetings, probeRetranscribe, retranscribeMeeting } from "../../api/client";
import type { MeetingDetail } from "../../api/client";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { isRunning } from "./shared";

const SUPPORT_KEY = ["meetings", "retranscribe-support"] as const;
const SUFFIX = / \(재처리\)$/;
/** 서버가 붙이는 제목 꼬리. 원본과 다시 전사한 버전을 제목으로 가른다 */
export const isReprocessed = (title: string) => SUFFIX.test(title);
const baseTitle = (title: string) => title.replace(/( \(재처리\))+$/, "");

/** 다시 전사를 할 수 있는 회의: 원본 녹음이 있고 지금 전사·분석이 돌고 있지 않은 것 */
export const canRetranscribe = (m: Pick<MeetingDetail, "audio" | "status">) => !!m.audio && !isRunning(m.status);

/** 서버 재전사 API 지원 여부. 아직 배포 전인 서버는 "no" 라 메뉴가 "서버 업데이트 후 사용 가능"으로 잠긴다 */
export function useRetranscribeSupport(m: Pick<MeetingDetail, "id" | "audio">): "yes" | "no" | "unknown" {
  const q = useQuery({ queryKey: SUPPORT_KEY, queryFn: () => probeRetranscribe(m.id), enabled: !!m.audio, staleTime: 5 * 60_000, retry: false });
  return q.data ?? "unknown";
}

/** 이 회의의 로컬 전사 작업 목록(대기·전사 중 표시와 원본 회의 링크). 전사 중이면 따라간다 */
export function useSttJobs(m: Pick<MeetingDetail, "id" | "provider" | "status">) {
  return useQuery({
    queryKey: ["meetings", "stt-jobs", m.id],
    queryFn: () => listMeetingSttJobs(m.id),
    enabled: m.provider === "local_whisper",
    refetchInterval: m.status === "transcribing" ? 2500 : false,
    retry: false,
  });
}

/** 전사 중 문구. 작업이 큐에서 차례를 기다리는 중이면 "대기 중", 돌고 있으면 "전사 중"이라고 구분해서 말한다 */
export function transcribeStateText(jobStatus: string | undefined): { label: string; text: string } {
  if (jobStatus === "queued") return { label: "대기 중", text: "앞선 작업이 끝나면 시작해요. 순서가 오면 이 Mac에서 전사해요." };
  return { label: "전사 중", text: "이 Mac에서 전사 중이에요. 끝나면 모델 메모리를 해제해요." };
}

export function RetranscribeDialog({ m, open, onClose }: { m: MeetingDetail; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [analyze, setAnalyze] = useState(false);
  const run = useMutation({
    mutationFn: () => retranscribeMeeting(m.id, analyze),
    onSuccess: (created) => {
      qc.setQueryData(["meetings", "detail", created.id], created);
      void qc.invalidateQueries({ queryKey: ["meetings", "list"] });
      onClose();
      toast({ message: "새 회의로 다시 전사를 시작했어요. 원본은 그대로 남아 있어요." });
      navigate(`/meetings/${created.id}`);
    },
    onError: (e) => {
      // 서버가 아직 이 API를 모르면 메뉴도 잠근다.
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) qc.setQueryData(SUPPORT_KEY, "no");
    },
  });
  const err = run.error ? (run.error instanceof ApiError && (run.error.status === 404 || run.error.status === 405) ? "서버 업데이트 후 사용할 수 있어요." : errorText(run.error).message) : null;
  const close = () => {
    run.reset();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      modal
      size="sm"
      title="다시 전사할까요?"
      id="meeting-retranscribe"
      footer={
        <>
          <Button onClick={close}>취소</Button>
          <Button variant="primary" busy={run.isPending} onClick={() => run.mutate()}><Icon name="retry" />다시 전사</Button>
        </>
      }
    >
      <div className="tk-stack">
        <p>이 녹음을 반복 억제와 화자 구분을 켠 새 설정으로 다시 전사해요.</p>
        <ul className="mt-plain">
          <li>이 회의의 <strong>전사·분석·승인한 기억은 그대로 보존</strong>돼요. 덮어쓰지 않아요.</li>
          <li>제목 뒤에 “(재처리)”가 붙은 <strong>새 회의</strong>가 만들어지고, 그 화면으로 이동해요.</li>
          <li>이 Mac에서 처리하고, 녹음 길이에 따라 몇 분에서 수십 분 걸릴 수 있어요.</li>
        </ul>
        <label className="tk-checkbox">
          <input type="checkbox" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} />
          전사가 끝나면 이어서 분석하기
        </label>
        {analyze && <p className="tk-help">분석은 앱의 모델 선택 정책에 따라 외부 모델을 쓸 수 있어요.</p>}
        {err && <p className="tk-error" role="alert"><Icon name="warning" />{err}</p>}
      </div>
    </Dialog>
  );
}

/**
 * 같은 녹음에서 나온 회의를 서로 이어 준다. 서버가 아직 회의끼리의 연결 필드를 주지 않아서
 * ① 다시 전사한 회의는 전사 작업의 source_meeting_id 로 원본을, ② 같은 녹음 파일을 쓰는 회의를 제목으로 찾아 원본/다시 전사한 버전을 보여 준다.
 */
export function RelatedMeetings({ m }: { m: MeetingDetail }) {
  const jobs = useSttJobs(m);
  const sourceId = jobs.data?.jobs.map((j) => j.params?.source_meeting_id).find((x): x is string => typeof x === "string");
  const audioId = m.audio?.artifact_id;
  const same = useQuery({
    queryKey: ["meetings", "list", "related", audioId, baseTitle(m.title)],
    queryFn: () => listMeetings({ q: baseTitle(m.title) }),
    enabled: !!audioId,
    staleTime: 30_000,
    retry: false,
  });
  const found = (same.data?.meetings ?? []).filter((x) => x.id !== m.id && x.audio?.artifact_id === audioId);
  const links = [
    ...(sourceId && !found.some((x) => x.id === sourceId) ? [{ id: sourceId, title: "", reprocessed: false }] : []),
    ...found.map((x) => ({ id: x.id, title: x.title, reprocessed: isReprocessed(x.title) })),
  ];
  if (!links.length) return null;
  const origin = links.filter((l) => !l.reprocessed);
  const again = links.filter((l) => l.reprocessed);
  return (
    <nav className="mt-related" aria-label="같은 녹음의 다른 회의">
      {origin.length > 0 && (isReprocessed(m.title) || !!sourceId) && (
        <p>
          <span className="mt-related__label">원본 회의</span>
          {origin.map((l) => <Link key={l.id} className="tk-link" to={`/meetings/${l.id}`}>{l.title || "원본 회의 열기"}</Link>)}
        </p>
      )}
      {again.length > 0 && (
        <p>
          <span className="mt-related__label">다시 전사한 버전</span>
          {again.map((l) => <Link key={l.id} className="tk-link" to={`/meetings/${l.id}`}>{l.title}</Link>)}
        </p>
      )}
    </nav>
  );
}
