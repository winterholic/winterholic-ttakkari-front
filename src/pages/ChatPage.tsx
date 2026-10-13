import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, cancelRun, createRun, ensureDesk, getArtifact, getSession, getWorkspace, listRuns, patchSession, stopAll, uploadFile } from "../api/client";
import { Menu } from "../ui/Menu";
import { toast } from "../ui/toastStore";
import type { AccountPool } from "../api/types";
import { PendingAttachment, releaseFileUrl } from "../features/chat/Attachments";
import { checkAttachFiles } from "../features/chat/clipboardFiles";
import { Composer } from "../features/chat/Composer";
import { RunBlock } from "../features/chat/RunBlock";
import { ArtifactViewerHost, FollowupComposer, useArtifactViewer } from "../features/viewer";
import { useIsDesktop } from "../features/viewer/hooks";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { buildForest, isActive } from "../features/tasks/buildTree";
import { useActiveTasks, useTaskTree } from "../features/tasks/useTasks";
import { NodePanel } from "../features/tasks/NodePanel";
import "../features/orchestrator/orchestrator.css";

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
// 백엔드 RunIn.prompt max_length 와 같다.
const MAX_PROMPT = 100_000;
// 대화는 따까리 하나뿐이라 끝없이 길어진다. 최근 것부터 이만큼씩 읽는다.
const RUN_PAGE = 40;

/** 바닥 근처일 때만 새 내용을 따라가고, 위로 올려 읽는 중이면 '새 메시지' 버튼을 띄운다(docs/07 §5). */
function useThreadFollow(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  // 위에 이전 대화를 붙일 때는 아래로부터의 거리를 지켜 읽던 자리에 머문다. 새 메시지 알림도 띄우지 않는다.
  const keepFromBottom = useRef<number | null>(null);
  // 우리가 바꾼 스크롤에서 온 scroll 이벤트. 트리 카드처럼 늦게 커지는 내용이 그 사이에 붙으면
  // 이 이벤트가 "사용자가 위로 올렸다"로 잘못 읽혀 바닥 따라가기가 풀렸다.
  const ownScroll = useRef(false);
  const [jump, setJump] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      if (ownScroll.current) {
        ownScroll.current = false;
        return;
      }
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
      const set = (top: number) => {
        // 값이 그대로면 scroll 이벤트가 오지 않으니 표시하지 않는다.
        if (Math.abs(el.scrollTop - top) >= 1) ownScroll.current = true;
        el.scrollTop = top;
      };
      if (keepFromBottom.current !== null) {
        set(el.scrollHeight - keepFromBottom.current);
        keepFromBottom.current = null;
      } else if (atBottom.current) set(el.scrollHeight - el.clientHeight);
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
  const holdPosition = () => {
    const el = ref.current;
    if (el) keepFromBottom.current = el.scrollHeight - el.scrollTop;
  };
  return { ref, inner, jump, toBottom, holdPosition };
}

/**
 * /chat·/work 는 모드(개인·회사)마다 하나뿐인 따까리 대화다(back ADR 0014). 새 대화 만들기는 없다.
 * /chat/:id 는 그 대화에서 뻗은 일(기획·작업 세션) 하나를 연다. 회사 모드(/work)는 회사 계정만 쓴다.
 */
export function ChatPage({ pool = "personal" }: { pool?: AccountPool }) {
  const { sessionId } = useParams();
  // 세션이 바뀌면 대기열·초안·스크롤 상태를 통째로 새로 시작한다.
  if (sessionId) return <ChatScreen key={sessionId} sessionId={sessionId} />;
  return <DeskScreen key={pool} pool={pool} />;
}

function DeskScreen({ pool }: { pool: AccountPool }) {
  const desk = useQuery({ queryKey: ["desk", pool], queryFn: () => ensureDesk(pool), staleTime: Infinity });
  if (desk.isSuccess) return <ChatScreen key={desk.data.id} sessionId={desk.data.id} />;
  return (
    <div className="tk-screen">
      <PageHeader title="따까리" actions={<PoolSwitch pool={pool} />} />
      <div className="tk-screen__body">
        {desk.isError ? (
          <div className="tk-empty">
            <p className="tk-empty__title">따까리 대화를 열지 못했어요</p>
            <p className="tk-body-sm tk-text-tertiary">{desk.error instanceof Error ? desk.error.message : "Mac Studio 연결을 확인해 주세요."}</p>
            <Button size="sm" onClick={() => void desk.refetch()}>
              <Icon name="retry" />
              다시 시도
            </Button>
          </div>
        ) : (
          <p className="tk-thinking">
            <span className="tk-spinner tk-spinner--sm" aria-hidden />
            따까리 대화를 여는 중
          </p>
        )}
      </div>
    </div>
  );
}

/** 개인·회사 모드 전환. 대화창은 하나이고 모드마다 대화 기록이 따로다. */
function PoolSwitch({ pool }: { pool: AccountPool }) {
  const navigate = useNavigate();
  return (
    <div className="tk-segmented" role="radiogroup" aria-label="모드">
      <label>
        <input type="radio" name="desk-pool" checked={pool === "personal"} onChange={() => navigate("/chat/thread")} />
        개인
      </label>
      <label>
        <input type="radio" name="desk-pool" checked={pool === "work"} onChange={() => navigate("/work/thread")} />
        <Icon name="briefcase" />
        회사
      </label>
    </div>
  );
}

function ChatScreen({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const viewer = useArtifactViewer();
  const isDesktop = useIsDesktop();
  const [fill, setFill] = useState<{ text: string; nonce: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const session = useQuery({ queryKey: ["session", sessionId], queryFn: () => getSession(sessionId) });
  const workspace = useQuery({
    queryKey: ["workspace", session.data?.workspace_id],
    queryFn: () => getWorkspace(session.data!.workspace_id),
    enabled: !!session.data,
    staleTime: 60_000,
  });
  const [runLimit, setRunLimit] = useState(RUN_PAGE);
  const runs = useQuery({
    // 앞부분이 ["runs", sessionId] 라 기존 무효화가 그대로 닿는다.
    queryKey: ["runs", sessionId, runLimit],
    queryFn: () => listRuns(sessionId, { limit: runLimit }),
    placeholderData: (prev) => prev,
    // 워커 보고로 서버가 새 run 을 만들어도 클라이언트는 모른다. 진행 중이 아니어도 느리게 계속 확인한다.
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => ACTIVE.includes(r.status)) ? 10_000 : 30_000),
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
  const workspaceId = session.data?.workspace_id ?? null;

  const startUpload = (file: File) => {
    if (!workspaceId) return;
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
  };
  // 파일 선택·붙여넣기·드롭이 모두 여기를 지난다. 크기·개수 규칙을 한 곳에서 적용한다.
  const attach = (picked: File[]) => {
    if (!workspaceId) return;
    const { accepted, problems } = checkAttachFiles(picked, attachments.length + (contextShown ? 1 : 0));
    for (const message of problems) toast({ message, tone: "danger" });
    accepted.forEach(startUpload);
  };
  const retryAttach = (key: string) => {
    const a = attachments.find((x) => x.key === key);
    if (!a) return;
    setAttachments((all) => all.filter((x) => x.key !== key));
    startUpload(a.file);
  };

  const refreshAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["runs", sessionId] });
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["artifacts"] });
  }, [qc, sessionId]);

  useForegroundResync(() => {
    refreshAll();
    void qc.invalidateQueries({ queryKey: ["session", sessionId] });
  });

  const send = useMutation({
    mutationFn: (prompt: string) => createRun(sessionId, { prompt, context_artifact_ids: contextIds }),
    onSuccess: () => {
      setSendError(null);
      attachments.forEach((a) => releaseFileUrl(a.file));
      setAttachments([]);
      refreshAll();
    },
    onError: (e, prompt) => {
      setSendError(e instanceof ApiError || e instanceof Error ? e.message : "보내지 못했어요.");
      setFill({ text: prompt, nonce: Date.now() });
    },
  });

  // 실행 중에 보낸 지시는 서버 세션 대기열에 들어가 앞 작업이 끝나면 시작된다(새로고침·다른 기기에서도 유지).
  const onSubmit = (text: string) => {
    if (text.length > MAX_PROMPT) {
      setSendError(`지시가 너무 길어요(최대 ${MAX_PROMPT.toLocaleString()}자). 긴 내용은 파일로 첨부해 주세요.`);
      setFill({ text, nonce: Date.now() });
      return;
    }
    send.mutate(text);
  };
  const stop = useCallback(
    (runId: string) => {
      void cancelRun(runId).then(refreshAll);
    },
    [refreshAll],
  );

  const { ref: threadRef, inner: innerRef, jump, toBottom, holdPosition } = useThreadFollow(sessionId);
  // 따까리 대화 안 트리 카드에서 고른 세션. 주소(?node=)에 두어 뒤로 가기로 닫힌다.
  const [params, setParams] = useSearchParams();
  const nodeId = params.get("node");
  const openNode = useCallback(
    (id: string) => {
      // 폰은 옆 서랍을 둘 폭이 없어 그 세션 화면으로 간다.
      if (!isDesktop) return navigate(`/chat/${id}`);
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set("node", id);
        return next;
      });
    },
    [isDesktop, navigate, setParams],
  );
  const closeNode = useCallback(
    () =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.delete("node");
        return next;
      }),
    [setParams],
  );
  const hasOlder = runList.length >= runLimit;
  const loadOlder = () => {
    holdPosition();
    setRunLimit((n) => n + RUN_PAGE);
  };

  const kind = session.data?.kind;
  const pool = session.data?.pool ?? "personal";
  const isDesk = kind === "desk";
  const deskHome = pool === "work" ? "/work" : "/chat";
  const lastProfile = [...runList].reverse().find((r) => r.profile)?.profile;
  const engineText = session.data?.engine === "auto" ? (lastProfile ?? "Claude Code 우선") : session.data?.engine === "codex" ? "Codex" : "Claude Code";
  // 따까리에서 뻗은 일이면 뿌리부터의 경로를 헤더에 보여 준다. 세션 목록이 없으니 위로 가는 길은 이것뿐이다.
  const tree = useTaskTree(isDesk || !session.data ? undefined : sessionId);
  const ancestors = (tree.data?.path ?? []).slice(0, -1);
  // 뿌리는 부모가 없거나 부모가 접수다. 부모가 있으면 따까리에서 뻗은 일이다.
  const fromDesk = !!tree.data?.path[0]?.parent_id;
  const active = useActiveTasks();
  const liveRoots = isDesk && active.data
    ? buildForest(active.data.roots, active.data.nodes).filter((t) => t.node.pool === pool && (t.activeBelow > 0 || isActive(t.node.status))).length
    : 0;

  const title = isDesk ? "따까리" : (session.data?.title ?? "불러오는 중");
  const kindLabel = kind === "orchestrator" ? (session.data?.parent_id ? "기획" : "오케스트레이터") : kind === "worker" ? "작업" : (workspace.data?.name ?? "대화");
  const meta = session.data && (
    isDesk ? (
      <>
        {activeRun ? <span className="tk-dot tk-dot--live" aria-hidden /> : null}
        {/* 모바일은 헤더 폭이 좁아 모드 전환 옆에 한 마디만 남긴다 */}
        {liveRoots > 0 ? `맡긴 일 ${liveRoots}개 진행 중` : pool === "work" ? "회사 계정만 써요" : "무엇이든 맡겨요"}
      </>
    ) : (
      <span className="chat-crumbs">
        {activeRun ? <span className="tk-dot tk-dot--live" aria-hidden /> : null}
        {fromDesk && (
          <>
            <Link to={deskHome}>따까리</Link>
            <span aria-hidden="true"> › </span>
          </>
        )}
        {ancestors.map((a) => (
          <Fragment key={a.id}>
            <Link to={`/chat/${a.id}`}>{a.title}</Link>
            <span aria-hidden="true"> › </span>
          </Fragment>
        ))}
        <span>{pool === "work" ? "회사 · " : ""}{kindLabel} · {engineText}{session.data.model ? ` · ${session.data.model}` : ""}</span>
      </span>
    )
  );

  const [dragging, setDragging] = useState(false);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      className="tk-screen"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        // 놓을 곳이 없어도 막아 둔다. 안 막으면 브라우저가 파일을 열면서 앱을 떠난다.
        e.preventDefault();
        if (workspaceId && !dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        if (!workspaceId) {
          toast({ message: "작업 공간을 먼저 고른 뒤 파일을 놓아 주세요.", tone: "danger" });
          return;
        }
        attach(Array.from(e.dataTransfer.files));
      }}
    >
      {dragging && (
        <div className="tk-dropzone" aria-hidden>
          <Icon name="paperclip" />
          <span>여기에 놓으면 첨부해요</span>
        </div>
      )}
      <PageHeader
        title={title}
        meta={meta}
        actions={
          session.data && (
            <>
              {isDesk && (
                <Link className="tk-button tk-button--sm tk-button--ghost" to={deskHome}>
                  <Icon name="tasks" />
                  판 보기
                </Link>
              )}
              {isDesk && <PoolSwitch pool={pool} />}
              <Link className="tk-icon-button" to={`/workspace/${sessionId}`} aria-label="작업 공간 열기">
                <Icon name="workspace" />
              </Link>
              <Menu
                label="세션 메뉴"
                items={[
                  {
                    // 따까리 대화를 보관하면 다음에 열 때 빈 대화로 새로 시작한다. 옛 대화는 지난 작업에 남는다.
                    label: isDesk ? "대화 보관하고 새로 시작" : "세션 보관",
                    icon: "library",
                    disabled: !!activeRun,
                    onSelect: () =>
                      void patchSession(sessionId, { archived: true }).then(() => {
                        void qc.invalidateQueries({ queryKey: ["sessions"] });
                        void qc.invalidateQueries({ queryKey: ["tasks"] });
                        if (isDesk) void qc.removeQueries({ queryKey: ["desk", pool] });
                        toast({ message: isDesk ? "대화를 보관했어요. 지난 작업에서 다시 볼 수 있어요." : "세션을 보관했어요." });
                        navigate(deskHome);
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
      <div className="desk-split" data-open={nodeId && isDesktop ? "" : undefined}>
      <div className="desk-split__main">
      <ArtifactViewerHost
        followup={
          // 데스크톱은 채팅 입력창이 그대로 보여 문맥 칩으로 이어 지시한다. 모바일 전체 화면 뷰어에만 따로 둔다.
          !isDesktop && viewer.current ? <FollowupComposer sessionId={sessionId} artifactId={viewer.current} /> : undefined
        }
      >
      <div className="tk-thread tk-screen__body" role="log" aria-label="대화" aria-live="polite" ref={threadRef}>
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
            {hasOlder && (
              <div className="thread-older">
                <Button size="sm" variant="ghost" onClick={loadOlder} disabled={runs.isFetching}>
                  {runs.isFetching ? "불러오는 중" : "이전 대화 더 보기"}
                </Button>
              </div>
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
              <Fragment key={run.id}>
              {i > 0 && <hr className="tk-divider thread-divider" />}
              <RunBlock
                run={run}
                isLast={i === runList.length - 1}
                onOpen={viewer.open}
                onStop={stop}
                onRetry={(p) => onSubmit(p)}
                onSuggest={(text) => setFill({ text, nonce: Date.now() })}
                onSettled={refreshAll}
                onOpenNode={kind === "desk" ? openNode : undefined}
                selectedNode={nodeId}
              />
              </Fragment>
            ))}
            {jump && (
              <button className="tk-jump" type="button" onClick={toBottom}>
                {activeRun && <span className="tk-dot tk-dot--live" aria-hidden />}새 메시지
                <Icon name="arrow-down" />
              </button>
            )}
          </div>
      </div>
      {sendError && (
        <p className="tk-message tk-message--system" role="alert">
          <span>보내지 못했어요 · {sendError}</span>
        </p>
      )}
      <Composer
        draftKey={sessionId}
        running={!!activeRun || send.isPending}
        queued={runList.filter((r) => r.status === "queued").length}
        onSubmit={onSubmit}
        onStop={activeRun ? () => stop(activeRun.id) : undefined}
        fill={fill}
        onAttach={workspaceId ? attach : undefined}
        blocked={uploading}
        notice={dragging ? "놓으면 첨부해요" : null}
        context={
          contextShown || attachments.length > 0 ? (
            <>
              {contextShown && (
                <div className="tk-chips" aria-label="함께 보낼 문맥">
                  <span className="tk-chip tk-chip--context">
                    <span>{contextShown.filename}</span>
                    <button className="tk-icon-button tk-icon-button--xs tk-icon-button--round" type="button" aria-label="문맥에서 빼기" onClick={() => setDroppedId(contextShown.id)}>
                      <Icon name="x" />
                    </button>
                  </span>
                </div>
              )}
              {attachments.length > 0 && (
                <div className="tk-attach-list" aria-label="함께 보낼 첨부">
                  {attachments.map((a) => (
                    <PendingAttachment
                      key={a.key}
                      file={a.file}
                      state={a.state}
                      error={a.error}
                      onRetry={() => retryAttach(a.key)}
                      onRemove={() => {
                        releaseFileUrl(a.file);
                        setAttachments((all) => all.filter((x) => x.key !== a.key));
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          ) : undefined
        }
      />
      </ArtifactViewerHost>
      </div>
      {nodeId && isDesktop && (
        <aside className="desk-split__node" aria-label="고른 세션">
          <NodePanel key={nodeId} nodeId={nodeId} onSelect={openNode} onClose={closeNode} onOpenArtifact={viewer.open} />
        </aside>
      )}
      </div>
    </div>
  );
}
