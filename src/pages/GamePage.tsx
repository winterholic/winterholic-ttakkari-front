import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getGame } from "../api/client";
import { engineLabel, GameCockpit } from "../features/games/GameCockpit";
import { PageHeader } from "../shell/PageHeader";

/** /games/:id — 게임 디렉터 관제탑. 게임 화면이 중심이고 코드·로그는 접힌 상세로만 둔다. */
export function GamePage() {
  const { id = "" } = useParams();
  // 같은 키라 GameCockpit 과 요청을 공유한다. 헤더 제목만 여기서 쓴다.
  const game = useQuery({ queryKey: ["games", id], queryFn: () => getGame(id), refetchOnWindowFocus: false });
  return (
    <div className="tk-screen">
      <PageHeader title={game.data?.name ?? "게임"} meta={game.data ? `${engineLabel(game.data.engine_id)} · ${game.data.slug}` : undefined} />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--md">
          <GameCockpit gameId={id} />
        </div>
      </div>
    </div>
  );
}
