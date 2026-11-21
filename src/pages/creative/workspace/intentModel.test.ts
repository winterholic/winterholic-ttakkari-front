import { expect, test } from "vitest";
import type { IntentSpecV2 } from "../../../api/creativeV2";
import fx from "./fixtures/intent-v2-local-backend.json";
import { blockingText, buildLabels, carryOpenChoices, dropTextDerived, forgetChoice, selectionRole, summarizeIntent } from "./intentModel";

const labels = buildLabels(fx.catalog as never, fx.facets as never);
const intentOf = (key: keyof typeof fx) => (fx[key] as unknown as { intent: IntentSpecV2 }).intent;

test("brief change drops only values read from the old text; confirmed values and resolutions stay", () => {
  const a = intentOf("scenarioA");
  const confirmed = { ...a, conditions: a.conditions.map((c, i) => i === 0 ? { ...c, origin: "user_confirmed" as const, confirmation: { at: "t", by: "user", revision: 1 } } : c) };
  const out = dropTextDerived(confirmed);
  expect(out.conditions.map((c) => c.id)).toEqual([confirmed.conditions[0].id]);
  expect(out.duration?.origin).toBe("default");
  expect(out.duration?.mode).toBe("auto");
});

test("an open duration conflict carries the user's own candidate so it is not silently dropped", () => {
  const intent = intentOf("scenarioC_conflict");
  expect(intent.duration).toBeNull();
  expect(carryOpenChoices(intent)).toEqual({ duration: { mode: "target", seconds: 30 } });
  expect(carryOpenChoices(null)).toEqual({});
});

test("setting a new length forgets the previous value and its resolution so no fake conflict appears", () => {
  const ready = intentOf("scenarioC_ready");
  const forgotten = forgetChoice(ready, "duration");
  expect(forgotten.duration?.mode).toBe("auto");
  expect(forgotten.conflicts.some((c) => c.id === "conflict.duration")).toBe(false);
  expect(forgetChoice(ready, "aspect").aspect).toBeNull();
});

test("the first pick in a single-primary dimension is primary, the next is secondary", () => {
  const c = intentOf("scenarioC_conflict_confirmed");
  expect(selectionRole(undefined, "C01.music_video", "C01")).toBe("primary");
  expect(selectionRole(c, "C01.animation", "C01")).toBe("secondary");
  expect(selectionRole(c, "tone.horror", "tone")).toBe("secondary");
});

test("blocking messages never leak internal origin names", () => {
  const r = fx.scenarioC_conflict as never;
  const text = blockingText("conflict.duration", r);
  expect(text).not.toMatch(/user_confirmed|user_free_text/);
  expect(blockingText("unconfirmed.content_type", r)).toMatch(/콘텐츠 유형/);
});

test("the summary sent to the storyboard flow lists only confirmed conditions, length and answers", () => {
  const text = summarizeIntent(intentOf("scenarioC_ready"), labels);
  expect(text).toContain("뮤직비디오");
  expect(text).toContain("약 30초 (희망)");
  expect(text).not.toContain("감성");
});
