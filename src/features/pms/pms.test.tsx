import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { PmsMilestone, PmsProject, PmsTask } from "../../api/types";
import { FEATURES, moreFeatures } from "../../shell/features";
import { addDays, diffDays, dueText, rangeText, shortDate, todayStr } from "./dates";
import { toCsv, taskRows, EXPORT_HEADER } from "./export";
import { DAY_W, barOf, chartRange, dayMarks, dragDates, monthMarks, snapDays } from "./ganttMath";
import { progressTone } from "./ProjectList";
import { parsePredecessors, visibleTasks } from "./WbsTable";

const h = vi.hoisted(() => ({ listPmsProjects: vi.fn(), listPmsTasks: vi.fn(), patchPmsTask: vi.fn(), createPmsProject: vi.fn(), getPmsProject: vi.fn() }));
vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  listPmsProjects: (...a: unknown[]) => h.listPmsProjects(...a),
  listPmsTasks: (...a: unknown[]) => h.listPmsTasks(...a),
  patchPmsTask: (...a: unknown[]) => h.patchPmsTask(...a),
  createPmsProject: (...a: unknown[]) => h.createPmsProject(...a),
  getPmsProject: (...a: unknown[]) => h.getPmsProject(...a),
}));
vi.mock("../../shell/PageHeader", () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));

import { Board } from "./Board";
import { ProjectList } from "./ProjectList";

beforeEach(() => {
  // jsdom 에는 dialog.showModal 이 없다. 계약(open 속성)만 흉내 낸다.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const task = (over: Partial<PmsTask> & Pick<PmsTask, "id" | "wbs" | "title">): PmsTask => ({
  project_id: "p1", parent_id: null, position: 0, depth: over.wbs.split(".").length - 1, has_children: false, description: "", priority: "normal",
  assignee: null, status: "todo", progress: 0, start_date: null, end_date: null, dates_rollup: false, overdue: false, predecessors: [],
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", done_at: null, ...over,
});
const project = (over: Partial<PmsProject> = {}): PmsProject => ({
  id: "p1", name: "웹 리뉴얼", description: "설명", scope: "personal", status: "active", start_date: "2026-10-01", end_date: "2026-10-31", members: ["민수"],
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", progress: 40,
  counts: { total: 5, todo: 2, doing: 1, review: 0, done: 2, overdue: 1, due_soon: 1, no_dates: 0 }, next_milestone: null, open_notes: 2, ...over,
});

const wrap = (ui: React.ReactNode, at = "/pms") => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/pms" element={ui} />
          <Route path="/pms/:id" element={<p>프로젝트 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("진입점", () => {
  it("PMS·WBS 가 기능 목록과 모바일 더보기에 모두 있다", () => {
    expect(FEATURES.find((f) => f.root === "pms")?.to).toBe("/pms");
    expect(FEATURES.find((f) => f.root === "wbs")?.to).toBe("/wbs");
    expect(moreFeatures().map((f) => f.root)).toEqual(expect.arrayContaining(["pms", "wbs"]));
  });
});

describe("날짜 도우미", () => {
  it("시간대·서머타임과 무관하게 일수를 센다", () => {
    expect(diffDays("2026-03-07", "2026-03-09")).toBe(2);
    expect(diffDays("2024-02-28", "2024-03-01")).toBe(2); // 윤년
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("표시 문구", () => {
    expect(todayStr(new Date(2026, 9, 3))).toBe("2026-10-03");
    expect(shortDate("2026-10-03")).toBe("10/3");
    expect(rangeText("2026-10-01", "2026-10-13")).toBe("10/1 – 10/13");
    expect(rangeText("2026-10-01", "2026-10-01")).toBe("10/1");
    expect(rangeText(null, null)).toBe("");
    expect(dueText(0)).toBe("오늘 마감");
    expect(dueText(3)).toBe("D-3");
    expect(dueText(-2)).toBe("2일 지남");
    expect(dueText(null)).toBe("");
  });
});

describe("간트 계산", () => {
  const tasks = [task({ id: "a", wbs: "1", title: "A", start_date: "2026-10-07", end_date: "2026-10-20" })];
  const ms: PmsMilestone[] = [{ id: "m", project_id: "p1", title: "출시", due_date: "2026-11-10", done: false, days: 28, overdue: false }];

  it("범위는 작업·마일스톤·오늘을 모두 담고 월요일에 시작한다", () => {
    const r = chartRange(tasks, ms, null, "2026-10-13");
    expect(new Date(r.start + "T00:00:00Z").getUTCDay()).toBe(1);
    expect(diffDays(r.start, "2026-10-07")).toBeGreaterThanOrEqual(3);
    expect(diffDays("2026-11-10", r.end)).toBeGreaterThanOrEqual(7);
    expect(r.days).toBe(diffDays(r.start, r.end) + 1);
  });
  it("날짜가 하나도 없어도 4주는 보여 준다", () => {
    expect(chartRange([], [], null, "2026-10-13").days).toBeGreaterThanOrEqual(28);
  });
  it("막대 위치: 시작·종료 양 끝 포함, 한쪽만 있으면 하루, 없으면 null", () => {
    const r = chartRange(tasks, [], null, "2026-10-13");
    const b = barOf(tasks[0], r, 10)!;
    expect(b.width).toBe(14 * 10);
    expect(b.left).toBe(diffDays(r.start, "2026-10-07") * 10);
    expect(barOf({ start_date: "2026-10-07", end_date: null }, r, 10)!.width).toBe(10);
    expect(barOf({ start_date: null, end_date: null }, r, 10)).toBeNull();
  });
  it("끌기: 이동·시작 늘이기·종료 줄이기, 뒤집히면 하루로", () => {
    expect(snapDays(26, 16)).toBe(2);
    expect(snapDays(7, 16)).toBe(0);
    expect(dragDates("2026-10-07", "2026-10-09", "move", 3)).toEqual({ start: "2026-10-10", end: "2026-10-12" });
    expect(dragDates("2026-10-07", "2026-10-09", "start", -2)).toEqual({ start: "2026-10-05", end: "2026-10-09" });
    expect(dragDates("2026-10-07", "2026-10-09", "start", 5)).toEqual({ start: "2026-10-09", end: "2026-10-09" });
    expect(dragDates("2026-10-07", "2026-10-09", "end", -5)).toEqual({ start: "2026-10-07", end: "2026-10-07" });
  });
  it("눈금 폭의 합이 전체 폭과 같다", () => {
    const r = chartRange(tasks, ms, null, "2026-10-13");
    const w = DAY_W.week;
    expect(monthMarks(r, w).reduce((a, m) => a + m.width, 0)).toBe(r.days * w);
    expect(dayMarks(r, "day")).toHaveLength(r.days);
  });
});

describe("내보내기", () => {
  const list = [
    task({ id: "a", wbs: "1", title: "기획, 설계", description: '그는 "좋다"고 했다\n둘째 줄', assignee: "민수", status: "done", progress: 100, start_date: "2026-10-01", end_date: "2026-10-03" }),
    task({ id: "b", wbs: "1.1", title: "=SUM(A1)", predecessors: ["a"], priority: "high" }),
  ];
  it("선행 작업은 번호로 적고 상태·우선순위는 한글이다", () => {
    const rows = taskRows(list);
    expect(rows[1][7]).toBe("1");
    expect(rows[0][3]).toBe("완료");
    expect(rows[1][8]).toBe("높음");
  });
  it("CSV: BOM, 쉼표·따옴표·줄바꿈 이스케이프, 수식으로 읽힐 글자 방지", () => {
    const csv = toCsv([[...EXPORT_HEADER], ...taskRows(list)]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"기획, 설계"');
    expect(csv).toContain('"그는 ""좋다""고 했다\n둘째 줄"');
    expect(csv).toContain(",'=SUM(A1),");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("WBS 표 도우미", () => {
  const list = [
    task({ id: "a", wbs: "1", title: "A", has_children: true }),
    task({ id: "a1", wbs: "1.1", title: "A1", parent_id: "a", has_children: true }),
    task({ id: "a11", wbs: "1.1.1", title: "A11", parent_id: "a1" }),
    task({ id: "a2", wbs: "1.2", title: "A2", parent_id: "a" }),
    task({ id: "b", wbs: "2", title: "B" }),
  ];
  it("접은 상위 작업 아래 줄을 숨긴다", () => {
    expect(visibleTasks(list, new Set()).map((t) => t.wbs)).toEqual(["1", "1.1", "1.1.1", "1.2", "2"]);
    expect(visibleTasks(list, new Set(["a1"])).map((t) => t.wbs)).toEqual(["1", "1.1", "1.2", "2"]);
    expect(visibleTasks(list, new Set(["a"])).map((t) => t.wbs)).toEqual(["1", "2"]);
  });
  it("선행 작업 번호 입력을 id 로 바꾸고 모르는 번호는 따로 돌려준다", () => {
    expect(parsePredecessors("1.1, 1.2  2", list)).toEqual({ ids: ["a1", "a2", "b"], unknown: [] });
    expect(parsePredecessors("1.1,9.9", list)).toEqual({ ids: ["a1"], unknown: ["9.9"] });
    expect(parsePredecessors("", list)).toEqual({ ids: [], unknown: [] });
  });
});

describe("진행 막대 색", () => {
  it("기간보다 많이 뒤처졌을 때만 경고색", () => {
    expect(progressTone(40, 40, 0)).toBeUndefined();
    expect(progressTone(40, 40, 3)).toBeUndefined(); // 지연 작업이 있어도 일정대로면 칠하지 않는다
    expect(progressTone(20, 40, 0)).toBe("warning");
    expect(progressTone(40, 46, 1)).toBe("warning");
    expect(progressTone(10, 60, 0)).toBe("danger");
    expect(progressTone(10, null, 5)).toBeUndefined();
  });
});

describe("프로젝트 목록 화면", () => {
  it("프로젝트 카드에 진행률·지연·이슈를 보이고 눌러 들어간다", async () => {
    h.listPmsProjects.mockResolvedValue({ projects: [project()] });
    wrap(<ProjectList base="pms" />);
    const link = await screen.findByRole("link", { name: /웹 리뉴얼/ });
    expect(link.getAttribute("href")).toBe("/pms/p1");
    expect(within(link).getByText("40%")).toBeTruthy();
    expect(within(link).getByText("지연 1")).toBeTruthy();
    expect(within(link).getByText("이슈 2")).toBeTruthy();
    fireEvent.click(link);
    expect(await screen.findByText("프로젝트 화면")).toBeTruthy();
  });
  it("프로젝트가 없으면 만들기를 안내한다", async () => {
    h.listPmsProjects.mockResolvedValue({ projects: [] });
    wrap(<ProjectList base="wbs" />);
    expect(await screen.findByText("아직 프로젝트가 없어요")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "WBS" })).toBeTruthy();
  });
  it("새 프로젝트: 이름이 없으면 막고, 기본 단계와 함께 만든다", async () => {
    h.listPmsProjects.mockResolvedValue({ projects: [] });
    h.createPmsProject.mockResolvedValue(project({ id: "new" }));
    wrap(<ProjectList base="pms" />);
    await screen.findByText("아직 프로젝트가 없어요");
    fireEvent.click(screen.getAllByRole("button", { name: /새 프로젝트/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "만들기" }));
    expect(await screen.findByText("프로젝트 이름을 적어 주세요.")).toBeTruthy();
    expect(h.createPmsProject).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "새 일" } });
    fireEvent.click(screen.getByRole("button", { name: "만들기" }));
    await waitFor(() => expect(h.createPmsProject).toHaveBeenCalled());
    const body = h.createPmsProject.mock.calls[0][0];
    expect(body.name).toBe("새 일");
    expect(body.phases).toEqual(["기획", "설계", "구현", "테스트", "출시"]);
    expect(await screen.findByText("프로젝트 화면")).toBeTruthy();
  });
});

describe("칸반", () => {
  const list = [
    task({ id: "a", wbs: "1", title: "단계", has_children: true }),
    task({ id: "a1", wbs: "1.1", title: "할 작업", parent_id: "a", status: "todo", assignee: "민수" }),
    task({ id: "a2", wbs: "1.2", title: "하는 중", parent_id: "a", status: "doing", progress: 50 }),
    task({ id: "a3", wbs: "1.3", title: "끝난 일", parent_id: "a", status: "done", progress: 100, done_at: "2026-10-10T00:00:00Z" }),
  ];
  it("말단 작업만 상태별 칸에 놓이고 상위 작업은 카드가 아니다", async () => {
    h.listPmsTasks.mockResolvedValue({ tasks: list });
    wrap(<Board project={project()} />);
    expect(await screen.findByText("할 작업")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^1 단계/ })).toBeNull();
    const todo = screen.getByRole("region", { name: /^할 일/ });
    expect(within(todo).getByText("할 작업")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /^진행/ })).getByText("하는 중")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /^완료/ })).getByText("끝난 일")).toBeTruthy();
  });
  it("카드 메뉴로 다른 칸으로 옮기면 상태만 바꿔 저장한다", async () => {
    h.listPmsTasks.mockResolvedValue({ tasks: list });
    h.patchPmsTask.mockResolvedValue({ task: { ...list[1], status: "review" }, tasks: list });
    wrap(<Board project={project()} />);
    await screen.findByText("할 작업");
    fireEvent.click(screen.getByRole("button", { name: "할 작업 옮기기" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "검토(으)로" }));
    await waitFor(() => expect(h.patchPmsTask).toHaveBeenCalledWith("a1", { status: "review" }));
  });
  it("담당자로 거른다", async () => {
    h.listPmsTasks.mockResolvedValue({ tasks: list });
    wrap(<Board project={project()} />);
    await screen.findByText("할 작업");
    fireEvent.click(screen.getByRole("button", { name: /민수/ }));
    expect(screen.getByText("할 작업")).toBeTruthy();
    expect(screen.queryByText("하는 중")).toBeNull();
  });
});
