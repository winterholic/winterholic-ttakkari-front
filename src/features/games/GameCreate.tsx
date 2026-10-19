import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createGame } from "../../api/client";
import type { GameCreateOut } from "../../api/gameTypes";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";

export const MAX_IDEA_CHARS = 2000;
export const MAX_DECISIONS = 20;
const MAX_DECISION_CHARS = 500;

/** 아이디어 한 줄로 새 게임을 만들고 AI 에게 첫 개발을 맡긴다(back ADR 0053). 만든 뒤 어디로 갈지는 호출자가 정한다. */
export function GameCreate({ onCreated }: { onCreated: (out: GameCreateOut) => void }) {
  const qc = useQueryClient();
  const [idea, setIdea] = useState("");
  const [name, setName] = useState("");
  const [genre, setGenre] = useState("");
  const [decisions, setDecisions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const create = useMutation({
    mutationFn: () => {
      // 입력칸에 적고 '추가'를 누르지 않은 결정도 버리지 않는다
      const pending = draft.trim();
      const all = pending && !decisions.includes(pending) ? [...decisions, pending] : decisions;
      return createGame({
        idea: idea.trim(),
        name: name.trim() || null,
        genre: genre.trim(),
        locked_decisions: all.slice(0, MAX_DECISIONS),
        start_development: true,
      });
    },
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: ["games"] });
      qc.setQueryData(["games", out.game.id], out.game);
      if (out.request_error) toast({ message: `게임은 만들었지만 AI 작업은 시작하지 못했어요. ${out.request_error.message}`, tone: "warning" });
      else toast({ message: `${out.game.name} 만들기를 AI에게 맡겼어요`, tone: "success" });
      onCreated(out);
    },
  });

  const addDecision = () => {
    const text = draft.trim();
    if (!text) return;
    if (!decisions.includes(text) && decisions.length < MAX_DECISIONS) setDecisions([...decisions, text]);
    setDraft("");
  };
  const ready = idea.trim().length > 0;

  return (
    <form className="game-create" aria-label="새 게임 만들기" onSubmit={(e) => { e.preventDefault(); if (ready && !create.isPending) create.mutate(); }}>
      <label className="tk-label" htmlFor="game-idea">만들고 싶은 게임을 한 줄로 적어 주세요</label>
      <textarea
        id="game-idea"
        className="tk-textarea"
        rows={3}
        maxLength={MAX_IDEA_CHARS}
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="예: 도트 그래픽 고양이가 점프로 장애물을 피하는 한 판짜리 게임"
      />
      <details className="game-create__more">
        <summary>이름·장르·꼭 지킬 결정 정하기 (선택)</summary>
        <div className="game-create__fields">
          <label className="tk-label" htmlFor="game-name">이름</label>
          <input id="game-name" className="tk-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="비우면 아이디어 첫 줄을 써요" />
          <label className="tk-label" htmlFor="game-genre">장르</label>
          <input id="game-genre" className="tk-input" value={genre} maxLength={60} onChange={(e) => setGenre(e.target.value)} placeholder="예: 아케이드" />
          <label className="tk-label" htmlFor="game-decision">꼭 지킬 결정</label>
          <p className="tk-help">여기 적은 결정은 만들 때 바로 승인돼요. AI가 나중에 바꾸면 빌드가 거절됩니다.</p>
          <div className="game-create__decision-row">
            <input
              id="game-decision"
              className="tk-input"
              value={draft}
              maxLength={MAX_DECISION_CHARS}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDecision(); } }}
              placeholder="예: 2D 도트 픽셀 그래픽"
            />
            <Button size="sm" onClick={addDecision} disabled={!draft.trim() || decisions.length >= MAX_DECISIONS}>
              <Icon name="plus" />
              <span>추가</span>
            </Button>
          </div>
          {decisions.length > 0 && (
            <ul className="game-create__decisions" aria-label="꼭 지킬 결정 목록">
              {decisions.map((d) => (
                <li key={d}>
                  <Icon name="lock" />
                  <span>{d}</span>
                  <button type="button" className="tk-icon-button" aria-label={`${d} 빼기`} onClick={() => setDecisions(decisions.filter((x) => x !== d))}>
                    <Icon name="x" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
      {create.isError && <p className="tk-error" role="alert">{errorText(create.error).message}</p>}
      <Button type="submit" variant="primary" block busy={create.isPending} disabled={!ready}>
        <Icon name="sparkles" />
        <span>{create.isPending ? "게임을 만드는 중" : "게임 만들기"}</span>
      </Button>
      <p className="tk-help">저장소를 만들고 AI가 처음부터 개발해요. 끝나면 자동으로 빌드되어 바로 플레이할 수 있어요.</p>
    </form>
  );
}
