import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listGames, registerGame } from "../api/client";
import type { Game } from "../api/gameTypes";
import { engineLabel } from "../features/games/GameCockpit";
import { GameCreate } from "../features/games/GameCreate";
import { errorText } from "../features/viewer/api";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { toast } from "../ui/toastStore";
import "../features/games/games.css";

function buildLabel(g: Game): string {
  const b = g.last_build;
  if (!b) return "빌드 없음";
  return `v${b.seq} · ${b.status === "succeeded" ? "플레이 가능" : b.status === "building" ? "빌드 중" : "빌드 실패"}`;
}

/** /games — 게임 스튜디오 목록. 게임 소스는 서버의 games 폴더에 있는 저장소를 slug 로 연결한다. */
export function GamesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["games"], queryFn: listGames });
  const [slug, setSlug] = useState("");
  const add = useMutation({
    mutationFn: () => registerGame(slug.trim()),
    onSuccess: (g) => { setSlug(""); void qc.invalidateQueries({ queryKey: ["games"] }); toast({ message: `${g.name} 게임을 연결했어요`, tone: "success" }); },
  });
  return (
    <div className="tk-screen">
      <PageHeader title="게임 스튜디오" meta="게임 화면을 보며 AI에게 고쳐 달라고 맡기는 곳" />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--md games-list">
          <GameCreate onCreated={(out) => navigate("/games/" + out.game.id)} />
          {q.isPending && <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />게임을 불러오는 중</p>}
          {q.isError && <p className="tk-error" role="alert">{errorText(q.error).message}</p>}
          {q.data?.length === 0 && <p className="tk-empty tk-empty--boxed">만든 게임이 아직 없어요. 위에서 아이디어를 적어 시작해 보세요.</p>}
          <ul className="games-list__items" aria-label="게임 목록">
            {q.data?.map((g) => (
              <li key={g.id}>
                <Link className="games-card" to={`/games/${g.id}`}>
                  <Icon name="smartphone" />
                  <span className="games-card__text">
                    <span className="games-card__name">{g.name}</span>
                    <span className="games-card__meta">{engineLabel(g.engine_id)} · {buildLabel(g)}</span>
                  </span>
                  <Icon name="chevron-right" />
                </Link>
              </li>
            ))}
          </ul>
          <details className="games-list__add">
            <summary>이미 있는 저장소 연결하기</summary>
            <form onSubmit={(e) => { e.preventDefault(); if (slug.trim()) add.mutate(); }}>
              <label className="tk-label" htmlFor="game-slug">저장소 이름(slug)</label>
              <input id="game-slug" className="tk-input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="예: flappy-dot" autoCapitalize="none" autoCorrect="off" />
              {add.isError && <p className="tk-error" role="alert">{errorText(add.error).message}</p>}
              <Button type="submit" variant="primary" busy={add.isPending} disabled={!slug.trim()}>연결</Button>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
