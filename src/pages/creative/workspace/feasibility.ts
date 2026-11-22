import type { CapabilityInfo, CatalogRelation, CreativeCapabilities } from "../../../api/creativeV2";

/**
 * 조건이 실제 제작으로 이어지는지에 대한 표시 단계. 백엔드 /capabilities 응답(provider level·integration)에서 계산한다.
 * supported: 스튜디오 제작 런타임에 연결돼 있고 실행 기록이 있다.
 * unverified: 연결은 됐지만 실행 기록이 없거나 부분이다.
 * plan_only: 실험실 수준이라 계획에는 적히지만 스튜디오 렌더에는 연결되지 않았다.
 * unsupported: 제공하는 도구가 없다.
 */
export type Feasibility = "supported" | "unverified" | "plan_only" | "unsupported";

export const FEASIBILITY_META: Record<Feasibility, { label: string; tone: "success" | "info" | "warning" | "danger"; hint: string }> = {
  supported: { label: "제작 가능", tone: "success", hint: "스튜디오 제작 런타임에서 실행한 기록이 있어요." },
  unverified: { label: "미검증", tone: "info", hint: "제작 런타임에 연결됐지만 이 능력으로 끝까지 실행한 기록이 부족해요. 결과가 다를 수 있어요." },
  plan_only: { label: "계획만 반영", tone: "warning", hint: "실험실 수준이라 계획에는 적히지만 스튜디오 제작에는 연결되지 않았어요. 영상에는 나오지 않을 수 있어요." },
  unsupported: { label: "미지원", tone: "danger", hint: "이 능력을 제공하는 도구가 없어요. 지금은 만들 수 없어요." },
};

const RANK: Record<Feasibility, number> = { supported: 0, unverified: 1, plan_only: 2, unsupported: 3 };
const CONNECTED = new Set(["creative_runtime", "app_service"]);

export function worstFeasibility(kinds: Feasibility[]): Feasibility | null {
  return kinds.reduce<Feasibility | null>((worst, k) => (worst === null || RANK[k] > RANK[worst] ? k : worst), null);
}

const bestFeasibility = (kinds: Feasibility[]): Feasibility | null =>
  kinds.reduce<Feasibility | null>((best, k) => (best === null || RANK[k] < RANK[best] ? k : best), null);

export interface FeasibilityResult { kind: Feasibility; notes: string[] }

/** 능력 하나의 판정. provider 중 가장 좋은 단계를 쓰고, 그 provider의 제한 문구를 함께 돌려준다. */
export function capabilityFeasibility(info: CapabilityInfo | undefined): FeasibilityResult {
  // 능력 정보를 못 찾았다고 제작 불가로 단정하지 않는다. 확인하지 못한 상태로 둔다.
  if (!info) return { kind: "unverified", notes: ["이 능력의 상태를 서버에서 찾지 못했어요."] };
  let best: FeasibilityResult = { kind: "unsupported", notes: [] };
  for (const p of info.providers) {
    let kind: Feasibility;
    if (p.level === "missing") kind = "unsupported";
    else if (CONNECTED.has(p.integration)) kind = p.level === "executed" ? "supported" : "unverified";
    else kind = "plan_only";
    if (RANK[kind] < RANK[best.kind] || (best.notes.length === 0 && kind === best.kind)) best = { kind, notes: p.constraints };
  }
  return best;
}

/**
 * 카탈로그 항목 하나의 판정. 필수(requires) 관계 중 능력 id만 본다. `a|b`는 하나만 되면 충족이라 가장 좋은 쪽, 서로 다른 필수는 가장 나쁜 쪽을 쓴다.
 * 선호 관계와 다른 항목 id(C03.* 등)는 제작 가능 여부에 쓰지 않는다. 판정할 능력이 없으면 null이다.
 */
export function entryFeasibility(relations: CatalogRelation[] | undefined, caps: CreativeCapabilities["capabilities"]): FeasibilityResult | null {
  const groups = (relations ?? []).filter((r) => r.type === "requires" && /^[a-z]+\./.test(r.target));
  if (groups.length === 0) return null;
  const results = groups.map((g) => {
    const options = g.target.split("|").map((id) => ({ id, ...capabilityFeasibility(caps[id]) }));
    const kind = bestFeasibility(options.map((o) => o.kind))!;
    return { kind, notes: options.filter((o) => o.kind === kind).flatMap((o) => o.notes) };
  });
  const kind = worstFeasibility(results.map((r) => r.kind))!;
  return { kind, notes: [...new Set(results.filter((r) => r.kind === kind).flatMap((r) => r.notes))] };
}

/** 답변이 조건(카탈로그·톤 id)이 아닌 값을 담으면 서버는 의도에만 저장하고 제작에는 쓰지 않는다(intent_plan not_applied 규칙). */
export const answerRecordedOnly = (values: string[], catalogIds: Set<string>) => !values.every((v) => catalogIds.has(v));

export const planOnlyAnswers = (answers: Array<{ field_id: string; values: string[] }>, catalogIds: Set<string>) =>
  answers.filter((a) => answerRecordedOnly(a.values, catalogIds)).map((a) => a.field_id);
