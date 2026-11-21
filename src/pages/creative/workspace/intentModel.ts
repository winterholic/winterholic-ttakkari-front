import type {
  CreativeCatalog,
  IntentConditionV2,
  IntentConflictV2,
  IntentFacetField,
  IntentFacets,
  IntentOrigin,
  IntentResolveResult,
  IntentSpecV2,
} from "../../../api/creativeV2";

/** 처음 보여 주는 조건 축. 12개 카탈로그 전체를 나열하지 않고, 나머지 차원은 전문 설정에서 연다. */
export const STARTER_DIMENSIONS: Array<{ key: string; label: string; hint: string }> = [
  { key: "C01", label: "콘텐츠 유형", hint: "어떤 종류의 영상인가요?" },
  { key: "C02", label: "장르·세계관", hint: "배경 세계나 시대" },
  { key: "C03", label: "화풍", hint: "그림체·영상 스타일" },
  { key: "tone", label: "톤", hint: "분위기" },
];

// 서버 SINGLE_PRIMARY(intent.py)와 같다. 이 차원은 주 선택이 하나여야 해서 첫 선택만 primary로 보낸다.
const SINGLE_PRIMARY = new Set(["C01", "C03", "C08"]);

export const ORIGIN_META: Record<IntentOrigin, { label: string; hint: string; confirmed: boolean }> = {
  user_confirmed: { label: "확정", hint: "내가 직접 정한 값", confirmed: true },
  user_free_text: { label: "문장에서 읽음", hint: "내가 쓴 문장에서 읽었어요. 확정 전에는 계획에 쓰지 않아요", confirmed: false },
  ai_inferred: { label: "AI 추론", hint: "문장이 직접 말하지 않아 AI가 짐작했어요. 확정 전에는 계획에 쓰지 않아요", confirmed: false },
  default: { label: "기본값", hint: "시스템 기본값", confirmed: false },
};

export const isConfirmed = (origin: IntentOrigin) => origin === "user_confirmed";

export interface Labels {
  conditions: Map<string, string>;
  dimensions: Map<string, string>;
  entriesByDimension: Map<string, Array<{ id: string; name: string }>>;
  fields: Map<string, IntentFacetField>;
  groups: Map<string, { title: string; description: string; tier: "essential" | "advanced" }>;
}

export function buildLabels(catalog: CreativeCatalog | undefined, facets: IntentFacets | undefined): Labels {
  const conditions = new Map<string, string>();
  const dimensions = new Map<string, string>([["tone", "톤"]]);
  const entriesByDimension = new Map<string, Array<{ id: string; name: string }>>();
  for (const [dim, cat] of Object.entries(catalog?.catalogs ?? {})) {
    dimensions.set(dim, cat.name);
    entriesByDimension.set(dim, cat.entries.map((e) => ({ id: e.id, name: e.name })));
    for (const e of cat.entries) conditions.set(e.id, e.name);
  }
  const tones = Object.entries(facets?.tones ?? {});
  entriesByDimension.set("tone", tones.map(([id, name]) => ({ id, name })));
  for (const [id, name] of tones) conditions.set(id, name);
  const fields = new Map<string, IntentFacetField>();
  for (const f of facets?.fields ?? []) {
    fields.set(f.id, f);
    for (const o of f.options) if (!conditions.has(o.id)) conditions.set(o.id, o.label);
  }
  const groups = new Map<string, { title: string; description: string; tier: "essential" | "advanced" }>();
  for (const g of facets?.groups ?? []) groups.set(g.id, { title: g.title, description: g.description, tier: g.tier });
  return { conditions, dimensions, entriesByDimension, fields, groups };
}

export const labelOf = (labels: Labels, id: string) => labels.conditions.get(id) ?? id;

/** 선택지 id가 조건이면 조건 이름, 아니면 설정이 가진 선택지 라벨을 쓴다. */
export function optionLabel(field: IntentFacetField | undefined, value: string, labels: Labels) {
  return field?.options.find((o) => o.id === value)?.label ?? labels.conditions.get(value) ?? value;
}

export function selectionRole(intent: IntentSpecV2 | null | undefined, id: string, dimension: string): "primary" | "secondary" {
  if (!SINGLE_PRIMARY.has(dimension)) return "secondary";
  const hasPrimary = intent?.conditions.some((c) => c.dimension === dimension && c.id !== id && c.role === "primary");
  return hasPrimary ? "secondary" : "primary";
}

export const dimensionOf = (id: string) => (id.startsWith("tone.") ? "tone" : id.split(".")[0]);

/**
 * 서버는 상태를 저장하지 않고 직전 intent를 다시 받는다. brief가 바뀌면 이전 문장에서 읽은 값(확정 전)은 낡았으니 빼서 보낸다.
 * 사용자가 확정한 조건·답변·해결 기록은 그대로 둔다. 그래야 문장을 고쳤는데 지운 단어의 조건이 남는 일이 없다.
 */
export function dropTextDerived(intent: IntentSpecV2): IntentSpecV2 {
  return {
    ...intent,
    conditions: intent.conditions.filter((c) => c.origin === "user_confirmed"),
    duration: intent.duration && intent.duration.origin !== "user_confirmed" ? { mode: "auto", seconds: null, platform: null, origin: "default", evidence: [] } : intent.duration,
    aspect: intent.aspect && intent.aspect.origin !== "user_confirmed" ? null : intent.aspect,
    conflicts: intent.conflicts.filter((c) => c.status === "resolved" && c.kind !== "duration" && c.kind !== "aspect"),
    unsupported: intent.unsupported.filter((u) => u.reason === "reference_not_ingested"),
  };
}

/**
 * 사용자가 길이·비율을 새로 정하면 직전 값과 직전 해결 기록을 잊고 보낸다.
 * 서버는 직전 값도 후보로 보므로 그대로 두면 "60초 vs 방금 바꾼 30초" 같은 가짜 충돌이 생긴다.
 */
export function forgetChoice(intent: IntentSpecV2, kind: "duration" | "aspect"): IntentSpecV2 {
  return {
    ...intent,
    duration: kind === "duration" ? { mode: "auto", seconds: null, platform: null, origin: "default", evidence: [] } : intent.duration,
    aspect: kind === "aspect" ? null : intent.aspect,
    conflicts: intent.conflicts.filter((c) => c.id !== `conflict.${kind}`),
  };
}

/**
 * 길이·비율 충돌이 열려 있는 동안 서버 intent의 해당 값은 null이라, 사용자가 구조화로 정한 후보가 다음 요청에서 사라진다.
 * 그러면 충돌이 조용히 풀리고 사용자의 값이 버려진다. 열린 충돌의 확정 후보를 구조화 입력으로 다시 실어 보낸다.
 */
export function carryOpenChoices(intent: IntentSpecV2 | null): { duration?: { mode: "auto" | "target" | "strict"; seconds: number | null }; aspect?: "16:9" | "9:16" | "1:1" } {
  const carried: ReturnType<typeof carryOpenChoices> = {};
  for (const c of intent?.conflicts ?? []) {
    if (c.status !== "open") continue;
    const mine = c.candidates.find((x) => x.origin === "user_confirmed");
    if (!mine) continue;
    if (c.kind === "duration") {
      const [mode, sec] = mine.value.split(":");
      if (mode === "target" || mode === "strict") carried.duration = { mode, seconds: Number(sec) };
      else if (mode === "auto") carried.duration = { mode: "auto", seconds: null };
    } else if (c.kind === "aspect" && (mine.value === "16:9" || mine.value === "9:16" || mine.value === "1:1")) {
      carried.aspect = mine.value;
    }
  }
  return carried;
}

export const BLOCKING_TEXT: Record<string, string> = {
  "missing.content_type": "콘텐츠 유형을 하나 이상 골라 주세요.",
  "unconfirmed.content_type": "콘텐츠 유형을 확정해 주세요. 문장에서 읽은 값은 확정해야 계획에 쓰입니다.",
};

// 길이·비율 충돌 문구에는 서버 내부 출처 이름(user_confirmed 등)이 섞여 있어 화면에서는 후보 카드로 다시 설명한다.
export function conflictMessage(c: IntentConflictV2): string {
  if (c.kind === "duration") return "입력한 길이가 서로 달라요. 하나를 골라야 다음으로 갈 수 있어요.";
  if (c.kind === "aspect") return "입력한 화면 비율이 서로 달라요. 하나를 골라야 다음으로 갈 수 있어요.";
  return c.message;
}

export function blockingText(id: string, result: IntentResolveResult): string {
  if (BLOCKING_TEXT[id]) return BLOCKING_TEXT[id];
  const conflict = result.intent.conflicts.find((c) => c.id === id);
  return conflict ? `충돌을 해결해 주세요. ${conflictMessage(conflict)}` : id;
}

export function durationLabel(policy: IntentSpecV2["duration"]): string {
  if (!policy || policy.mode === "auto") return "내용에 맞춰 자동";
  const sec = policy.seconds ?? 0;
  const t = sec >= 60 && sec % 30 === 0 ? `${Math.floor(sec / 60)}분${sec % 60 ? ` ${sec % 60}초` : ""}` : `${sec}초`;
  return policy.mode === "target" ? `약 ${t} (희망)` : `${t} (엄격)`;
}

export const ASPECT_LABEL: Record<string, string> = { "16:9": "16:9 가로", "9:16": "9:16 세로", "1:1": "1:1 정사각형" };

export const CONFLICT_KIND_LABEL: Record<string, string> = {
  duration: "길이 충돌",
  aspect: "화면 비율 충돌",
  catalog_conflict: "조건 충돌",
  single_primary: "주 선택 충돌",
  rule: "조합 주의",
};

export const UNSUPPORTED_REASON: Record<string, string> = {
  not_in_catalog: "목록에 없는 조건",
  unknown_tone: "알 수 없는 톤",
  reference_not_ingested: "아직 받지 못하는 참조",
  rule_blocked: "지금은 쓸 수 없음",
};

/** 계획·스토리보드로 넘길 요약. 사람이 읽는 문장이라 실행 보장이 아니다. */
export function summarizeIntent(intent: IntentSpecV2, labels: Labels): string {
  const confirmed = intent.conditions.filter((c) => c.origin === "user_confirmed");
  const byDim = new Map<string, string[]>();
  for (const c of confirmed) byDim.set(c.dimension, [...(byDim.get(c.dimension) ?? []), `${labelOf(labels, c.id)}${c.strength === "required" ? "(필수)" : ""}`]);
  const lines = [...byDim.entries()].map(([dim, names]) => `${labels.dimensions.get(dim) ?? dim}: ${names.join(", ")}`);
  lines.push(`길이: ${durationLabel(intent.duration)}`);
  if (intent.aspect) lines.push(`화면 비율: ${intent.aspect.value}`);
  for (const a of intent.answers) {
    const field = labels.fields.get(a.field_id);
    lines.push(`${field?.label ?? a.field_id}: ${a.values.map((v) => optionLabel(field, v, labels)).join(", ")}`);
  }
  return lines.join("\n");
}

export const conditionsOf = (intent: IntentSpecV2 | undefined, dimension: string): IntentConditionV2[] =>
  (intent?.conditions ?? []).filter((c) => c.dimension === dimension);

/** 활성 묶음에서 content·output은 전용 영역이 맡는다. */
export const DEDICATED_GROUPS = new Set(["content", "output"]);
