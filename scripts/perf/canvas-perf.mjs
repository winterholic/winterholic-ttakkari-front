// 따까리 판(캔버스)에 일 노드를 많이 올리고, 이동·확대 입력 동안의 스크립트·레이아웃 시간을 잰다.
// 사용: VITE_API_BASE=http://127.0.0.1:5401 pnpm build 후  node scripts/perf/canvas-perf.mjs [--dist=dist] [--nodes=120] [--json]
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { body as stubBody } from "../ui-sweep/stub.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "1"]));
const DIST = resolve(args.dist ?? "dist");
const N = Number(args.nodes ?? 120);
const API = 5401, WEB = 5422;
const core = process.env.PLAYWRIGHT_CORE ?? join(homedir(), ".ttakkari/browser-runtime/node_modules/playwright-core/index.mjs");
const { chromium } = await import(pathToFileURL(core).href);
const now = new Date().toISOString();
// 따까리 대화 아래 기획 세션 8개, 각각 아래에 작업 세션이 이어지는 모양. 일부는 실행 중이라 판에 올라간다.
const nodes = [];
const roots = [];
for (let i = 0; i < 8; i++) {
  const lead = `lead${i}`;
  roots.push(lead);
  nodes.push({ id: lead, parent_id: "desk1", kind: "orchestrator", title: `기획 세션 ${i}`, pool: "personal", created_at: now, updated_at: now, archived_at: null, status: i % 2 ? "running" : "succeeded", profile: "내 클로드", model: null, last_result: "결과 요약 문장입니다" });
  const per = Math.floor((N - 8) / 8);
  for (let j = 0; j < per; j++) nodes.push({ id: `w${i}-${j}`, parent_id: j % 3 === 0 ? lead : `w${i}-${j - 1}`, kind: "worker", title: `작업 ${i}-${j}`, pool: "personal", created_at: now, updated_at: now, archived_at: null, status: j % 4 === 0 ? "running" : "succeeded", profile: "내 클로드", model: null, last_result: "작업 결과" });
}
const cors = { "content-type": "application/json", "access-control-allow-origin": "http://127.0.0.1:" + WEB, "access-control-allow-credentials": "true", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "*" };
const api = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname.replace(/^\/api\//, "");
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  res.writeHead(200, cors);
  if (p === "tasks/active") return res.end(JSON.stringify({ roots, nodes }));
  if (p === "desk") return res.end(JSON.stringify({ id: "desk1", title: "따까리", kind: "desk", status: "active", pool: "personal", engine: "claude", model: null, workspace_id: "w1", parent_id: null, created_at: now, updated_at: now }));
  res.end(JSON.stringify(stubBody(p, req.method, u.search)));
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
await ctx.addInitScript("try{localStorage.setItem('tk-onboarded','1')}catch{}");
await ctx.route((u) => u.hostname === "cdn.jsdelivr.net", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await page.goto(`http://127.0.0.1:${WEB}/chat`, { waitUntil: "load" });
await page.waitForSelector(".tnode", { timeout: 15000 });
await page.waitForTimeout(1500);
if (args.css) await page.addStyleTag({ content: String(args.css) });
const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
const nodeCount = await page.locator(".tnode").count();
const stage = page.locator(".tcanvas");
const box = await stage.boundingBox();
const dash = async () => page.evaluate(() => { const e = document.querySelector(".tcanvas__edge[data-live]"); return e ? getComputedStyle(e).strokeDashoffset : null; });
const dashA = await dash(); await page.waitForTimeout(400); const dashB = await dash();
const idle0 = await metrics();
await page.waitForTimeout(4000);
const idle1 = await metrics();
const m0 = await metrics();
const t0 = Date.now();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 90; i++) { await page.mouse.wheel(i % 2 ? 12 : -12, 18); }   // 트랙패드 두 손가락 이동
for (let i = 0; i < 30; i++) { await page.keyboard.down("Meta"); await page.mouse.wheel(0, i % 2 ? 8 : -8); await page.keyboard.up("Meta"); } // ⌘+휠 확대
await page.waitForTimeout(300);
const m1 = await metrics();
const out = { dash_moves: dashA !== dashB, dash: [dashA, dashB], canvas_nodes: nodeCount, wall_ms: Date.now() - t0, script_ms: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), layout_ms: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), style_ms: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), layouts: m1.LayoutCount - m0.LayoutCount, idle_4s_script_ms: Math.round((idle1.ScriptDuration - idle0.ScriptDuration) * 1000), idle_4s_style_ms: Math.round((idle1.RecalcStyleDuration - idle0.RecalcStyleDuration) * 1000), idle_4s_task_ms: Math.round((idle1.TaskDuration - idle0.TaskDuration) * 1000) };
console.log(args.json ? JSON.stringify(out) : JSON.stringify(out, null, 2));
await browser.close(); api.close(); web.close(); process.exit(0);
