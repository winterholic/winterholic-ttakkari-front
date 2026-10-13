import { Fragment, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cancelRun } from "../../api/client";
import type { RunOut } from "../../api/types";
import { RunBlock } from "../chat/RunBlock";

/**
 * 캔버스 옆 패널의 따까리 대화. 입력은 캔버스 아래 떠 있는 입력창 하나로 받는다.
 * 넘긴 일의 트리 카드를 누르면 캔버스에서 그 노드를 고른다.
 */
export function DeskThread({
  deskId,
  runs,
  pending,
  error,
  onRetry,
  onSelectNode,
  selectedNode,
  onOpenArtifact,
  onSuggest,
}: {
  deskId: string;
  runs: RunOut[];
  pending: boolean;
  error: boolean;
  onRetry: () => void;
  onSelectNode: (id: string) => void;
  selectedNode: string | null;
  onOpenArtifact: (id: string) => void;
  onSuggest: (text: string) => void;
}) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["runs", deskId] });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  }, [qc, deskId]);
  const stop = useCallback((id: string) => void cancelRun(id).then(refresh), [refresh]);
  const last = runs[runs.length - 1];

  // 새 메시지·답이 오면 맨 아래를 보여 준다. 패널은 짧은 기록이라 읽던 자리 보존보다 최신이 중요하다.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [runs.length, last?.status, last?.result_text]);

  return (
    <div className="desk-thread tk-screen__body" ref={ref} role="log" aria-label="따까리 대화" aria-live="polite">
      <div className="tk-thread__inner desk-thread__inner">
        {pending && (
          <p className="tk-thinking">
            <span className="tk-spinner tk-spinner--sm" aria-hidden />
            대화를 불러오는 중
          </p>
        )}
        {error && (
          <p className="tk-message tk-message--system">
            <span>대화를 불러오지 못했어요.</span>
            <button className="tk-button tk-button--sm" type="button" onClick={onRetry}>
              다시 시도
            </button>
          </p>
        )}
        {!pending && !error && runs.length === 0 && (
          <div className="tk-empty">
            <p className="tk-empty__title">따까리에게 무엇이든 말해 보세요</p>
            <p className="tk-body-sm tk-text-tertiary">바로 답할 일은 여기서 답하고, 손이 가는 일은 왼쪽 판에 가지로 펼쳐져요.</p>
          </div>
        )}
        {runs.map((run, i) => (
          <Fragment key={run.id}>
            {i > 0 && <hr className="tk-divider thread-divider" />}
            <RunBlock
              run={run}
              isLast={i === runs.length - 1}
              onOpen={onOpenArtifact}
              onStop={stop}
              onRetry={onSuggest}
              onSuggest={onSuggest}
              onSettled={refresh}
              onOpenNode={onSelectNode}
              selectedNode={selectedNode}
              leadAs="chip"
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
