import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  analyzeMeeting, cancelMeetingAnalysis, patchMeeting, patchMeetingItem, putMeetingTranscript, requestMeetingTranscription,
  resolveMeetingProposal,
} from "../../api/client";
import type { MeetingDetail, MeetingItem } from "../../api/client";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";

export const detailKey = (id: string) => ["meetings", "detail", id] as const;

/** 상세가 쓰는 동작 모음. 응답으로 받은 최신 상세를 캐시에 바로 넣어 화면이 한 박자 늦지 않게 한다. */
export function useMeetingActions(m: MeetingDetail) {
  const qc = useQueryClient();
  const put = (d: MeetingDetail) => {
    qc.setQueryData(detailKey(m.id), d);
    void qc.invalidateQueries({ queryKey: ["meetings", "list"] });
  };
  const fail = (e: unknown) => toast({ message: errorText(e).message });
  return {
    analyze: useMutation({ mutationFn: () => analyzeMeeting(m.id), onSuccess: put, onError: fail }),
    cancel: useMutation({ mutationFn: () => cancelMeetingAnalysis(m.id), onSuccess: put, onError: fail }),
    localTranscribe: useMutation({ mutationFn: () => requestMeetingTranscription(m.id, "local_whisper"), onSuccess: put }),
    transcript: useMutation({ mutationFn: (v: { text: string; source: "paste" | "file" }) => putMeetingTranscript(m.id, v.text, v.source), onSuccess: put }),
    project: useMutation({ mutationFn: (projectId: string) => patchMeeting(m.id, { project_id: projectId || null }), onSuccess: put, onError: fail }),
    item: useMutation({
      mutationFn: (v: { item: MeetingItem; status: "open" | "done" }) => patchMeetingItem(m.id, v.item.id, { status: v.status }),
      onSuccess: () => void qc.invalidateQueries({ queryKey: detailKey(m.id) }),
      onError: fail,
    }),
    resolve: useMutation({
      mutationFn: (v: { id: string; action: "approve" | "reject" }) => resolveMeetingProposal(m.id, v.id, v.action),
      onSuccess: (d, v) => {
        put(d);
        toast({ message: v.action === "approve" ? "맥락 도서관에 반영했어요." : "제안을 거절했어요." });
      },
      onError: fail,
    }),
  };
}
export type Actions = ReturnType<typeof useMeetingActions>;
