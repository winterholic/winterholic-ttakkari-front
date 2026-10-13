import { Fragment, useCallback, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelRun, createRun, listRuns } from "../../api/client";
import type { UUID } from "../../api/types";
import { Composer } from "../chat/Composer";
import { RunBlock } from "../chat/RunBlock";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { branchStatus, buildForest, isActive } from "./buildTree";
import { StatusGlyph, TaskTree } from "./TaskTree";
import { useTaskTree } from "./useTasks";

const KIND_LABEL: Record<string, string> = { orchestrator: "기획 세션", worker: "작업 세션", chat: "대화", desk: "따까리" };
const PANEL_RUNS = 30;

/**
 * 트리에서 고른 세션 하나를 따까리 대화 옆 서랍에 연다. 따까리 대화를 떠나지 않고 가지 하나의
 * 지시·진행·결과를 보고, 그 세션에 바로 지시한다. 하위 가지가 있으면 맨 위에 작은 트리로 보인다.
 */
export function NodePanel({
  nodeId,
  onSelect,
  onClose,
  onOpenArtifact,
}: {
  nodeId: UUID;
  onSelect: (id: UUID) => void;
  onClose: () => void;
  onOpenArtifact: (id: string) => void;
}) {
  const qc = useQueryClient();
  const tree = useTaskTree(nodeId);
  const runs = useQuery({
    queryKey: ["runs", nodeId, PANEL_RUNS],
    queryFn: () => listRuns(nodeId, { limit: PANEL_RUNS }),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => isActive(r.status)) ? 5_000 : 30_000),
  });
  const [fill, setFill] = useState<{ text: string; nonce: number } | null>(null);
  const runList = runs.data ?? [];
  const activeRun = runList.find((r) => isActive(r.status)) ?? null;

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["runs", nodeId] });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  }, [qc, nodeId]);
  const send = useMutation({
    mutationFn: (prompt: string) => createRun(nodeId, { prompt }),
    onSuccess: refresh,
    onError: (e, prompt) => {
      toast({ message: `보내지 못했어요 · ${e instanceof Error ? e.message : String(e)}`, tone: "danger" });
      setFill({ text: prompt, nonce: Date.now() });
    },
  });
  const stop = useCallback((runId: string) => void cancelRun(runId).then(refresh), [refresh]);

  const node = tree.data?.nodes.find((n) => n.id === nodeId);
  const path = tree.data?.path ?? [];
  const [self] = tree.data ? buildForest([nodeId], tree.data.nodes) : [];
  const status = self ? branchStatus(self) : (node?.status ?? null);

  return (
    <section className="node-panel" aria-label={node ? `${node.title} 상세` : "세션 상세"}>
      <header className="node-panel__head">
        <div className="node-panel__titles">
          {path.length > 1 && (
            <p className="node-panel__crumbs">
              {path.slice(0, -1).map((p, i) => (
                <Fragment key={p.id}>
                  {i > 0 && <span aria-hidden="true"> › </span>}
                  <button type="button" onClick={() => onSelect(p.id)}>
                    {p.title}
                  </button>
                </Fragment>
              ))}
            </p>
          )}
          <h2 className="node-panel__title">
            <StatusGlyph status={status} />
            <span>{node?.title ?? "불러오는 중"}</span>
          </h2>
          {node && (
            <p className="node-panel__meta">
              {KIND_LABEL[node.kind] ?? node.kind}
              {node.profile ? ` · ${node.profile}` : ""}
              {node.model ? ` · ${node.model}` : ""}
            </p>
          )}
        </div>
        <div className="node-panel__actions">
          <Link className="tk-icon-button" to={`/chat/${nodeId}`} aria-label="이 세션을 크게 보기">
            <Icon name="expand" />
          </Link>
          <button className="tk-icon-button" type="button" aria-label="서랍 닫기" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
      </header>
      <div className="node-panel__body tk-screen__body">
        {self && self.children.length > 0 && (
          <div className="node-panel__branches">
            <p className="node-panel__label">하위 {self.size}개</p>
            <TaskTree items={self.children} label="하위 세션" variant="card" onSelect={onSelect} />
          </div>
        )}
        <div className="tk-thread__inner node-panel__thread">
          {runs.isPending && (
            <p className="tk-thinking">
              <span className="tk-spinner tk-spinner--sm" aria-hidden />
              불러오는 중
            </p>
          )}
          {runs.isError && (
            <p className="tk-message tk-message--system">
              <span>지시 기록을 불러오지 못했어요.</span>
              <button className="tk-button tk-button--sm" type="button" onClick={() => void runs.refetch()}>
                다시 시도
              </button>
            </p>
          )}
          {runs.isSuccess && runList.length === 0 && <p className="node-panel__label">아직 받은 지시가 없어요.</p>}
          {runList.map((run, i) => (
            <Fragment key={run.id}>
              {i > 0 && <hr className="tk-divider thread-divider" />}
              <RunBlock
                run={run}
                isLast={i === runList.length - 1}
                onOpen={onOpenArtifact}
                onStop={stop}
                onRetry={(p) => send.mutate(p)}
                onSuggest={(text) => setFill({ text, nonce: Date.now() })}
                onSettled={refresh}
              />
            </Fragment>
          ))}
        </div>
      </div>
      <Composer
        draftKey={`node:${nodeId}`}
        label={node ? `${node.title}에 지시하기` : "이 세션에 지시하기"}
        running={!!activeRun || send.isPending}
        queued={runList.filter((r) => r.status === "queued").length}
        onSubmit={(text) => send.mutate(text)}
        onStop={activeRun ? () => stop(activeRun.id) : undefined}
        fill={fill}
      />
    </section>
  );
}
