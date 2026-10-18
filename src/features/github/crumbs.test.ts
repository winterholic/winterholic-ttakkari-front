import { describe, expect, it } from "vitest";
import { crumbsFor, titleFor } from "./crumbs";

const labels = (p: string) => crumbsFor(p, "a").map((c) => c.label);

describe("crumbsFor", () => {
  it("홈은 GitHub 하나뿐이고 링크가 없다", () => {
    expect(crumbsFor("/github", "a")).toEqual([{ label: "GitHub" }]);
  });
  it("owner·repo·섹션을 올라갈 수 있는 링크로 만들고 마지막은 링크를 뗀다", () => {
    const c = crumbsFor("/github/o/r/pulls/12", "a");
    expect(c.map((x) => x.label)).toEqual(["GitHub", "o", "r", "PR", "#12"]);
    expect(c[3].to).toBe("/github/o/r/pulls?as=a");
    expect(c[4].to).toBeUndefined();
  });
  it("Actions run·job 은 실행 번호로 올라간다", () => {
    expect(labels("/github/o/r/actions/runs/9001/jobs/5001")).toEqual(["GitHub", "o", "r", "Actions", "실행 #9001", "job 5001"]);
    expect(crumbsFor("/github/o/r/actions/runs/9001/jobs/5001", "a")[4].to).toBe("/github/o/r/actions/runs/9001?as=a");
  });
  it("퍼센트 인코딩된 이름을 풀어 보여 준다", () => {
    expect(labels("/github/o/r%2Ex")).toEqual(["GitHub", "o", "r.x"]);
  });
});

describe("titleFor", () => {
  it("가장 깊은 저장소·owner 이름", () => {
    expect(titleFor("/github")).toBe("GitHub");
    expect(titleFor("/github/o")).toBe("o");
    expect(titleFor("/github/o/r/issues")).toBe("o/r");
  });
});
