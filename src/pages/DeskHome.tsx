import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRun, ensureDesk, listRuns, searchTasks, taskTree } from "../api/client";
import type { AccountPool, TaskNode, UUID } from "../api/types";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { toast } from "../ui/toastStore";
import { SessionComposer } from "../features/chat/SessionComposer";
import { ArtifactViewerHost, useArtifactViewer } from "../features/viewer";
import { useIsDesktop } from "../features/viewer/hooks";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { buildForest, isActive } from "../features/tasks/buildTree";
import { NodePanel } from "../features/tasks/NodePanel";
import { StatusGlyph } from "../features/tasks/TaskTree";
import { useActiveTasks } from "../features/tasks/useTasks";
import { TaskCanvas } from "../features/canvas/TaskCanvas";
import { DeskThread } from "../features/canvas/DeskThread";
import { DESK_ID } from "../features/canvas/layout";
import { CanvasBoundary } from "../features/canvas/CanvasBoundary";
import "../features/canvas/canvas.css";
import "../features/tasks/tasks.css";

const THREAD_RUNS = 40;
const SEARCH_DEBOUNCE_MS = 250;
// 아래에 떠 있는 입력창 높이(맞춤 때 비울 자리). 입력창 한 줄 + 힌트 줄.
const COMPOSER_INSET = 112;

/**
 * 따까리 홈(/chat·/work): 맡긴 일의 계층을 한 판에 펼친 캔버스가 화면의 주인공이다(back ADR 0014).
 * 맨 위 따까리 노드 아래로 기획 → 작업 세션이 가계도처럼 내려가고, 지시는 판 아래 떠 있는 입력창 하나로 한다.
 * 데스크톱은 오른쪽 패널에 대화(따까리 노드)나 고른 세션의 상세가 열린다. 폰은 판만 두고 세션 화면으로 간다.
 */
export function DeskHome({ pool }: { pool: AccountPool }) {
  const desk = useQuery({ queryKey: ["desk", pool], queryFn: () => ensureDesk(pool), staleTime: Infinity });
  if (desk.isSuccess) return <Home key={desk.data.id} pool={pool} deskId={desk.data.id} />;
  return (
    <div className="tk-screen">
      <PageHeader title="따까리" actions={<PoolSwitch pool={pool} />} />
      <div className="tk-screen__body">
        {desk.isError ? (
          <div className="tk-empty">
            <p className="tk-empty__title">따까리를 열지 못했어요</p>
            <p className="tk-body-sm tk-text-tertiary">{desk.error instanceof Error ? desk.error.message : "Mac Studio 연결을 확인해 주세요."}</p>
            <Button size="sm" onClick={() => void desk.refetch()}>
              <Icon name="retry" />
              다시 시도
            </Button>
          </div>
        ) : (
          <p className="tk-thinking">
            <span className="tk-spinner tk-spinner--sm" aria-hidden />
            따까리를 여는 중
          </p>
        )}
      </div>
    </div>
  );
}

export function PoolSwitch({ pool }: { pool: AccountPool }) {
  const navigate = useNavigate();
  return (
    <div className="tk-segmented" role="radiogroup" aria-label="모드">
      <label>
        <input type="radio" name="desk-pool" checked={pool === "personal"} onChange={() => navigate("/chat")} />
        개인
      </label>
      <label>
        <input type="radio" name="desk-pool" checked={pool === "work"} onChange={() => navigate("/work")} />
        <Icon name="briefcase" />
        회사
      </label>
    </div>
  );
}

function Home({ pool, deskId }: { pool: AccountPool; deskId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isDesktop = useIsDesktop();
  const viewer = useArtifactViewer();
  const [params, setParams] = useSearchParams();
  const selected = params.get("node");
  const pins = params.getAll("pin");
  // 판이 주인공이라 패널은 닫고 시작한다. 노드를 고르거나 지시를 보내면 열린다.
  const [panelOpen, setPanelOpen] = useState(!!params.get("node"));
  const [fill, setFill] = useState<{ text: string; nonce: number } | null>(null);
  const base = pool === "work" ? "/work" : "/chat";

  const active = useActiveTasks();
  const pinned = useQueries({ queries: pins.map((id) => ({ queryKey: ["tasks", "tree", id], queryFn: () => taskTree(id) })) });
  const runs = useQuery({
    queryKey: ["runs", deskId, THREAD_RUNS],
    queryFn: () => listRuns(deskId, { limit: THREAD_RUNS }),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => isActive(r.status)) ? 3_000 : 20_000),
  });
  useForegroundResync(() => {
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["runs", deskId] });
  });

  // 판에 올릴 숲: 이 모드에서 지금 도는 일 + 검색·서고에서 불러온 지난 일(pin) + 지금 고른 노드가 든 일.
  // 끝난 일은 올리지 않는다. 쌓이면 판이 끝없이 넓어지고, 결과는 대화·서고·검색으로 다시 본다.
  // 부모 없는 뿌리(옛 메인 오케스트레이터 시절 데이터)는 지금 구조가 아니라 판에 올리지 않는다(서고에는 남는다).
  const forest = useMemo(() => {
    const nodes = new Map<UUID, TaskNode>();
    const pinnedRoots = new Set<UUID>();
    const candidates: UUID[] = [];
    if (active.data) {
      for (const n of active.data.nodes) nodes.set(n.id, n);
      for (const r of active.data.roots) {
        const n = nodes.get(r);
        if (n?.pool === pool && n.parent_id !== null) candidates.push(r);
      }
    }
    for (const q of pinned) {
      if (!q.data) continue;
      for (const n of q.data.nodes) nodes.set(n.id, n);
      pinnedRoots.add(q.data.root_id);
      if (!candidates.includes(q.data.root_id)) candidates.push(q.data.root_id);
    }
    const all = buildForest(candidates, [...nodes.values()]);
    const contains = (t: (typeof all)[number], id: UUID): boolean => t.node.id === id || t.children.some((c) => contains(c, id));
    return all.filter((t) => pinnedRoots.has(t.node.id) || t.activeBelow > 0 || isActive(t.node.status) || (!!selected && contains(t, selected)));
  }, [active.data, pinned, pool, selected]);

  const runList = runs.data ?? [];
  const lastRun = runList[runList.length - 1];
  const liveRoots = forest.filter((t) => t.activeBelow > 0 || isActive(t.node.status)).length;
  const deskCard = {
    title: pool === "work" ? "따까리 · 회사" : "따까리",
    sub: lastRun && isActive(lastRun.status)
      ? "답하는 중…"
      : liveRoots > 0
        ? `맡긴 일 ${liveRoots}개 진행 중`
        : (lastRun?.result_text?.split("\n")[0] ?? "무엇이든 맡겨 주세요"),
    live: liveRoots > 0 || (!!lastRun && isActive(lastRun.status)),
  };

  const setNode = (id: UUID | null, extra?: { pin?: UUID }) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (id && id !== DESK_ID) next.set("node", id);
      else next.delete("node");
      if (extra?.pin && !next.getAll("pin").includes(extra.pin)) next.append("pin", extra.pin);
      return next;
    });
  const select = (id: UUID) => {
    if (id === DESK_ID) {
      if (!isDesktop) return navigate(`${base}/thread`);
      setPanelOpen(true);
      return setNode(null);
    }
    if (!isDesktop) return navigate(`/chat/${id}`);
    setPanelOpen(true);
    setNode(id);
  };
  const clearPins = () =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete("pin");
      next.delete("node");
      return next;
    });

  const send = useMutation({
    mutationFn: ({ prompt, contextIds }: { prompt: string; contextIds: string[] }) => createRun(deskId, { prompt, context_artifact_ids: contextIds }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["runs", deskId] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      // 답은 따까리 노드와 대화 패널에 온다. 데스크톱은 대화를 펼쳐 둔다.
      if (isDesktop) {
        setPanelOpen(true);
        setNode(null);
      }
    },
    onError: (e, { prompt }) => {
      toast({ message: `보내지 못했어요 · ${e instanceof Error ? e.message : String(e)}`, tone: "danger" });
      setFill({ text: prompt, nonce: Date.now() });
    },
  });

  const showPanel = isDesktop && panelOpen;
  const deskSelected = showPanel && !selected;
  const meta = liveRoots > 0 ? `맡긴 일 ${liveRoots}개 진행 중` : pool === "work" ? "회사 계정만 써요" : "맡긴 일이 여기서 가지를 뻗어요";

  return (
    <div className="tk-screen">
      <PageHeader
        title={deskCard.title}
        meta={meta}
        actions={
          <>
            <PoolSwitch pool={pool} />
            {isDesktop ? (
              <button className="tk-icon-button" type="button" aria-pressed={showPanel} aria-label={showPanel ? "옆 패널 닫기" : "대화 열기"} onClick={() => setPanelOpen((v) => !v)}>
                <Icon name="workspace" />
              </button>
            ) : (
              <Link className="tk-icon-button" to={`${base}/thread`} aria-label="대화 보기">
                <Icon name="chat" />
              </Link>
            )}
          </>
        }
      />
      <ArtifactViewerHost>
        <div className="home">
          <div className="home__canvas">
            {active.isPending ? (
              <p className="tk-thinking home__loading">
                <span className="tk-spinner tk-spinner--sm" aria-hidden />
                맡긴 일을 불러오는 중
              </p>
            ) : (
              <CanvasBoundary>
              <TaskCanvas
                forest={forest}
                desk={deskCard}
                selectedId={selected ?? (deskSelected ? DESK_ID : null)}
                onSelect={select}
                focusId={selected}
                bottomInset={COMPOSER_INSET}
                label="맡긴 일의 계층"
                overlay={
                  <>
                    <div className="home__top" data-no-pan>
                      <TaskSearch pool={pool} forestIds={new Set(forestIds(forest))} onPick={(id, root) => (forestIds(forest).includes(id) ? select(id) : (setPanelOpen(true), setNode(id, { pin: root })))} />
                      {pins.length > 0 && (
                        <button className="tk-chip home__pins" type="button" onClick={clearPins}>
                          지난 일 {pins.length}개 펼침
                          <Icon name="x" />
                        </button>
                      )}
                    </div>
                    {active.isError && (
                      <p className="tk-message tk-message--system home__notice" data-no-pan>
                        <span>맡긴 일을 불러오지 못했어요.</span>
                        <button className="tk-button tk-button--sm" type="button" onClick={() => void active.refetch()}>
                          다시 시도
                        </button>
                      </p>
                    )}
                  </>
                }
              />
              </CanvasBoundary>
            )}
            {/* 입력창은 판 밖에 둔다. 판이 오류로 멈춰도 따까리에게 지시할 수 있어야 한다. */}
            <div className="home__composer">
              <SessionComposer
                sessionId={deskId}
                draftKey={`desk:${deskId}`}
                running={send.isPending}
                queued={0}
                onSubmit={(prompt, contextIds) => send.mutateAsync({ prompt, contextIds })}
                fill={fill}
              />
            </div>
          </div>
          {showPanel && (
            <aside className="home__panel" aria-label={selected ? "고른 세션" : "따까리 대화"}>
              {selected ? (
                <NodePanel key={selected} nodeId={selected} onSelect={select} onClose={() => setNode(null)} onOpenArtifact={viewer.open} />
              ) : (
                <>
                  <header className="home__panel-head">
                    <span className="tk-avatar tk-avatar--agent tk-avatar--sm" aria-hidden />
                    <h2>대화</h2>
                    <Link className="tk-icon-button" to={`${base}/thread`} aria-label="대화를 크게 보기">
                      <Icon name="expand" />
                    </Link>
                    <button className="tk-icon-button" type="button" aria-label="패널 닫기" onClick={() => setPanelOpen(false)}>
                      <Icon name="x" />
                    </button>
                  </header>
                  <DeskThread
                    deskId={deskId}
                    runs={runList}
                    pending={runs.isPending}
                    error={runs.isError}
                    onRetry={() => void runs.refetch()}
                    onSelectNode={select}
                    selectedNode={selected}
                    onOpenArtifact={viewer.open}
                    onSuggest={(text) => setFill({ text, nonce: Date.now() })}
                  />
                </>
              )}
            </aside>
          )}
        </div>
      </ArtifactViewerHost>
    </div>
  );
}

function forestIds(forest: ReturnType<typeof buildForest>): UUID[] {
  const out: UUID[] = [];
  const walk = (t: (typeof forest)[number]) => (out.push(t.node.id), t.children.forEach(walk));
  forest.forEach(walk);
  return out;
}

/** 판 위 검색: 지금 판에 있는 일과 지난 일(제목·지시·결과)을 함께 찾는다. 고르면 판에서 그 노드로 간다. */
function TaskSearch({ pool, forestIds: onBoard, onPick }: { pool: AccountPool; forestIds: Set<UUID>; onPick: (id: UUID, rootId: UUID) => void }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);
  const hits = useQuery({ queryKey: ["tasks", "search", q, pool], queryFn: () => searchTasks(q, pool), enabled: q.length > 0 });
  const pick = (id: UUID, root: UUID) => {
    onPick(id, root);
    setOpen(false);
    setText("");
  };
  return (
    <div
      className="home__search"
      ref={box}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <span className="tk-input-wrap">
        <Icon name="search" />
        <input
          className="tk-input"
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && hits.data?.[0]) pick(hits.data[0].node.id, hits.data[0].root_id);
          }}
          placeholder="맡긴 일 찾기(지난 일 포함)"
          aria-label="맡긴 일 찾기"
          aria-expanded={open && q.length > 0}
          aria-controls="home-search-results"
        />
      </span>
      {open && q.length > 0 && (
        <div className="home__results" id="home-search-results">
          {hits.isPending && <p className="home__results-note">찾는 중</p>}
          {hits.isError && <p className="home__results-note">찾지 못했어요. 잠시 뒤 다시 해 주세요.</p>}
          {hits.isSuccess && hits.data.length === 0 && <p className="home__results-note">'{q}'가 든 일이 없어요.</p>}
          {hits.isSuccess && hits.data.length > 0 && (
            <ul className="home__results-list">
              {hits.data.slice(0, 12).map((h) => (
                <li key={h.node.id}>
                  <button type="button" className="home__result" onClick={() => pick(h.node.id, h.root_id)}>
                    <StatusGlyph status={h.node.status} />
                    <span className="home__result-text">
                      <span className="home__result-title">{h.node.title}</span>
                      <span className="home__result-path">
                        {onBoard.has(h.node.id) ? "판에 있음" : "지난 일"}
                        {h.path.length > 1 ? ` · ${h.path.slice(0, -1).map((p) => p.title).join(" › ")}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
