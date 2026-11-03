import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { KbContractError, isKbUnsupported, isKbV3Summary, kbConflicts, kbEntity, kbGraph, kbIngest, kbJob, kbJobs, kbResolveConflict, kbRetryJob, kbSearchV3, kbSummaryV3 } from "./kb";

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });
const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const lastUrl = () => new URL(String(fetchMock.mock.calls.at(-1)![0]));
const lastInit = () => fetchMock.mock.calls.at(-1)![1] as RequestInit;

it("어떤 조회도 scope 를 보내지 않는다(생략 = 통합 도서관, 계약 §2.6)", async () => {
  reply({ counts: { sources: 0, documents: 0, revisions: 0, passages: 0, evidence: 0 }, last_collected_at: null });
  await kbSummaryV3();
  expect(lastUrl().pathname).toBe("/api/assistant/kb/summary");
  expect(lastUrl().searchParams.has("scope")).toBe(false);
  reply({ items: [], query: "q", terms: [], limit: 20, offset: 0, has_more: false });
  await kbSearchV3({ q: "디플로이먼트", domain: "dev-infra", entity_id: "e1" });
  expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ q: "디플로이먼트", mode: "hybrid", domain: "dev-infra", entity_id: "e1", limit: "20", offset: "0" });
  reply({ items: [], query: "q", terms: [], limit: 20, offset: 0, has_more: false });
  await kbSearchV3({ q: "디플로이먼트", include_candidates: true });
  expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ q: "디플로이먼트", mode: "hybrid", include_candidates: "true", limit: "20", offset: "0" });
});

it("ingest 는 multipart 로 files[]·urls[]·text·title·domain 을 보낸다", async () => {
  reply({ batch_id: "b1", items: [{ document_id: "d1", revision_id: "r1", job_id: "j1", status: "registered" }] });
  const file = new File(["# 제목"], "a.md", { type: "text/markdown" });
  const out = await kbIngest({ files: [file], urls: ["https://example.test/a"], text: "본문", title: "제목", domain: "ai" });
  expect(out.items[0].job_id).toBe("j1");
  expect(lastUrl().pathname).toBe("/api/assistant/kb/ingest");
  expect(lastInit().method).toBe("POST");
  const form = lastInit().body as FormData;
  expect((form.getAll("files[]")[0] as File).name).toBe("a.md");
  expect(form.getAll("urls[]")).toEqual(["https://example.test/a"]);
  expect([form.get("text"), form.get("title"), form.get("domain")]).toEqual(["본문", "제목", "ai"]);
  // multipart 경계는 브라우저가 붙이므로 Content-Type 을 직접 정하면 안 된다.
  expect(new Headers(lastInit().headers).has("Content-Type")).toBe(false);
});

it("계약과 다른 응답은 빈 성공이 아니라 KbContractError 로 드러난다", async () => {
  reply({ jobs: [] });
  await expect(kbJobs()).rejects.toBeInstanceOf(KbContractError);
  reply({ items: [] });
  await expect(kbJobs()).rejects.toThrow(/jobs: total/);
  reply({ id: "j1" });
  await expect(kbRetryJob("j1", null)).rejects.toThrow(/retry/);
  reply({ batch_id: "b", items: [{ name: "x" }] });
  await expect(kbIngest({ files: [], urls: [], text: "x", title: "t" })).rejects.toBeInstanceOf(KbContractError);
  reply({ nodes: [] });
  await expect(kbGraph()).rejects.toThrow(/ontology\/graph/);
  reply({ batch_id: "b" });
  await expect(kbIngest({ files: [], urls: [], text: "x", title: "t" })).rejects.toBeInstanceOf(KbContractError);
});

it("라우트가 없는 서버만 미지원으로 보고, 앱이 만든 404·422·409 는 그대로 둔다(실서버 오류 모양 기준)", async () => {
  // 실서버: FastAPI 기본 404 도 {code, message} 로 감싸져서 code 는 not_found, message 는 Not Found 다(http_404 가 아니다).
  reply({ code: "not_found", message: "Not Found" }, 404);
  const err = await kbConflicts().catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(isKbUnsupported(err)).toBe(true);
  reply({ code: "error", message: "Method Not Allowed" }, 405);
  expect(isKbUnsupported(await kbConflicts().catch((e: unknown) => e))).toBe(true);
  // 프록시가 JSON 아닌 404 를 주면 toApiError 가 http_404 로 만든다. 이것도 미지원이다.
  fetchMock.mockResolvedValueOnce(new Response("<html>nope</html>", { status: 404 }));
  expect(isKbUnsupported(await kbConflicts().catch((e: unknown) => e))).toBe(true);
  reply({ code: "not_found", message: "kb_document_not_found" }, 404);
  expect(isKbUnsupported(await kbConflicts().catch((e: unknown) => e))).toBe(false);
  reply({ code: "error", message: "kb_job_status_invalid" }, 422);
  expect(isKbUnsupported(await kbConflicts().catch((e: unknown) => e))).toBe(false);
  reply({ code: "conflict", message: "kb_alias_belongs_to_other_entity" }, 409);
  expect(isKbUnsupported(await kbConflicts().catch((e: unknown) => e))).toBe(false);
  expect(isKbUnsupported(new Error("x"))).toBe(false);
});

it("재시도·충돌 해결·그래프 확장은 계약의 본문과 파라미터를 쓴다", async () => {
  const retried = { id: "j1", retry: { requeued: true, from_stage: "extracting", reason: null, reset_stages: ["extracting"] } };
  reply(retried);
  expect((await kbRetryJob("j1", "extracting")).retry.requeued).toBe(true);
  expect(lastUrl().pathname).toBe("/api/assistant/kb/jobs/j1/retry");
  expect(JSON.parse(String(lastInit().body))).toEqual({ from_stage: "extracting" });
  reply(retried);
  await kbRetryJob("j1", null);
  expect(JSON.parse(String(lastInit().body))).toEqual({ from_stage: null });
  reply({ status: "resolved_a" });
  await kbResolveConflict("c1", "resolved_a", "  최신 문서  ");
  expect(lastUrl().pathname).toBe("/api/assistant/kb/conflicts/c1/resolve");
  expect(JSON.parse(String(lastInit().body))).toEqual({ resolution: "resolved_a", note: "최신 문서" });
  reply({ nodes: [], edges: [], center_entity_id: "e1", total_entities: 3 });
  await kbGraph({ center_entity_id: "e1", limit: 30 });
  expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ center_entity_id: "e1", hops: "1", limit: "30" });
  // 이웃이 한 쪽보다 많으면 offset 으로 이어 받고, 후보 관계는 요청할 때만 받는다.
  reply({ nodes: [], edges: [], center_entity_id: "e1", total_entities: 3 });
  await kbGraph({ center_entity_id: "e1", limit: 30, offset: 30, include_candidates: true });
  expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ center_entity_id: "e1", hops: "1", limit: "30", offset: "30", include_candidates: "true" });
  reply({ id: "e1", name: "x", aliases: [], relations: [], conflicts: [] });
  await kbEntity("e1", { include_candidates: true });
  expect(lastUrl().searchParams.get("include_candidates")).toBe("true");
  reply({ items: [], total: 0 });
  await kbConflicts({ status: "all", kind: "version_divergence", entity_id: "e-valkey", offset: 30 });
  expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ status: "all", kind: "version_divergence", entity_id: "e-valkey", limit: "50", offset: "30" });
  reply({ items: [], total: 0 });
  await kbJobs({ status: "attention", limit: 5 });
  expect(Object.fromEntries(lastUrl().searchParams)).toEqual({ status: "attention", limit: "5", offset: "0" });
  reply({ id: "j1", status: "degraded", stages: [] });
  expect((await kbJob("j1")).id).toBe("j1");
  expect(lastUrl().pathname).toBe("/api/assistant/kb/jobs/j1");
});

it("summary 에 v3 숫자가 있어야 v3 서버로 본다", () => {
  expect(isKbV3Summary(undefined)).toBe(false);
  expect(isKbV3Summary({ counts: { sources: 1, documents: 1, revisions: 1, passages: 1, evidence: 0 }, last_collected_at: null })).toBe(false);
  expect(isKbV3Summary({ counts: { sources: 1, documents: 1, revisions: 1, passages: 1, evidence: 0, entities: 0 }, last_collected_at: null })).toBe(true);
});
