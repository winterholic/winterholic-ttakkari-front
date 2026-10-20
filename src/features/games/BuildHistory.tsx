import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getGameBuild, listGameBuilds, listGameVersions, rollbackGame, startGameBuild } from "../../api/client";
import type { Game, GameBuild } from "../../api/gameTypes";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import type { Screenshot } from "./feedback";
import { BuildCompare, PlayPreview, VersionOrigin, resolvePair, togglePair } from "./VersionCompare";
import type { ComparePair } from "./VersionCompare";
import { VersionFilters } from "./VersionFilters";
import { EMPTY_FILTER, activeFilterCount, filterVersions, kb, summarizeChange } from "./versionInfo";
import type { VersionFilter, VersionItem } from "./versionInfo";

const STATUS: Record<GameBuild["status"], { text: string; tone?: "success" | "danger" | "info" }> = {
  building: { text: "만드는 중", tone: "info" },
  succeeded: { text: "성공", tone: "success" },
  failed: { text: "실패", tone: "danger" },
};

/** 롤백 API 의 거절 사유(back api/games.py CODE_STATUS)를 사람 말로. */
export function rollbackProblem(e: unknown): string {
  if (e instanceof ApiError) {
    const map: Record<string, string> = {
      lock_violation: "그 버전의 잠긴 결정이 지금 승인된 결정과 달라 되돌릴 수 없어요.",
      snapshot_tampered: "그 버전의 빌드 파일이 기록과 달라 되돌릴 수 없어요.",
      dirty_worktree: "저장소에 저장되지 않은 변경이 있어 소스 복구를 할 수 없어요. 화면만 되돌리기는 가능해요.",
      build_in_progress: "지금 빌드가 진행 중이에요. 끝난 뒤 다시 시도해 주세요.",
      not_restorable: "이 빌드는 소스를 복구할 수 없어요(커밋 기록이 없거나 저장 전 상태로 만든 빌드).",
      already_active: "이미 이 버전을 보고 있어요.",
      no_build: "그 빌드를 찾을 수 없어요.",
    };
    return map[e.code] ?? e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export { summarizeChange };

export function activeBuildOf(game: Game, builds: GameBuild[]): GameBuild | null {
  const ok = builds.filter((b) => b.status === "succeeded");
  return ok.find((b) => b.id === game.active_build_id) ?? ok[0] ?? null;
}

export function useGameBuilds(gameId: string) {
  return useQuery({
    queryKey: ["games", gameId, "builds"],
    queryFn: () => listGameBuilds(gameId),
    refetchInterval: (q) => ((q.state.data ?? []).some((b) => b.status === "building") ? 3_000 : false),
  });
}

export function RollbackDialog({ game, target, onClose }: { game: Game; target: GameBuild | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [restoreSource, setRestoreSource] = useState(false);
  const rollback = useMutation({
    mutationFn: (b: GameBuild) => rollbackGame(game.id, { build_id: b.id, restore_source: restoreSource, confirm: true }),
    onSuccess: (r, b) => {
      toast({ message: r.restore_build ? `v${b.seq}로 되돌리고 복구 빌드를 만드는 중이에요` : `v${b.seq}로 되돌렸어요`, tone: "success" });
      void qc.invalidateQueries({ queryKey: ["games", game.id] });
      onClose();
    },
  });
  const close = () => { rollback.reset(); setRestoreSource(false); onClose(); };
  return (
    <Dialog
      open={!!target}
      onClose={close}
      title="이 버전으로 되돌리기"
      modal
      footer={
        <div className="tk-button-group tk-button-group--end game-dialog-actions">
          <Button onClick={close}>취소</Button>
          <Button variant="danger" busy={rollback.isPending} onClick={() => target && rollback.mutate(target)}>되돌리기</Button>
        </div>
      }
    >
      {target && (
        <div className="game-rollback">
          <p>게임 화면을 <strong>v{target.seq}</strong> 빌드로 되돌립니다. 기존 빌드와 소스 기록은 지우지 않아요.</p>
          <label className="tk-checkbox">
            <input type="checkbox" checked={restoreSource} onChange={(e) => setRestoreSource(e.target.checked)} />
            <span>소스 코드도 이 버전으로 복구하고 새 빌드를 만들기</span>
          </label>
          <p className="tk-help">{restoreSource ? "저장소에 복구 커밋이 새로 생기고 복구 빌드가 만들어져요. 저장되지 않은 변경이 있으면 거절돼요." : "화면에서 여는 버전만 바뀌어요. 소스는 그대로예요."}</p>
          {rollback.isError && <p className="tk-error" role="alert">{rollbackProblem(rollback.error)}</p>}
        </div>
      )}
    </Dialog>
  );
}

/** 비교 칸에 들어가 있는 위치. 이전 칸이면 "이전", 최신 칸이면 "최신". */
type Slot = "left" | "right" | null;

function BuildRow({ game, b, active, slot, onRollback, onCompare, onPlay }: {
  game: Game;
  b: VersionItem;
  active: boolean;
  slot: Slot;
  onRollback: (b: GameBuild) => void;
  onCompare: (b: VersionItem) => void;
  onPlay: (b: GameBuild) => void;
}) {
  const st = STATUS[b.status];
  const [open, setOpen] = useState(false);
  const detail = useQuery({ enabled: open, queryKey: ["games", game.id, "build", b.id], queryFn: () => getGameBuild(game.id, b.id) });
  return (
    <li className="game-build" data-active={active ? "" : undefined} data-compare={slot ?? undefined}>
      <div className="game-build__head">
        <strong>v{b.seq}</strong>
        <span className={`tk-badge${st.tone ? ` tk-badge--${st.tone}` : ""}`}>{st.text}</span>
        {active && <span className="tk-badge tk-badge--info">지금 보는 버전</span>}
        {b.restored_from_id && <span className="tk-badge tk-badge--warning">복구 빌드</span>}
        {b.status === "succeeded" && !b.lock_verified && <span className="tk-badge" title="승인된 잠금 결정이 없을 때 만든 빌드">잠금 미검증</span>}
        {slot && <span className="tk-badge tk-badge--success">{slot === "left" ? "비교 중 · 이전" : "비교 중 · 최신"}</span>}
        <span className="game-build__time">{new Date(b.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <VersionOrigin v={b} />
      {(b.requests_on ?? 0) > 0 && (
        <p className="game-build__meta">이 버전을 보고 수정 요청 {b.requests_on}건{b.feedback_requests_on ? ` (시각 피드백 ${b.feedback_requests_on}건)` : ""}</p>
      )}
      <p className="game-build__meta">
        {b.source_commit ? `커밋 ${b.source_commit.slice(0, 7)}${b.source_dirty ? " (저장 전 변경 포함)" : ""}` : "커밋 기록 없음"} · {kb(b.bundle_bytes)}
      </p>
      {b.error && <p className="tk-error">{b.error}</p>}
      <div className="game-build__actions">
        {b.status === "succeeded" && (
          <>
            <Button size="xs" aria-pressed={!!slot} onClick={() => onCompare(b)} aria-label={`v${b.seq} ${slot ? "비교에서 빼기" : "비교에 담기"}`}>
              <Icon name={slot ? "check" : "git-merge"} />
              <span>{slot ? "비교에서 빼기" : "비교에 담기"}</span>
            </Button>
            <Button size="xs" onClick={() => onPlay(b)} aria-label={`v${b.seq} 해 보기`}>
              <Icon name="play" />
              <span>해 보기</span>
            </Button>
          </>
        )}
        {b.status === "succeeded" && !active && (
          <Button size="xs" variant="danger" onClick={() => onRollback(b)} aria-label={`v${b.seq}로 되돌리기`}>
            <Icon name="history" />
            <span>이 버전으로 되돌리기</span>
          </Button>
        )}
        <button className="tk-link" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>빌드 로그 {open ? "접기" : "보기"}</button>
      </div>
      {open && (
        <details open className="game-build__log">
          <summary>코드·로그 상세</summary>
          {detail.isPending ? <p className="tk-status" role="status">불러오는 중</p> : detail.isError ? <p className="tk-error" role="alert">{errorText(detail.error).message}</p> : <pre className="tk-code__pre game-build__pre">{detail.data.log_tail || "로그가 없어요"}</pre>}
        </details>
      )}
    </li>
  );
}

/** 빌드 목록에 요청·피드백 정보를 덧붙인다. 서버가 /versions 를 모르면(이전 세대) 덧붙일 것이 없고 빌드 기록만 보인다. */
export function useGameVersionInfo(gameId: string, builds: GameBuild[] | undefined) {
  const newest = builds?.[0];
  // 새 빌드가 생기거나 최신 빌드 상태가 바뀌면 요청 연결도 다시 읽는다
  const sig = builds ? `${builds.length}:${newest?.id ?? ""}:${newest?.status ?? ""}` : "";
  return useQuery({
    enabled: !!builds,
    queryKey: ["games", gameId, "versions", sig],
    queryFn: () => listGameVersions(gameId),
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function BuildHistory({ game, shots, onShot }: { game: Game; shots: Record<string, Screenshot>; onShot: (s: Screenshot) => void }) {
  const qc = useQueryClient();
  const q = useGameBuilds(game.id);
  const info = useGameVersionInfo(game.id, q.data);
  const [target, setTarget] = useState<GameBuild | null>(null);
  const [preview, setPreview] = useState<GameBuild | null>(null);
  const [filter, setFilterState] = useState<VersionFilter>(EMPTY_FILTER);
  // 기간 필터의 기준 시각. 렌더 중 Date.now() 를 부르지 않고 필터를 바꿀 때 갱신한다
  const [now, setNow] = useState(() => Date.now());
  const setFilter = (f: VersionFilter) => { setNow(Date.now()); setFilterState(f); };
  const [pair, setPair] = useState<ComparePair>({ left: null, right: null });
  const compareRef = useRef<HTMLDivElement>(null);
  const start = useMutation({
    mutationFn: () => startGameBuild(game.id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["games", game.id] }); toast({ message: "빌드를 시작했어요", tone: "success" }); },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const items: VersionItem[] = useMemo(() => {
    const byId = new Map((info.data ?? []).map((v) => [v.id, v]));
    return (q.data ?? []).map((b) => byId.get(b.id) ?? b);
  }, [q.data, info.data]);
  const enriched = !!info.data;
  const shown = useMemo(() => filterVersions(items, filter, now), [items, filter, now]);
  if (q.isPending) return <p className="tk-status" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />빌드를 불러오는 중</p>;
  if (q.isError) return <p className="tk-error" role="alert">{errorText(q.error).message}</p>;
  const active = activeBuildOf(game, q.data);
  const ok = items.filter((b) => b.status === "succeeded");
  const eff = resolvePair(ok, pair);
  const slotOf = (b: VersionItem): Slot => (eff.left?.id === b.id ? "left" : eff.right?.id === b.id ? "right" : null);
  const addToCompare = (b: VersionItem) => {
    setPair(togglePair(ok, pair, b));
    compareRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };
  return (
    <div className="game-builds">
      <div className="game-builds__bar">
        <p className="tk-label">버전 이력</p>
        <Button size="xs" onClick={() => start.mutate()} busy={start.isPending}>
          <Icon name="retry" />
          <span>새로 빌드</span>
        </Button>
      </div>
      {q.data.length === 0 ? (
        <p className="tk-empty tk-empty--boxed">아직 빌드가 없어요.</p>
      ) : (
        <>
          <div ref={compareRef}>
            <BuildCompare game={game} builds={items} shots={shots} onShot={onShot} pair={pair} onPair={setPair} enriched={enriched} />
          </div>
          <VersionFilters gameId={game.id} filter={filter} onChange={setFilter} total={items.length} shown={shown.length} withRequests={enriched} />
          {info.isError && <p className="tk-help" role="status">요청·피드백 정보는 아직 읽지 못해 빌드 기록만 보여요.</p>}
          {shown.length === 0 ? (
            <div className="tk-empty tk-empty--boxed">
              <p className="tk-empty__title">조건에 맞는 버전이 없어요</p>
              <p>검색어나 필터를 바꿔 보세요.</p>
              {activeFilterCount(filter) > 0 && <Button size="sm" onClick={() => setFilter(EMPTY_FILTER)}>필터 지우기</Button>}
            </div>
          ) : (
            <ul className="game-builds__list" aria-label="빌드 목록">
              {shown.map((b) => <BuildRow key={b.id} game={game} b={b} active={b.id === active?.id} slot={slotOf(b)} onRollback={setTarget} onCompare={addToCompare} onPlay={setPreview} />)}
            </ul>
          )}
        </>
      )}
      <RollbackDialog game={game} target={target} onClose={() => setTarget(null)} />
      <PlayPreview game={game} build={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
