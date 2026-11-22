import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { IntentFacetField } from "../../../api/creativeV2";
import { FieldInput } from "./FieldInput";

afterEach(cleanup);

const multi: IntentFacetField = {
  id: "cut.shots", group: "cut", dimension: "C06", label: "컷 구성", question: "어떤 컷을 쓸까요?", kind: "multi", tier: "essential",
  options: [{ id: "close", label: "클로즈업" }, { id: "wide", label: "와이드" }],
};

const show = (values: string[], onAnswer = vi.fn()) => {
  render(<FieldInput field={multi} values={values} onAnswer={onAnswer} labelOf={(v) => v} />);
  return onAnswer;
};

test("a multi-select can be emptied: unpressing the last value sends an explicit empty list", () => {
  const onAnswer = show(["close"]);
  fireEvent.click(screen.getByRole("button", { name: "close" }));
  expect(onAnswer).toHaveBeenCalledWith([]);
});

test("a multi-select still adds and removes one value at a time", () => {
  const onAnswer = show(["close"]);
  fireEvent.click(screen.getByRole("button", { name: "wide" }));
  expect(onAnswer).toHaveBeenLastCalledWith(["close", "wide"]);
  cleanup();
  const again = show(["close", "wide"]);
  fireEvent.click(screen.getByRole("button", { name: "wide" }));
  expect(again).toHaveBeenLastCalledWith(["close"]);
});
