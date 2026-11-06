import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const base = "http://127.0.0.1:5179";
const fixturePath = new URL("./artcraft-browser-fixture.mjs", import.meta.url).pathname;
const server = spawn(process.execPath, [fixturePath], { stdio: "ignore" });

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    if (server.exitCode !== null) throw new Error(`fixture exited early (${server.exitCode})`);
    try {
      const { response } = await request("/api/health");
      if (response.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error("fixture did not become ready");
}

async function finishJob(id) {
  let result;
  for (let i = 0; i < 35; i += 1) {
    result = await request(`/api/artcraft/jobs/${id}`);
    assert.equal(result.response.status, 200);
    if (!["queued", "running"].includes(result.body.state)) return result.body;
  }
  throw new Error(`job ${id} did not finish`);
}

try {
  await waitForServer();
  const selectedMode = await fetch(`${base}/artcraft/manage?fixture=failure`);
  assert.equal(selectedMode.status, 200);

  const preview = await request("/api/artcraft/apps/photocraft/update");
  assert.equal(preview.response.status, 200);

  const initial = await request("/api/artcraft/apps/photocraft/update/status");
  assert.equal(initial.body.state, "idle");
  assert.equal(initial.body.last_status, null);
  assert.deepEqual(initial.body.history, []);
  assert.equal("sha256" in preview.body.latest_release, false);

  const invalidApply = await request("/api/artcraft/apps/photocraft/update", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: false }),
  });
  assert.equal(invalidApply.response.status, 428);
  assert.deepEqual(invalidApply.body, { detail: { code: "confirm_required", message: "확인이 필요합니다." } });

  const apply = await request("/api/artcraft/apps/photocraft/update", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tag: "v0.10.0", confirm: true }),
  });
  assert.equal(apply.response.status, 202);
  const failedJob = await finishJob(apply.body.id);
  assert.equal(failedJob.action, "update-apply");
  assert.equal(failedJob.state, "failed");

  const afterFailure = await request("/api/artcraft/apps/photocraft/update/status");
  assert.equal(afterFailure.body.state, "idle");
  assert.equal(afterFailure.body.current_version, "0.9.0");
  assert.equal(afterFailure.body.last_status.action, "update-apply");
  assert.equal(afterFailure.body.last_status.from_version, "0.9.0");
  assert.equal(afterFailure.body.last_status.to_version, "0.10.0");
  assert.equal(afterFailure.body.last_status.status, "failed");
  assert.match(afterFailure.body.last_status.error, /MCP initialize/);

  const rollback = await request("/api/artcraft/apps/photocraft/update/rollback", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }),
  });
  assert.equal(rollback.response.status, 202);
  const restoredJob = await finishJob(rollback.body.id);
  assert.equal(restoredJob.action, "update-rollback");
  assert.equal(restoredJob.state, "succeeded");

  const afterRollback = await request("/api/artcraft/apps/photocraft/update/status");
  assert.equal(afterRollback.body.state, "idle");
  assert.equal(afterRollback.body.current_version, "0.8.5");
  assert.deepEqual(afterRollback.body.history.map(({ action, from_version, to_version, status, error }) => ({ action, from_version, to_version, status, error })), [
    { action: "update-apply", from_version: "0.9.0", to_version: "0.10.0", status: "failed", error: "MCP initialize 검증 실패. 이전 설치를 복구했습니다." },
    { action: "update-rollback", from_version: undefined, to_version: "0.8.5", status: "succeeded", error: null },
  ]);
  assert.deepEqual(afterRollback.body.last_status, afterRollback.body.history[1]);
  const restoredPreview = await request("/api/artcraft/apps/photocraft/update");
  assert.equal(restoredPreview.body.installed_version, "0.8.5");
  assert.equal(restoredPreview.body.cli_version_line, "photocraft-cli 0.8.5");

  const invalidRollback = await request("/api/artcraft/apps/photocraft/update/rollback", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: false }),
  });
  assert.equal(invalidRollback.response.status, 428);
  assert.deepEqual(invalidRollback.body, { detail: { code: "confirm_required", message: "확인이 필요합니다." } });

  console.log("ARTCRAFT_FIXTURE_HTTP_PASS initial=idle/empty update=failed rollback=succeeded version=0.8.5 history=2 errors=FastAPI-detail sha256=absent");
} finally {
  server.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(3000)]);
}
