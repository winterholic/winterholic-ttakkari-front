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

const hint = () => document.querySelector(".goal-summary__hint")?.textContent ?? "";
const kind = () => document.querySelector(".goal-summary")?.getAttribute("data-kind");
const waitingBase = { phase: "waiting" as const, waiting_until: "2099-01-01T05:20:00Z" };

describe("GoalSummaryBar 새 필드로 구분하는 상태", () => {
  it("실제 실행 중: has_owner=true 이고 대기·장애가 없으면 진행 중", () => {
    render(<GoalSummaryBar summary={make({ wait_type: null, waiting_dependencies: [], has_partial_failure: false, has_owner: true })} />);
    expect(badge()).toBe("진행 중");
    expect(kind()).toBe("running");
  });

  it("외부 의존성 대기: 결과 대기로 보이고 기다리는 것 이름을 짧게 보여 준다", () => {
    const deps = [{ target: "배포 완료", reason: "internal-reason-xyz", owner: "ci-bot" }, { target: "리뷰 결과" }];
    render(<GoalSummaryBar summary={make({ phase: "waiting", wait_type: "external_dependency", waiting_dependencies: deps, has_owner: true })} />);
    expect(badge()).toBe("결과 대기");
    expect(hint()).toBe("기다리던 결과가 오면 자동으로 이어가요");
    expect(screen.getByText(/기다리는 것 배포 완료, 리뷰 결과/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/internal-reason-xyz|ci-bot|external_dependency/);
    expect(document.querySelector(".goal-summary__hint[data-needed]")).toBeNull();
  });

  it("외부 의존성 이름이 많거나 길면 줄여서 보여 준다", () => {
    const deps = ["가", "나", "다", "라", "마"].map((t) => ({ target: t }));
    render(<GoalSummaryBar summary={make({ phase: "waiting", wait_type: "external_dependency", waiting_dependencies: deps, has_owner: true })} />);
    expect(screen.getByText(/기다리는 것 가, 나, 다 외 2개/)).toBeTruthy();
  });

  it("계정 한도 대기: 한도 대기로 보이고 재개 시각을 안내하며 조치 필요로 보이지 않는다", () => {
    render(<GoalSummaryBar summary={make({ ...waitingBase, wait_type: "usage_limit", has_owner: true })} />);
    expect(badge()).toBe("한도 대기");
    expect(hint()).toMatch(/에 자동으로 이어가요/);
    expect(document.querySelector(".goal-summary__hint[data-needed]")).toBeNull();
  });

  it("계정 한도 대기인데 시각이 없으면 한도가 풀리면 이어간다고 안내한다", () => {
    render(<GoalSummaryBar summary={make({ phase: "waiting", wait_type: "usage_limit", waiting_until: null, has_owner: true })} />);
    expect(hint()).toBe("한도가 풀리면 자동으로 이어가요");
  });

  it("자동 재개 예정: 새 백엔드가 대기 이유 없이(wait_type=null) 대기 시각만 주면 자동 재개 예정", () => {
    render(<GoalSummaryBar summary={make({ ...waitingBase, wait_type: null, has_owner: true })} />);
    expect(badge()).toBe("자동 재개 예정");
    expect(hint()).toMatch(/에 자동으로 이어가요/);
  });

  it("일부 요구 장애: 일부 막힘으로 보이고 막힌 요구 수와 항목 태그를 보여 준다", () => {
    const pending = [{ id: "B", text: "API 구현", status: "blocked" as const, evidence: "" }, { id: "C", text: "문서", status: "pending" as const, evidence: "" }];
    render(<GoalSummaryBar summary={make({ pending, pending_count: 2, has_partial_failure: true, has_owner: true })} />);
    expect(badge()).toBe("일부 막힘");
    expect(hint()).toBe("막힌 요구가 있어요. 나머지는 계속해요");
    expect(screen.getByText(/막힌 요구 1개/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("API 구현").parentElement?.textContent).toContain("막힘");
  });

  it("대기 중에 일부 요구가 막혀 있어도 대기 상태가 먼저 보이고 장애는 덧붙는다", () => {
    render(<GoalSummaryBar summary={make({ ...waitingBase, wait_type: "usage_limit", has_partial_failure: true, has_owner: true })} />);
    expect(badge()).toBe("한도 대기");
    expect(screen.getByText(/일부 요구가 막혔어요/)).toBeTruthy();
  });

  it("사용자 일시중지: 멈춤이고 has_owner 가 false 여도 멈춤으로 보인다", () => {
    render(<GoalSummaryBar summary={make({ status: "paused", phase: "paused", auto_resumable: false, user_action: "resume", has_owner: false, has_partial_failure: true })} />);
    expect(badge()).toBe("멈춤");
    expect(kind()).toBe("paused");
  });

  it("사용자 확인 필요: 확인 필요가 대기·진행보다 앞선다", () => {
    render(<GoalSummaryBar summary={make({ ...waitingBase, wait_type: "usage_limit", user_action: "review", user_intervention_needed: true, has_owner: true })} />);
    expect(badge()).toBe("확인 필요");
    expect(document.querySelector(".goal-summary__hint[data-needed]")).not.toBeNull();
  });

  it("최종 완료: status=complete 이고 남은 요구와 확인 사항이 없을 때만 완료", () => {
    render(<GoalSummaryBar summary={make({ status: "complete", phase: "complete", pending: [], pending_count: 0, has_owner: false, has_partial_failure: false, wait_type: null })} />);
    expect(badge()).toBe("완료");
    expect(kind()).toBe("complete");
  });
});

describe("GoalSummaryBar 책임자·완료 불변 조건", () => {
  it("active 인데 has_owner=false 면 진행 중으로 보이지 않고 다시 지시하라고 안내한다", () => {
    render(<GoalSummaryBar summary={make({ has_owner: false, running_tasks: [] })} />);
    expect(badge()).not.toBe("진행 중");
    expect(badge()).toBe("이어갈 작업 없음");
    expect(hint()).toBe("진행 중인 작업이 없어요. 다시 지시해 주세요");
    expect(document.querySelector(".goal-summary__hint[data-needed]")).not.toBeNull();
    expect(document.querySelector(".tk-dot--live")).toBeNull();
  });

  it("has_owner=false 면 일부 장애·대기 상태도 진행 중이나 자동 재개로 보이지 않는다", () => {
    expect(goalPhaseView(make({ has_owner: false, has_partial_failure: true }))?.kind).toBe("no_owner");
    expect(goalPhaseView(make({ ...waitingBase, wait_type: null, has_owner: false }))?.kind).toBe("no_owner");
  });

  it("has_owner 필드가 없으면(구버전) 모른다고 보고 기존처럼 진행 중으로 본다", () => {
    expect(goalPhaseView(base)?.label).toBe("진행 중");
  });

  it("status 가 complete 가 아니면 phase=complete 여도 완료로 보이지 않는다", () => {
    for (const status of ["active", "paused", "blocked"] as const) {
      expect(goalPhaseView(make({ status, phase: "complete" }))?.label).not.toBe("완료");
    }
    expect(goalPhaseView(make({ status: "active", phase: "complete" }))?.label).toBe("진행 중");
  });

  it("status=complete 라도 남은 요구가 있으면 완료가 아니라 확인 필요", () => {
    expect(goalPhaseView(make({ status: "complete", phase: "complete" }))?.label).toBe("확인 필요");
  });

  it("모르는 status 는 그리지 않는다", () => {
    const { container } = render(<GoalSummaryBar summary={make({ status: "archived" as GoalSummary["status"] })} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("GoalSummaryBar 하위 호환·용어 노출", () => {
  it("새 필드가 없는 이전 백엔드 응답: 기존대로 그려지고 깨지지 않는다", () => {
    const legacy = { ...base } as Record<string, unknown>;
    for (const k of ["wait_type", "waiting_dependencies", "has_partial_failure", "has_owner"]) expect(k in legacy).toBe(false);
    render(<GoalSummaryBar summary={legacy as unknown as GoalSummary} />);
    expect(badge()).toBe("진행 중");
    expect(screen.getByText("내 조치는 필요 없어요")).toBeTruthy();
  });

  it("이전 백엔드의 waiting 은 이유를 몰라 대기 중, 거짓 이유를 만들지 않는다", () => {
    render(<GoalSummaryBar summary={make(waitingBase)} />);
    expect(badge()).toBe("대기 중");
  });

  it("waiting_dependencies 가 배열이 아니거나 항목이 이상해도 깨지지 않는다", () => {
    const weird = make({ phase: "waiting", wait_type: "external_dependency", has_owner: true, waiting_dependencies: [null, { target: 3 }, {}] as unknown as GoalSummary["waiting_dependencies"] });
    expect(() => render(<GoalSummaryBar summary={weird} />)).not.toThrow();
    cleanup();
    const notArray = make({ phase: "waiting", wait_type: "external_dependency", has_owner: true, waiting_dependencies: "x" as unknown as GoalSummary["waiting_dependencies"] });
    expect(() => render(<GoalSummaryBar summary={notArray} />)).not.toThrow();
    expect(badge()).toBe("결과 대기");
  });

  it("모르는 blocker_kind 는 내부 코드를 그대로 보이지 않는다", () => {
    render(<GoalSummaryBar summary={make({ status: "blocked", phase: "blocked", user_action: "intervene", user_intervention_needed: true, blocker_kind: "internal_code_zzz" })} />);
    expect(document.body.textContent).not.toMatch(/internal_code_zzz/);
    expect(screen.getByText(/막혀 있어요/)).toBeTruthy();
  });
});
