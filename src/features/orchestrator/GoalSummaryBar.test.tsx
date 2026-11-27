import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GoalSummary } from "../../api/types";
import { GoalSummaryBar, goalPhaseView } from "./GoalSummaryBar";

const base: GoalSummary = {
  status: "active", phase: "running", goal: "백엔드 작업 완료", revision: 1,
  completed: [{ id: "A", text: "스키마 작성", status: "done", evidence: "pytest -q: 3 passed" }],
  pending: [{ id: "B", text: "API 구현", status: "pending", evidence: "" }],
  completed_count: 1, pending_count: 1, running_tasks: ["API 작업자"], next_action: "B 구현",
  waiting_until: null, stop_reason: "", blocker_kind: null, auto_resumable: true,
  user_action: "none", user_intervention_needed: false, additional_request_count: 0,
  updated_at: "2026-11-27T18:25:14.236326+00:00",
};
const make = (patch: Partial<GoalSummary>): GoalSummary => ({ ...base, ...patch });
const badge = () => document.querySelector(".goal-summary .tk-badge")?.textContent ?? "";

afterEach(cleanup);

describe("GoalSummaryBar phase별 렌더링", () => {
  it("running: 진행 중, 개수, 실행 중 작업, 다음 할 일, 조치 필요 없음", () => {
    render(<GoalSummaryBar summary={base} />);
    expect(badge()).toBe("진행 중");
    expect(screen.getByText("완료 1 · 남음 1")).toBeTruthy();
    expect(screen.getByText(/실행 중 API 작업자 · 다음 B 구현/)).toBeTruthy();
    expect(screen.getByText("내 조치는 필요 없어요")).toBeTruthy();
    expect(document.querySelector(".goal-summary__hint[data-needed]")).toBeNull();
  });

  it("waiting: 대기 시각과 자동 재개 문구를 보이고 조치 필요로 보이지 않는다", () => {
    render(<GoalSummaryBar summary={make({ phase: "waiting", waiting_until: "2099-01-01T05:20:00Z" })} />);
    expect(badge()).toBe("대기 중");
    expect(screen.getByText(/에 자동으로 이어가요/)).toBeTruthy();
    expect(document.querySelector(".goal-summary__hint[data-needed]")).toBeNull();
  });

  it("paused: 멈춤, 중단 사유, 다시 지시하면 이어간다", () => {
    render(<GoalSummaryBar summary={make({ status: "paused", phase: "paused", auto_resumable: false, user_action: "resume", stop_reason: "사용자가 중단했습니다." })} />);
    expect(badge()).toBe("멈춤");
    expect(screen.getByText("다시 지시하면 이어가요")).toBeTruthy();
    expect(screen.getByText(/중단 사유 사용자가 중단했습니다/)).toBeTruthy();
  });

  it("blocked: 막힘, 개입 필요 강조, 막힌 이유", () => {
    render(<GoalSummaryBar summary={make({ status: "blocked", phase: "blocked", auto_resumable: false, user_action: "intervene", user_intervention_needed: true, blocker_kind: "no_progress", stop_reason: "같은 오류 반복" })} />);
    expect(badge()).toBe("막힘");
    expect(document.querySelector(".goal-summary__hint[data-needed]")?.textContent).toBe("막힘을 풀어 주세요");
    expect(screen.getByText(/진전이 없어요/)).toBeTruthy();
  });

  it("complete: 완료", () => {
    render(<GoalSummaryBar summary={make({ status: "complete", phase: "complete", pending: [], pending_count: 0, running_tasks: [], next_action: "", auto_resumable: false })} />);
    expect(badge()).toBe("완료");
    expect(screen.getByText("완료 1 · 남음 0")).toBeTruthy();
  });

  it("complete 라도 완료 근거가 완료 단어뿐이면 확인 필요로 보이고 완료로 보이지 않는다", () => {
    render(<GoalSummaryBar summary={make({ status: "complete", phase: "complete", user_action: "review", user_intervention_needed: true, pending: [], pending_count: 0 })} />);
    expect(badge()).toBe("확인 필요");
    expect(badge()).not.toBe("완료");
    expect(document.querySelector(".goal-summary__hint[data-needed]")?.textContent).toBe("완료 근거를 확인해 주세요");
  });

  it("Run 이 끝나도 phase 가 running 이면 완료로 보이지 않는다", () => {
    expect(goalPhaseView(make({ phase: "running" }))?.label).toBe("진행 중");
    expect(goalPhaseView(make({ phase: "waiting" }))?.label).not.toBe("완료");
  });

  it("펼치면 완료·남음 항목과 근거를 보고, 접으면 숨긴다", () => {
    render(<GoalSummaryBar summary={base} />);
    expect(screen.queryByText("스키마 작성")).toBeNull();
    const head = screen.getByRole("button", { expanded: false });
    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("스키마 작성")).toBeTruthy();
    expect(screen.getByText("pytest -q: 3 passed")).toBeTruthy();
    expect(screen.getByText("API 구현")).toBeTruthy();
    expect(screen.getByText("백엔드 작업 완료")).toBeTruthy();
    fireEvent.click(head);
    expect(screen.queryByText("스키마 작성")).toBeNull();
  });
});

describe("GoalSummaryBar null·필드 없음", () => {
  it("null 이면 아무것도 그리지 않는다", () => {
    const { container } = render(<GoalSummaryBar summary={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("구버전 백엔드라 필드가 없으면(undefined) 아무것도 그리지 않는다", () => {
    const { container } = render(<GoalSummaryBar summary={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("모르는 phase 는 틀린 상태를 보이지 않고 그리지 않는다", () => {
    const { container } = render(<GoalSummaryBar summary={make({ phase: "archived" as GoalSummary["phase"] })} />);
    expect(container.innerHTML).toBe("");
  });
});
