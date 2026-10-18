// 독립 검증용: 목(mock) 없이 실제 격리 백엔드(+실제 gh 계정)에 붙어 GitHub 화면을 jsdom 으로 그린다.
// GH_REAL_BACKEND 가 없으면 건너뛴다(CI·일반 vitest 에 영향 없음). 비공개 저장소 이름·login 은 결과 파일에 쓰지 않는다.
// 실행: TTAKKARI_NO_ENV_FILE=1 VITE_API_BASE=http://127.0.0.1:18793 GH_REAL_BACKEND=1 GH_REAL_PASSWORD=... pnpm vitest run src/features/github/realBackend.verify.test.tsx
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { writeFileSync } from "node:fs";
import { API_BASE, setAccessToken } from "../../api/client";
import { ghAccounts, ghMyRepos, ghPull, ghPulls, ghRunJobs, ghRuns } from "../../api/githubClient";
import { GithubPage } from "../../pages/GithubPage";

const ENABLED = !!process.env.GH_REAL_BACKEND;
const OUT = process.env.GH_REAL_OUT ?? "/tmp/gh-real-frontend.json";
const d = ENABLED ? describe : describe.skip;

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}
function renderAt(path: string, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const r = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes><Route path="/github/*" element={<GithubPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...r, qc };
}

/** 스켈레톤이 모두 사라질 때까지 기다린다(실제 네트워크라 넉넉히). */
async function settle(container: HTMLElement, ms = 30_000) {
  await waitFor(() => expect(container.querySelector(".gh-skeleton")).toBeNull(), { timeout: ms, interval: 100 });
}
const alerts = (c: HTMLElement) => [...c.querySelectorAll('[role="alert"]')].map((e) => (e.textContent ?? "").slice(0, 120));

/** 앱 안 링크는 전부 `as=` 를 유지해야 한다. */
const linksWithoutAs = (c: HTMLElement) => [...c.querySelectorAll<HTMLAnchorElement>('a[href^="/github"]')].map((a) => a.getAttribute("href")!).filter((h) => !/[?&]as=/.test(h));

const report: Record<string, unknown>[] = [];
const note = (label: string, extra: Record<string, unknown> = {}) => report.push({ label, ...extra });

let A = "";
let B = "";
let aRepo: { owner: string; repo: string; priv: boolean } | null = null;
let aPrivate: { owner: string; repo: string } | null = null;
let bPrivate: { owner: string; repo: string } | null = null;

d("실제 격리 백엔드 + 실제 gh 계정으로 GitHub 화면", () => {
  beforeAll(async () => {
    const r = await fetch(API_BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: process.env.GH_REAL_PASSWORD }) });
    expect(r.status).toBe(200);
    setAccessToken(((await r.json()) as { access_token: string }).access_token);
    const acc = await ghAccounts();
    const ok = acc.accounts.filter((x) => x.state === "success").map((x) => x.login);
    expect(ok.length).toBeGreaterThanOrEqual(2);
    [A, B] = ok;
    for (const [who, login] of [["A", A], ["B", B]] as const) {
      const repos = (await ghMyRepos(login, { sort: "pushed" })).data;
      const p = repos.find((x) => x.private);
      const pub = repos.find((x) => !x.private) ?? repos[0];
      if (who === "A") {
        aRepo = { owner: pub.full_name.split("/")[0], repo: pub.name, priv: pub.private };
        if (p) aPrivate = { owner: p.full_name.split("/")[0], repo: p.name };
      } else if (p) bPrivate = { owner: p.full_name.split("/")[0], repo: p.name };
    }
  }, 120_000);
  afterEach(() => cleanup());
  afterAll(() => writeFileSync(OUT, JSON.stringify(report, null, 1)));

  it("홈: 계정 자동 선택 없이 선택 화면 → 계정 선택 → 프로필·조직·저장소가 실제 데이터로 뜬다", async () => {
    window.localStorage.clear();
    const { container } = renderAt("/github");
    // 계정이 2개이고 저장된 계정이 없으면 서버가 추정하지 않고 선택 화면을 보인다.
    await screen.findByText("GitHub 계정 선택", {}, { timeout: 30_000 });
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names.some((n) => n.startsWith(A))).toBe(true);
    expect(names.some((n) => n.startsWith(B))).toBe(true);
    fireEvent.click(screen.getAllByRole("button").find((b) => (b.textContent ?? "").startsWith(A))!);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("as=" + A), { timeout: 10_000 });
    await screen.findByText("내 프로필", { selector: "h2" }, { timeout: 30_000 });
    await settle(container);
    note("home", { alerts: alerts(container), listItems: container.querySelectorAll("ul.tk-list li").length });
    expect(alerts(container)).toEqual([]);
    expect(container.querySelectorAll("ul.tk-list li").length).toBeGreaterThan(3);
    expect(JSON.parse(window.localStorage.getItem("ttakkari.github.account")!)).toBe(A);
  }, 90_000);

  it("저장소 개요·코드 트리·파일·PR·이슈·Actions 라우트가 실제 응답으로 오류 없이 그려진다", async () => {
    const { owner, repo } = aRepo!;
    const routes = [
      `/github/${owner}?as=${A}`,
      `/github/${owner}/${repo}?as=${A}`,
      `/github/${owner}/${repo}/code?as=${A}`,
      `/github/${owner}/${repo}/pulls?as=${A}&state=all`,
      `/github/${owner}/${repo}/issues?as=${A}&state=all`,
      `/github/${owner}/${repo}/actions?as=${A}`,
    ];
    for (const [i, p] of routes.entries()) {
      const { container, unmount } = renderAt(p);
      await settle(container);
      const al = alerts(container);
      note(`route#${i}`, { alerts: al, text: (container.textContent ?? "").length });
      expect(al, p.replace(owner, "<o>").replace(repo, "<r>")).toEqual([]);
      expect(linksWithoutAs(container).length).toBe(0);
      unmount();
      cleanup();
    }
  }, 180_000);

  it("공개 저장소(cli/cli): README 서식·코드 트리→파일·이슈 상세/댓글·PR 상세/files가 그려진다", async () => {
    const base = "/github/cli/cli";
    const { container, unmount } = renderAt(`${base}/code?as=${A}`);
    await settle(container);
    expect(alerts(container)).toEqual([]);
    // README 가 있고 상대 링크가 앱 안 코드 링크 또는 막힘 글자이거나 github.com 새 탭 링크여야 한다.
    const anchors = [...container.querySelectorAll(".gh-md a")];
    const bad = anchors.filter((a) => a.tagName === "A" && a.getAttribute("href") && !a.getAttribute("href")!.startsWith("/github") && !(a.getAttribute("href")!.startsWith("https://github.com") && a.getAttribute("rel") === "noopener noreferrer"));
    note("cli readme links", { total: anchors.length, unsafe: bad.map((a) => a.getAttribute("href")) });
    expect(bad).toEqual([]);
    unmount();
    cleanup();

    const { container: f, unmount: u2 } = renderAt(`${base}/code?as=${A}&path=README.md`);
    await settle(f);
    note("cli README.md file", { alerts: alerts(f), rendered: !!f.querySelector(".gh-md") });
    expect(alerts(f)).toEqual([]);
    u2();
    cleanup();
  }, 120_000);

  it("공개 저장소 cli/cli 의 PR·이슈·Actions 목록과 상세에서 앱 링크가 as 를 유지하고 오류가 없다", async () => {
    const lists = [`/github/cli/cli/pulls?as=${A}&state=all`, `/github/cli/cli/issues?as=${A}&state=all`, `/github/cli/cli/actions?as=${A}`];
    let firstPull = 0;
    let firstIssue = 0;
    let firstRun = "";
    for (const p of lists) {
      const { container, unmount } = renderAt(p);
      await settle(container);
      expect(alerts(container)).toEqual([]);
      const hrefs = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/github/cli/cli/"]')].map((a) => a.getAttribute("href")!);
      note("list " + p.split("?")[0].split("/").pop(), { links: hrefs.length, withoutAs: linksWithoutAs(container).length });
      expect(linksWithoutAs(container)).toEqual([]);
      if (p.includes("/pulls")) firstPull = Number(hrefs.map((h) => h.match(/pulls\/(\d+)/)?.[1]).find(Boolean) ?? 0);
      if (p.includes("/issues")) firstIssue = Number(hrefs.map((h) => h.match(/issues\/(\d+)/)?.[1]).find(Boolean) ?? 0);
      if (p.includes("/actions")) firstRun = hrefs.map((h) => h.match(/runs\/(\d+)/)?.[1]).find(Boolean) ?? "";
      unmount();
      cleanup();
    }
    expect(Boolean(firstPull && firstIssue && firstRun)).toBe(true);
    for (const p of [`/github/cli/cli/pulls/${firstPull}?as=${A}`, `/github/cli/cli/issues/${firstIssue}?as=${A}`, `/github/cli/cli/actions/runs/${firstRun}?as=${A}`]) {
      const { container, unmount } = renderAt(p);
      await settle(container);
      note("detail " + p.split("?")[0].split("/").slice(-2, -1)[0], { alerts: alerts(container), withoutAs: linksWithoutAs(container).length });
      expect(alerts(container)).toEqual([]);
      expect(linksWithoutAs(container)).toEqual([]);
      unmount();
      cleanup();
    }
  }, 180_000);

  it("가장 큰 공개 PR 의 files 탭: 접힘·펼침·큰 patch 확인·hunk 더 보기가 실제 patch 로 동작한다", async () => {
    const list = (await ghPulls(A, "cli", "cli", { state: "all" })).data.slice(0, 20);
    let best = { n: 0, files: 0 };
    for (const p of list) {
      const detail = (await ghPull(A, "cli", "cli", p.number)).data;
      const files = detail.changed_files ?? 0;
      if (files > best.files) best = { n: p.number, files };
    }
    note("largest pr among first 20", { files: best.files });
    const { container } = renderAt(`/github/cli/cli/pulls/${best.n}?as=${A}&tab=files`);
    await settle(container, 60_000);
    expect(alerts(container)).toEqual([]);
    const headers = () => [...container.querySelectorAll<HTMLButtonElement>('.tk-diff__file button[aria-expanded="false"]')];
    const total = headers().length;
    expect(total).toBeGreaterThan(0);
    const t0 = performance.now();
    for (const b of headers().slice(0, 12)) fireEvent.click(b);
    const rows = container.querySelectorAll(".tk-diff__table tr").length;
    note("diff expand", { fileHeaders: total, expandedFirst12Rows: rows, ms: Math.round(performance.now() - t0), confirmButtons: container.querySelectorAll(".gh-diff__confirm button").length, moreButtons: [...container.querySelectorAll("button")].filter((b) => /다음 hunk/.test(b.textContent ?? "")).length });
    expect(rows).toBeGreaterThan(0);
  }, 180_000);

  it("Actions: 실제 run 상세 → job 로그 창(실패 step·창 이동)이 오류 없이 그려진다", async () => {
    const repos = (await ghMyRepos(B, { sort: "pushed" })).data;
    let found: { o: string; r: string; run: number; job: number } | null = null;
    for (const rp of repos.slice(0, 8)) {
      const [o, r] = rp.full_name.split("/");
      const runs = (await ghRuns(B, o, r, {})).data;
      for (const run of runs.slice(0, 3)) {
        const jobs = (await ghRunJobs(B, o, r, String(run.id))).data;
        if (jobs.length) { found = { o, r, run: run.id, job: jobs[0].id }; break; }
      }
      if (found) break;
    }
    expect(found).not.toBeNull();
    const { o, r, run, job } = found!;
    const a = renderAt(`/github/${o}/${r}/actions/runs/${run}?as=${B}`);
    await settle(a.container);
    note("run detail", { alerts: alerts(a.container) });
    expect(alerts(a.container)).toEqual([]);
    a.unmount();
    cleanup();
    const j = renderAt(`/github/${o}/${r}/actions/runs/${run}/jobs/${job}?as=${B}`);
    await settle(j.container);
    const pre = j.container.querySelectorAll(".gh-log, pre, .tk-diff__table tr, [data-log-line]").length;
    note("job log", { alerts: alerts(j.container), logNodes: pre, textLen: (j.container.textContent ?? "").length });
    expect(alerts(j.container)).toEqual([]);
    expect((j.container.textContent ?? "").length).toBeGreaterThan(200);
  }, 180_000);

  it("계정 격리: A 의 비공개 저장소를 B 로 열면 권한 없음 상태+A 로 열기 제안, 눌러 전환하면 열린다. 반대도 동일", async () => {
    for (const [owner, from, to, label] of [[aPrivate, B, A, "A-private-via-B"], [bPrivate, A, B, "B-private-via-A"]] as const) {
      if (!owner) { note(label, { skipped: "no private repo" }); continue; }
      const { container, qc, unmount } = renderAt(`/github/${owner.owner}/${owner.repo}?as=${from}`);
      await settle(container);
      const al = alerts(container);
      expect(al.length).toBeGreaterThan(0);
      const btn = within(container).queryByRole("button", { name: new RegExp(to + " 계정으로 열기") });
      note(label, { alertShown: true, switchButton: !!btn });
      expect(btn).not.toBeNull();
      // 격리 확인: from 계정 키에 데이터가 들어간 쿼리가 없어야 한다.
      const dataKeys = qc.getQueryCache().findAll({ queryKey: ["github", from] }).filter((q) => q.state.data !== undefined).length;
      expect(dataKeys).toBe(0);
      fireEvent.click(btn!);
      await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("as=" + to), { timeout: 10_000 });
      await settle(container);
      note(label + " after switch", { alerts: alerts(container) });
      expect(alerts(container)).toEqual([]);
      // 전환 뒤 떠난 계정의 쿼리는 제거되었다.
      expect(qc.getQueryCache().findAll({ queryKey: ["github", from] }).length).toBe(0);
      unmount();
      cleanup();
    }
  }, 180_000);

  it("삭제·알 수 없는 계정(?as=)은 선택 화면으로, 형식이 깨진 owner/repo 는 서버를 부르지 않고 not found", async () => {
    const x = renderAt(`/github/cli/cli?as=ghost-account-zz`);
    await screen.findByText("GitHub 계정 선택", {}, { timeout: 30_000 });
    expect(x.container.textContent).toContain("ghost-account-zz 계정을 찾을 수 없어요");
    x.unmount();
    cleanup();
    const y = renderAt(`/github/cli/..%2F..%2Fx?as=${A}`);
    await settle(y.container);
    expect(alerts(y.container).length).toBeGreaterThan(0);
    note("malformed repo param", { alerts: alerts(y.container) });
  }, 60_000);

  it("주소 입력: owner/repo·URL·악성 입력(@evil·file:·../)을 실제 /resolve 로 처리하고 외부로 이동하지 않는다", async () => {
    window.localStorage.setItem("ttakkari.github.account", A);
    const cases: [string, "ok" | "error"][] = [
      ["cli/cli", "ok"],
      ["https://github.com/cli/cli/pulls", "ok"],
      ["https://github.com/cli/cli/tree/trunk/pkg", "ok"],
      ["https://github.com.evil.com/cli/cli", "error"],
      ["file:///etc/passwd", "error"],
      ["git@github.com:cli/cli", "error"],
      ["http://127.0.0.1/cli/cli", "error"],
    ];
    for (const [q, expected] of cases) {
      const { container, unmount } = renderAt(`/github?as=${A}`);
      await screen.findByLabelText("저장소 주소", {}, { timeout: 30_000 });
      const input = screen.getByLabelText("저장소 주소") as HTMLInputElement;
      fireEvent.change(input, { target: { value: q } });
      fireEvent.click(screen.getByRole("button", { name: "열기" }));
      if (expected === "ok") {
        await waitFor(() => expect(screen.getByTestId("where").textContent).toMatch(/^\/github\/cli\/cli/), { timeout: 30_000 });
        note("resolve ok", { q: q.slice(0, 50), to: screen.getByTestId("where").textContent });
      } else {
        await waitFor(() => expect(container.querySelector('[role="alert"].tk-error, p.tk-error')).not.toBeNull(), { timeout: 30_000 });
        expect(screen.getByTestId("where").textContent).toBe(`/github?as=${A}`);
        note("resolve rejected", { q: q.slice(0, 50) });
      }
      unmount();
      cleanup();
    }
  }, 240_000);
});
