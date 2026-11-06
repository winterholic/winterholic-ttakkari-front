import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { listGames } from "../api/client";
import type { Game } from "../api/gameTypes";
import { engineLabel } from "../features/games/GameCockpit";
import { GameCreate } from "../features/games/GameCreate";
import { GameConnect } from "../features/games/GameConnect";
import { errorText } from "../features/viewer/api";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import "../features/games/games.css";

function buildLabel(g: Game): string {
  const b = g.last_build;
  if (!b) return "빌드 없음";
  return `v${b.seq} · ${b.status === "succeeded" ? "플레이 가능" : b.status === "building" ? "빌드 중" : "빌드 실패"}`;
}

/** /games — 게임 스튜디오 목록. 게임 소스는 서버의 games 폴더에 있는 저장소를 slug 로 연결한다. */
export function GamesPage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["games"], queryFn: listGames });
  const [entry, setEntry] = useState<"create" | "connect" | null>(null);
  const games = [...(q.data ?? [])].sort((a, b) =>
    Date.parse(b.last_build?.finished_at ?? b.last_build?.created_at ?? b.created_at) - Date.parse(a.last_build?.finished_at ?? a.last_build?.created_at ?? a.created_at));
  return (
    <div className="tk-screen">
      <PageHeader title="게임 스튜디오" meta="게임 화면을 보며 AI에게 고쳐 달라고 맡기는 곳" />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--md games-list">
          <div className="games-home__intro"><h2>내 게임 이어하기</h2><p className="tk-help">게임을 열어 지금 할 일을 확인하고, 플레이하며 AI에게 수정을 맡겨 보세요.</p></div>
          {q.isPending && <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />게임을 불러오는 중</p>}
          {q.isError && <div><p className="tk-error" role="alert">{errorText(q.error).message}</p><Button onClick={() => void q.refetch()}>게임 목록 다시 불러오기</Button></div>}
          {q.data?.length === 0 && <p className="tk-empty tk-empty--boxed">아직 연결한 게임이 없어요. 만들고 있는 게임을 연결하거나 새 아이디어로 시작해 보세요.</p>}
          <ul className="games-list__items" aria-label="게임 목록">
            {games.map((g) => (
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
          <div className="games-home__actions" aria-label="게임 시작 방법">
            <Button aria-expanded={entry === "create"} onClick={() => setEntry(entry === "create" ? null : "create")}><Icon name="plus" /><span>새 게임 만들기</span></Button>
            <Button aria-expanded={entry === "connect"} onClick={() => setEntry(entry === "connect" ? null : "connect")}><Icon name="folder" /><span>기존 게임 연결</span></Button>
          </div>
          {entry === "create" && <GameCreate onCreated={(out) => navigate("/games/" + out.game.id)} />}
          {entry === "connect" && <GameConnect />}
        </div>
      </div>
    </div>
  );
}
