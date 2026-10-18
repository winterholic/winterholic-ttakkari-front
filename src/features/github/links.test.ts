import { describe, expect, it } from "vitest";
import { ghPath, githubWebUrl, parseNumber, resolveRelative, safeGithubHref, withQuery, preserveQuery, routeForResolved } from "./links";

describe("safeGithubHref", () => {
  it.each([
    ["https://github.com/o/r", "https://github.com/o/r"],
    ["https://www.github.com/o/r/pull/3", "https://www.github.com/o/r/pull/3"],
  ])("%s 허용", (input, out) => expect(safeGithubHref(input)).toBe(out));
  it.each([
    "http://github.com/o/r", "javascript:alert(1)", "https://github.com.evil.com/o", "https://evil.com/github.com",
    "https://user@github.com/o", "https://github.com:8443/o", "//github.com/o", "file:///etc/passwd", "git@github.com:o/r", "", null, undefined,
    "https://github.com@evil.com/", "https://api.github.com/repos/o/r",
  ])("%s 거부", (input) => expect(safeGithubHref(input as string | null | undefined)).toBeNull());
});

describe("githubWebUrl", () => {
  it("검증된 owner/repo 조각만으로 github.com 주소를 만든다", () => {
    expect(githubWebUrl({ owner: "o", repo: "r", kind: "actions-job", runId: "5", jobId: "9" })).toBe("https://github.com/o/r/actions/runs/5/job/9");
    expect(githubWebUrl({ owner: "o", repo: "r", kind: "pull", number: 4 })).toBe("https://github.com/o/r/pull/4");
    expect(githubWebUrl({ owner: "o", repo: "r", kind: "blob", ref: "feat/x", path: "a b/c.ts" })).toBe("https://github.com/o/r/blob/feat/x/a%20b/c.ts");
    expect(githubWebUrl({ owner: "o", kind: "owner" })).toBe("https://github.com/o");
  });
  it("규칙에 어긋난 owner 는 null", () => {
    expect(githubWebUrl({ owner: "../x", repo: "r", kind: "repo" })).toBeNull();
    expect(githubWebUrl({ owner: "o", repo: "..", kind: "repo" })).toBeNull();
  });
});

describe("parseNumber", () => {
  it("1 이상 정수만 받는다", () => {
    expect(parseNumber("12")).toBe(12);
    for (const bad of ["0", "-1", "01", "1.5", "abc", "", undefined, "99999999999", "2147483649"]) expect(parseNumber(bad as string | undefined)).toBeNull();
  });
  it("pull-files 주소", () => {
    expect(githubWebUrl({ owner: "o", repo: "r", kind: "pull-files", number: 4 })).toBe("https://github.com/o/r/pull/4/files");
  });
});

describe("ghPath / withQuery / preserveQuery", () => {
  it("as 를 항상 붙이고 ref·path 를 쿼리로 둔다", () => {
    expect(ghPath("winterholic", { owner: "o", repo: "r", section: "code", ref: "feat/x", path: "src/a.ts" })).toBe("/github/o/r/code?as=winterholic&ref=feat%2Fx&path=src%2Fa.ts");
    expect(ghPath("a", { owner: "o", repo: "r", section: "pulls", number: 12 })).toBe("/github/o/r/pulls/12?as=a");
    expect(ghPath("a", { owner: "o", repo: "r", section: "job", runId: "5", jobId: "9" })).toBe("/github/o/r/actions/runs/5/jobs/9?as=a");
    expect(ghPath("a", { owner: "o" })).toBe("/github/o?as=a");
    expect(ghPath("a", {})).toBe("/github?as=a");
  });
  it("쿼리 값을 바꾸고 빈 값은 지운다", () => {
    const p = new URLSearchParams("as=a&state=open&page=3");
    expect(withQuery(p, { state: "closed", page: undefined }).toString()).toBe("as=a&state=closed");
  });
  it("계정 전환 시 나머지 쿼리는 유지한다", () => {
    expect(preserveQuery(new URLSearchParams("as=a&ref=main&path=x"), "b").toString()).toBe("as=b&ref=main&path=x");
  });
});

describe("resolveRelative", () => {
  it("README 위치 기준으로 상대 링크를 저장소 경로로 푼다", () => {
    expect(resolveRelative("docs/README.md", "guide/a.md")).toBe("docs/guide/a.md");
    expect(resolveRelative("docs/README.md", "../b.md")).toBe("b.md");
    expect(resolveRelative("README.md", "./c.md#x")).toBe("c.md");
    expect(resolveRelative("README.md", "/abs/d.md")).toBe("abs/d.md");
  });
  it("저장소 밖으로 나가는 링크와 스킴이 있는 링크는 null", () => {
    expect(resolveRelative("README.md", "../../x")).toBeNull();
    expect(resolveRelative("README.md", "mailto:a@b.c")).toBeNull();
    expect(resolveRelative("README.md", "https://x.com")).toBeNull();
    expect(resolveRelative("README.md", "#top")).toBeNull();
  });
});

describe("routeForResolved", () => {
  it("해석 결과 필드로 앱 경로를 만든다(원본 URL 은 쓰지 않는다)", () => {
    expect(routeForResolved("a", { kind: "repo", owner: "o", repo: "r" })).toBe("/github/o/r?as=a");
    expect(routeForResolved("a", { kind: "pull", owner: "o", repo: "r", number: 3 })).toBe("/github/o/r/pulls/3?as=a");
    expect(routeForResolved("a", { kind: "code", owner: "o", repo: "r", ref: "feat/x", path: "a.ts", is_file: true })).toBe("/github/o/r/code?as=a&ref=feat%2Fx&path=a.ts");
    expect(routeForResolved("a", { kind: "code", owner: "o", repo: "r", ref: null, path: null })).toBe("/github/o/r/code?as=a");
    expect(routeForResolved("a", { kind: "owner", owner: "o" })).toBe("/github/o?as=a");
    expect(routeForResolved("a", { kind: "run", owner: "o", repo: "r", run_id: 5 })).toBe("/github/o/r/actions/runs/5?as=a");
    expect(routeForResolved("a", { kind: "job", owner: "o", repo: "r", run_id: 5, job_id: 9 })).toBe("/github/o/r/actions/runs/5/jobs/9?as=a");
  });
  it("필요한 필드가 비면 가장 가까운 목록 화면으로 내려간다", () => {
    expect(routeForResolved("a", { kind: "pull", owner: "o", repo: "r" })).toBe("/github/o/r/pulls?as=a");
    expect(routeForResolved("a", { kind: "job", owner: "o", repo: "r", run_id: 5 })).toBe("/github/o/r/actions/runs/5?as=a");
    expect(routeForResolved("a", { kind: "repo", owner: "o" })).toBe("/github/o?as=a");
  });
});
