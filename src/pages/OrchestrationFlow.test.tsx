import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrchestrationFlow } from "./OrchestrationFlow";

afterEach(cleanup);

describe("비서 실행 흐름", () => {
  it("접수부터 작업 보고와 사용자 보고까지의 흐름을 보여 준다", () => {
    render(<OrchestrationFlow />);

    expect(screen.getByRole("figure", { name: "따까리 실제 실행 흐름" })).toBeTruthy();
    const copy = document.body.textContent ?? "";
    for (const label of ["사용자 요청", "접수", "기획 세션", "작업 세션", "[작업 보고]", "사용자에게 결과 보고", "Opus medium", "GPT Sol high", "Luna high"]) {
      expect(copy).toContain(label);
    }
  });

  it("역할별 지침·기억·지식·도구의 적용 범위와 운영 정책을 설명한다", () => {
    render(<OrchestrationFlow />);

    const copy = document.body.textContent ?? "";
    for (const label of ["접수 지침만", "공통 + 기획 지침", "공통 + 작업 지침", "library_catalog", "recall", "remember", "link", "work-history", "share_file", "account_usage", "50%", "70%"] ) {
      expect(copy).toContain(label);
    }
  });
});
