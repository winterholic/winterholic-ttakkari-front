import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessToken, onAuthLost, setAccessToken } from "./client";
import { GhApiError, ghContents, ghIssues, ghJobLogs, ghMe, ghRepo, ghResolve, ghAccounts, ghKey } from "./githubClient";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const fetchMock = vi.fn<typeof fetch>();
const authLost = vi.fn();
const rate = { limit: 5000, remaining: 4990, reset: 1, low: false };
const env = (data: unknown) => ({ data, rate, fetched_at: "2026-10-18T00:00:00Z", cached: false, account: "winterholic" });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAccessToken("app-token");
  onAuthLost(authLost);
});
afterEach(() => {
  fetchMock.mockReset();
  authLost.mockReset();
  onAuthLost(null);
  vi.unstubAllGlobals();
});

const lastUrl = () => new URL(String(fetchMock.mock.calls.at(-1)![0]));

describe("요청 구성", () => {
  it("모든 호출에 account 쿼리와 앱 Bearer 를 싣고 경로 조각을 인코딩한다", async () => {
    fetchMock.mockImplementation(async () => json(env({ name: "r" })));
    await ghRepo("winterholic", "own er", "re/po");
    const u = lastUrl();
    expect(u.pathname).toBe("/api/github/repos/own%20er/re%2Fpo");
    expect(u.searchParams.get("account")).toBe("winterholic");
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer app-token");
  });

  it("값이 없는 쿼리는 보내지 않고 ref·path 는 쿼리로만 전달한다", async () => {
    fetchMock.mockImplementation(async () => json(env({ kind: "dir", entries: [] })));
    await ghContents("a", "o", "r", { ref: "feat/x y", path: "src/a b.ts" });
    const u = lastUrl();
    expect(u.pathname).toBe("/api/github/repos/o/r/contents");
    expect(u.searchParams.get("ref")).toBe("feat/x y");
    expect(u.searchParams.get("path")).toBe("src/a b.ts");
    await ghIssues("a", "o", "r", { state: "open", page: undefined });
    expect(lastUrl().searchParams.has("page")).toBe(false);
  });

  it("계정 목록·입력 해석은 account 를 보내지 않는다", async () => {
    fetchMock.mockImplementation(async () => json({ data: [] }));
    await ghAccounts();
    expect(lastUrl().searchParams.has("account")).toBe(false);
    fetchMock.mockImplementation(async () => json({ kind: "repo", owner: "o", repo: "r" }));
    await ghResolve("https://github.com/o/r");
    expect(lastUrl().pathname).toBe("/api/github/resolve");
    expect(lastUrl().searchParams.get("q")).toBe("https://github.com/o/r");
    expect(lastUrl().searchParams.has("account")).toBe(false);
  });

  it("로그 창은 from_line·lines 를 쿼리로 보낸다", async () => {
    fetchMock.mockImplementation(async () => json(env({ lines: [], total_lines: 0, from_line: 1, masked: true, truncated: false })));
    await ghJobLogs("a", "o", "r", "77", { from_line: 2001, lines: 2000 });
    const u = lastUrl();
    expect(u.pathname).toBe("/api/github/repos/o/r/actions/jobs/77/logs");
    expect(u.searchParams.get("from_line")).toBe("2001");
  });
});

describe("401 과 오류 처리", () => {
  it("GitHub 상류 만료 코드는 401 이어도 앱 세션을 건드리지 않는다", async () => {
    fetchMock.mockImplementation(async () => json({ code: "gh_auth_expired", message: "만료" }, 401));
    const err = await ghMe("a").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GhApiError);
    expect((err as GhApiError).code).toBe("gh_auth_expired");
    expect(fetchMock).toHaveBeenCalledTimes(1); // refresh 호출 없음
    expect(authLost).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("app-token");
  });

  it("앱 자신의 401 은 refresh 후 한 번 재요청한다", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/api/auth/refresh")) return json({ access_token: "fresh" });
      return (init!.headers as Record<string, string>).Authorization === "Bearer fresh" ? json(env({ login: "a" })) : json({ code: "unauthorized", message: "x" }, 401);
    });
    const r = await ghMe("a");
    expect(r.data).toEqual({ login: "a" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("앱 refresh 까지 실패하면 앱 로그아웃 경로를 탄다", async () => {
    fetchMock.mockImplementation(async (url) => (String(url).endsWith("/api/auth/refresh") ? json({ code: "unauthorized", message: "x" }, 401) : json({ code: "unauthorized", message: "x" }, 401)));
    await ghMe("a").catch(() => undefined);
    expect(authLost).toHaveBeenCalled();
  });

  it("reset·reason·retry_after 를 오류에 담는다", async () => {
    fetchMock.mockImplementation(async () => json({ code: "gh_rate_limited", message: "한도", reset: 1_900_000_000 }, 429, { "Retry-After": "30" }));
    const e1 = (await ghMe("a").catch((e: unknown) => e)) as GhApiError;
    expect(e1.reset).toBe(1_900_000_000);
    expect(e1.retryAfter).toBe(30);
    fetchMock.mockImplementation(async () => json({ detail: { code: "gh_forbidden", message: "SSO", reason: "sso_required" } }, 403));
    const e2 = (await ghMe("a").catch((e: unknown) => e)) as GhApiError;
    expect(e2.code).toBe("gh_forbidden");
    expect(e2.reason).toBe("sso_required");
  });

  it("네트워크 실패는 network 코드로 감싼다", async () => {
    fetchMock.mockRejectedValue(new TypeError("fail"));
    const e = (await ghMe("a").catch((x: unknown) => x)) as GhApiError;
    expect(e.code).toBe("network");
  });
});

describe("쿼리 키", () => {
  it("모든 키가 선택 계정으로 시작해 계정 간 캐시가 섞이지 않는다", () => {
    expect(ghKey("a", "repo", "o", "r")).toEqual(["github", "a", "repo", "o", "r"]);
    expect(ghKey("a", "repo", "o", "r")).not.toEqual(ghKey("b", "repo", "o", "r"));
  });
});
