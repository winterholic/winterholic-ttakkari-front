// 실제 백엔드(serve_backend.py)에 같은 요청을 보내 응답을 그대로 저장한다. 프론트 테스트가 목업이 아니라 실제 응답 모양으로 돌도록 하는 기록이다.
// 사용: node scripts/kb-live/capture.mjs --base http://127.0.0.1:8799 --out src/features/kb/liveFixtures/recorded.json
// 저장하는 것: 요청 메서드·경로·상태·본문. 로그인 토큰은 저장하지 않는다. 시험 계정 비밀번호는 백엔드 conftest 가 공개한 시험 값이다.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:8799");
const OUT = arg("out", "src/features/kb/liveFixtures/recorded.json");
const TEST_PASSWORD = "correct-horse-battery";
const KB = `${BASE}/api/assistant/kb`;

const login = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: TEST_PASSWORD }) });
const token = (await login.json()).access_token;
const rec = {};
async function call(name, method, path, { json, form } = {}) {
  const res = await fetch(`${KB}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(json ? { "content-type": "application/json" } : {}) },
    body: json ? JSON.stringify(json) : form,
  });
  let body = null;
  try { body = await res.json(); } catch { /* 본문 없음 */ }
  rec[name] = { method, path, status: res.status, body };
  return body;
}

await call("summary", "GET", "/summary");
const docs = await call("documents", "GET", "/documents?limit=30");
const byTitle = (t) => docs.items.find((d) => d.title === t);
await call("documents_attention", "GET", "/documents?pipeline_status=attention");
await call("documents_none", "GET", "/documents?pipeline_status=none");
await call("documents_domain_devinfra", "GET", "/documents?domain=dev-infra&limit=1");
await call("documents_bad_status", "GET", "/documents?pipeline_status=nonsense");

const main = byTitle("k8s-ko") ?? docs.items[0];
await call("document_detail", "GET", `/documents/${main.id}`);
const rollout = byTitle("롤아웃 정책");
if (rollout) await call("document_detail_versions", "GET", `/documents/${rollout.id}`);
const held = docs.items.find((d) => d.pipeline_status === "held");
if (held) await call("document_detail_held", "GET", `/documents/${held.id}`);
const html = byTitle("HorizontalPodAutoscaler");
if (html) await call("document_detail_html", "GET", `/documents/${html.id}`);
await call("document_missing", "GET", "/documents/00000000-0000-0000-0000-000000000000");

const jobs = await call("jobs", "GET", "/jobs?limit=100");
await call("jobs_active", "GET", "/jobs?status=active");
await call("jobs_attention", "GET", "/jobs?status=attention&limit=2");
await call("jobs_held", "GET", "/jobs?status=held");
await call("jobs_bad_status", "GET", "/jobs?status=nonsense");
const degraded = jobs.items.find((j) => j.status === "degraded");
if (degraded) {
  await call("job_one", "GET", `/jobs/${degraded.id}`);
  await call("job_retry_extracting", "POST", `/jobs/${degraded.id}/retry`, { json: { from_stage: "extracting" } });
  await call("job_retry_bad_stage", "POST", `/jobs/${degraded.id}/retry`, { json: { from_stage: "parsing" } });
}
await call("job_missing", "GET", "/jobs/00000000-0000-0000-0000-000000000000");

await call("search_hybrid", "GET", `/search?q=${encodeURIComponent("디플로이먼트")}&mode=hybrid`);
await call("search_hybrid_en", "GET", `/search?q=${encodeURIComponent("Kubernetes")}&mode=hybrid`);
await call("search_lexical", "GET", `/search?q=${encodeURIComponent("디플로이먼트")}&mode=lexical`);
await call("search_vector", "GET", `/search?q=${encodeURIComponent("디플로이먼트")}&mode=vector`);
await call("search_nohit", "GET", `/search?q=${encodeURIComponent("zzqxjk없는말")}&mode=hybrid`);

const graph = await call("graph_hubs", "GET", "/ontology/graph?limit=12");
await call("graph_hubs_candidates", "GET", "/ontology/graph?limit=12&include_candidates=true");
await call("graph_search", "GET", `/ontology/graph?q=${encodeURIComponent("Deployment")}&limit=30`);
const center = graph.nodes.find((n) => /deployment/i.test(n.name)) ?? graph.nodes[0];
await call("graph_neighbors", "GET", `/ontology/graph?center_entity_id=${center.id}&limit=30`);
await call("graph_neighbors_page2", "GET", `/ontology/graph?center_entity_id=${center.id}&limit=1&offset=1&include_candidates=true`);
await call("graph_hops3", "GET", `/ontology/graph?center_entity_id=${center.id}&hops=3&limit=30`);
await call("graph_missing_entity", "GET", "/ontology/graph?center_entity_id=00000000-0000-0000-0000-000000000000");
await call("entity_detail", "GET", `/ontology/entities/${center.id}`);
await call("entity_detail_candidates", "GET", `/ontology/entities/${center.id}?include_candidates=true`);
await call("entity_missing", "GET", "/ontology/entities/00000000-0000-0000-0000-000000000000");
await call("alias_add", "POST", `/ontology/entities/${center.id}/aliases`, { json: { alias: "디플로이먼트 컨트롤러", lang: "ko" } });
await call("alias_add_again", "POST", `/ontology/entities/${center.id}/aliases`, { json: { alias: "디플로이먼트 컨트롤러", lang: "ko" } });
const other = graph.nodes.find((n) => n.id !== center.id);
if (other) await call("alias_taken", "POST", `/ontology/entities/${center.id}/aliases`, { json: { alias: other.name, lang: "en" } });
await call("alias_too_short", "POST", `/ontology/entities/${center.id}/aliases`, { json: { alias: "a" } });

const open = await call("conflicts_open", "GET", "/conflicts");
await call("conflicts_all", "GET", "/conflicts?status=all");
await call("conflicts_kind_version", "GET", "/conflicts?kind=version_divergence");
if (open.items.length) {
  const c = open.items[0];
  const wrong = c.kind === "ambiguous_entity" ? "resolved_a" : "merged";
  await call("conflict_resolve_wrong_kind", "POST", `/conflicts/${c.id}/resolve`, { json: { resolution: wrong } });
}

// 근거 원문: 문서 상세의 첫 패시지
const detail = rec.document_detail.body;
const passageId = detail.passages.items[0]?.id;
if (passageId) await call("evidence", "GET", `/passages/${passageId}/evidence`);

// ingest: 보류·실패·중복 항목 모양. 같은 바이트를 다시 올려 duplicate 를 얻는다.
const form = new FormData();
form.append("files[]", new Blob(["# 같은 파일\n\n본문 하나."], { type: "text/markdown" }), "same.md");
await call("ingest_first", "POST", "/ingest", { form });
const form2 = new FormData();
form2.append("files[]", new Blob(["# 같은 파일\n\n본문 하나."], { type: "text/markdown" }), "same.md");
form2.append("files[]", new Blob([new Uint8Array([0, 1, 2, 3, 4, 5, 250, 251])]), "legacy.hwp");
form2.append("urls[]", "http://127.0.0.1:9/none");
await call("ingest_mixed", "POST", "/ingest", { form: form2 });
await call("ingest_empty", "POST", "/ingest", { json: {} });
await call("ingest_too_many", "POST", "/ingest", { json: { text: "x", urls: Array.from({ length: 21 }, (_, i) => `https://example.com/${i}`) } });
rec.__meta = { base: BASE, captured_at: new Date().toISOString(), note: "실제 back-kb-v3-api 앱에 대한 응답. 토큰은 저장하지 않았다." };

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(rec, null, 2));
console.log("captured", Object.keys(rec).length, "responses ->", OUT);
for (const [k, v] of Object.entries(rec)) if (k !== "__meta") console.log(String(v.status).padEnd(4), k);
