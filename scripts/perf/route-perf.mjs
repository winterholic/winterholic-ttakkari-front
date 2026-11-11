// 주요 경로를 차례로 열어 DOM 규모·스크립트/레이아웃 시간·요청 수를 잰다(합성 스텁 데이터, CPU 4배 느리게).
// 사용: VITE_API_BASE=http://127.0.0.1:5401 pnpm build 후  node scripts/perf/route-perf.mjs [--dist=dist] [--routes=/chat,/tasks]
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { body as stubBody } from "../ui-sweep/stub.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "1"]));
const DIST = resolve(args.dist ?? "dist");
const ROUTES = (args.routes ?? "/chat,/work,/tasks,/workspace,/library,/files,/assistant,/more,/notifications,/weather,/resources,/meetings,/pms,/pms/p1,/pms/p1/board,/wbs/p1,/checklists,/memos,/calendar,/context-library?tab=overview,/chat/s1,/logs").split(",");
const API = 5401, WEB = 5412;
const core = process.env.PLAYWRIGHT_CORE ?? join(homedir(), ".ttakkari/browser-runtime/node_modules/playwright-core/index.mjs");
const { chromium } = await import(pathToFileURL(core).href);
const cors = { "content-type": "application/json", "access-control-allow-origin": "http://127.0.0.1:" + WEB, "access-control-allow-credentials": "true", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "*" };
const api = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  res.writeHead(200, cors);
  res.end(JSON.stringify(stubBody(u.pathname.replace(/^\/api\//, ""), req.method, u.search)));
});
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const web = http.createServer((req, res) => {
  let f = join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await Promise.all([new Promise((r) => api.listen(API, "127.0.0.1", r)), new Promise((r) => web.listen(WEB, "127.0.0.1", r))]);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const rows = [];
for (const route of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.addInitScript("try{localStorage.setItem('tk-onboarded','1')}catch{}");
  await ctx.route((u) => u.hostname === "cdn.jsdelivr.net", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(`http://127.0.0.1:${WEB}${route}`, { waitUntil: "load" });
  await page.waitForSelector("main", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (args.shot) await page.screenshot({ path: `${args.shot}${route.replace(/[^\w]/g, "_")}.png` });
  const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const r = await page.evaluate(() => ({ nodes: document.getElementsByTagName("*").length, req: performance.getEntriesByType("resource").filter((x) => x.initiatorType === "fetch").length, js: Math.round(performance.getEntriesByType("resource").filter((x) => x.name.endsWith(".js")).reduce((a, x) => a + x.transferSize, 0) / 1024), heap: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576) }));
  if (errs.length && args.debug) console.log(route, errs[0]);
  rows.push({ route, nodes: r.nodes, script_ms: Math.round(m.ScriptDuration * 1000), layout_ms: Math.round(m.LayoutDuration * 1000), style_ms: Math.round(m.RecalcStyleDuration * 1000), api: r.req, js_kb: r.js, heap_mb: r.heap, err: errs.length });
  await ctx.close();
}
console.table(rows);
await browser.close(); api.close(); web.close(); process.exit(0);
