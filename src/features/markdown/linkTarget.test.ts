import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import { APP_ROUTE_ROOTS, classifyHref, dirOf, fileLinkErrorText, joinFromBase, linkUrlTransform } from "./linkTarget";

const OUTBOX = "/Users/winterholic/.ttakkari/data/outbox/cb85ebe7-5424-4088-bb0b-bf4653ba1d3e/aip-20261015-result.md";

describe("classifyHref", () => {
  it("보고 메시지의 outbox 절대경로는 앱 라우트가 아니라 파일이다", () => {
    expect(classifyHref(OUTBOX)).toEqual({ kind: "file", path: OUTBOX });
  });

  it("실제 기록에 나온 파일 링크 모양을 모두 파일로 본다", () => {
    const abs = "/Users/winterholic/development/projects/winterholic-ttakkari/back/src/ttakkari/orchestrator/runtime.py";
    expect(classifyHref(`${abs}:59`)).toEqual({ kind: "file", path: `${abs}:59` });
    expect(classifyHref("/private/tmp/aip-wt-worker/product/VERIFICATION.md")).toMatchObject({ kind: "file" });
    expect(classifyHref("~/work-history/2026-10-14.md")).toEqual({ kind: "file", path: "~/work-history/2026-10-14.md" });
    expect(classifyHref("src/features/chat/Messages.tsx:93")).toEqual({ kind: "file", path: "src/features/chat/Messages.tsx:93" });
    expect(classifyHref("./README.md")).toEqual({ kind: "file", path: "./README.md" });
    expect(classifyHref("../docs/a.md")).toEqual({ kind: "file", path: "../docs/a.md" });
    expect(classifyHref("util.ts:12")).toEqual({ kind: "file", path: "util.ts:12" });
  });

  it("마크다운이 퍼센트 인코딩한 한글·공백 경로를 되돌리고 #위치는 버린다", () => {
    const enc = "/Users/winterholic/.ttakkari/data/outbox/x/%EA%B2%B0%EA%B3%BC%20%EB%B3%B4%EA%B3%A0.md";
    expect(classifyHref(enc)).toEqual({ kind: "file", path: "/Users/winterholic/.ttakkari/data/outbox/x/결과 보고.md" });
    expect(classifyHref("docs/a.md#섹션")).toEqual({ kind: "file", path: "docs/a.md" });
    expect(classifyHref("/Users/me/a.py#L10-L20")).toEqual({ kind: "file", path: "/Users/me/a.py" });
    expect(classifyHref("/Users/me/100%.md")).toEqual({ kind: "file", path: "/Users/me/100%.md" });
  });

  it("file:// 은 이 기기의 경로로 풀고 다른 호스트는 막는다", () => {
    expect(classifyHref("file:///Users/me/a%20b.md")).toEqual({ kind: "file", path: "/Users/me/a b.md" });
    expect(classifyHref("file://localhost/Users/me/a.md")).toEqual({ kind: "file", path: "/Users/me/a.md" });
    expect(classifyHref("file://other-host/etc/passwd")).toEqual({ kind: "blocked" });
  });

  it("외부 http(s), 앱 라우트, 앵커, 메일은 기존 동작을 유지한다", () => {
    expect(classifyHref("https://redis.io/docs")).toEqual({ kind: "external", href: "https://redis.io/docs" });
    expect(classifyHref("HTTP://example.com")).toMatchObject({ kind: "external" });
    expect(classifyHref("/library")).toEqual({ kind: "route", to: "/library" });
    expect(classifyHref("/memos/abc?x=1#h")).toEqual({ kind: "route", to: "/memos/abc?x=1#h" });
    expect(classifyHref("/context-library/items/a/b")).toMatchObject({ kind: "route" });
    expect(classifyHref("?artifact=abc")).toEqual({ kind: "route", to: "?artifact=abc" });
    expect(classifyHref("#section")).toEqual({ kind: "anchor", href: "#section" });
    expect(classifyHref("mailto:a@b.c")).toEqual({ kind: "passthrough", href: "mailto:a@b.c" });
    expect(classifyHref("tel:010")).toMatchObject({ kind: "passthrough" });
  });

  it("스크립트·데이터 스킴과 빈 링크는 막는다", () => {
    for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>", "vbscript:x", "", "   "]) {
      expect(classifyHref(bad), bad).toEqual({ kind: "blocked" });
    }
  });

  it("linkUrlTransform 은 file: 과 파일:줄을 지우지 않고 위험한 스킴만 지운다", () => {
    expect(linkUrlTransform("file:///Users/me/a.md")).toBe("file:///Users/me/a.md");
    expect(linkUrlTransform("util.ts:12")).toBe("util.ts:12");
    expect(linkUrlTransform("javascript:alert(1)")).toBe("");
  });

  it("APP_ROUTE_ROOTS 가 App.tsx 의 최상위 라우트와 어긋나지 않는다", () => {
    const roots = new Set([...appSource.matchAll(/path="\/([a-z-]+)/g)].map((m) => m[1]));
    expect([...roots].sort()).toEqual([...APP_ROUTE_ROOTS].sort());
  });
});

describe("joinFromBase / dirOf", () => {
  it("문서 폴더 기준으로 상대경로를 풀고 절대경로는 건드리지 않는다", () => {
    expect(joinFromBase("docs/adr", "0001.md")).toBe("docs/adr/0001.md");
    expect(joinFromBase("docs/adr", "../api-contract.md")).toBe("docs/api-contract.md");
    expect(joinFromBase("docs", "./a/./b.md:3")).toBe("docs/a/b.md:3");
    expect(joinFromBase(null, "a.md")).toBe("a.md");
    expect(joinFromBase("docs", "/Users/me/a.md")).toBe("/Users/me/a.md");
    expect(joinFromBase("docs", "~/a.md")).toBe("~/a.md");
  });

  it("작업 폴더 위로 올라가는 경로는 .. 를 남겨 백엔드가 거부하게 한다", () => {
    expect(joinFromBase("docs", "../../x.md")).toBe("../x.md");
  });

  it("dirOf", () => {
    expect(dirOf("docs/adr/0001.md")).toBe("docs/adr");
    expect(dirOf("README.md")).toBeNull();
    expect(dirOf(null)).toBeNull();
  });
});

describe("fileLinkErrorText", () => {
  it("오류 코드를 사람이 읽을 문장으로 바꾼다", () => {
    expect(fileLinkErrorText("outside_root", "x")).toMatch(/허용된 폴더 밖/);
    expect(fileLinkErrorText("sensitive", "x")).toMatch(/민감/);
    expect(fileLinkErrorText("not_found", "x")).toMatch(/찾을 수 없/);
    expect(fileLinkErrorText("weird", "서버 문장")).toBe("서버 문장");
  });
});
