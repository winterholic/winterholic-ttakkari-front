import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, createRun } from "../../api/client";
import type { UUID } from "../../api/types";
import { Icon } from "../../ui/Icon";
import { errorText } from "./api";
import { shouldSubmitOnEnter } from "./kinds";

/** 뷰어 아래 후속 지시(docs/09 §5). 지금 보는 결과물이 context_artifact_ids 로 붙은 채 새 Run 을 만들고 채팅으로 간다. */
export function FollowupComposer({ sessionId, artifactId }: { sessionId: UUID; artifactId: UUID }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: (prompt: string) => createRun(sessionId, { prompt, context_artifact_ids: [artifactId] }),
    onSuccess: () => {
      setText("");
      // 채팅 화면 안에서 열린 뷰어면 같은 라우트라 목록이 저절로 갱신되지 않는다.
      void qc.invalidateQueries({ queryKey: ["runs", sessionId] });
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      navigate(`/chat/${sessionId}`);
    },
  });
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const empty = text.trim() === "";
  const submit = () => {
    if (empty || offline || send.isPending) return;
    send.mutate(text.trim());
  };
  const err = send.error ? errorText(send.error) : null;

  return (
    <form
      className="tk-composer"
      aria-label="이 문서에 대해 지시하기"
      data-offline={offline || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="tk-composer__row">
        <label className="tk-sr-only" htmlFor="followup-input">이 문서에 대해 지시</label>
        <textarea
          id="followup-input"
          className="tk-composer__input"
          rows={1}
          value={text}
          placeholder="이 문서에 대해 지시하기 · 예: 3번을 더 짧게"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
            if (shouldSubmitOnEnter({ key: e.key, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, keyCode: e.keyCode, isComposing: e.nativeEvent.isComposing }, coarse)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          className="tk-icon-button tk-icon-button--primary tk-icon-button--round tk-composer__send"
          type="submit"
          aria-label="보내기"
          aria-disabled={empty || offline || send.isPending || undefined}
          aria-busy={send.isPending || undefined}
        >
          <Icon name="send" />
        </button>
      </div>
      {offline && <p className="tk-status tk-status--warning" role="status"><Icon name="wifi-off" />오프라인이라 보낼 수 없어요. 연결이 돌아오면 보내 주세요.</p>}
      {err && (
        <p className="tk-error" role="alert">
          {send.error instanceof ApiError && send.error.status === 409 ? "이 세션에서 아직 작업이 실행 중이에요. 끝난 뒤에 보내 주세요." : err.message}
          {err.code && <> <code>{err.code}</code></>}
        </p>
      )}
    </form>
  );
}
