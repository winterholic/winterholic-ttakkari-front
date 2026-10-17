import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { addArtcraftRound, getArtifact, listArtcraftTasks } from "../../../api/client";
import { Icon } from "../../../ui/Icon";
import { errorText } from "../../viewer/api";
import { shouldSubmitOnEnter } from "../../viewer/kinds";
import "../../chat/composer.css";

/**
 * 뷰어 아래 "이 결과로 이어서 수정". 지금 보는 결과물 하나를 입력 파일로 붙여 같은 작업에 새 라운드를 만들고 작업 상세로 간다.
 * 작업 ID 는 결과물의 세션으로 찾는다(작업 세션 1개 = 작업 1개). 작업에 속하지 않은 결과물이면 아무것도 그리지 않는다.
 * taskId 를 이미 아는 화면(작업 상세)은 그대로 넘긴다.
 */
export function OutputFollowup({ artifactId, taskId }: { artifactId: string; taskId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const art = useQuery({ queryKey: ["artifact", artifactId], queryFn: () => getArtifact(artifactId), staleTime: 60_000, enabled: !taskId });
  const sessionId = art.data?.session_id ?? null;
  const found = useQuery({
    queryKey: ["artcraft", "task-by-session", sessionId],
    queryFn: () => listArtcraftTasks({ session_id: sessionId ?? undefined }),
    enabled: !taskId && !!sessionId,
    staleTime: 60_000,
  });
  const id = taskId ?? found.data?.items[0]?.id;
  const send = useMutation({
    mutationFn: (prompt: string) => addArtcraftRound(id as string, { prompt, input_artifact_ids: [artifactId], use_previous: false }),
    onSuccess: (task) => {
      setText("");
      void qc.invalidateQueries({ queryKey: ["artcraft", "tasks"] });
      void qc.setQueryData(["artcraft", "task", task.id], task);
      navigate(`/artcraft/t/${task.id}`);
    },
  });
  if (!id) return null;
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const empty = text.trim() === "";
  const submit = () => {
    if (empty || offline || send.isPending) return;
    send.mutate(text.trim());
  };
  const err = send.error ? errorText(send.error) : null;
  return (
    <form className="tk-composer" aria-label="이 결과로 이어서 수정 요청하기" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="tk-composer__row">
        <label className="tk-sr-only" htmlFor="acw-followup-input">이 결과로 이어서 수정 요청</label>
        <textarea
          id="acw-followup-input"
          className="tk-composer__input"
          rows={1}
          value={text}
          placeholder="이 결과를 이어서 수정 · 예: 더 밝게"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
            if (shouldSubmitOnEnter({ key: e.key, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, keyCode: e.keyCode, isComposing: e.nativeEvent.isComposing }, coarse)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="tk-icon-button tk-icon-button--primary tk-icon-button--round tk-composer__send" type="submit" aria-label="이어서 수정 요청 보내기"
          aria-disabled={empty || offline || send.isPending || undefined} aria-busy={send.isPending || undefined}>
          <Icon name="send" />
        </button>
      </div>
      {err && <p className="tk-error" role="alert">{err.message}{err.code && <> <code>{err.code}</code></>}</p>}
    </form>
  );
}
