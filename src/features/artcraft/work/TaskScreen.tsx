import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { addArtcraftRound, cancelRun, getArtcraftTask } from "../../../api/client";
import type { ArtcraftRound, ArtcraftTaskDetail } from "../../../api/artcraftTypes";
import { useForegroundResync } from "../../../hooks/useForegroundResync";
import { PageHeader } from "../../../shell/PageHeader";
import { Badge } from "../../../ui/Badge";
import { Button, IconButton } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { toast } from "../../../ui/toastStore";
import { SentAttachments } from "../../chat/Attachments";
import { Composer } from "../../chat/Composer";
import { errorText } from "../../viewer/api";
import { formatWhen } from "../../viewer/kinds";
import { ArtifactViewerHost, useArtifactViewer } from "../../viewer";
import { EmptyState, ErrorState, ListSkeleton } from "../../viewer/screenStates";
import { OutputFollowup } from "./OutputFollowup";
import { CategoryGlyph, OutputTile, StateBadge, elapsed, findCategory, isActive, useCatalog } from "./shared";
import { useAttachments } from "./useAttachments";

const taskKey = (id: string) => ["artcraft", "task", id] as const;

function RoundCard({ round, last, onOpen, onRetry, retrying }: { round: ArtcraftRound; last: boolean; onOpen: (id: string) => void; onRetry: (prompt: string) => void; retrying: boolean }) {
  const live = isActive(round.state);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);
  const time = elapsed(round.started_at, round.finished_at, now);
  return (
    <section className="acw-round" aria-label={`${round.index}번째 지시`} data-state={round.state}>
      <header className="acw-round__head">
        <span className="acw-round__no">{round.index}번째 지시</span>
        <span className="ac-sub">{formatWhen(round.created_at)}</span>
        <StateBadge state={round.state} />
      </header>
      <div className="acw-bubble">
        <p className="acw-bubble__text">{round.prompt}</p>
        {round.inputs.length > 0 && <SentAttachments ids={round.inputs.map((a) => a.id)} onOpen={onOpen} />}
        {(round.use_previous || Object.keys(round.options).length > 0) && (
          <p className="acw-bubble__meta">
            {round.use_previous && <Badge>이전 결과 이어서</Badge>}
            {Object.entries(round.options).map(([k, v]) => <Badge key={k} mono>{`${k}=${v}`}</Badge>)}
          </p>
        )}
      </div>
      {live && (
        <p className="tk-status tk-status--agent" role="status">
          <span className="tk-spinner tk-spinner--sm" aria-hidden="true" />
          {round.waiting_reason ?? (round.state === "queued" ? "차례를 기다리는 중" : round.progress ?? "작업 중")}
          {time && round.state === "running" && <span className="ac-sub"> · {time}</span>}
        </p>
      )}
      {round.state !== "failed" && (round.messages.length > 0 ? round.messages : round.result_text ? [round.result_text] : []).map((m, i) => (
        <p className="acw-result" key={i}>{m}</p>
      ))}
      {round.state === "failed" && (
        <div className="acw-failed" role="alert">
          <p><Icon name="warning" /> 작업이 실패했어요{round.error && <> · <code>{round.error.slice(0, 240)}</code></>}</p>
          {last && <Button size="sm" busy={retrying} onClick={() => onRetry(round.prompt)}><Icon name="retry" />같은 지시로 다시 하기</Button>}
        </div>
      )}
      {(round.state === "cancelled" || round.state === "interrupted") && <p className="ac-note">{round.state === "cancelled" ? "취소한 작업이에요." : "서버가 다시 시작되며 중단됐어요. 이어서 지시하면 계속해요."}</p>}
      {round.outputs.length > 0 ? (
        <>
          <h3 className="acw-block__title">결과 {round.outputs.length}개{time && !live ? ` · ${time}` : ""}</h3>
          <ul className="acw-grid" aria-label={`${round.index}번째 결과`}>
            {round.outputs.map((a) => <OutputTile key={a.id} artifact={a} onOpen={onOpen} />)}
          </ul>
        </>
      ) : round.state === "done" && <p className="ac-note">결과 파일이 없어요. 답변만 있는 작업이에요. 파일이 필요하면 이어서 요청해 보세요.</p>}
    </section>
  );
}

/** 작업 상세: 라운드별 지시·진행·결과, 이어서 수정 요청. 진행 중이면 3초마다 갱신한다. */
export function TaskScreen({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const viewer = useArtifactViewer();
  const catalog = useCatalog();
  const task = useQuery({
    queryKey: taskKey(taskId),
    queryFn: () => getArtcraftTask(taskId),
    refetchInterval: (q) => (q.state.data && isActive(q.state.data.state) ? 3000 : false),
  });
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: taskKey(taskId) }); });
  const data: ArtcraftTaskDetail | undefined = task.data;
  const category = findCategory(catalog.data, data?.category);
  const att = useAttachments(catalog.data?.workspace_id, category?.accepts ?? [], catalog.data?.limits.files ?? 10);
  const [usePrev, setUsePrev] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const live = data ? isActive(data.state) : false;

  const apply = (next: ArtcraftTaskDetail) => {
    qc.setQueryData(taskKey(taskId), next);
    void qc.invalidateQueries({ queryKey: ["artcraft", "tasks"] });
  };
  const send = useMutation({
    mutationFn: (v: { prompt: string; ids: string[]; previous: boolean }) => addArtcraftRound(taskId, { prompt: v.prompt, input_artifact_ids: v.ids, use_previous: v.previous }),
    onSuccess: (next) => { setSendError(null); att.clear(); apply(next); },
    onError: (e) => setSendError(errorText(e).message),
  });
  const stop = useMutation({
    mutationFn: () => cancelRun(data?.last_run_id as string),
    onSuccess: () => void qc.invalidateQueries({ queryKey: taskKey(taskId) }),
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const hasOutputs = (data?.output_count ?? 0) > 0;

  return (
    <div className="tk-screen">
      <PageHeader
        title={data?.title ?? "작업"}
        meta={data ? <>{category?.title ?? data.category} · {data.round_count}번째 지시까지</> : undefined}
        actions={
          <>
            {live && data?.last_run_id && <IconButton aria-label="작업 취소" disabled={stop.isPending} onClick={() => stop.mutate()}><Icon name="stop" /></IconButton>}
            <Link className="tk-button tk-button--ghost tk-button--sm" to={data ? `/artcraft/c/${data.category}` : "/artcraft"}><Icon name="back" /><span>목록</span></Link>
          </>
        }
      />
      <ArtifactViewerHost followup={viewer.current ? <OutputFollowup artifactId={viewer.current} taskId={taskId} /> : undefined}>
        <div className="tk-screen__body">
          <div className="tk-container tk-container--lg">
            <div className="ac acw-rounds">
              {task.isPending ? <ListSkeleton label="작업을 불러오는 중" rows={3} />
                : task.isError ? <ErrorState what="작업" error={task.error} onRetry={() => void task.refetch()} />
                  : data && (
                    <>
                      <div className="acw-taskhead">
                        {category && <CategoryGlyph category={category} />}
                        <div className="acw-taskhead__text">
                          <StateBadge state={data.state} />
                          <span className="ac-sub">{data.apps.join(" · ")}</span>
                        </div>
                      </div>
                      {data.rounds.map((r, i) => (
                        <RoundCard
                          key={r.id}
                          round={r}
                          last={i === data.rounds.length - 1}
                          onOpen={viewer.open}
                          retrying={send.isPending}
                          onRetry={(prompt) => send.mutate({ prompt, ids: [], previous: false })}
                        />
                      ))}
                      <p className="ac-note">
                        <Link to={`/chat/${data.session_id}`}>대화 기록 열기</Link>
                        <span> · 결과는 보존 기간이 지나면 정리돼요. 필요한 파일은 내려받아 두세요.</span>
                      </p>
                    </>
                  )}
              {!task.isPending && !task.isError && !data && <EmptyState icon="palette" title="작업을 찾을 수 없어요" />}
            </div>
          </div>
        </div>
        {sendError && <p className="tk-message tk-message--system" role="alert"><span>보내지 못했어요 · {sendError}</span></p>}
        {data && (
          <Composer
            draftKey={`artcraft-task-${taskId}`}
            label="이어서 수정 요청하기"
            running={live || send.isPending}
            queued={0}
            onSubmit={(text) => send.mutate({ prompt: text, ids: att.ids, previous: usePrev && hasOutputs })}
            onAttach={att.attach}
            blocked={att.busy || send.isPending}
            notice={att.failed ? "올리지 못한 파일을 다시 올리거나 빼고 보내 주세요" : null}
            context={
              att.tiles || hasOutputs ? (
                <>
                  {att.tiles}
                  {hasOutputs && (
                    <label className="tk-checkbox acw-prev">
                      <input type="checkbox" checked={usePrev} onChange={(e) => setUsePrev(e.target.checked)} />
                      이전 결과를 이어서 고치기
                    </label>
                  )}
                </>
              ) : undefined
            }
          />
        )}
      </ArtifactViewerHost>
    </div>
  );
}
