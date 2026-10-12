import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "./Composer";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  // jsdom 에는 캔버스가 없다. 측정이 안 되면 실제 줄 수로 가리는 길을 탄다.
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

function setup(context?: React.ReactNode) {
  render(<Composer draftKey="t" running={false} queued={0} onSubmit={() => {}} onAttach={() => {}} context={context} />);
  return { form: screen.getByRole("form"), input: screen.getByRole("textbox") };
}

describe("Composer 배치", () => {
  it("빈 상태와 한 줄은 한 줄 배치, 줄바꿈이 들어가면 본문을 윗줄로 올린다", () => {
    const { form, input } = setup();
    expect(form.hasAttribute("data-stacked")).toBe(false);
    fireEvent.change(input, { target: { value: "한 줄" } });
    expect(form.hasAttribute("data-stacked")).toBe(false);
    fireEvent.change(input, { target: { value: "첫 줄\n둘째 줄" } });
    expect(form.hasAttribute("data-stacked")).toBe(true);
    fireEvent.change(input, { target: { value: "" } });
    expect(form.hasAttribute("data-stacked")).toBe(false);
  });

  it("첨부가 붙으면 비어 있어도 윗줄 배치다", () => {
    const { form } = setup(<div>첨부</div>);
    expect(form.hasAttribute("data-stacked")).toBe(true);
  });
});
