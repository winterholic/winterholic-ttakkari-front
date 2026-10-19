import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getGameBuild, listGameBuilds, rollbackGame, startGameBuild } from "../../api/client";
import type { Game, GameBuild } from "../../api/gameTypes";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { captureBuild } from "./captureBuild";
import type { Screenshot } from "./feedback";

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

const kb = (n: number | null) => (n === null ? "?" : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);

/** 두 빌드의 변경 요약. 서버에 변경 설명이 없어 빌드 기록(커밋·번들 크기·파일 수·잠금 검증)에서만 만든다. */
export function summarizeChange(prev: GameBuild, next: GameBuild): string[] {
  const out: string[] = [];
  if (prev.source_commit && next.source_commit) {
    out.push(prev.source_commit === next.source_commit ? "소스 커밋이 같아요" : `소스 커밋 ${prev.source_commit.slice(0, 7)} → ${next.source_commit.slice(0, 7)}`);
  }
  if (prev.bundle_bytes !== null && next.bundle_bytes !== null) {
    const d = next.bundle_bytes - prev.bundle_bytes;
    out.push(d === 0 ? "번들 크기 변화 없음" : `번들 ${d > 0 ? "+" : "-"}${kb(Math.abs(d))} (${kb(prev.bundle_bytes)} → ${kb(next.bundle_bytes)})`);
  }
  if (prev.bundle_files !== null && next.bundle_files !== null && prev.bundle_files !== next.bundle_files) out.push(`파일 ${prev.bundle_files}개 → ${next.bundle_files}개`);
  if (prev.bundle_sha256 && prev.bundle_sha256 === next.bundle_sha256) out.push("번들 내용이 완전히 같아요");
  if (prev.lock_verified !== next.lock_verified) out.push(next.lock_verified ? "새 빌드는 잠긴 결정 검증을 통과했어요" : "새 빌드는 잠긴 결정 검증이 없어요");
  return out;
}

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
      size="sm"
      title="이 버전으로 되돌리기"
      modal
      footer={
        <div className="tk-button-group tk-button-group--end">
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

function BuildRow({ game, b, active, onRollback }: { game: Game; b: GameBuild; active: boolean; onRollback: (b: GameBuild) => void }) {
  const st = STATUS[b.status];
  const [open, setOpen] = useState(false);
  const detail = useQuery({ enabled: open, queryKey: ["games", game.id, "build", b.id], queryFn: () => getGameBuild(game.id, b.id) });
  return (
    <li className="game-build" data-active={active ? "" : undefined}>
      <div className="game-build__head">
        <strong>v{b.seq}</strong>
        <span className={`tk-badge${st.tone ? ` tk-badge--${st.tone}` : ""}`}>{st.text}</span>
        {active && <span className="tk-badge tk-badge--info">지금 보는 버전</span>}
        {b.restored_from_id && <span className="tk-badge tk-badge--warning">복구 빌드</span>}
        {b.status === "succeeded" && !b.lock_verified && <span className="tk-badge" title="승인된 잠금 결정이 없을 때 만든 빌드">잠금 미검증</span>}
        <span className="game-build__time">{new Date(b.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <p className="game-build__meta">
        {b.source_commit ? `커밋 ${b.source_commit.slice(0, 7)}${b.source_dirty ? " (저장 전 변경 포함)" : ""}` : "커밋 기록 없음"} · {kb(b.bundle_bytes)}
      </p>
      {b.error && <p className="tk-error">{b.error}</p>}
      <div className="game-build__actions">
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

/** 이전·최신 빌드의 캡처를 나란히 둔다. 캡처는 해당 빌드를 비교용으로 열어 bridge 로 찍는다. */
export function BuildCompare({
  game,
  builds,
  shots,
  onShot,
}: {
  game: Game;
  builds: GameBuild[];
  shots: Record<string, Screenshot>;
  onShot: (s: Screenshot) => void;
}) {
  const ok = builds.filter((b) => b.status === "succeeded");
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const right = ok.find((b) => b.id === (rightId ?? ok[0]?.id)) ?? null;
  const left = ok.find((b) => b.id === (leftId ?? ok.find((b2) => b2.id !== right?.id)?.id)) ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (ok.length < 2) return <p className="tk-empty tk-empty--boxed">성공한 빌드가 둘 이상이면 이전·최신 화면을 나란히 비교할 수 있어요.</p>;

  const capture = async (b: GameBuild) => {
    setBusy(b.id);
    setErr(null);
    try {
      onShot(await captureBuild(game.id, b.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const slot = (label: string, cur: GameBuild | null, set: (id: string) => void) => (
    <div className="game-compare__slot" role="group" aria-label={label}>
      <label className="tk-label" htmlFor={`cmp-${label}`}>{label}</label>
      <select id={`cmp-${label}`} className="tk-input tk-input--sm" value={cur?.id ?? ""} onChange={(e) => set(e.target.value)}>
        {ok.map((b) => <option key={b.id} value={b.id}>v{b.seq}{b.id === game.active_build_id ? " (지금)" : ""}</option>)}
      </select>
      <div className="game-compare__shot">
        {cur && shots[cur.id] ? (
          <img src={shots[cur.id].url} alt={`${label} v${cur.seq} 화면`} />
        ) : (
          <Button size="sm" busy={busy === cur?.id} disabled={!cur || busy !== null} onClick={() => cur && void capture(cur)}>
            <Icon name="camera" />
            <span>이 빌드 화면 캡처</span>
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <section className="game-compare" aria-label="빌드 비교">
      <div className="game-compare__grid">
        {slot("이전 빌드", left, setLeftId)}
        {slot("최신 빌드", right, setRightId)}
      </div>
      {err && <p className="tk-error" role="alert">{err}</p>}
      {left && right && left.id !== right.id && (
        <div className="game-compare__summary">
          <p className="tk-label">변경 요약 <span className="tk-help">빌드 기록 기준</span></p>
          <ul>{summarizeChange(left, right).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

export function BuildHistory({ game, shots, onShot }: { game: Game; shots: Record<string, Screenshot>; onShot: (s: Screenshot) => void }) {
  const qc = useQueryClient();
  const q = useGameBuilds(game.id);
  const [target, setTarget] = useState<GameBuild | null>(null);
  const start = useMutation({
    mutationFn: () => startGameBuild(game.id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["games", game.id] }); toast({ message: "빌드를 시작했어요", tone: "success" }); },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  if (q.isPending) return <p className="tk-status" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />빌드를 불러오는 중</p>;
  if (q.isError) return <p className="tk-error" role="alert">{errorText(q.error).message}</p>;
  const active = activeBuildOf(game, q.data);
  return (
    <div className="game-builds">
      <div className="game-builds__bar">
        <p className="tk-label">빌드 {q.data.length}개</p>
        <Button size="xs" onClick={() => start.mutate()} busy={start.isPending}>
          <Icon name="retry" />
          <span>새로 빌드</span>
        </Button>
      </div>
      {q.data.length === 0 ? (
        <p className="tk-empty tk-empty--boxed">아직 빌드가 없어요.</p>
      ) : (
        <>
          <BuildCompare game={game} builds={q.data} shots={shots} onShot={onShot} />
          <ul className="game-builds__list" aria-label="빌드 목록">
            {q.data.map((b) => <BuildRow key={b.id} game={game} b={b} active={b.id === active?.id} onRollback={setTarget} />)}
          </ul>
        </>
      )}
      <RollbackDialog game={game} target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
