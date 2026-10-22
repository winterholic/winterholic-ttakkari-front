import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { DurationPicker } from "./DurationPicker";
import { INITIAL_DURATION, toRequest } from "./duration";
import type { DurationState } from "./duration";

afterEach(cleanup);

function Harness({ max, softOnly, onState }: { max?: number; softOnly?: boolean; onState?: (s: DurationState) => void }) {
  const [state, setState] = useState<DurationState>(INITIAL_DURATION);
  onState?.(state);
  return <DurationPicker value={state} onChange={setState} max={max} softOnly={softOnly} idPrefix="t" />;
}

const chip = (name: string) => screen.getByRole("radio", { name });

test("shows auto first, then the final preset list, then direct input; auto is selected by default", () => {
  render(<Harness />);
  const names = screen.getAllByRole("radio", { checked: undefined }).map((el) => el.textContent);
  const chips = names.slice(0, 10);
  expect(chips).toEqual(["자동", "15초", "30초", "1분", "2분", "3분", "5분", "10분", "15분", "직접 입력"]);
  expect(chip("자동").getAttribute("aria-checked")).toBe("true");
  expect(screen.queryByText(/AI가 내용에 필요한 길이를 정해요/)).not.toBeNull();
  expect(screen.queryByRole("radiogroup", { name: "맞춤 방식" })).toBeNull();
});

test("choosing 3 minutes defaults to a soft preference that does not promise exactness", () => {
  let latest = INITIAL_DURATION;
  render(<Harness onState={(s) => (latest = s)} />);
  fireEvent.click(chip("3분"));
  expect(chip("3분").getAttribute("aria-checked")).toBe("true");
  expect(toRequest(latest, "2026-10-22").request).toEqual({ mode: "preferred", seconds: 180 });
  expect(screen.queryByText(/정확한 길이를 보장하지 않고/)).not.toBeNull();
  fireEvent.click(screen.getByLabelText("정확히"));
  expect(toRequest(latest, "2026-10-22").request).toEqual({ mode: "exact", seconds: 180 });
});

test("direct input validates boundaries and rejects NaN, Infinity, zero and values above 15 minutes", () => {
  let latest = INITIAL_DURATION;
  render(<Harness onState={(s) => (latest = s)} />);
  fireEvent.click(chip("직접 입력"));
  const input = screen.getByLabelText(/직접 입력 \(초/);
  for (const [text, message] of [
    ["0", "1초 이상"],
    ["0.5", "1초 이상"],
    ["901", "900초"],
    ["NaN", "숫자만"],
    ["Infinity", "숫자만"],
    ["-3", "숫자만"],
  ] as const) {
    fireEvent.change(input, { target: { value: text } });
    expect(screen.getByRole("alert").textContent).toContain(message);
    expect(toRequest(latest, "2026-10-22").request).toBeNull();
  }
  for (const text of ["1", "45", "900"]) {
    fireEvent.change(input, { target: { value: text } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(toRequest(latest, "2026-10-22").request).toEqual({ mode: "preferred", seconds: Number(text) });
  }
});

test("a screen with a smaller maximum disables longer presets with an explanation and ignores clicks", () => {
  render(<Harness max={240} softOnly />);
  const ten = chip("10분");
  expect(ten.getAttribute("aria-disabled")).toBe("true");
  expect(ten.getAttribute("title")).toContain("4분");
  fireEvent.click(ten);
  expect(chip("자동").getAttribute("aria-checked")).toBe("true");
  fireEvent.click(chip("2분"));
  expect(screen.queryByRole("radiogroup", { name: "맞춤 방식" })).toBeNull();
  expect(screen.queryByText(/희망 길이로만 만들어요/)).not.toBeNull();
});

test("platform cap shows the YouTube Shorts source and a custom cap requires its own source", () => {
  let latest = INITIAL_DURATION;
  render(<Harness onState={(s) => (latest = s)} />);
  fireEvent.click(chip("1분"));
  fireEvent.click(screen.getByLabelText("넘지 않게(상한)"));
  expect(screen.queryByText(/YouTube Shorts 상한 3분/)).not.toBeNull();
  expect(toRequest(latest, "2026-10-22").request).toEqual({ mode: "platform_cap", platform: "youtube_shorts" });
  fireEvent.click(screen.getByLabelText("직접 지정한 상한"));
  expect(toRequest(latest, "2026-10-22").request).toBeNull();
  fireEvent.change(screen.getByLabelText("상한 근거"), { target: { value: "클라이언트 요청서" } });
  expect(toRequest(latest, "2026-10-22").request).toEqual({
    mode: "platform_cap",
    seconds: 60,
    source: "클라이언트 요청서",
    as_of: "2026-10-22",
  });
});
