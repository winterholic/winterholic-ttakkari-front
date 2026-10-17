import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const notFound = () => json({ code: "not_found", message: "Not Found" }, 404);

const fetchMock = vi.fn<typeof fetch>();
const rows = [{ id: "a1", name: "A1" }, { id: "a2", name: "A2" }];
const paths = () => fetchMock.mock.calls.map((c) => new URL(String(c[0])).pathname + new URL(String(c[0])).search);

/** 일괄 조회 재사용 캐시가 모듈 안에 있어 테스트마다 새로 불러온다. */
async function load() {
  vi.resetModules();
  const api = await import("./client");
  api.setAccessToken("t");
  return api;
}

beforeEach(() => { vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

describe("구버전 백엔드 사용량 폴백", () => {
  it("새 엔드포인트가 있으면 폴백 없이 그대로 쓴다", async () => {
    fetchMock.mockImplementation(async (url) => String(url).includes("/usage/cached") ? json(rows) : json(rows[0]));
    const api = await load();
    expect(await api.accountUsageCached()).toEqual(rows);
    expect(await api.accountUsageOne("a1", true)).toEqual(rows[0]);
    expect(paths()).toEqual(["/api/accounts/usage/cached", "/api/accounts/a1/usage?refresh=true"]);
  });

  it("cached 가 404 면 기존 일괄 API 결과로 목록을 채운다", async () => {
    fetchMock.mockImplementation(async (url) => String(url).includes("/usage/cached") ? notFound() : json(rows));
    const api = await load();
    expect(await api.accountUsageCached()).toEqual(rows);
    expect(paths()).toEqual(["/api/accounts/usage/cached", "/api/accounts/usage?refresh=false"]);
  });

  it("계정별 조회가 404 면 일괄 결과에서 그 계정을 고르고, 여러 카드가 일괄 요청을 한 번만 보낸다", async () => {
    fetchMock.mockImplementation(async (url) => /\/api\/accounts\/usage\?/.test(String(url)) ? json(rows) : notFound());
    const api = await load();
    const [a1, a2] = await Promise.all([api.accountUsageOne("a1"), api.accountUsageOne("a2")]);
    expect([a1, a2]).toEqual(rows);
    expect(paths().filter((p) => p.startsWith("/api/accounts/usage?"))).toEqual(["/api/accounts/usage?refresh=false"]);
  });

  it("새로고침은 refresh=true 일괄 조회를 쓴다", async () => {
    fetchMock.mockImplementation(async (url) => /\/api\/accounts\/usage\?/.test(String(url)) ? json(rows) : notFound());
    const api = await load();
    await api.accountUsageOne("a2", true);
    expect(paths()).toContain("/api/accounts/usage?refresh=true");
  });

  it("일괄 결과에 없는 계정은 원래 404 를 던진다", async () => {
    fetchMock.mockImplementation(async (url) => /\/api\/accounts\/usage\?/.test(String(url)) ? json(rows) : notFound());
    const api = await load();
    await expect(api.accountUsageOne("zz")).rejects.toMatchObject({ status: 404 });
  });

  it("404 가 아닌 오류는 폴백하지 않는다", async () => {
    fetchMock.mockResolvedValue(json({ code: "boom", message: "서버 오류" }, 500));
    const api = await load();
    await expect(api.accountUsageCached()).rejects.toMatchObject({ status: 500 });
    await expect(api.accountUsageOne("a1")).rejects.toMatchObject({ status: 500 });
    expect(paths().every((p) => !p.startsWith("/api/accounts/usage?"))).toBe(true);
  });

  it("일괄 조회가 실패하면 다음 호출은 실패를 재사용하지 않는다", async () => {
    let n = 0;
    fetchMock.mockImplementation(async (url) => {
      if (!/\/api\/accounts\/usage\?/.test(String(url))) return notFound();
      return ++n === 1 ? json({ code: "boom", message: "x" }, 500) : json(rows);
    });
    const api = await load();
    await expect(api.accountUsageOne("a1")).rejects.toMatchObject({ status: 500 });
    expect(await api.accountUsageOne("a1")).toEqual(rows[0]);
  });
});
