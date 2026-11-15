import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GhApiError } from "./githubClient";
import { getAppraisal, listAppraisals, startAppraisal } from "./repoAppraisalClient";
import { onAuthLost, setAccessToken } from "./client";

// 상류 GitHub 오류가 앱 로그아웃으로 번지지 않는지 본다. 백엔드는 상류 401 을
// 502 로 바꾸지만(github/errors.py), 혹시 401 로 와도 코드로 가려 로그아웃하지 않는다.
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  setAccessToken("app-token");
  onAuthLost(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  onAuthLost(null);
});

it("시작 200 은 재사용, 202 는 새 실행으로 구분한다", async () => {
  const fetchMock = vi.fn(async () => json({ id: "1", status: "done" }, 200));
  vi.stubGlobal("fetch", fetchMock);
  const hit = await startAppraisal({ target: "acme/widgets", account: "alice", mode: "quick", force: false });
  expect(hit.reused).toBe(true);
  expect((hit.appraisal as { id: string }).id).toBe("1");
  const init = (fetchMock.mock.calls[0] as unknown as [unknown, { body: string }])[1];
  expect(init).toMatchObject({ method: "POST", credentials: "include" });
  expect(JSON.parse(init.body)).toEqual({ target: "acme/widgets", account: "alice", mode: "quick", force: false });

  fetchMock.mockImplementation(async () => json({ id: "2", status: "queued" }, 202));
  const fresh = await startAppraisal({ target: "acme/widgets", account: "alice", mode: "deep", force: true });
  expect(fresh.reused).toBe(false);
});

it("401 이어도 상류 코드면 refresh·로그아웃 없이 그대로 던진다", async () => {
  const lost = vi.fn();
  onAuthLost(lost);
  const fetchMock = vi.fn(async () => json({ code: "gh_auth_expired", message: "만료" }, 401));
  vi.stubGlobal("fetch", fetchMock);
  const err = await getAppraisal("some-id").then(
    () => { throw new Error("should throw"); },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(GhApiError);
  expect((err as GhApiError).code).toBe("gh_auth_expired");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(lost).not.toHaveBeenCalled();
});

it("이력은 owner·repo·limit 을 쿼리로 보낸다", async () => {
  const fetchMock = vi.fn(async () => json({ items: [] }, 200));
  vi.stubGlobal("fetch", fetchMock);
  await listAppraisals("acme", "widgets", 20);
  const url = (fetchMock.mock.calls[0] as unknown as [unknown])[0];
  expect(String(url)).toContain("/api/repo-appraisals?owner=acme&repo=widgets&limit=20");
});

it("연결 실패는 network 코드로 바꾼다", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
  const err = await getAppraisal("some-id").then(
    () => { throw new Error("should throw"); },
    (e: unknown) => e,
  );
  expect((err as GhApiError).code).toBe("network");
});
