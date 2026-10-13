import { useMutation, useQueryClient } from "@tanstack/react-query";
import { putDeskFeedback } from "../../api/client";
import type { DeskAction, DeskVerdict, RunEvent, RunOut } from "../../api/types";
import { toast } from "../../ui/toastStore";

/** 접수가 고른 쪽. 판정이 있으면 판정 시점 값을, 없으면 이벤트를 본다(마지막 desk.route). */
export function deskDecision(run: RunOut, events: RunEvent[]): DeskAction | null {
  if (run.desk_feedback) return run.desk_feedback.decided;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "desk.route") return e.payload.action;
  }
  return null;
}

/**
 * 접수 답 아래의 작은 판정 칩(back ADR 0013 "판정과 재생 평가"). 실제 메시지로 접수 정확도를 재려고 모은다.
 * "넘겼어야 해"는 판정과 함께 그 메시지를 바로 새 기획 세션에 넘긴다.
 */
export function DeskFeedback({ run, decided }: { run: RunOut; decided: DeskAction }) {
  const qc = useQueryClient();
  const saved = run.desk_feedback?.verdict ?? null;
  const wrong: DeskVerdict = decided === "answer" ? "should_delegate" : "should_answer";
  const m = useMutation({
    mutationFn: (verdict: DeskVerdict) =>
      putDeskFeedback(run.id, { verdict, redo: verdict === "should_delegate" }),
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: ["runs", run.session_id] });
      if (out.lead_id) {
        void qc.invalidateQueries({ queryKey: ["runEvents", run.id] });
        void qc.invalidateQueries({ queryKey: ["workers"] });
        void qc.invalidateQueries({ queryKey: ["sessions"] });
        toast({ message: "기획 세션에 넘겼어요.", tone: "success" });
      }
    },
    onError: (e) => toast({ message: `판정을 남기지 못했어요 · ${e instanceof Error ? e.message : String(e)}`, tone: "danger" }),
  });
  // 목록을 다시 읽기 전에도 누른 쪽이 바로 선택돼 보이게 한다.
  const current = m.isSuccess ? m.variables : saved;
  const chips: { verdict: DeskVerdict; label: string }[] = [
    { verdict: "ok", label: "맞아" },
    { verdict: wrong, label: decided === "answer" ? "넘겼어야 해" : "바로 답했어야 해" },
  ];
  return (
    <div className="tk-chips tk-suggestions" role="group" aria-label="접수 판단 평가">
      {chips.map((c) => (
        <button
          key={c.verdict}
          className="tk-chip"
          type="button"
          aria-pressed={current === c.verdict}
          aria-busy={(m.isPending && m.variables === c.verdict) || undefined}
          disabled={m.isPending}
          onClick={() => current !== c.verdict && m.mutate(c.verdict)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
