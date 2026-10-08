import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, cancelRun, createRun, createSession, getArtifact, getSession, getWorkspace, listRuns, patchSession, stopAll, uploadFile } from "../api/client";
import { Menu } from "../ui/Menu";
import { toast } from "../ui/toastStore";
import type { RunOut } from "../api/types";
import { Composer } from "../features/chat/Composer";
import { NewSession } from "../features/chat/NewSession";
import type { NewSessionChoice } from "../features/chat/NewSession";
import { RunBlock } from "../features/chat/RunBlock";
import { ArtifactViewerHost, useArtifactViewer } from "../features/viewer";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";

const FOLLOW_THRESHOLD = 96;

interface Attachment {
  key: string;
  name: string;
  state: "uploading" | "done" | "failed";
  file: File;
  id?: string;
  error?: string;
}
const ACTIVE = ["queued", "running"];

/** 바닥 근처일 때만 새 내용을 따라가고, 위로 올려 읽는 중이면 '새 메시지' 버튼을 띄운다(docs/07 §5). */
function useThreadFollow(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [jump, setJump] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD;
      if (atBottom.current) setJump(false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = ref.current;
    const body = inner.current;
    if (!el || !body) return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
      else setJump(true);
    });
    ro.observe(body);
    return () => ro.disconnect();
  }, [dep]);

  const toBottom = () => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    atBottom.current = true;
    setJump(false);
  };
  return { ref, inner, jump, toBottom };
}

export function ChatPage() {
  const { sessionId } = useParams();
  // 세션이 바뀌면 대기열·초안·스크롤 상태를 통째로 새로 시작한다.
  return <ChatScreen key={sessionId ?? "new"} sessionId={sessionId} />;
}

function ChatScreen({ sessionId }: { sessionId: string | undefined }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const viewer = useArtifactViewer();
  const [choice, setChoice] = useState<NewSessionChoice | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [fill, setFill] = useState<{ text: string; nonce: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const session = useQuery({ queryKey: ["session", sessionId], queryFn: () => getSession(sessionId!), enabled: !!sessionId });
  const workspace = useQuery({
    queryKey: ["workspace", session.data?.workspace_id],
    queryFn: () => getWorkspace(session.data!.workspace_id),
    enabled: !!session.data,
    staleTime: 60_000,
  });
  const runs = useQuery({
    queryKey: ["runs", sessionId],
    queryFn: () => listRuns(sessionId!),
    enabled: !!sessionId,
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => ACTIVE.includes(r.status)) ? 10_000 : false),
  });
  const runList = useMemo(() => runs.data ?? [], [runs.data]);
  const activeRun = runList.find((r) => ACTIVE.includes(r.status)) ?? null;

  // 지금 보고 있는 결과물이 있으면 다음 지시의 문맥으로 붙인다(Context Continuity).
  const contextArtifact = useQuery({
    queryKey: ["artifact", viewer.current],
    queryFn: () => getArtifact(viewer.current!),
    enabled: !!viewer.current,
  });
  const [droppedId, setDroppedId] = useState<string | null>(null);
  const contextShown = contextArtifact.data && contextArtifact.data.id !== droppedId ? contextArtifact.data : null;
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachSeq = useRef(0);
  const uploading = attachments.some((a) => a.state === "uploading");
  const attachedIds = attachments.flatMap((a) => (a.state === "done" && a.id ? [a.id] : []));
  const contextIds = [...(contextShown ? [contextShown.id] : []), ...attachedIds];
  const workspaceId = session.data?.workspace_id ?? choice?.workspaceId ?? null;

  const attach = (files: File[]) => {
    if (!workspaceId) return;
    for (const file of files) {
      attachSeq.current += 1;
      const key = `${attachSeq.current}-${file.name}`;
      setAttachments((all) => [...all, { key, name: file.name, state: "uploading", file }]);
      uploadFile(file, workspaceId, sessionId).then(
        (art) => setAttachments((all) => all.map((a) => (a.key === key ? { ...a, state: "done", id: art.id } : a))),
        (e: unknown) =>
          setAttachments((all) =>
            all.map((a) => (a.key === key ? { ...a, state: "failed", error: e instanceof Error ? e.message : "올리지 못했어요" } : a)),
          ),
      );
    }
  };
  const retryAttach = (key: string) => {
    const a = attachments.find((x) => x.key === key);
    if (!a) return;
    setAttachments((all) => all.filter((x) => x.key !== key));
    attach([a.file]);
  };

  const contextNames = useCallback(
    (run: RunOut) => run.context_artifact_ids.map((id) => (contextArtifact.data?.id === id ? contextArtifact.data.filename : "함께 보낸 파일")),
    [contextArtifact.data],
  );

  const refreshAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["runs", sessionId] });
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    void qc.invalidateQueries({ queryKey: ["artifacts"] });
  }, [qc, sessionId]);

  const flushing = useRef(false);
  const send = useMutation({
    onMutate: (prompt: string) => {
      setQueue((q) => (q[0] === prompt && flushing.current ? q.slice(1) : q));
      flushing.current = false;
    },
    mutationFn: async (prompt: string) => {
      let sid = sessionId;
      if (!sid) {
        if (!choice) throw new Error("작업 공간을 먼저 골라 주세요.");
        const s = await createSession({ workspace_id: choice.workspaceId, engine: choice.engine, model: choice.model, effort: choice.effort });
        sid = s.id;
      }
      const run = await createRun(sid, { prompt, context_artifact_ids: contextIds });
      return { sid, run };
    },
    onSuccess: ({ sid }) => {
      setSendError(null);
      setAttachments([]);
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      if (sid !== sessionId) navigate(`/chat/${sid}`);
      else void qc.invalidateQueries({ queryKey: ["runs", sid] });
    },
    onError: (e, prompt) => {
      if (e instanceof ApiError && e.status === 409) {
        // 다른 기기에서 먼저 시작한 작업이 있다. 대기열로 돌린다.
        setQueue((q) => [prompt, ...q]);
        refreshAll();
        return;
      }
      setSendError(e instanceof Error ? e.message : "보내지 못했어요.");
      setFill({ text: prompt, nonce: Date.now() });
    },
  });

  // 실행 중에 쓴 지시는 끝나면 순서대로 보낸다.
  const { mutate, isPending } = send;
  useEffect(() => {
    if (activeRun || isPending || flushing.current || queue.length === 0) return;
    flushing.current = true;
    mutate(queue[0]);
  }, [activeRun, isPending, mutate, queue]);

  const onSubmit = (text: string) => {
    if (activeRun) setQueue((q) => [...q, text]);
    else send.mutate(text);
  };
  const stop = useCallback(
    (runId: string) => {
      void cancelRun(runId).then(refreshAll);
    },
    [refreshAll],
  );

  const { ref: threadRef, inner: innerRef, jump, toBottom } = useThreadFollow(sessionId);

  const title = sessionId ? (session.data?.title ?? "불러오는 중") : "새 세션";
  const meta = sessionId && session.data && (
    <>
      {activeRun ? <span className="tk-dot tk-dot--live" aria-hidden /> : null}
      {workspace.data?.name ?? "작업 공간"} · {session.data.engine === "codex" ? "Codex" : "Claude Code"}
      {session.data.model ? ` · ${session.data.model}` : ""}
    </>
  );

  const [dragging, setDragging] = useState(false);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      className="tk-screen"
      onDragOver={(e) => {
        if (!workspaceId || !hasFiles(e)) return;
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!workspaceId || !hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        attach(Array.from(e.dataTransfer.files));
      }}
    >
      <PageHeader
        title={title}
        meta={meta}
        actions={
          sessionId && (
            <>
              <Link className="tk-icon-button" to={`/workspace/${sessionId}`} aria-label="작업 공간 열기">
                <Icon name="workspace" />
              </Link>
              <Menu
                label="세션 메뉴"
                items={[
                  {
                    label: "세션 보관",
                    icon: "library",
                    disabled: !!activeRun,
                    onSelect: () =>
                      void patchSession(sessionId, { archived: true }).then(() => {
                        void qc.invalidateQueries({ queryKey: ["sessions"] });
                        toast({ message: "세션을 보관했어요." });
                        navigate("/chat");
                      }),
                  },
                  {
                    label: "모든 작업 비상 정지",
                    icon: "stop",
                    danger: true,
                    separatorBefore: true,
                    onSelect: () =>
                      void stopAll().then((r) => {
                        refreshAll();
                        toast({ message: r.stopped.length ? `작업 ${r.stopped.length}개를 멈췄어요.` : "실행 중인 작업이 없어요." });
                      }),
                  },
                ]}
              >
                <Icon name="more-vertical" />
              </Menu>
            </>
          )
        }
      />
      <ArtifactViewerHost>
      <div className="tk-thread tk-screen__body" role="log" aria-label="대화" aria-live="polite" ref={threadRef}>
        {!sessionId ? (
          <NewSession value={choice} onChange={setChoice} />
        ) : (
          <div className="tk-thread__inner" ref={innerRef}>
            {session.isError && (
              <div className="tk-empty">
                <p className="tk-empty__title">세션을 찾을 수 없어요</p>
                <div className="tk-button-group">
                  <Link className="tk-button" to="/chat">
                    새 세션 시작
                  </Link>
                </div>
              </div>
            )}
            {runs.isPending && !session.isError && (
              <p className="tk-thinking">
                <span className="tk-spinner tk-spinner--sm" aria-hidden />
                대화를 불러오는 중
              </p>
            )}
            {runs.isError && (
              <p className="tk-message tk-message--system">
                <span>대화를 불러오지 못했어요.</span>
                <button className="tk-button tk-button--sm" type="button" onClick={() => void runs.refetch()}>
                  다시 시도
                </button>
              </p>
            )}
            {runList.map((run, i) => (
              <RunBlock
                key={run.id}
                run={run}
                contextNames={contextNames(run)}
                isLast={i === runList.length - 1}
                onOpen={viewer.open}
                onStop={stop}
                onRetry={(p) => onSubmit(p)}
                onSuggest={(text) => setFill({ text, nonce: Date.now() })}
                onSettled={refreshAll}
              />
            ))}
            {queue.map((q, i) => (
              <article key={`${i}-${q}`} className="tk-message tk-message--user" data-author="user" aria-label="대기 중인 지시">
                <div className="tk-message__body">{q}</div>
                <p className="tk-message__meta">
                  <span className="tk-message__time">대기 중</span>
                  <button className="tk-button tk-button--sm tk-button--ghost" type="button" onClick={() => setQueue((all) => all.filter((_, j) => j !== i))}>
                    취소
                  </button>
                </p>
              </article>
            ))}
            {jump && (
              <button className="tk-jump" type="button" onClick={toBottom}>
                {activeRun && <span className="tk-dot tk-dot--live" aria-hidden />}새 메시지
                <Icon name="arrow-down" />
              </button>
            )}
          </div>
        )}
      </div>
      {sendError && (
        <p className="tk-message tk-message--system" role="alert">
          <span>보내지 못했어요 · {sendError}</span>
        </p>
      )}
      <Composer
        draftKey={sessionId ?? "new"}
        running={!!activeRun || send.isPending}
        queued={queue.length}
        onSubmit={onSubmit}
        onStop={activeRun ? () => stop(activeRun.id) : undefined}
        fill={fill}
        onAttach={workspaceId ? attach : undefined}
        blocked={uploading}
        notice={dragging ? "놓으면 첨부해요" : null}
        context={
          contextShown || attachments.length > 0 ? (
            <div className="tk-chips" aria-label="함께 보낼 문맥">
              {contextShown && (
                <span className="tk-chip tk-chip--context">
                  <span>{contextShown.filename}</span>
                  <button className="tk-icon-button tk-icon-button--xs tk-icon-button--round" type="button" aria-label="문맥에서 빼기" onClick={() => setDroppedId(contextShown.id)}>
                    <Icon name="x" />
                  </button>
                </span>
              )}
              {attachments.map((a) => (
                <span
                  key={a.key}
                  className="tk-chip tk-chip--context"
                  aria-busy={a.state === "uploading" || undefined}
                  data-failed={a.state === "failed" ? "" : undefined}
                  title={a.error}
                >
                  {a.state === "uploading" && <span className="tk-spinner tk-spinner--xs" aria-hidden />}
                  <span>{a.name}</span>
                  {a.state === "failed" && (
                    <button className="tk-icon-button tk-icon-button--xs tk-icon-button--round" type="button" aria-label={`${a.name} 다시 올리기`} onClick={() => retryAttach(a.key)}>
                      <Icon name="retry" />
                    </button>
                  )}
                  <button className="tk-icon-button tk-icon-button--xs tk-icon-button--round" type="button" aria-label={`${a.name} 빼기`} onClick={() => setAttachments((all) => all.filter((x) => x.key !== a.key))}>
                    <Icon name="x" />
                  </button>
                </span>
              ))}
            </div>
          ) : undefined
        }
      />
      </ArtifactViewerHost>
    </div>
  );
}
