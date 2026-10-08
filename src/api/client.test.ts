import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, listWorkspaces, onAuthLost, setAccessToken, getAccessToken, downloadLink } from "./client";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAccessToken("old");
  onAuthLost(null);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});


describe("client 401 처리", () => {
  it("401 이면 refresh 후 새 토큰으로 한 번 재요청한다", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/api/auth/refresh")) return json({ access_token: "new", token_type: "bearer", expires_in: 900 });
      return (init!.headers as Record<string, string>).Authorization === "Bearer new"
        ? json([{ id: "w1" }])
        : json({ code: "unauthorized", message: "만료" }, 401);
    });
    const r = await listWorkspaces();
    expect(r).toEqual([{ id: "w1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getAccessToken()).toBe("new");
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe("include");
  });

  it("동시 401 은 refresh 를 한 번만 호출한다", async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/api/auth/refresh")) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return json({ access_token: "new", token_type: "bearer", expires_in: 900 });
      }
      return (init!.headers as Record<string, string>).Authorization === "Bearer new"
        ? json([])
        : json({ code: "unauthorized", message: "x" }, 401);
    });
    await Promise.all([listWorkspaces(), listWorkspaces(), listWorkspaces()]);
    expect(refreshCalls).toBe(1);
  });

  it("refresh 가 실패하면 onAuthLost 를 부르고 ApiError 를 던진다", async () => {
    const lost = vi.fn();
    onAuthLost(lost);
    fetchMock.mockImplementation(async () => json({ code: "unauthorized", message: "no" }, 401));
    await expect(listWorkspaces()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(lost).toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    // 원 요청 1 + refresh 1, 무한 재시도 없음
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("ApiError", () => {
  it("{code,message} 본문과 Retry-After 를 파싱한다", async () => {
    fetchMock.mockResolvedValue(json({ code: "rate_limited", message: "잠시 후" }, 429, { "Retry-After": "30" }));
    const err = await listWorkspaces().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: "rate_limited", message: "잠시 후", retryAfter: 30 });
  });

  it("422 의 errors 배열을 보존한다", async () => {
    fetchMock.mockResolvedValue(
      json({ code: "validation", message: "bad", errors: [{ loc: ["body", "name"], msg: "required" }] }, 422),
    );
    const err = (await listWorkspaces().catch((e: unknown) => e)) as ApiError;
    expect(err.errors).toEqual([{ loc: ["body", "name"], msg: "required" }]);
  });

  it("JSON 이 아닌 오류 본문은 http_<status> 코드로 만든다", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 502, statusText: "Bad Gateway" }));
    await expect(listWorkspaces()).rejects.toMatchObject({ status: 502, code: "http_502" });
  });
});

describe("downloadLink", () => {
  it("상대 경로를 절대 URL 로 바꾼다", async () => {
    fetchMock.mockResolvedValue(json({ url: "/api/dl/tok", expires_at: "2026-01-01T00:00:00Z" }));
    const r = await downloadLink("a1");
    expect(r.url).toMatch(/^https?:\/\/.+\/api\/dl\/tok$/);
  });
});

