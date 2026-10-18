// 독립 검증용 반례 테스트(기존 테스트가 다루지 않은 입력). 구현 수정 없이 현재 동작을 고정해 본다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { GhContext } from "./GithubContext";
import { GhMarkdown } from "./GhMarkdown";
import { githubWebUrl, ghPath, resolveRelative, routeForResolved, safeGithubHref } from "./links";
import { parsePatch } from "./pulls/parsePatch";
import { GhApiError, ghContents, ghMe } from "../../api/githubClient";
import { setAccessToken } from "../../api/client";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setAccessToken(null);
});

const VECTORS = [
  "[a](javascript:alert(1))", "[a](JaVaScRiPt:alert(1))", "[a](java\tscript:alert(1))", "[a](data:text/html;base64,PHNjcmlwdD4=)", "[a](vbscript:x)",
  "[a](//evil.com/x)", "[a](https://github.com@evil.com/)", "[a](https://evil.com/github.com)", "[a](https://api.github.com/user)",
  "[a](https://github.com:8443/x)", "[a](http://github.com/x)", "[a](https://github.com.evil.com/x)", "[a](https://github.com./x)",
  '<a href="javascript:alert(1)">x</a>', "<img src=x onerror=alert(1)>", "<iframe src=https://evil.com></iframe>", "<svg onload=alert(1)>", "<script>alert(1)</script>",
  "![x](https://evil.com/p.png)", "![x](javascript:alert(1))", "![x](data:image/svg+xml,<svg onload=alert(1)>)",
  "https://evil.com/auto", "www.evil.com", "<https://evil.com>", "evil@example.com",
  "[a][1]\n\n[1]: javascript:alert(1)", "[a](\\\\evil.com)", "[a](x/../../../../y)", "[a](%2e%2e/%2e%2e/x)", "<details><summary onclick=alert(1)>x</summary></details>",
  "[a](https://github.com/o/r \"t\" onmouseover=\"alert(1)\")", "[a](<https://github.com/o/r>)",
];

describe("GhMarkdown 반례", () => {
  it.each(VECTORS)("%s", (md) => {
    const { container } = render(
      <MemoryRouter>
        <GhContext.Provider value={{ account: "alice", accounts: [], switchAccount: () => {} }}>
          <GhMarkdown base={{ owner: "o", repo: "r", ref: "main", file: "docs/a.md" }}>{md}</GhMarkdown>
        </GhContext.Provider>
      </MemoryRouter>,
    );
    expect(container.querySelector("script,iframe,svg,object,embed,form,style,link,meta,img,video,audio")).toBeNull();
    for (const el of container.querySelectorAll("*")) for (const a of el.getAttributeNames()) expect(a.toLowerCase().startsWith("on"), a).toBe(false);
    for (const a of container.querySelectorAll("a")) {
      const href = a.getAttribute("href") ?? "";
      const external = /^https:\/\/github\.com\//.test(href);
      const internal = href.startsWith("/github/");
      expect(external || internal, "href=" + href).toBe(true);
      if (external) {
        expect(a.getAttribute("target")).toBe("_blank");
        expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      }
    }
  });
});

describe("safeGithubHref·링크 도우미 반례", () => {
  it.each([
    ["https://github.com/o/r", true], ["https://www.github.com/o/r", true], ["HTTPS://GITHUB.COM/o/r", true], ["https://github.com:443/o/r", true],
    ["https://github.com:444/o/r", false], ["https://u:p@github.com/o", false], ["https://github.com@evil.com", false], ["https://github.com\\@evil.com", true],
    ["https://evil.com#@github.com", false], ["http://github.com/o", false], ["javascript:alert(1)", false], ["//github.com/o", false], ["https://github.com./o", false],
    ["https://github。com/o", true], ["https://githuB.com/o", true], ["https://gïthub.com/o", false],
  ])("%s → %s", (href, ok) => {
    expect(safeGithubHref(href) !== null).toBe(ok);
  });

  it("역슬래시·전각 마침표는 WHATWG URL 이 정규화하므로 통과해도 반환값 호스트는 github.com 이다", () => {
    for (const h of ["https://github.com\\@evil.com", "https://github。com/o"]) expect(new URL(safeGithubHref(h)!).hostname).toBe("github.com");
  });

  it("safeGithubHref 가 정규화한 값은 항상 https://github.com 계열로 시작", () => {
    expect(safeGithubHref("HTTPS://GITHUB.COM:443/o/r?x=1#y")).toBe("https://github.com/o/r?x=1#y");
  });

  it("ref·path 에 특수문자가 있어도 쿼리로만 실리고 경로 구조를 바꾸지 않는다", () => {
    const p = ghPath("alice", { owner: "o", repo: "r", section: "code", ref: "feat/a#1?x=1&y", path: "dir/a b#c?d%e&f.txt" });
    const u = new URL("http://x" + p);
    expect(u.pathname).toBe("/github/o/r/code");
    expect(u.searchParams.get("ref")).toBe("feat/a#1?x=1&y");
    expect(u.searchParams.get("path")).toBe("dir/a b#c?d%e&f.txt");
    expect(u.searchParams.get("as")).toBe("alice");
  });

  it("githubWebUrl: 세그먼트마다 인코딩하고 슬래시는 유지, 이름 규칙 위반은 null", () => {
    expect(githubWebUrl({ kind: "blob", owner: "o", repo: "r", ref: "feat/a#1", path: "d/a b#c?.txt" })).toBe("https://github.com/o/r/blob/feat/a%231/d/a%20b%23c%3F.txt");
    expect(githubWebUrl({ kind: "repo", owner: "o/x", repo: "r" })).toBeNull();
    expect(githubWebUrl({ kind: "repo", owner: "o", repo: ".." })).toBeNull();
    expect(githubWebUrl({ kind: "pull", owner: "o", repo: "r", number: 1 })).toBe("https://github.com/o/r/pull/1");
  });

  it("resolveRelative: 조상 탈출·백슬래시·퍼센트 인코딩 조작", () => {
    expect(resolveRelative("a.md", "../x")).toBeNull();
    expect(resolveRelative("d/a.md", "../../x")).toBeNull();
    expect(resolveRelative("d/a.md", "../x")).toBe("x");
    expect(resolveRelative("a.md", "%2e%2e/x")).toBe("%2e%2e/x"); // 서버가 ".." 로 해석하지 못하게 거부해야 하는 값(아래 서버 호출은 쿼리로 인코딩됨)
    expect(resolveRelative("a.md", "mailto:a@b")).toBeNull();
    expect(resolveRelative("a.md", "tel:1")).toBeNull();
  });

  it("routeForResolved: 서버가 준 필드에 슬래시·쿼리 문자가 있어도 경로가 갈라지지 않는다", () => {
    const p = routeForResolved("alice", { kind: "code", owner: "o", repo: "r", ref: "a/b?c", path: "x/y#z", number: null, run_id: null, job_id: null, needs_ref_resolution: false } as never);
    const u = new URL("http://x" + p);
    expect(u.pathname).toBe("/github/o/r/code");
    expect(u.searchParams.get("path")).toBe("x/y#z");
  });
});

describe("parsePatch 반례", () => {
  it("hunk 머리 앞 잡음 버림, '\\ No newline', CRLF, 빈 컨텍스트 줄(공백 제거된 patch)", () => {
    const patch = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n a\n\n-b\n+c\n\\ No newline at end of file\r\n";
    const h = parsePatch(patch);
    expect(h).toHaveLength(1);
    expect(h[0].lines.map((l) => l.type)).toEqual(["ctx", "ctx", "del", "add", "meta"]);
    expect(h[0].lines[1]).toMatchObject({ oldNo: 2, newNo: 2, text: "" });
  });
  it("본문에 '@@' 로 시작하는 추가·삭제·컨텍스트 줄이 있어도 새 hunk 로 오인하지 않는다", () => {
    const patch = "@@ -1,2 +1,2 @@\n+@@ -9,9 +9,9 @@\n-@@ -1 +1 @@\n @@ -5 +5 @@\n";
    const h = parsePatch(patch);
    expect(h).toHaveLength(1);
    expect(h[0].lines).toHaveLength(3);
  });
  it("헤더 없는 patch·빈 patch·매우 긴 한 줄도 던지지 않는다", () => {
    expect(parsePatch("")).toEqual([]);
    expect(parsePatch("+only")).toEqual([]);
    const t0 = performance.now();
    const h = parsePatch("@@ -1 +1 @@\n+" + "x".repeat(2_000_000));
    expect(h[0].lines[0].text.length).toBe(2_000_000);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
  it("수만 줄 patch 파싱 시간", () => {
    const body = Array.from({ length: 60_000 }, (_, i) => (i % 3 ? "+" : "-") + "line " + i).join("\n");
    const t0 = performance.now();
    const h = parsePatch("@@ -1,1 +1,1 @@\n" + body);
    expect(h[0].lines).toHaveLength(60_000);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe("githubClient 요청·오류 반례", () => {
  const jsonRes = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  it("account·ref·path·특수 owner 는 쿼리 인코딩되고 경로는 세그먼트 인코딩된다", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonRes(200, { data: {} }));
    await ghContents("al ice&x=1", "o", "r", { ref: "a/b#c", path: "d e/f?g.txt" });
    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/github/repos/o/r/contents");
    expect(url.searchParams.get("account")).toBe("al ice&x=1");
    expect(url.searchParams.get("ref")).toBe("a/b#c");
    expect(url.searchParams.get("path")).toBe("d e/f?g.txt");
    expect([...url.searchParams.keys()].sort()).toEqual(["account", "path", "ref"]);
    expect((f.mock.calls[0][1] as RequestInit).method).toBe("GET");
  });

  it.each([502, 429, 403, 404, 422, 409])("GitHub 오류 %s 는 로그아웃(refresh 호출)을 유발하지 않는다", async (status) => {
    setAccessToken("app-token");
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonRes(status, { code: status === 429 ? "gh_rate_limited" : "gh_not_found", message: "m", reset: 1792291172, retry_after: 30 }, status === 429 ? { "Retry-After": "30" } : {}));
    await expect(ghMe("alice")).rejects.toBeInstanceOf(GhApiError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each(["gh_auth_expired", "account_unavailable", "no_account", "invalid_target", "unsupported_host"])("방어: 이런 코드가 혹시 401 로 와도 %s 는 refresh 없이 GhApiError", async (code) => {
    setAccessToken("app-token");
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonRes(401, { code, message: "m" }));
    await expect(ghMe("alice")).rejects.toMatchObject({ code, status: 401 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("앱 401 은 refresh 를 한 번 시도한다(앱 세션 만료와 GitHub 만료를 구분)", async () => {
    setAccessToken("old");
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const u = String(input);
      if (u.includes("/api/auth/refresh")) return jsonRes(401, { code: "unauthorized", message: "no" });
      return jsonRes(401, { code: "unauthorized", message: "no" });
    });
    await expect(ghMe("alice")).rejects.toBeInstanceOf(GhApiError);
    expect(f.mock.calls.some((c) => String(c[0]).includes("/api/auth/refresh"))).toBe(true);
  });

  it("프록시 HTML 502·빈 본문·네트워크 오류도 GhApiError 로 정리된다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }));
    await expect(ghMe("alice")).rejects.toMatchObject({ status: 502 });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 504 }));
    await expect(ghMe("alice")).rejects.toMatchObject({ status: 504 });
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(ghMe("alice")).rejects.toMatchObject({ code: "network" });
  });
});
