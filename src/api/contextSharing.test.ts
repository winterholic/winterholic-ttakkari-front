import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError, setAccessToken } from "./client";
import * as cs from "./contextSharing";

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const fetcher = vi.fn<typeof fetch>();
const call = (i = 0) => {
  const [url, init] = fetcher.mock.calls[i];
  return { url: String(url), init: init as RequestInit, body: init?.body ? JSON.parse(String(init.body)) : undefined };
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetcher);
  setAccessToken("owner-test-token");
});
afterEach(() => {
  fetcher.mockReset();
  vi.unstubAllGlobals();
  setAccessToken(null);
});

it("프로젝트·문서 목록은 GET 으로 소유자 경로만 부른다", async () => {
  fetcher.mockImplementation(async () => reply({ gateway: {}, projects: [] }));
  await cs.shareProjects();
  await cs.shareSources("e1");
  expect(call(0).url).toMatch(/\/api\/context-sharing\/projects$/);
  expect(call(0).init.method ?? "GET").toBe("GET");
  expect(call(1).url).toMatch(/\/api\/context-sharing\/projects\/e1\/sources$/);
  for (const i of [0, 1]) expect(call(i).url).not.toContain("/api/agent/");
});

it("공유 사이트 상태는 독립 GET /site 및 PATCH /site {enabled} 계약을 쓴다", async () => {
  fetcher.mockImplementation(async () => reply({ enabled: false, public_url: "https://share.example.test" }));
  await cs.getSite();
  await cs.patchSite({ enabled: false });
  expect(call(0).url).toMatch(/\/api\/context-sharing\/site$/);
  expect(call(0).init.method ?? "GET").toBe("GET");
  expect(call(1).url).toMatch(/\/api\/context-sharing\/site$/);
  expect(call(1).init.method).toBe("PATCH");
  expect(call(1).body).toEqual({ enabled: false });
});

it("초안 생성은 선택한 문서 id 와 work 범위 확인값을 그대로 보낸다", async () => {
  fetcher.mockImplementation(async () => reply({ id: "d1" }, 201));
  await cs.createDraft({ entity_id: "e1", document_ids: ["a", "b"], title: "제목", summary: "요약", confirm_work_scope: true });
  const c = call();
  expect(c.init.method).toBe("POST");
  expect(c.url).toMatch(/\/api\/context-sharing\/drafts$/);
  expect(c.body).toEqual({ entity_id: "e1", document_ids: ["a", "b"], title: "제목", summary: "요약", confirm_work_scope: true });
});

it("초안 목록은 프로젝트·상태·limit 을 쿼리로 보낸다", async () => {
  fetcher.mockImplementation(async () => reply({ drafts: [], total: 0, limit: 50, offset: 0 }));
  await cs.listDrafts({ entityId: "e1", status: "draft" });
  const u = new URL(call().url);
  expect(u.pathname).toBe("/api/context-sharing/drafts");
  expect(u.searchParams.get("entity_id")).toBe("e1");
  expect(u.searchParams.get("status")).toBe("draft");
});

it("초안 수정은 PATCH 로 expected_digest 와 변경분만 보낸다", async () => {
  fetcher.mockImplementation(async () => reply({ id: "d1" }));
  await cs.patchDraft("d1", { title: "새 제목", documents: [{ id: "x", owner_verified: true }], expected_digest: "a".repeat(64) });
  const c = call();
  expect(c.init.method).toBe("PATCH");
  expect(c.url).toMatch(/\/drafts\/d1$/);
  expect(c.body).toEqual({ title: "새 제목", documents: [{ id: "x", owner_verified: true }], expected_digest: "a".repeat(64) });
});

it("게시는 approved_digest 하나만 보낸다", async () => {
  fetcher.mockImplementation(async () => reply({ draft: {}, publication: {} }));
  await cs.publishDraft("d1", "b".repeat(64));
  const c = call();
  expect(c.init.method).toBe("POST");
  expect(c.url).toMatch(/\/drafts\/d1\/publish$/);
  expect(c.body).toEqual({ approved_digest: "b".repeat(64) });
});

it("키 발급은 서버 고정 TTL 을 따르며 slug·label·scopes 만 본문으로 보낸다", async () => {
  fetcher.mockImplementation(async () => reply({ id: "k1", key: "RAW" }, 201));
  await cs.issueKey({ project_slug: "alpha", label: "claude", scopes: ["read", "search"] });
  const c = call();
  expect(c.url).toMatch(/\/api\/context-sharing\/keys$/);
  expect(c.url).not.toContain("?");
  expect(c.body).toEqual({ project_slug: "alpha", label: "claude", scopes: ["read", "search"] });
});

it("재사용 API Key 발급은 v2 type·TTL·snapshot 정책을 요청한다", async () => {
  fetcher.mockImplementation(async () => reply({ id: "k2", key: "RAW" }, 201));
  await cs.issueKey({ project_slug: "alpha", label: "Claude Code", scopes: ["read"], credential_type: "reusable_api_v2", ttl_days: 7, snapshot_policy: "latest" });
  const c = call();
  expect(c.url).toMatch(/\/api\/context-sharing\/keys$/);
  expect(c.body).toEqual({ project_slug: "alpha", label: "Claude Code", scopes: ["read"], credential_type: "reusable_api_v2", ttl_days: 7, snapshot_policy: "latest" });
});

it("사람용 링크 발급·목록·개별 폐기는 Private /links API 계약을 쓴다", async () => {
  fetcher.mockImplementation(async () => reply({ links: [] }));
  await cs.issueLink({ project_slug: "alpha", label: "리뷰", ttl_days: 3, snapshot_policy: "pinned", allow_export: false });
  await cs.listLinks("alpha");
  await cs.revokeLink("link-1");
  expect(call(0).url).toMatch(/\/api\/context-sharing\/links$/);
  expect(call(0).init.method).toBe("POST");
  expect(call(0).body).toEqual({ project_slug: "alpha", label: "리뷰", ttl_days: 3, snapshot_policy: "pinned", allow_export: false });
  const list = new URL(call(1).url);
  expect(list.pathname).toBe("/api/context-sharing/links");
  expect(list.searchParams.get("project_slug")).toBe("alpha");
  expect(call(2).url).toMatch(/\/links\/link-1\/revoke$/);
  expect(call(2).init.method).toBe("POST");
});

it("키 목록·폐기·프로젝트 철회 경로", async () => {
  fetcher.mockImplementation(async () => reply({ keys: [] }));
  await cs.listKeys("alpha");
  await cs.revokeKey("k1");
  await cs.revokeProject("alpha");
  expect(new URL(call(0).url).searchParams.get("project_slug")).toBe("alpha");
  expect(call(1).url).toMatch(/\/keys\/k1\/revoke$/);
  expect(call(1).init.method).toBe("POST");
  expect(call(2).url).toMatch(/\/projects\/alpha\/revoke$/);
  expect(call(2).init.method).toBe("POST");
});

it("서버 오류의 부가 필드(current_digest·document_ids·partial)를 ApiError.extra 로 보존한다", async () => {
  fetcher.mockImplementation(async () =>
    reply({ code: "digest_mismatch", message: "다름", current_digest: "c".repeat(64) }, 409),
  );
  const e = await cs.publishDraft("d1", "b".repeat(64)).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(ApiError);
  expect((e as ApiError).code).toBe("digest_mismatch");
  expect((e as ApiError).extra).toEqual({ current_digest: "c".repeat(64) });
});
