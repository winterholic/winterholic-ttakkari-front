// 채팅 화면 성능 계측. 합성 API(지난 Run 40개 + 실시간 스트리밍 Run 1개)를 띄우고 빌드된 dist 를 크롬으로 열어 잰다.
// 사용: VITE_API_BASE=http://127.0.0.1:5401 pnpm build 후  node scripts/perf/chat-perf.mjs [--dist=dist] [--runs=40] [--stream=400] [--json]
// 필요: playwright-core(PLAYWRIGHT_CORE=<경로>/index.mjs 로 지정, 기본은 ~/.ttakkari/browser-runtime), Chrome.
// 실제 서버·계정은 쓰지 않는다. 숫자는 장비마다 달라서 같은 장비에서 전후를 비교하는 용도다.
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

import { body as stubBody } from "../ui-sweep/stub.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "1"]));
const DIST = resolve(args.dist ?? "dist");
const RUNS = Number(args.runs ?? 40);
const STREAM = Number(args.stream ?? 400);
const API = 5401;
const WEB = 5402;
const core = process.env.PLAYWRIGHT_CORE ?? join(homedir(), ".ttakkari/browser-runtime/node_modules/playwright-core/index.mjs");
const { chromium } = await import(pathToFileURL(core).href);

const T0 = Date.parse("2026-11-10T00:00:00Z");
const iso = (n) => new Date(T0 + n * 1000).toISOString();
const MD = (i) => `## 결과 ${i}\n\n작업을 마쳤어요. 핵심은 아래와 같아요.\n\n- 항목 **하나** \`code\` [링크](https://example.com/${i})\n- 항목 둘 ~~취소~~\n\n| 이름 | 값 |\n| --- | --- |\n| a | ${i} |\n| b | ${i * 2} |\n\n\`\`\`ts\nconst x = ${i};\nconsole.log(x);\n\`\`\`\n\n${"긴 문단이 이어집니다. ".repeat(12)}`;
const run = (i, over = {}) => ({
  id: `r${i}`, session_id: "s1", workspace_id: "w1", prompt: `${i}번째 지시입니다\n세부 내용`, context_artifact_ids: [], engine: "claude", model: null, effort: null,
  status: "succeeded", exit_code: 0, error: null, result_text: MD(i), cost_usd: 0.12, usage: {}, checkpoint_ref: null, origin: "user", profile: "내 클로드", last_seq: 0,
  created_at: iso(i * 60), started_at: iso(i * 60 + 1), finished_at: iso(i * 60 + 30), ...over,
});
const past = Array.from({ length: RUNS }, (_, i) => run(i + 1));
const LIVE = run(RUNS + 1, { id: "live", status: "running", result_text: null, finished_at: null, created_at: iso(RUNS * 60 + 100), started_at: iso(RUNS * 60 + 101) });
const ev = (seq, type, payload) => ({ seq, type, payload, created_at: iso(seq) });
const pastEvents = () => {
  const out = [ev(1, "run.status", { status: "running" })];
  for (let k = 0; k < 60; k++) {
    out.push(ev(2 + k * 2, "tool.call", { call_id: `c${k}`, name: "Read", input: { file_path: `/a/b/c/file${k}.ts` } }));
    out.push(ev(3 + k * 2, "tool.result", { call_id: `c${k}`, is_error: false, output: "ok" }));
  }
  out.push(ev(200, "message", { text: MD(1) }), ev(201, "run.finished", { status: "succeeded", error: null, result_text: MD(1), cost_usd: 0.1, exit_code: 0 }));
  return out;
};
const liveEvent = (n) => (n === 1 ? ev(1, "run.status", { status: "running" }) : n % 3 === 0
  ? ev(n, "message", { text: MD(n).slice(0, 200 + n * 6) })
  : n % 3 === 1 ? ev(n, "tool.call", { call_id: `L${n}`, name: "Bash", input: { command: `echo ${n}` } }) : ev(n, "tool.result", { call_id: `L${n - 1}`, is_error: false, output: "ok" }));

let liveDone = false;
const json = (res, data) => { res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "http://127.0.0.1:" + WEB, "access-control-allow-credentials": "true" }); res.end(JSON.stringify(data)); };
const apiServer = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname.replace(/^\/api\//, "");
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "http://127.0.0.1:" + WEB, "access-control-allow-credentials": "true", "access-control-allow-headers": "authorization,content-type,last-event-id", "access-control-allow-methods": "*" }); return res.end(); }
  if (p === "auth/refresh") return json(res, { access_token: "x", expires_in: 900, token_type: "bearer" });
  if (p === "auth/me") return json(res, { id: "u1", name: "t", role: "owner" });
  if (p === "health") return json(res, { ok: true });
  if (p === "sessions/s1") return json(res, { id: "s1", title: "perf", kind: "chat", status: "active", pool: "personal", engine: "claude", model: null, workspace_id: "w1", parent_id: null, created_at: iso(0), updated_at: iso(0) });
  if (p === "workspaces/w1") return json(res, { id: "w1", name: "ws", root_path: "/tmp", extra_writable_roots: [] });
  if (p === "sessions/s1/runs" && req.method === "GET") return json(res, [...past, liveDone ? { ...LIVE, status: "succeeded", result_text: MD(99), finished_at: iso(RUNS * 60 + 200) } : LIVE].slice(-Number(u.searchParams.get("limit") ?? 40)));
  const m = p.match(/^runs\/([^/]+)\/events$/);
  if (m) return json(res, m[1] === "live" ? [] : pastEvents());
  if (p === "runs/live/stream") {
    res.writeHead(200, { "content-type": "text/event-stream", "access-control-allow-origin": "http://127.0.0.1:" + WEB, "access-control-allow-credentials": "true", "cache-control": "no-cache" });
    let n = 0;
    const t = setInterval(() => { n += 1; res.write(`id: ${n}\nevent: run_event\ndata: ${JSON.stringify(liveEvent(n))}\n\n`); if (n >= STREAM) { clearInterval(t); liveDone = true; res.write("event: end\ndata: {}\n\n"); res.end(); } }, 12);
    req.on("close", () => clearInterval(t));
    return;
  }
  // 나머지(사이드바·알림 등)는 레이아웃 검사용 스텁의 합성 데이터를 그대로 쓴다.
  return json(res, stubBody(p, req.method, u.search));
});
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const webServer = http.createServer((req, res) => {
  let f = join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await Promise.all([new Promise((r) => apiServer.listen(API, "127.0.0.1", r)), new Promise((r) => webServer.listen(WEB, "127.0.0.1", r))]);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
await ctx.addInitScript("try{localStorage.setItem('tk-onboarded','1')}catch{}");
// 외부 글꼴 CDN 은 네트워크 변수가 되므로 막는다(CSS 만 비어 오고 렌더는 시스템 글꼴).
const cdnDelay = Number(args["cdn-delay"] ?? 0);
await ctx.route((u) => u.hostname === "cdn.jsdelivr.net", async (r) => { if (cdnDelay) await new Promise((x) => setTimeout(x, cdnDelay)); await r.fulfill({ status: 200, contentType: "text/css", body: "" }); });
const page = await ctx.newPage();
if (args.debug) { page.on("console", (m) => console.log("console:", m.text())); page.on("requestfailed", (r) => console.log("failed:", r.url(), r.failure()?.errorText)); page.on("response", (r) => r.status() >= 400 && console.log(r.status(), r.url())); }
const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(args.cpu ?? 4) }); // 폰에 가깝게 4배 느리게
await page.addInitScript(() => {
  window.__long = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  window.__inp = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__inp.push(e.duration); }).observe({ type: "event", durationThreshold: 16, buffered: true });
});
const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${WEB}/chat/s1`, { waitUntil: "load" });
await page.waitForSelector(".tk-thread .tk-message--agent", { timeout: 20000 });
const tReady = Date.now() - t0;
const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; const p = Object.fromEntries(performance.getEntriesByType("paint").map((x) => [x.name, x.startTime])); const res = performance.getEntriesByType("resource"); return { fcp: p["first-contentful-paint"], lcp: window.__lcp, js: res.filter((r) => r.name.endsWith(".js")).reduce((a, r) => a + r.transferSize, 0), jsCount: res.filter((r) => r.name.endsWith(".js")).length, css: res.filter((r) => r.name.endsWith(".css") && r.name.includes("127.0.0.1")).reduce((a, r) => a + r.transferSize, 0), dcl: n.domContentLoadedEventEnd }; });
await page.waitForTimeout(1500);
const m0 = await metrics();
await page.evaluate(() => { window.__long.length = 0; window.__inp.length = 0; });
// 스트리밍 구간: 이벤트가 쏟아지는 동안 스크롤·입력(타이핑)을 섞어 체감 렉을 만든다.
const composer = page.locator("textarea").first();
const s0 = Date.now();
const typing = (async () => { for (let i = 0; i < 40; i++) { await composer.press("a").catch(() => {}); await page.waitForTimeout(40); } })();
await page.waitForFunction(() => !document.querySelector(".tk-message--agent[aria-busy=true]"), null, { timeout: 60000 }).catch(() => {});
await typing;
const streamMs = Date.now() - s0;
const m1 = await metrics();
const r = await page.evaluate(() => ({ long: window.__long, inp: window.__inp, nodes: document.getElementsByTagName("*").length, gap: (() => { const t = document.querySelector(".tk-thread"); return Math.round(t.scrollHeight - t.scrollTop - t.clientHeight); })(), heap: performance.memory?.usedJSHeapSize }));
// 스트림이 끝난 뒤 아무것도 안 하는 8초. 폴링·타이머가 혼자 만드는 일을 본다.
const i0 = await metrics(); const reqs0 = await page.evaluate(() => performance.getEntriesByType("resource").length);
await page.waitForTimeout(8000);
const i1 = await metrics(); const reqs1 = await page.evaluate(() => performance.getEntriesByType("resource").length);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const out = {
  ready_ms: tReady, fcp_ms: Math.round(nav.fcp), lcp_ms: Math.round(nav.lcp ?? 0), js_kb: Math.round(nav.js / 1024), js_files: nav.jsCount, css_kb: Math.round(nav.css / 1024),
  dom_nodes: r.nodes, bottom_gap_px: r.gap, heap_mb: Math.round((r.heap ?? 0) / 1048576),
  stream: { wall_ms: streamMs, script_ms: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), layout_ms: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), style_ms: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000),
    layouts: m1.LayoutCount - m0.LayoutCount, long_tasks: r.long.length, long_total_ms: Math.round(sum(r.long)), long_max_ms: Math.round(Math.max(0, ...r.long)), input_slow_max_ms: Math.round(Math.max(0, ...r.inp)), input_slow_n: r.inp.length },
  idle_8s: { script_ms: Math.round((i1.ScriptDuration - i0.ScriptDuration) * 1000), layouts: i1.LayoutCount - i0.LayoutCount, requests: reqs1 - reqs0 },
  requests_total: reqs0,
};
if (args.res) console.log((await page.evaluate(() => performance.getEntriesByType("resource").map((r) => `${Math.round(r.transferSize / 1024)}KB ${r.initiatorType} ${r.name.replace(/^https?:\/\/[^/]+/, "")}`))).join("\n"));
if (args.shot) await page.screenshot({ path: args.shot });
console.log(args.json ? JSON.stringify(out) : JSON.stringify(out, null, 2));
await browser.close(); apiServer.close(); webServer.close(); process.exit(0);
