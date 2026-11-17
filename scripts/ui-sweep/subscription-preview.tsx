// Browser-only synthetic fixture. No real authentication or provider requests.
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UsageDialog } from "../../src/features/accounts/UsageDialog";
import { setAccessToken } from "../../src/api/client";
import "../../src/vendor/ttakkari/tokens.css";
import "../../src/vendor/ttakkari/typography.css";
import "../../src/vendor/ttakkari/components.css";
import "../../src/boot.css";

const now = Math.floor(Date.now() / 1000);
const mode = new URL(location.href).searchParams.get("state");
const windows = [
  { key: "five_hour", label: "5시간", percent: 3, resets_at: now + 7200, state: "current" },
  { key: "seven_day", label: "주간", percent: 12, resets_at: now + 3 * 86400, state: "current" },
];
const account = { id: "synthetic-codex", name: "내 Codex · 긴 계정 이름으로 모바일 줄바꿈 확인", engine: "codex",
  pool: "personal", enabled: true, rank: 1, work_enabled: false, work_rank: null, max_used_percent: 100,
  remaining_to_limit_percent: 88, stale: false, login: "ok", cooldown_seconds: 0, windows,
  source: "api", plan: "plus", error: null, updated_at: now, execution_enabled: true };
let subscription = { provider: "codex", auto_enabled: mode !== "off", reset_at: now + 3 * 86400,
  next_check_at: now + 43200, next_activation_at: now + 3 * 86400 + 10, last_checked_at: now,
  last_check_outcome: "observed", last_result: mode === "empty" ? null : {
    status: mode === "unknown" ? "unknown" : "succeeded", started_at: now - 4 * 86400,
    before: { windows: [{ key: "seven_day", percent: 0, resets_at: now - 4 * 86400 }] },
    after: { windows: [{ key: "seven_day", percent: 0, resets_at: now + 3 * 86400 }] },
  } };
setAccessToken("synthetic-fixture-only");
window.fetch = async (input, init) => {
  const path = new URL(String(input), location.href).pathname;
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status,
    headers: { "Content-Type": "application/json" } });
  if (path.endsWith("/subscription")) {
    if (mode === "error") return reply({ detail: "synthetic metadata unavailable" }, 503);
    if (init?.method === "PATCH") subscription = { ...subscription, ...JSON.parse(String(init.body)) };
    return reply(subscription);
  }
  if (path.includes("/subscription/")) return reply({ ...subscription, action_result: { status: "already_used" } });
  if (path.includes("/qwen-usage")) return reply({ detail: "not part of this fixture" }, 503);
  if (path.endsWith("/usage/cached") || path.endsWith("/accounts/usage")) return reply([account]);
  if (path.endsWith("/usage")) return reply(account);
  return reply({ detail: "unexpected fixture request" }, 404);
};
const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById("root")!).render(
  <MemoryRouter><QueryClientProvider client={qc}><UsageDialog open onClose={() => {}} /></QueryClientProvider></MemoryRouter>,
);
