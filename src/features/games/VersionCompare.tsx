import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { compareGameVersions, playGame } from "../../api/client";
import type { Game, GameBuild, GameFeedbackSummary } from "../../api/gameTypes";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { errorText } from "../viewer/api";
import { captureBuild } from "./captureBuild";
import type { Screenshot } from "./feedback";
import { REQUEST_KIND, feedbackParts, originOf, summarizeChange, versionsBetween } from "./versionInfo";
import type { VersionItem } from "./versionInfo";

export interface ComparePair { left: string | null; right: string | null }

/** 칸이 비어 있으면 최신 성공 빌드(오른쪽)와 그 바로 이전 성공 빌드(왼쪽)를 쓴다. ok 는 seq 내림차순이다. */
export function resolvePair<T extends GameBuild>(ok: T[], pair: ComparePair): { left: T | null; right: T | null } {
  const right = ok.find((b) => b.id === pair.right) ?? ok[0] ?? null;
  const left = ok.find((b) => b.id === pair.left) ?? ok.find((b) => b.id !== right?.id) ?? null;
  return { left, right };
}

/** 목록의 "비교에 담기". 이미 담긴 버전이면 뺀다. 담을 때는 현재 오른쪽보다 오래된 버전이면 왼쪽(이전), 아니면 오른쪽(최신) 칸에 넣는다. */
export function togglePair<T extends GameBuild>(ok: T[], pair: ComparePair, v: T): ComparePair {
  const eff = resolvePair(ok, pair);
  if (eff.left?.id === v.id) return { ...pair, left: null };
  if (eff.right?.id === v.id) return { ...pair, right: null };
  if (eff.right && v.seq < eff.right.seq) return { ...pair, left: v.id };
  return { ...pair, right: v.id };
}

function FeedbackBadges({ fb }: { fb: GameFeedbackSummary | null | undefined }) {
  const parts = feedbackParts(fb);
  if (!parts.length) return null;
  return (
    <span className="game-origin__fb" role="group" aria-label="시각 피드백">
      <span className="tk-help">피드백</span>
      {parts.map((t) => <span key={t} className="tk-badge tk-badge--info">{t}</span>)}
    </span>
  );
}

/** 한 버전이 어디서 왔는지: 경위, 요청 본문, 피드백 종류. 요청 정보가 없는 서버·수동 빌드는 경위 한 줄만 남는다. */
export function VersionOrigin({ v }: { v: VersionItem }) {
  const ask = v.produced_by?.instruction;
  return (
    <div className="game-origin">
      <p className="game-origin__line">{originOf(v)}</p>
      {ask && <p className="game-origin__ask" title={ask}>{ask}</p>}
      <FeedbackBadges fb={v.produced_by?.feedback} />
    </div>
  );
}

/** 서명된 별도 origin 주소로 그 빌드를 바로 해 본다. 세이브·캡처 bridge 를 잇지 않는 미리보기이며 닫으면 iframe 을 제거한다. */
export function PlayPreview({ game, build, onClose }: { game: Game; build: GameBuild | null; onClose: () => void }) {
  const play = useQuery({
    enabled: !!build,
    queryKey: ["games", game.id, "preview", build?.id],
    queryFn: () => playGame(game.id, build?.id),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  return (
    <Dialog open={!!build} onClose={onClose} title={build ? `v${build.seq} 해 보기` : "해 보기"} size="lg" footer={<div className="tk-button-group tk-button-group--end game-dialog-actions"><Button onClick={onClose}>닫기</Button></div>}>
      {build && (
        <div className="game-preview">
          {play.isPending ? (
            <p className="tk-status" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />게임을 여는 중</p>
          ) : play.isError ? (
            <p className="tk-error" role="alert">{errorText(play.error).message}</p>
          ) : (
            <iframe className="game-preview__frame" title={`v${build.seq} 게임 화면`} src={play.data.url} sandbox={play.data.sandbox} allow="autoplay; gamepad" referrerPolicy="no-referrer" />
          )}
          <p className="tk-help">미리보기라서 진행 저장과 캡처는 이어지지 않아요. 수정 요청은 지금 보는 버전의 화면에서 해 주세요.</p>
        </div>
      )}
    </Dialog>
  );
}

const sign = (n: number | null, mark: string) => (n === null ? "" : `${mark}${n}`);

/** 두 빌드의 소스 변경. 서버가 게임 저장소 git 객체에서 읽은 파일 증감·커밋 제목이며 못 읽으면 사유를 보인다. */
export function SourceChange({ game, left, right }: { game: Game; left: GameBuild; right: GameBuild }) {
  const q = useQuery({
    queryKey: ["games", game.id, "compare", left.id, right.id],
    queryFn: () => compareGameVersions(game.id, left.id, right.id),
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (q.isPending) return <p className="tk-status" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />소스 변경을 읽는 중</p>;
  if (q.isError) return <p className="tk-help" role="status">소스 변경은 아직 읽지 못했어요. 위의 빌드 기록 요약만 볼 수 있어요.</p>;
  const d = q.data;
  if (!d.available) return <p className="tk-help" role="status">{d.reason || "소스 변경을 비교할 수 없어요."}</p>;
  if (d.same_commit) return <p className="tk-help">두 빌드의 소스 커밋이 같아서 바뀐 소스가 없어요.</p>;
  return (
    <div className="game-source">
      <p className="game-source__total">
        바뀐 파일 {d.files_total}개 <span className="game-source__add">+{d.insertions}</span> <span className="game-source__del">-{d.deletions}</span>
      </p>
      {(d.base_dirty || d.head_dirty) && <p className="tk-help">저장 전 변경이 들어간 빌드라 실제 소스와 조금 다를 수 있어요.</p>}
      {d.commits.length > 0 ? (
        <ul className="game-source__commits" aria-label="커밋">
          {d.commits.map((c) => <li key={c.sha}><code>{c.sha}</code> <span>{c.subject}</span></li>)}
        </ul>
      ) : d.files_total > 0 ? <p className="tk-help">이전→최신 방향의 커밋이 없어요. 두 빌드가 같은 갈래가 아닐 수 있어요.</p> : null}
      {d.commits_truncated && <p className="tk-help">커밋이 많아 최근 {d.commits.length}개만 보여요.</p>}
      {d.files.length > 0 && (
        <details className="game-source__files">
          <summary>바뀐 파일 {d.files_total > d.files.length ? `(변경이 큰 ${d.files.length}개)` : "목록"}</summary>
          <ul>
            {d.files.map((f) => (
              <li key={f.path}>
                <span className="game-source__path">{f.path}</span>
                <span className="game-source__counts">{f.added === null ? "바이너리" : <><span className="game-source__add">{sign(f.added, "+")}</span> <span className="game-source__del">{sign(f.deleted, "-")}</span></>}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** 두 버전 사이에 들어온 요청들(요청문·피드백). 인접하지 않은 버전을 비교할 때 무엇이 바뀌었는지 맥락을 준다. */
export function RequestsBetween({ all, left, right }: { all: VersionItem[]; left: VersionItem; right: VersionItem }) {
  const between = versionsBetween(all, left, right).filter((v) => v.produced_by);
  if (!between.length) return null;
  return (
    <div className="game-between">
      <p className="tk-label">사이의 요청</p>
      <ol className="game-between__list">
        {between.map((v) => (
          <li key={v.id}>
            <strong>v{v.seq}</strong> <span className="tk-help">{REQUEST_KIND[v.produced_by?.kind ?? ""] ?? "요청"}</span>
            <span className="game-between__ask">{v.produced_by?.instruction || "요청문을 읽지 못했어요"}</span>
            <FeedbackBadges fb={v.produced_by?.feedback} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 이전·최신 빌드를 나란히 둔다: 경위·요청, 캡처, 해 보기, 변경 요약(빌드 기록·소스·사이의 요청). 캡처는 해당 빌드를 비교용으로 열어 bridge 로 찍는다. */
export function BuildCompare({
  game,
  builds,
  shots,
  onShot,
  pair,
  onPair,
  enriched,
}: {
  game: Game;
  builds: VersionItem[];
  shots: Record<string, Screenshot>;
  onShot: (s: Screenshot) => void;
  pair: ComparePair;
  onPair: (p: ComparePair) => void;
  /** 서버가 요청·피드백 정보(/versions)를 줬는지. 아니면 빌드 기록만으로 비교한다 */
  enriched: boolean;
}) {
  const ok = builds.filter((b) => b.status === "succeeded");
  const { left, right } = resolvePair(ok, pair);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<GameBuild | null>(null);

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

  const slot = (label: string, cur: VersionItem | null, set: (id: string) => void) => (
    <div className="game-compare__slot" role="group" aria-label={label}>
      <label className="tk-label" htmlFor={`cmp-${label}`}>{label}</label>
      <select id={`cmp-${label}`} className="tk-input tk-input--sm" value={cur?.id ?? ""} onChange={(e) => set(e.target.value)}>
        {ok.map((b) => <option key={b.id} value={b.id}>v{b.seq}{b.id === game.active_build_id ? " (지금)" : ""}</option>)}
      </select>
      {cur && <VersionOrigin v={cur} />}
      <div className="game-compare__shot" data-empty={cur && shots[cur.id] ? undefined : ""}>
        {cur && shots[cur.id] ? (
          <img src={shots[cur.id].url} alt={`${label} v${cur.seq} 화면`} />
        ) : (
          <Button size="sm" busy={busy === cur?.id} disabled={!cur || busy !== null} onClick={() => cur && void capture(cur)}>
            <Icon name="camera" />
            <span>이 빌드 화면 캡처</span>
          </Button>
        )}
      </div>
      <Button size="xs" disabled={!cur} onClick={() => cur && setPreview(cur)} aria-label={`${label} v${cur?.seq ?? ""} 해 보기`}>
        <Icon name="play" />
        <span>해 보기</span>
      </Button>
    </div>
  );

  const differs = left && right && left.id !== right.id;
  return (
    <section className="game-compare" aria-label="빌드 비교">
      <div className="game-compare__grid">
        {slot("이전 빌드", left, (id) => onPair({ ...pair, left: id }))}
        {slot("최신 빌드", right, (id) => onPair({ ...pair, right: id }))}
      </div>
      {err && <p className="tk-error" role="alert">{err}</p>}
      {differs && (
        <div className="game-compare__summary">
          <p className="tk-label">변경 요약 <span className="tk-help">v{left.seq} → v{right.seq}</span></p>
          <ul>{summarizeChange(left, right).map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="tk-label">소스 변경</p>
          <SourceChange game={game} left={left} right={right} />
          {enriched && <RequestsBetween all={builds} left={left} right={right} />}
        </div>
      )}
      <PlayPreview game={game} build={preview} onClose={() => setPreview(null)} />
    </section>
  );
}
