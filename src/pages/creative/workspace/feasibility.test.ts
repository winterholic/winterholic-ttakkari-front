import { expect, test } from "vitest";
import type { CreativeCapabilities } from "../../../api/creativeV2";
import { answerRecordedOnly, capabilityFeasibility, entryFeasibility, planOnlyAnswers, worstFeasibility } from "./feasibility";

const provider = (capability: string, level: string, integration: string, constraints: string[] = []) =>
  ({ entry_id: `p.${capability}`, capability, level, integration, evidence: [], constraints });
const cap = (id: string, best_level: string, providers: ReturnType<typeof provider>[]) => [id, { name: id, description: "", best_level, providers }] as const;

// 운영 /capabilities 응답(2026-11-21 스냅샷)에서 대표 사례만 옮겼다.
const caps: CreativeCapabilities["capabilities"] = Object.fromEntries([
  cap("render.html_motion", "executed", [provider("render.html_motion", "executed", "creative_runtime", ["현재 제작 경로는 16:9 Kafka 메시지 흐름 3장면을 지원한다."])]),
  cap("edit.timeline", "executed", [provider("edit.timeline", "executed", "creative_runtime")]),
  cap("edit.color_grade", "installed", [provider("edit.color_grade", "installed", "creative_runtime")]),
  cap("audio.music_analysis", "executed", [provider("audio.music_analysis", "executed", "lab_only")]),
  cap("render.3d_preset", "missing", [provider("render.3d_preset", "missing", "creative_runtime")]),
  cap("render.painterly_shader", "missing", []),
]);

test("a capability is supported only when it is wired into the studio runtime and has an execution record", () => {
  expect(capabilityFeasibility(caps["render.html_motion"]).kind).toBe("supported");
  expect(capabilityFeasibility(caps["render.html_motion"]).notes[0]).toMatch(/Kafka/);
});

test("wired but only installed means unverified, lab-only means plan-only, no provider means unsupported", () => {
  expect(capabilityFeasibility(caps["edit.color_grade"]).kind).toBe("unverified");
  expect(capabilityFeasibility(caps["audio.music_analysis"]).kind).toBe("plan_only");
  expect(capabilityFeasibility(caps["render.3d_preset"]).kind).toBe("unsupported");
  expect(capabilityFeasibility(caps["render.painterly_shader"]).kind).toBe("unsupported");
  expect(capabilityFeasibility(undefined).kind).toBe("unverified");
});

test("an entry takes the worst of its required capabilities and the best of each alternative group", () => {
  const rel = (target: string, type = "requires") => ({ type, target, strength: "hard", note: "" });
  expect(entryFeasibility([rel("edit.timeline"), rel("audio.music_analysis")], caps)?.kind).toBe("plan_only");
  expect(entryFeasibility([rel("render.3d_preset|edit.timeline")], caps)?.kind).toBe("supported");
  expect(entryFeasibility([rel("edit.timeline"), rel("render.3d_preset")], caps)?.kind).toBe("unsupported");
  // 선호 관계, 다른 항목 id, 관계 없음은 판정에 쓰지 않는다.
  expect(entryFeasibility([rel("render.3d_preset", "prefers"), rel("C08.three_act")], caps)).toBeNull();
  expect(entryFeasibility(undefined, caps)).toBeNull();
});

test("worstFeasibility orders unsupported > plan_only > unverified > supported", () => {
  expect(worstFeasibility(["supported", "unverified", "plan_only"])).toBe("plan_only");
  expect(worstFeasibility(["supported", "unsupported"])).toBe("unsupported");
  expect(worstFeasibility([])).toBeNull();
});

test("an answer whose values are not catalog conditions is recorded only, matching the server's not_applied rule", () => {
  const catalogIds = new Set(["C03.anime", "tone.calm"]);
  expect(answerRecordedOnly(["C03.anime", "tone.calm"], catalogIds)).toBe(false);
  expect(answerRecordedOnly(["C03.anime", "close"], catalogIds)).toBe(true);
  expect(planOnlyAnswers([{ field_id: "a", values: ["close"] }, { field_id: "b", values: ["C03.anime"] }], catalogIds)).toEqual(["a"]);
});
