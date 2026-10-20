import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getGame, playGame, startGameBuild } from "../../api/client";
import type { GameBuild } from "../../api/gameTypes";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { BuildHistory, activeBuildOf, useGameBuilds } from "./BuildHistory";
import { FeedbackForm, GameRequests, useGameRequests } from "./FeedbackSubmission";
import { GamePlayer } from "./GamePlayer";
import type { ClipSelection } from "./recordBridge";
import type { PickSelection } from "./pickBridge";
import { LockedDecisions } from "./LockedDecisions";
import { VisualFeedback } from "./VisualFeedback";
import type { Annotation, Screenshot } from "./feedback";
import "./games.css";

type Tab = "feedback" | "work" | "builds" | "locks";
const TABS: { id: Tab; label: string }[] = [
  { id: "feedback", label: "수정 요청" },
  { id: "work", label: "AI 작업" },
  { id: "builds", label: "버전" },
  { id: "locks", label: "잠긴 결정" },
];

const SETTLE_MS = 90_000;
const SETTLE_POLL_MS = 3_000;

const ENGINE_LABEL: Record<string, string> = { "web-phaser": "Phaser", phaser: "Phaser" };
export const engineLabel = (id: string): string => ENGINE_LABEL[id] ?? id;

/** 헤더 아래 상태 배지. 새 상태 체계를 만들지 않고 빌드 상태와 요청 Run 상태를 그대로 합친다. */
export function gameStatus(builds: GameBuild[] | undefined, requestsActive: boolean, lastBuild: GameBuild | null): { text: string; tone: "info" | "success" | "danger" | "warning" | undefined; live?: boolean } {
  if (requestsActive) return { text: "AI 작업 중", tone: "info", live: true };
  const latest = builds?.[0] ?? lastBuild;
  if (!latest) return { text: "빌드 없음", tone: "warning" };
  if (latest.status === "building") return { text: "빌드 중", tone: "info", live: true };
  if (latest.status === "failed") return { text: "최근 빌드 실패", tone: "danger" };
  return { text: "플레이 가능", tone: "success" };
}

export function GameCockpit({ gameId }: { gameId: string }) {
  const qc = useQueryClient();
  const game = useQuery({ queryKey: ["games", gameId], queryFn: () => getGame(gameId), refetchOnWindowFocus: false });
  const builds = useGameBuilds(gameId);
  const requests = useGameRequests(gameId);
  const [tab, setTab] = useState<Tab>("feedback");
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [clip, setClip] = useState<ClipSelection | null>(null);
  const [picked, setPicked] = useState<PickSelection | null>(null);
  const [shots, setShots] = useState<Record<string, Screenshot>>({});
  const urls = useRef(new Set<string>());
  const panelRef = useRef<HTMLDivElement>(null);

  const active = game.data ? activeBuildOf(game.data, builds.data ?? []) : null;
  const requestsActive = (requests.data ?? []).some((r) => ["queued", "running", "waiting"].includes(r.status));
  const play = useQuery({
    enabled: !!game.data,
    queryKey: ["games", gameId, "play", game.data?.active_build_id ?? null, active?.id ?? null],
    queryFn: () => playGame(gameId),
    retry: false,
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
  const start = useMutation({
    mutationFn: () => startGameBuild(gameId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["games", gameId] }); toast({ message: "빌드를 시작했어요", tone: "success" }); },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });

  // 빌드가 끝나면 서버가 활성 빌드를 옮겼을 수 있다(복구 빌드 등). 게임 정보와 플레이 주소를 다시 읽는다(실측: 복구 빌드 성공 뒤 목록은 v3 인데 지금 보는 버전이 v1 로 남았다).
  const hasBuilding = (builds.data ?? []).some((b) => b.status === "building");
  const wasBuilding = useRef(false);
  useEffect(() => {
    if (wasBuilding.current && !hasBuilding) void qc.invalidateQueries({ queryKey: ["games", gameId] });
    wasBuilding.current = hasBuilding;
  }, [hasBuilding, qc, gameId]);

  // 개발·수정 요청이 끝나면 서버가 같은 게임을 자동 빌드한다(back ADR 0054). 빌드 행이 생기고 끝날 때까지 잠시 목록을 다시 읽는다.
  const wasActive = useRef(false);
  const [settleUntil, setSettleUntil] = useState(0);
  useEffect(() => {
    if (wasActive.current && !requestsActive) setSettleUntil(Date.now() + SETTLE_MS);
    wasActive.current = requestsActive;
  }, [requestsActive]);
  useEffect(() => {
    if (!settleUntil) return;
    const id = setInterval(() => {
      if (Date.now() > settleUntil) { clearInterval(id); setSettleUntil(0); return; }
      void qc.invalidateQueries({ queryKey: ["games", gameId, "builds"] });
    }, SETTLE_POLL_MS);
    return () => clearInterval(id);
  }, [settleUntil, qc, gameId]);

  // 방금 만든 게임처럼 빌드가 아직 없고 AI 가 일하는 중이면 진행 상황 탭을 먼저 보여 준다(처음 한 번만).
  const autoTabbed = useRef(false);
  useEffect(() => {
    if (!autoTabbed.current && requestsActive && builds.data?.length === 0) { autoTabbed.current = true; setTab("work"); }
  }, [requestsActive, builds.data?.length]);

  // 캡처하면 게임 화면 아래의 표시 영역으로 내려가 바로 그릴 수 있게 한다(모바일에서는 화면 밖에 놓인다).
  useEffect(() => {
    if (screenshot) panelRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [screenshot]);

  useEffect(() => {
    const set = urls.current;
    return () => { set.forEach((u) => URL.revokeObjectURL(u)); set.clear(); };
  }, []);

  const keepShot = useCallback((s: Screenshot) => {
    urls.current.add(s.url);
    setShots((prev) => {
      const old = prev[s.buildId];
      if (old && old.url !== screenshot?.url) { URL.revokeObjectURL(old.url); urls.current.delete(old.url); }
      return { ...prev, [s.buildId]: s };
    });
  }, [screenshot?.url]);

  const onCaptured = useCallback((s: Screenshot) => {
    keepShot(s);
    setClip((c) => c?.buildId === s.buildId ? c : null);
    setPicked((p) => (p && p.buildId === s.buildId ? p : null)); // 요청의 빌드는 하나라서 다른 빌드에서 고른 오브젝트는 담아 두지 않는다
    setScreenshot(s);
    setAnnotations([]);
    setTab("feedback");
  }, [keepShot]);

  if (game.isPending) return <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />게임을 불러오는 중</p>;
  if (game.isError) return <p className="tk-error" role="alert">{errorText(game.error).message}</p>;

  const g = game.data;
  const status = gameStatus(builds.data, requestsActive, g.last_build);
  const playedBuild = play.data ? { id: play.data.build_id, seq: play.data.build_seq } : null;
  const target = screenshot ? { id: screenshot.buildId, seq: screenshot.buildSeq } : picked ? { id: picked.buildId, seq: picked.buildSeq } : clip ? { id: clip.buildId, seq: clip.buildSeq } : playedBuild;

  return (
    <div className="game-cockpit">
      <div className="game-chips tk-chips tk-chips--wrap" aria-label="게임 정보">
        {g.genre && <span className="tk-chip"><span>장르 {g.genre}</span></span>}
        <span className="tk-chip"><Icon name="smartphone" /><span>엔진 {engineLabel(g.engine_id)}</span></span>
        <span className="tk-chip"><Icon name="history" /><span>{playedBuild ? `빌드 v${playedBuild.seq}` : active ? `빌드 v${active.seq}` : "빌드 없음"}</span></span>
        <span className={`tk-badge${status.tone ? ` tk-badge--${status.tone}` : ""}`} role="status">
          {status.live && <span className="tk-dot tk-dot--live" aria-hidden="true" />}
          <span>{status.text}</span>
        </span>
      </div>

      <GamePlayer
        key={`${gameId}:${play.data?.build_id}`}
        play={play.data}
        loading={play.isFetching || game.isFetching && !play.data}
        error={play.isError ? play.error : null}
        onRestart={() => void play.refetch()}
        onCaptured={onCaptured}
        onPickUse={(selection) => { setPicked(selection); if (clip?.buildId !== selection.buildId) setClip(null); if (screenshot?.buildId !== selection.buildId) { setScreenshot(null); setAnnotations([]); } setTab("feedback"); }}
        onClipUse={(selection) => { setClip(selection); if (screenshot?.buildId !== selection.buildId) { setScreenshot(null); setAnnotations([]); } if (picked?.buildId !== selection.buildId) setPicked(null); setTab("feedback"); panelRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }}
        onStartBuild={() => start.mutate()}
        working={requestsActive}
        gameId={gameId}
        buildTitle={playedBuild ? `v${playedBuild.seq}` : ""}
      />

      <div className="tk-tablist game-tabs" role="tablist" aria-label="스튜디오">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" className="tk-tab" id={`game-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`game-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "work" && requestsActive && <span className="tk-dot tk-dot--live" aria-label="작업 중" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`game-panel-${tab}`} aria-labelledby={`game-tab-${tab}`} className="game-panel" ref={panelRef}>
        {tab === "feedback" && (
          <>
            {screenshot ? (
              <VisualFeedback screenshot={screenshot} annotations={annotations} onChange={setAnnotations} onDiscard={() => { setScreenshot(null); setAnnotations([]); }} />
            ) : (
              <p className="tk-help game-panel__hint">게임 화면 아래 <strong>캡처</strong>를 누르면 그 장면 위에 영역·화살표·그림으로 바꿀 곳을 표시할 수 있어요.</p>
            )}
            <FeedbackForm
              game={g}
              build={target}
              screenshot={screenshot}
              annotations={annotations}
              clip={clip}
              onClearClip={() => setClip(null)}
              picked={picked}
              onClearPicked={() => setPicked(null)}
              onSubmitted={() => { setScreenshot(null); setAnnotations([]); setPicked(null); setClip(null); setTab("work"); }}
            />
          </>
        )}
        {tab === "work" && <GameRequests gameId={g.id} />}
        {tab === "builds" && <BuildHistory game={g} shots={shots} onShot={keepShot} />}
        {tab === "locks" && <LockedDecisions game={g} />}
      </div>
    </div>
  );
}
