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
  const [shots, setShots] = useState<Record<string, Screenshot>>({});
  const urls = useRef(new Set<string>());

  const active = game.data ? activeBuildOf(game.data, builds.data ?? []) : null;
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
    setScreenshot(s);
    setAnnotations([]);
    setTab("feedback");
  }, [keepShot]);

  if (game.isPending) return <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />게임을 불러오는 중</p>;
  if (game.isError) return <p className="tk-error" role="alert">{errorText(game.error).message}</p>;

  const g = game.data;
  const requestsActive = (requests.data ?? []).some((r) => ["queued", "running", "waiting"].includes(r.status));
  const status = gameStatus(builds.data, requestsActive, g.last_build);
  const playedBuild = play.data ? { id: play.data.build_id, seq: play.data.build_seq } : null;
  const target = screenshot ? { id: screenshot.buildId, seq: screenshot.buildSeq } : playedBuild;

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
        play={play.data}
        loading={play.isFetching || game.isFetching && !play.data}
        error={play.isError ? play.error : null}
        onRestart={() => void play.refetch()}
        onCaptured={onCaptured}
        onStartBuild={() => start.mutate()}
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

      <div role="tabpanel" id={`game-panel-${tab}`} aria-labelledby={`game-tab-${tab}`} className="game-panel">
        {tab === "feedback" && (
          <>
            {screenshot ? (
              <VisualFeedback screenshot={screenshot} annotations={annotations} onChange={setAnnotations} onDiscard={() => { setScreenshot(null); setAnnotations([]); }} />
            ) : (
              <p className="tk-help game-panel__hint">게임 화면 아래 <strong>캡처</strong>를 누르면 그 장면 위에 영역·화살표·그림으로 바꿀 곳을 표시할 수 있어요.</p>
            )}
            <FeedbackForm game={g} build={target} screenshot={screenshot} annotations={annotations} onSubmitted={() => { setScreenshot(null); setAnnotations([]); setTab("work"); }} />
          </>
        )}
        {tab === "work" && <GameRequests gameId={g.id} />}
        {tab === "builds" && <BuildHistory game={g} shots={shots} onShot={keepShot} />}
        {tab === "locks" && <LockedDecisions game={g} />}
      </div>
    </div>
  );
}
