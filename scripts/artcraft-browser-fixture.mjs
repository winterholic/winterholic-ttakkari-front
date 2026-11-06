/**
 * Local-only visual verification server for ArtCraft.
 * It serves Vite and a contract-shaped API fixture from one origin. The refresh
 * route issues a fake in-memory token; no production auth or credentials used.
 * Run: node scripts/artcraft-browser-fixture.mjs
 * Switch state by navigating to /artcraft/manage?fixture=plan|success|failure|interrupted|busy|conflict
 */
import { createServer } from "vite";

const port = 5179;
process.env.VITE_API_BASE = `http://127.0.0.1:${port}`;
let mode = "plan";
let job = null;
let jobPolls = 0;
let updateHistory = [];
let installedVersion = "0.9.0";
const now = "2026-11-07T00:30:00Z";

const app = {
  app: "photocraft", title: "PhotoCraft", domain: "사진 편집", site_status: "안정화 중",
  installed: { release: "0.9.0", cli_ok: true, cli_version: "photocraft-cli 0.9.0", bundle_installed: true, source_build: { commit: "fixture", version: "0.9.0" } },
  latest: { tag: "v0.10.0", update_available: true, checked_at: now },
  smoke: { ts: now, source: "artcraft", error: null, passed: 4, total: 4, failed: [], mcp: { ok: true, tools: 12 }, mcp_flow: { ok: true, calls: 3 }, gui: null },
  mcp: { ok: true, tool_count: 12, ms: 32, error: null }, gui: { running: false, listening: false, port: 7878, transport: "tcp" },
  auth: { mode: "token", label: "로컬 테스트 인증", protected: true }, healthy: true, known_bugs: [],
  can_rollback: true, previous_version: "0.8.5", update_busy: false,
};
const updateInfo = () => ({
  app: app.app, title: app.title, installed_version: installedVersion, cli_version_line: `photocraft-cli ${installedVersion}`,
  latest_release: { tag: "v0.10.0", version: "0.10.0", published_at: "2026-11-06T10:00:00Z", asset_name: "photocraft-cli-0.10.0-macos-universal.zip" },
  update_available: installedVersion !== "0.10.0", can_update: mode !== "busy", can_rollback: true, previous_version: "0.8.5",
  busy: mode === "busy", busy_reason: mode === "busy" ? "PhotoCraft 앱이 현재 실행 중입니다." : null, latest_job: job,
});
const record = ({ job_id, action, from_version, to_version, status, error = null }) => ({
  job_id, action, ...(from_version ? { from_version } : {}), ...(to_version ? { to_version } : {}), status, error, at: now,
});
const updateStatus = () => {
  const status = mode === "interrupted"
    ? record({ job_id: "fixture-update-1", action: "update-apply", from_version: "0.9.0", to_version: "0.10.0", status: "interrupted", error: "서버 재시작 뒤 작업을 복구했습니다." })
    : updateHistory.at(-1) ?? null;
  const state = mode === "interrupted" ? "interrupted" : job && ["queued", "running"].includes(job.state) ? job.state : "idle";
  return {
    app: app.app,
    current_version: installedVersion,
    previous_version: "0.8.5", state, error: status?.error ?? null, last_status: status,
    history: mode === "interrupted" ? [status] : updateHistory,
  };
};
const artifact = {
  id: "fixture-artifact-1", workspace_id: "fixture-workspace", session_id: "fixture-session", run_id: "fixture-run-2",
  filename: "편집한_사진_요약.md", mime_type: "text/markdown", kind: "markdown", category: "document",
  source: "agent_output", origin: "agent", area: "agent", keep_reason: null, keep_evidence: null,
  rel_path: "fixture-run-2/편집한_사진_요약.md", storage_mode: "copy", size_bytes: 88, sha256: "b".repeat(64),
  preview_status: "ready", preview_mime: "text/markdown", preview_error: null, export_policy: "allow", downloadable: true,
  retention_until: null, created_at: now,
};
const taskDetail = {
  id: "fixture-task-1", session_id: "fixture-session", category: "photo", title: "프로필 사진을 밝게 보정", apps: ["photocraft"], template_id: null,
  state: "done", round_count: 2, output_count: 1, last_run_id: "fixture-run-2", error: null, progress: null, waiting_reason: null,
  created_at: "2026-11-06T23:50:00Z", updated_at: now, archived_at: null, options: {},
  rounds: [
    { id: "fixture-run-1", index: 1, status: "succeeded", state: "done", prompt: "프로필 사진을 자연스럽게 밝게 보정해 주세요.", result_text: "밝기와 색감을 조정했어요.", messages: ["밝기와 색감을 조정했어요."], error: null, options: {}, use_previous: false, inputs: [], outputs: [], progress: null, waiting_reason: null, created_at: "2026-11-06T23:50:00Z", started_at: "2026-11-06T23:50:02Z", finished_at: "2026-11-06T23:52:00Z" },
    { id: "fixture-run-2", index: 2, status: "succeeded", state: "done", prompt: "하이라이트는 조금 낮추고 결과 요약도 붙여 주세요.", result_text: "하이라이트를 낮췄고, 보정한 결과의 설명 파일도 만들었어요.", messages: ["하이라이트를 낮췄고, 보정한 결과의 설명 파일도 만들었어요."], error: null, options: {}, use_previous: true, inputs: [], outputs: [artifact], progress: null, waiting_reason: null, created_at: now, started_at: now, finished_at: now },
  ],
};
const category = {
  id: "photo", section: "image", title: "사진 편집", tagline: "보정·배경·크기 조정", icon: "image",
  maturity: { level: "ready", label: "기본 작업 가능", summary: "사진을 자연스럽게 보정하고 결과를 파일로 저장해요." },
  apps: [{ app: "photocraft", title: "PhotoCraft", role: "사진 편집", installed: true }],
  can: ["밝기·색감 보정", "배경 정리"], cannot: ["사람 얼굴의 정확한 신원 확인"], accepts: ["jpg", "png"], outputs: ["PNG", "JPG"], templates: [],
};
const catalog = { sections: [{ id: "image", title: "이미지", categories: ["photo"] }], categories: [category], available: true, unavailable_reason: null, workspace_id: "fixture-workspace", workspace_error: null, limits: { files: 10, prompt: 8000 } };
const summary = { id: taskDetail.id, session_id: taskDetail.session_id, category: "photo", title: taskDetail.title, apps: ["photocraft"], template_id: null, state: "done", round_count: 2, output_count: 1, last_run_id: "fixture-run-2", error: null, progress: null, waiting_reason: null, created_at: taskDetail.created_at, updated_at: now, archived_at: null };

const send = (res, status, value, headers = {}) => {
  res.statusCode = status;
  for (const [name, val] of Object.entries(headers)) res.setHeader(name, val);
  if (Buffer.isBuffer(value) || typeof value === "string") return res.end(value);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
};
const sendApiError = (res, status, code, message) => send(res, status, { detail: { code, message } });
const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
};
const fixtureJob = (state = "queued") => ({ id: "fixture-update-1", kind: "update", action: "update-apply", apps: [app.app], mode: "apply", state, created_at: now, started_at: state === "queued" ? null : now, finished_at: null, summary: null, output: "" });

const fixturePlugin = {
  name: "artcraft-local-browser-fixture",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      // Vite dev does not emit the production PWA worker; a tiny valid local worker
      // avoids a misleading MIME error while keeping the browser's SW lifecycle real.
      if (url.pathname === "/sw.js") return send(res, 200, "self.addEventListener('fetch', () => {});", { "Content-Type": "text/javascript; charset=utf-8", "Service-Worker-Allowed": "/" });
      if (!url.pathname.startsWith("/api/")) {
        const selected = url.searchParams.get("fixture");
        if (selected && ["plan", "success", "failure", "interrupted", "busy", "conflict"].includes(selected)) {
          mode = selected;
          job = null;
          jobPolls = 0;
          updateHistory = [];
          installedVersion = "0.9.0";
          app.installed.release = installedVersion;
          app.installed.cli_version = `photocraft-cli ${installedVersion}`;
          app.latest.update_available = true;
          app.update_busy = selected === "busy";
        }
        return next();
      }
      try {
        const path = url.pathname;
        if (path === "/api/auth/refresh" && req.method === "POST") return send(res, 200, { access_token: "local-artcraft-fixture-token" });
        if (path === "/api/auth/logout" && req.method === "POST") return send(res, 204, "");
        if (path === "/api/health") return send(res, 200, { ok: true });
        if (path === "/api/tasks/active" && req.method === "GET") return send(res, 200, { roots: [], nodes: [] });
        if (path === "/api/artcraft/apps" && req.method === "GET") {
          const overviewJob = mode === "interrupted" ? fixtureJob("running") : job && ["queued", "running"].includes(job.state) ? job : null;
          return send(res, 200, { generated_at: now, stale: false, error: null, apps: [app], remote: { checked_at: now, attempted_at: now, error: null, checking: false }, jobs: overviewJob ? [overviewJob] : [] });
        }
        if (path === `/api/artcraft/apps/${app.app}/update` && req.method === "GET") return send(res, 200, updateInfo());
        if (path === `/api/artcraft/apps/${app.app}/update/status` && req.method === "GET") return send(res, 200, updateStatus());
        if (path === `/api/artcraft/apps/${app.app}/update` && req.method === "POST") {
          const body = await readBody(req);
          if (mode === "conflict" || mode === "busy") return sendApiError(res, 409, "app_running", "PhotoCraft 앱이 현재 실행 중입니다.");
          if (body.confirm !== true) return sendApiError(res, 428, "confirm_required", "확인이 필요합니다.");
          job = fixtureJob(); jobPolls = 0;
          return send(res, 202, job);
        }
        if (path === `/api/artcraft/apps/${app.app}/update/rollback` && req.method === "POST") {
          if ((await readBody(req)).confirm !== true) return sendApiError(res, 428, "confirm_required", "확인이 필요합니다.");
          job = { ...fixtureJob(), id: "fixture-rollback-1", action: "update-rollback", mode: "rollback" }; jobPolls = 0;
          return send(res, 202, job);
        }
        const jobMatch = path.match(/^\/api\/artcraft\/jobs\/([^/]+)$/);
        if (jobMatch && req.method === "GET") {
          if (mode === "interrupted" || !job) return sendApiError(res, 404, "not_found", "작업을 찾을 수 없습니다.");
          jobPolls += 1;
          const action = job.action;
          const endState = mode === "failure" && action === "update-apply" ? "failed" : "succeeded";
          const finished = jobPolls >= 30;
          job = {
            ...job, state: finished ? endState : "running", started_at: now, finished_at: finished ? now : null,
            summary: !finished ? null : action === "update-rollback" ? "PhotoCraft 0.8.5로 복구했어요." : endState === "failed" ? "검증 실패 후 이전 버전으로 복구했어요." : "PhotoCraft 0.10.0 업데이트와 MCP 검증을 마쳤어요.",
            output: !finished ? "스테이징 및 사후 검증 중" : action === "update-rollback" ? "PhotoCraft 0.8.5 · rollback succeeded" : endState === "failed" ? "MCP initialize 실패 · update failed after restoring 0.9.0" : "CLI 0.10.0 · MCP initialize ok",
          };
          if (finished && !updateHistory.some((entry) => entry.job_id === job.id)) {
            updateHistory.push(record({
              job_id: job.id, action, ...(action === "update-apply" ? { from_version: "0.9.0" } : {}),
              to_version: action === "update-rollback" ? "0.8.5" : "0.10.0", status: endState,
              error: endState === "failed" ? "MCP initialize 검증 실패. 이전 설치를 복구했습니다." : null,
            }));
            if (endState === "succeeded") installedVersion = action === "update-rollback" ? "0.8.5" : "0.10.0";
            app.installed.release = installedVersion;
            app.installed.cli_version = `photocraft-cli ${installedVersion}`;
            app.latest.update_available = installedVersion !== "0.10.0";
          }
          return send(res, 200, job);
        }
        if (path === "/api/artcraft/catalog" && req.method === "GET") return send(res, 200, catalog);
        if (path === "/api/artcraft/tasks" && req.method === "GET") return send(res, 200, { items: [summary] });
        if (path === `/api/artcraft/tasks/${taskDetail.id}` && req.method === "GET") return send(res, 200, taskDetail);
        if (path === `/api/artcraft/tasks/${taskDetail.id}/runs` && req.method === "POST") {
          const body = await readBody(req);
          const nextIndex = taskDetail.rounds.length + 1;
          const nextRound = { id: `fixture-run-${nextIndex}`, index: nextIndex, status: "queued", state: "queued", prompt: body.prompt ?? "", result_text: null, messages: [], error: null, options: {}, use_previous: body.use_previous === true, inputs: [], outputs: [], progress: "작업을 대기 중", waiting_reason: null, created_at: now, started_at: null, finished_at: null };
          taskDetail.rounds.push(nextRound);
          taskDetail.round_count = taskDetail.rounds.length;
          taskDetail.state = "queued";
          taskDetail.updated_at = now;
          return send(res, 202, taskDetail);
        }
        if (path === "/api/artcraft/outputs" && req.method === "GET") return send(res, 200, { items: [{ artifact, task_id: summary.id, task_title: summary.title, category: "photo", run_id: artifact.run_id }], has_more: false });
        if (path === `/api/artifacts/${artifact.id}` && req.method === "GET") return send(res, 200, artifact);
        if (path === `/api/artifacts/${artifact.id}/content` && req.method === "GET") return send(res, 200, "# 보정 결과\n\n밝기와 색감을 자연스럽게 조정했습니다.\n", { "Content-Type": "text/markdown; charset=utf-8" });
        if (path === `/api/artifacts/${artifact.id}/download-link` && req.method === "POST") return send(res, 200, { url: `/api/artifacts/${artifact.id}/download` });
        if (path === `/api/artifacts/${artifact.id}/download` && req.method === "GET") return send(res, 200, "# 보정 결과\n\n밝기와 색감을 자연스럽게 조정했습니다.\n", { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.filename)}` });
        return sendApiError(res, 404, "fixture_not_found", `로컬 fixture 경로 없음: ${req.method} ${path}`);
      } catch (error) {
        console.error("ArtCraft fixture error", error);
        return sendApiError(res, 500, "fixture_error", "로컬 fixture 처리 오류");
      }
    });
  },
};

const server = await createServer({
  configFile: new URL("../vite.config.ts", import.meta.url).pathname,
  envDir: false,
  plugins: [fixturePlugin],
  server: { host: "127.0.0.1", port, strictPort: true },
});
await server.listen();
console.log(`ArtCraft browser fixture listening on http://127.0.0.1:${port}`);
console.log("Local-only fake refresh token; no production credentials or API calls.");
console.log("Fixture modes: plan, success, failure, interrupted, busy, conflict (set via ?fixture=...). Ctrl-C stops server.");
const close = async () => { await server.close(); process.exit(0); };
process.once("SIGINT", close);
process.once("SIGTERM", close);
