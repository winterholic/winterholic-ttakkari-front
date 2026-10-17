import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

afterEach(cleanup);

describe("PageHeader 메타", () => {
  it("글자 메타는 .tk-header__meta-text 에 담겨 말줄임이 먹는다(flex 상자의 맨 글자는 말줄임이 안 된다)", () => {
    const { container } = render(<PageHeader title="알림" meta="안 읽은 알림 148개" />);
    const text = container.querySelector(".tk-header__meta > .tk-header__meta-text");
    expect(text?.textContent).toBe("안 읽은 알림 148개");
    expect(container.querySelector(".tk-header__meta")?.getAttribute("title")).toBe("안 읽은 알림 148개");
  });

  it("요소 메타(배지 + 글자)는 그대로 둔다", () => {
    const { container } = render(<PageHeader title="프로젝트" meta={<span className="custom"><b>진행</b> 개인</span>} />);
    expect(container.querySelector(".tk-header__meta-text")).toBeNull();
    expect(container.querySelector(".tk-header__meta > .custom")).toBeTruthy();
  });

  it("메타가 없으면 .tk-header__meta 를 그리지 않는다", () => {
    const { container } = render(<PageHeader title="설정" />);
    expect(container.querySelector(".tk-header__meta")).toBeNull();
  });
});
