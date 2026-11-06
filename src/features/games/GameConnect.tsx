import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { discoverGames, registerGame } from "../../api/client";
import { Button } from "../../ui/Button";
import { errorText } from "../viewer/api";

/** 진단은 읽기 전용. 사용자가 연결을 누를 때 기존 등록 API만 호출한다. */
export function GameConnect() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [slug, setSlug] = useState("");
  const candidates = useQuery({ queryKey: ["game-discovery"], queryFn: discoverGames, retry: false });
  const connect = useMutation({
    mutationFn: (value: string) => registerGame(value),
    onSuccess: (g) => {
      qc.setQueryData(["games", g.id], g);
      void qc.invalidateQueries({ queryKey: ["games"] });
      void qc.invalidateQueries({ queryKey: ["game-discovery"] });
      navigate("/games/" + g.id);
    },
  });
  return <section className="game-connect" aria-labelledby="game-connect-title">
    <h2 id="game-connect-title">기존 게임 연결하기</h2>
    <p className="tk-help">Mac의 게임 폴더에서 연결할 프로젝트를 찾아요. 진단 중에는 원본 파일을 바꾸거나 빌드를 실행하지 않아요.</p>
    {candidates.isPending && <p role="status">게임 폴더를 확인하는 중</p>}
    {candidates.isError && <div><p role="alert" className="tk-error">{errorText(candidates.error).message}</p><Button onClick={() => void candidates.refetch()}>다시 찾기</Button></div>}
    {connect.isError && <p role="alert" className="tk-error">{errorText(connect.error).message}</p>}
    {candidates.data?.candidates.length === 0 && <p className="tk-empty tk-empty--boxed">연결할 게임 폴더를 찾지 못했어요. 게임 폴더와 ttakkari-game.json 설정을 확인해 주세요.</p>}
    <ul className="games-list__items" aria-label="연결할 게임">
      {candidates.data?.candidates.map((c) => <li key={c.slug} className="game-build">
        <strong>{c.name}</strong><span className="tk-help">{c.slug}</span>
        {c.issues.map((issue) => <p className="tk-help" key={issue}>{issue}</p>)}
        {c.game_id ? <Link className="tk-link" to={"/games/" + c.game_id}>게임 열기</Link>
          : <Button aria-label={`${c.name} 연결`} variant="primary" disabled={!c.can_register || connect.isPending} busy={connect.isPending && connect.variables === c.slug} onClick={() => connect.mutate(c.slug)}>연결하기</Button>}
      </li>)}
    </ul>
    {candidates.data?.has_more && <p className="tk-help">처음 100개 폴더를 확인했어요. 목록에 없으면 아래에서 폴더 이름으로 연결할 수 있어요.</p>}
    <details><summary>폴더 이름으로 직접 연결</summary>
      <form className="game-connect__manual" onSubmit={(e) => { e.preventDefault(); if (slug.trim() && !connect.isPending) connect.mutate(slug.trim()); }}>
        <label className="tk-label" htmlFor="game-connect-slug">게임 폴더 이름</label>
        <input id="game-connect-slug" className="tk-input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="예: flappy-dot" autoCapitalize="none" autoCorrect="off" />
        <Button type="submit" busy={connect.isPending} disabled={!slug.trim()}>연결</Button>
      </form>
    </details>
  </section>;
}
