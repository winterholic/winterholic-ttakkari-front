import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";

const h = vi.hoisted(() => ({
  summary: vi.fn(), search: vi.fn(), item: vi.fn(), layers: vi.fn(), group: vi.fn(), projects: vi.fn(), project: vi.fn(),
}));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  getHarnessSummary: (...a: unknown[]) => h.summary(...a),
  searchHarness: (...a: unknown[]) => h.search(...a),
  getHarnessItem: (...a: unknown[]) => h.item(...a),
  getHarnessLayers: (...a: unknown[]) => h.layers(...a),
  getHarnessGroup: (...a: unknown[]) => h.group(...a),
  getHarnessProjects: (...a: unknown[]) => h.projects(...a),
  getHarnessProject: (...a: unknown[]) => h.project(...a),
}));
import { HarnessPage } from "./HarnessPage";
import { FEATURES } from "../shell/features";
import { formatAge, highlightParts } from "../features/harness/labels";

const counts = (total: number, missing = 0, warnings = 0) => ({ total, present: total - missing, missing, inactive: 0, warnings });
const card = (id: string, label: string, short: string, kind: string, total: number, extra: Record<string, unknown> = {}) => ({
  id, label, short, kind, blurb: `${label} 설명`, ...counts(total, 1, id === "claude" ? 2 : 0), exists: total > 1,
  concerns: [{ id: "instruction", label: "지침", total: 2, present: 2 }, { id: "skill", label: "스킬", total: total - 2, present: total - 2 }], ...extra,
});
const summary = {
  generated_at: 1_792_000_000, total: 579, present: 570,
  categories: [{ id: "skill", label: "스킬", total: 322, present: 321, missing: 1, inactive: 4, warnings: 2 }],
  engines: [{ id: "claude", total: 340 }], scopes: [{ id: "global", total: 400 }],
  warning_total: 2, warning_kinds: { broken_ref: 1, duplicate: 1, too_long: 0, other: 0 },
  warnings: [
    { item_id: "aaaaaaaaaaaaaa", name: "harness-engineering", category: "skill", engine: "claude", kind: "broken_ref", message: "깨진 참조: ~/.claude/skills/x.md", count: 1 },
    { item_id: "bbbbbbbbbbbbbb", name: "skill-creator", category: "skill", engine: "claude", kind: "duplicate", message: "중복 이름 3곳", count: 3 },
  ],
  session_kinds: ["desk", "lead", "worker", "orchestrator"], layer_engines: ["claude", "codex", "antigravity", "muse", "qwen-local"],
  groups: [
    card("claude", "Claude 하네스", "Claude", "main", 330),
    card("codex", "Codex 하네스", "Codex", "main", 18),
    card("muse", "Muse 하네스", "Muse", "main", 34),
    card("qwen", "Qwen Code 하네스", "Qwen Code", "main", 14),
    card("antigravity", "Antigravity 하네스", "Antigravity", "main", 45),
    card("ttakkari", "따까리 하네스", "따까리", "ttakkari", 194),
    card("projects", "프로젝트별 하네스", "프로젝트", "projects", 46, { projects: 16, company_projects: 3 }),
  ],
  labels: { concerns: { instruction: "지침", skill: "스킬" }, layers: { user: "사용자 전역" }, groups: {} },
};
const row = {
  id: "aaaaaaaaaaaaaa", category: "skill", name: "handoff", group: "스킬", description: "현재 대화를 인계 문서로 작성한다.",
  scope: "global", engine: "claude", sessions: ["lead", "worker"], source: "file", path: "~/.claude/skills/handoff/SKILL.md",
  mtime: 1_791_000_000, present: true, active: true, active_note: "프롬프트의 스킬 목록에 노출", kind: "markdown",
  chars: 4200, lines: 90, masked: 0, warnings: [], alias_of: null,
  hgroup: "claude", concern: "skill", layer: "user", project: "", pool: "",
  crumb: [{ kind: "group", id: "claude", label: "Claude 하네스" }, { kind: "concern", id: "skill", label: "스킬" }],
};
const missing = {
  ...row, id: "cccccccccccccc", name: "GEMINI.md", category: "instruction", engine: "antigravity", present: false, active: false, active_note: "파일 없음",
  chars: 0, lines: 0, mtime: null, description: "Gemini 지침", sessions: [], hgroup: "antigravity", concern: "instruction",
  crumb: [{ kind: "group", id: "antigravity", label: "Antigravity 하네스" }, { kind: "concern", id: "instruction", label: "지침" }],
};
const detail = {
  ...row, body: "# 인계\n\n본문 내용입니다. token [REDACTED]", offset: 0, next_offset: null, truncated_source: false, real_path: null,
  frontmatter: { name: "handoff", description: "현재 대화를 다음 세션이 이어받을 인계 문서로 작성한다." }, meta: {}, masked: 2,
  warnings: ["깨진 참조: gone.md"], layer_label: "사용자 전역",
  counterparts: {
    items: [{ id: "cccccccccccccc", name: "GEMINI.md", engine: "antigravity", hgroup: "antigravity", label: "Antigravity", present: false, path: null }],
    concerns: [{ hgroup: "codex", engine: "codex", label: "Codex", concern: "skill", project: "", total: 1 }],
  },
};
const groupDetail = {
  id: "claude", label: "Claude 하네스", kind: "main", blurb: "Claude Code 전역 설정", ...counts(330, 1, 2), exists: true,
  concerns: [
    { id: "instruction", label: "지침", ...counts(2), exists: true }, { id: "skill", label: "스킬", ...counts(290), exists: true },
    { id: "agent", label: "에이전트·커맨드", ...counts(2, 2), exists: false },
  ],
  layers: [
    { id: "user", label: "사용자 전역", note: "엔진 CLI 가 사용자 단위로 읽는 설정", order: 1, evidence: "external", applies: true, ...counts(328), concerns: { instruction: 2, skill: 290 } },
    { id: "account", label: "따까리 계정 폴더", note: "계정마다 CLAUDE_CONFIG_DIR", order: 2, evidence: "code", applies: true, ...counts(0), concerns: {} },
    { id: "project", label: "프로젝트", note: "작업 디렉터리의 프로젝트 파일", order: 3, evidence: "external", applies: true, ...counts(0), concerns: {},
      link: { group: "projects", label: "프로젝트별 하네스에서 보기", total: 30, projects: 13 } },
    { id: "session", label: "세션 주입(따까리)", note: "따까리가 Run 마다 얹는다", order: 4, evidence: "code", applies: true, ...counts(0), concerns: {},
      injection: [{ id: "claude_flag", title: "--append-system-prompt 로 합본 전달", phase: "delivery", applies: true, evidence: "code", condition: "", item_id: null, source: "agents/claude.py" }] },
  ],
  notes: [],
};
const projects = {
  total: 2, scanned: 5, company: 1, without_harness: ["projects/bare", "projects/games"],
  projects: [
    { key: "hyperez/ezwork", name: "ezwork", container: "hyperez", pool: "company", ...counts(3), engines: { claude: 2, codex: 1 }, concerns: { instruction: 3 } },
    { key: "projects/aip", name: "aip", container: "projects", pool: "personal", ...counts(8, 0, 1), engines: { claude: 3, codex: 3, shared: 2 }, concerns: { instruction: 6 } },
  ],
};
const projectRow = { ...row, id: "pppppppppppppp", name: "CLAUDE.md", category: "instruction", scope: "project", hgroup: "projects", concern: "instruction", layer: "root", project: "projects/aip", pool: "personal", group: "projects/aip" };
const projectDetail = {
  key: "projects/aip", name: "aip", pool: "personal", ...counts(2),
  engines: [
    { id: "claude", label: "Claude", ...counts(1), concerns: [{ id: "instruction", label: "지침", total: 1, items: [projectRow], truncated: false }] },
    { id: "codex", label: "Codex", ...counts(1), concerns: [{ id: "instruction", label: "지침", total: 1, items: [{ ...projectRow, id: "qqqqqqqqqqqqqq", name: "AGENTS.md", engine: "codex", layer: "nested" }], truncated: false }] },
  ],
};
const layers = {
  session: "lead", session_label: "기획", engine: "claude", pool: "personal", prompt_chars: 16657, applied: 2, total: 3, external: 1, notes: ["레이어 본문은 실제 주입 함수가 만든 것이다."],
  layers: [
    { order: 1, id: "system_note", title: "기본 안내", origin: "code", source: "runs/manager.py SYSTEM_NOTE", applies: true, condition: "", evidence: "code", phase: "prompt", chars: 925, preview: "You are running unattended", item_id: "dddddddddddddd" },
    { order: 2, id: "common_instructions", title: "사용자 공통 지침", origin: "file", source: "~/.ttakkari/harness/instructions.md", applies: false, condition: "비어 있거나 파일 없음: 합쳐지지 않는다", evidence: "code", phase: "prompt", chars: 0, preview: "", item_id: null },
    { order: 3, id: "claude_user_md", title: "~/.claude/CLAUDE.md", origin: "cli", source: "Claude Code 가 로드", applies: true, condition: "", evidence: "external", phase: "load", chars: 0, preview: "", item_id: "eeeeeeeeeeeeee" },
  ],
};

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}{l.search}</output>;
}
function mount(path = "/harness") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><HarnessPage /><Where /></MemoryRouter>
  </QueryClientProvider>);
}
const where = () => screen.getByTestId("where").textContent ?? "";
beforeEach(() => {
  h.summary.mockResolvedValue(summary);
  h.search.mockResolvedValue({ total: 2, items: [row, missing], next_cursor: null, facets: { groups: [] } });
  h.item.mockResolvedValue(detail);
  h.layers.mockResolvedValue(layers);
  h.group.mockResolvedValue(groupDetail);
  h.projects.mockResolvedValue(projects);
  h.project.mockResolvedValue(projectDetail);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("부가 기능에서 발견되고 첫 화면에 7개 그룹 카드를 보여 준다", async () => {
  expect(FEATURES.find((f) => f.root === "harness")?.to).toBe("/harness");
  mount();
  const cards = await screen.findAllByRole("button", { name: /하네스 열기$/ });
  expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual([
    "Claude 하네스 열기", "Codex 하네스 열기", "Muse 하네스 열기", "Qwen Code 하네스 열기", "Antigravity 하네스 열기", "따까리 하네스 열기", "프로젝트별 하네스 열기",
  ]);
  const claude = cards[0].textContent ?? "";
  expect(claude).toContain("설정 있음");
  expect(claude).toContain("항목 330");
  expect(claude).toContain("경고 2");
  expect(cards[6].textContent).toContain("프로젝트 16개");
  expect(cards[6].textContent).toContain("회사 3");
  expect(screen.getAllByText("579").length).toBeGreaterThan(0);
  expect(h.search).not.toHaveBeenCalled();
});

it("읽기 전용이다: 편집·저장 컨트롤이 없다", async () => {
  mount("/harness?g=claude&c=skill&item=aaaaaaaaaaaaaa");
  await screen.findByRole("heading", { name: "handoff" });
  expect(screen.queryByRole("textbox", { name: /편집|수정/ })).toBeNull();
  expect(document.querySelector("textarea")).toBeNull();
  expect(screen.queryByRole("button", { name: /저장|삭제|수정|편집/ })).toBeNull();
});

it("그룹 카드를 열면 레이어 스택과 관심사별 목록을 보여 준다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Claude 하네스 열기" }));
  expect(where()).toContain("g=claude");
  const items = await screen.findAllByRole("heading", { level: 3 });
  expect(items.map((i) => i.textContent)).toEqual(["사용자 전역", "따까리 계정 폴더", "프로젝트", "세션 주입(따까리)"]);
  const region = screen.getByRole("region", { name: "레이어 스택" });
  const cards = within(region).getAllByRole("listitem").filter((li) => li.classList.contains("hv-stack__item"));
  expect(cards).toHaveLength(4);
  expect(cards[0].textContent).toContain("엔진 동작 · 확인 필요");
  expect(cards[3].textContent).toContain("코드로 확인");
  expect(cards[2].textContent).toContain("프로젝트별 하네스에서 보기 · 13개 프로젝트 30개 항목");
  expect(cards[3].textContent).toContain("--append-system-prompt 로 합본 전달");
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ hgroup: "claude", concern: "instruction" })));
  // 존재하는 관심사만 값이 있고, 없는 관심사는 "없음"으로 흐리게
  const chips = screen.getByRole("group", { name: "관심사" });
  expect(within(chips).getByRole("button", { name: /에이전트·커맨드 없음/ })).toBeTruthy();
  fireEvent.click(within(chips).getByRole("button", { name: /스킬 290/ }));
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ hgroup: "claude", concern: "skill" })));
  expect(where()).toContain("c=skill");
});

it("레이어 칩을 누르면 그 레이어·관심사의 항목만 본다", async () => {
  mount("/harness?g=claude");
  const layerChips = await screen.findByRole("group", { name: "사용자 전역의 관심사" });
  fireEvent.click(within(layerChips).getByRole("button", { name: /스킬 290/ }));
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ hgroup: "claude", concern: "skill", layer: "user" })));
  expect(where()).toContain("l=user");
  expect(screen.getByText("레이어:").parentElement?.textContent).toContain("사용자 전역");
  fireEvent.click(screen.getByRole("button", { name: "해제" }));
  await waitFor(() => expect(where()).not.toContain("l=user"));
});

it("프로젝트 레이어의 링크는 프로젝트별 하네스로 간다", async () => {
  mount("/harness?g=claude");
  fireEvent.click(await screen.findByRole("button", { name: /프로젝트별 하네스에서 보기/ }));
  expect(where()).toContain("g=projects");
  expect(await screen.findByRole("heading", { name: /개인 프로젝트/ })).toBeTruthy();
});

it("프로젝트별: 회사 프로젝트를 먼저·배지로 구분하고 프로젝트 → 엔진 → 관심사로 본다", async () => {
  mount("/harness?g=projects");
  const company = await screen.findByRole("button", { name: "hyperez/ezwork 열기" });
  expect(company.textContent).toContain("회사");
  expect(screen.getByRole("button", { name: "projects/aip 열기" }).textContent).toContain("개인");
  expect(screen.getByText(/프로젝트 5개를 살펴보니 하네스 파일이 있는 프로젝트는 2개/)).toBeTruthy();
  expect(screen.getByText("하네스 파일이 없는 프로젝트 2개")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "projects/aip 열기" }));
  expect(where()).toContain("p=projects%2Faip");
  expect(await screen.findByRole("heading", { name: "aip" })).toBeTruthy();
  const claude = await screen.findByRole("region", { name: "Claude 항목" });
  expect(within(claude).getByText("지침")).toBeTruthy();
  expect(within(claude).getByRole("button", { name: /CLAUDE\.md/ }).textContent).toContain("프로젝트 루트");
  const codex = screen.getByRole("region", { name: "Codex 항목" });
  expect(within(codex).getByRole("button", { name: /AGENTS\.md/ }).textContent).toContain("하위 폴더");
  fireEvent.click(within(claude).getByRole("button", { name: /CLAUDE\.md/ }));
  expect(where()).toContain("item=pppppppppppppp");
  expect(where()).toContain("p=projects%2Faip");
});

it("통합 검색은 머리글의 검색 아이콘으로 열고 결과에 그룹 › 관심사 경로를 보여 준다", async () => {
  mount();
  await screen.findAllByRole("button", { name: /하네스 열기$/ });
  expect(screen.queryByRole("searchbox", { name: "하네스 검색" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  expect(where()).toContain("find=1");
  fireEvent.change(await screen.findByRole("searchbox", { name: "하네스 검색" }), { target: { value: "launchctl" } });
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ q: "launchctl" })));
  expect(where()).toContain("q=launchctl");
  const first = await screen.findByRole("button", { name: /^Claude 하네스 › 스킬/ });
  expect(first.textContent).toContain("handoff");
  expect(screen.getByRole("button", { name: /^Antigravity 하네스 › 지침/ })).toBeTruthy();
  fireEvent.click(within(screen.getByRole("group", { name: "그룹 범위" })).getByRole("button", { name: "Muse" }));
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ hgroup: "muse", q: "launchctl" })));
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  expect(where()).not.toContain("find=1");
  expect(where()).not.toContain("q=");
});

it("항목을 열면 경로·레이어·description 강조·마스킹 안내·경고·대응 항목을 보여 준다", async () => {
  mount("/harness?g=claude&c=skill");
  fireEvent.click(await screen.findByRole("button", { name: /^handoff/ }));
  expect(await screen.findByRole("heading", { name: "handoff" })).toBeTruthy();
  const callout = screen.getByLabelText("설명");
  expect(callout.textContent).toContain("frontmatter description");
  expect(callout.textContent).toContain("다음 세션이 이어받을");
  expect(screen.getAllByText("~/.claude/skills/handoff/SKILL.md").length).toBeGreaterThan(0);
  expect(screen.getByText(/값 2곳을 가렸어요/)).toBeTruthy();
  expect(screen.getByLabelText("경고").textContent).toContain("깨진 참조: gone.md");
  expect(screen.getByText("프롬프트의 스킬 목록에 노출")).toBeTruthy();
  expect(where()).toContain("item=aaaaaaaaaaaaaa");
  expect(where()).toContain("g=claude");
  expect(h.item).toHaveBeenCalledWith("aaaaaaaaaaaaaa", 0);
  const crumbs = screen.getByRole("navigation", { name: "경로" });
  expect(within(crumbs).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Claude 하네스", "스킬", "handoff"]);
  expect(screen.getAllByText("사용자 전역").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "원문 보기" }));
  expect(screen.getByLabelText("원문").textContent).toContain("[REDACTED]");
});

it("경로의 그룹 칸을 누르면 그 그룹 화면으로, 대응 항목은 그 항목으로 이동한다", async () => {
  mount("/harness?g=claude&c=skill&item=aaaaaaaaaaaaaa");
  await screen.findByRole("navigation", { name: "경로" });
  const counter = screen.getByRole("region", { name: "같은 레이어의 다른 엔진" });
  expect(counter.textContent).toContain("Antigravity · GEMINI.md");
  expect(counter.textContent).toContain("Codex 의 같은 관심사");
  fireEvent.click(within(counter).getByRole("button", { name: /Antigravity · GEMINI\.md/ }));
  await waitFor(() => expect(where()).toContain("item=cccccccccccccc"));
  expect(where()).toContain("g=antigravity");
  const crumbs = await screen.findByRole("navigation", { name: "경로" });
  fireEvent.click(within(crumbs).getByRole("button", { name: "Claude 하네스" }));
  await waitFor(() => expect(where()).not.toContain("item="));
  expect(where()).toContain("g=claude");
});

it("프로젝트 항목의 경로는 프로젝트 화면으로 돌아간다", async () => {
  h.item.mockResolvedValue({
    ...detail, ...projectRow, layer_label: "프로젝트 루트", counterparts: { items: [], concerns: [] },
    crumb: [{ kind: "group", id: "projects", label: "프로젝트별 하네스" }, { kind: "project", id: "projects/aip", label: "aip" }, { kind: "engine", id: "claude", label: "Claude" }, { kind: "concern", id: "instruction", label: "지침" }],
  });
  mount("/harness?g=projects&p=projects%2Faip&item=pppppppppppppp");
  const crumbs = await screen.findByRole("navigation", { name: "경로" });
  fireEvent.click(within(crumbs).getByRole("button", { name: "aip" }));
  await waitFor(() => expect(where()).not.toContain("item="));
  expect(where()).toContain("p=projects%2Faip");
});

it("긴 본문은 접혀 있고 펼치기·구간 이동을 지원한다", async () => {
  h.item.mockResolvedValue({ ...detail, body: "줄\n".repeat(80), chars: 20000, lines: 81, next_offset: 8000 });
  mount("/harness?g=claude&item=aaaaaaaaaaaaaa");
  const expand = await screen.findByRole("button", { name: "전체 펼치기" });
  expect(document.querySelector(".hv-body__box")?.hasAttribute("data-collapsed")).toBe(true);
  fireEvent.click(expand);
  expect(document.querySelector(".hv-body__box")?.hasAttribute("data-collapsed")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "다음 구간" }));
  await waitFor(() => expect(h.item).toHaveBeenLastCalledWith("aaaaaaaaaaaaaa", 8000));
});

it("경고 요약에서 항목으로 바로 이동한다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /경고 보기/ }));
  expect(screen.getByText("중복 이름 3곳")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /harness-engineering/ }));
  await waitFor(() => expect(where()).toContain("item=aaaaaaaaaaaaaa"));
  expect(await screen.findByRole("heading", { name: "handoff" })).toBeTruthy();
});

it("따까리 하네스의 세션별 레이어: 합쳐지는 레이어를 순서·적용 여부·근거와 함께 보여 준다", async () => {
  h.group.mockResolvedValue({ ...groupDetail, id: "ttakkari", label: "따까리 하네스", layers: [] });
  mount("/harness?g=ttakkari");
  const tabs = await screen.findByRole("navigation", { name: "따까리 하네스 보기" });
  fireEvent.click(within(tabs).getByRole("button", { name: "세션별 레이어" }));
  expect(where()).toContain("v=sessions");
  expect(await screen.findByText(/프롬프트 합본 16,657자/)).toBeTruthy();
  const list = screen.getByRole("list", { name: "적용 순서" });
  const cards = within(list).getAllByRole("listitem");
  expect(cards).toHaveLength(3);
  expect(cards[0].textContent).toContain("기본 안내");
  expect(cards[0].textContent).toContain("코드로 확인");
  expect(cards[1].textContent).toContain("미적용");
  expect(cards[2].textContent).toContain("엔진 동작 · 확인 필요");
  expect(h.layers).toHaveBeenCalledWith("lead", "claude", "personal");
  fireEvent.click(screen.getByRole("button", { name: "작업자" }));
  await waitFor(() => expect(h.layers).toHaveBeenLastCalledWith("worker", "claude", "personal"));
  fireEvent.click(screen.getByRole("button", { name: "회사" }));
  await waitFor(() => expect(h.layers).toHaveBeenLastCalledWith("worker", "claude", "work"));
  fireEvent.change(screen.getByRole("combobox", { name: "엔진 선택" }), { target: { value: "codex" } });
  await waitFor(() => expect(h.layers).toHaveBeenLastCalledWith("worker", "codex", "work"));
  fireEvent.click(screen.getByRole("button", { name: "접수" }));
  await waitFor(() => expect(h.layers).toHaveBeenLastCalledWith("desk", "codex", "work"));
  expect(within(screen.getByRole("combobox", { name: "엔진 선택" })).queryByText("Muse")).toBeNull();
});

it("세션 주입 레이어의 전체 보기는 따까리 하네스의 세션별 레이어를 그 엔진으로 연다", async () => {
  mount("/harness?g=claude");
  fireEvent.click(await screen.findByRole("button", { name: /세션별 레이어 전체 보기/ }));
  expect(where()).toContain("g=ttakkari");
  expect(where()).toContain("v=sessions");
  expect(where()).toContain("le=claude");
});

it("레이어의 상세 보기는 같은 화면에서 항목을 연다", async () => {
  h.group.mockResolvedValue({ ...groupDetail, id: "ttakkari", label: "따까리 하네스", layers: [] });
  mount("/harness?g=ttakkari&v=sessions");
  fireEvent.click((await screen.findAllByRole("button", { name: /원문·상세 보기/ }))[0]);
  await waitFor(() => expect(where()).toContain("item=dddddddddddddd"));
  expect(where()).toContain("g=ttakkari");
});

it("실패하면 이유와 다시 시도를 보여 준다", async () => {
  h.summary.mockRejectedValueOnce(new Error("서버에 연결하지 못했어요."));
  mount();
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("button", { name: "Claude 하네스 열기" })).toBeTruthy();
});

it("검색어 강조와 날짜 표기 도우미", () => {
  expect(highlightParts("Launchctl 와 launchctl", "launchctl").filter((p) => p.hit)).toHaveLength(2);
  expect(highlightParts("abc", "")).toEqual([{ text: "abc", hit: false }]);
  expect(formatAge(Date.now() / 1000 - 86_400 * 3)).toBe("3일 전");
  expect(formatAge(null)).toBe("");
});
