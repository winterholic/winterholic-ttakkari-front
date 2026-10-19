import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listGameRequests, requestGameWork, uploadFile } from "../../api/client";
import type { Game, GameBuild, GameRequest } from "../../api/gameTypes";
import type { ArtifactOut } from "../../api/types";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { TaskTreeCard } from "../tasks/TaskTreeCard";
import { buildPayload, renderAnnotatedPng, toFeedbackIn } from "./feedback";
import type { Annotation, Screenshot } from "./feedback";

const ACTIVE = new Set(["queued", "running", "waiting"]);
export const MAX_COMMENT_CHARS = 4000;

const STATUS_TEXT: Record<string, string> = {
  queued: "대기 중", running: "작업 중", waiting: "응답 대기", succeeded: "완료", failed: "실패", cancelled: "취소됨", interrupted: "중단됨",
};

export function useGameRequests(gameId: string) {
  return useQuery({
    queryKey: ["games", gameId, "requests"],
    queryFn: () => listGameRequests(gameId),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => ACTIVE.has(r.status)) ? 4_000 : 20_000),
  });
}

/** 스크린샷(원본·주석본)을 Artifact 로 올리고, 그 ID 와 정규화 좌표를 담은 수정 요청을 worker 로 보낸다. */
export function useSubmitFeedback(game: Game) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { build: Pick<GameBuild, "id" | "seq">; screenshot: Screenshot | null; annotations: Annotation[]; comment: string }) => {
      let original: ArtifactOut | null = null;
      let annotated: ArtifactOut | null = null;
      if (input.screenshot) {
        const stamp = input.screenshot.capturedAt.replace(/[^0-9]/g, "").slice(0, 14);
        original = await uploadFile(new File([input.screenshot.blob], `${game.slug}-v${input.build.seq}-${stamp}.png`, { type: "image/png" }), game.workspace_id);
        if (input.annotations.length > 0) {
          const png = await renderAnnotatedPng(input.screenshot, input.annotations);
          if (png) annotated = await uploadFile(new File([png], `${game.slug}-v${input.build.seq}-${stamp}-annotated.png`, { type: "image/png" }), game.workspace_id);
        }
      }
      const payload = buildPayload({ gameId: game.id, build: input.build, screenshot: input.screenshot, annotations: input.annotations, comment: input.comment, artifact: original, annotatedArtifact: annotated });
      const request = await requestGameWork(game.id, {
        kind: "modify", build_id: input.build.id, instruction: payload.comment, feedback: toFeedbackIn(payload),
      });
      return { request, payload, original, annotated };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["games", game.id, "requests"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/** 지시 입력 + 'AI 수정 요청'. 캡처가 없어도 글만으로 보낼 수 있다. */
export function FeedbackForm({
  game,
  build,
  screenshot,
  annotations,
  onSubmitted,
}: {
  game: Game;
  build: Pick<GameBuild, "id" | "seq"> | null;
  screenshot: Screenshot | null;
  annotations: Annotation[];
  onSubmitted: () => void;
}) {
  const [comment, setComment] = useState("");
  const submit = useSubmitFeedback(game);
  const text = comment.trim();
  const blocked = !build ? "성공한 빌드가 있어야 요청할 수 있어요." : !text ? "무엇을 바꿀지 글로 적어 주세요." : null;

  const send = () => {
    if (!build || !text) return;
    submit.mutate(
      { build, screenshot, annotations, comment },
      {
        onSuccess: () => {
          toast({ message: "AI에게 수정 요청을 보냈어요", tone: "success" });
          setComment("");
          onSubmitted();
        },
      },
    );
  };

  return (
    <form className="vf-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <label className="tk-label" htmlFor="game-feedback-text">이렇게 바꿔 주세요</label>
      <textarea
        id="game-feedback-text"
        className="tk-textarea"
        rows={4}
        maxLength={MAX_COMMENT_CHARS}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="예: 주인공 점프가 너무 무거워요. 20%만 가볍게 해 주세요"
      />
      <p className="vf-form__attach" aria-live="polite">
        <Icon name={screenshot ? "image" : "info"} />
        {screenshot ? `스크린샷 첨부됨 · 표시 ${annotations.length}개 · v${screenshot.buildSeq}` : "스크린샷 없이 글만 보냅니다. 화면을 가리키려면 위에서 캡처해 주세요."}
      </p>
      {submit.isError && <p className="tk-error" role="alert">{errorText(submit.error).message}</p>}
      {blocked && <p className="tk-help">{blocked}</p>}
      <Button type="submit" variant="primary" block busy={submit.isPending} disabled={!!blocked}>
        <Icon name="send" />
        <span>AI 수정 요청</span>
      </Button>
    </form>
  );
}

function RequestRow({ r }: { r: GameRequest }) {
  return (
    <li className="game-request" data-status={r.status}>
      <p className="game-request__meta">
        <span className="tk-badge" data-state={r.status === "succeeded" ? "succeeded" : r.status === "failed" ? "failed" : r.status}>{STATUS_TEXT[r.status] ?? r.status}</span>
        <span>{new Date(r.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        {r.lock === "tampered" && <span className="tk-badge tk-badge--warning">잠금 결정 변경 감지</span>}
      </p>
      {/* 새 상태 시스템을 만들지 않고 기존 작업 트리 카드(back ADR 0014)를 그대로 쓴다 */}
      <TaskTreeCard rootId={r.session_id} onSelect={() => undefined} />
      <Link className="tk-link game-request__open" to={`/workspace/${r.session_id}`}>작업 세션 열기</Link>
    </li>
  );
}

/** 이 게임에서 보낸 요청과 worker 상태. */
export function GameRequests({ gameId }: { gameId: string }) {
  const q = useGameRequests(gameId);
  if (q.isPending) return <p className="tk-status" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />작업 현황을 불러오는 중</p>;
  if (q.isError) return <p className="tk-error" role="alert">{errorText(q.error).message}</p>;
  if (q.data.length === 0) return <p className="tk-empty tk-empty--boxed">아직 보낸 수정 요청이 없어요. 게임을 캡처해 표시하고 요청해 보세요.</p>;
  return (
    <ul className="game-requests" aria-label="AI 작업 현황">
      {q.data.map((r) => <RequestRow key={r.run_id} r={r} />)}
    </ul>
  );
}
