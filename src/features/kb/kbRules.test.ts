// 실서버(back-kb-v3-api 27ea2f4)와 계약을 대조하며 생긴 표시 규칙들. 입력은 실서버가 실제로 주는 코드·모양이다(liveFixtures 참고).
import { expect, it } from "vitest";
import { expansion, graph, ingestMixed } from "./kbFixtures";
import { mergeGraph, neighborsOf, seedStore } from "./graphStore";
import { ingestItemView, ingestSummary } from "./IngestModal";
import {
  PERMANENT_HOLD, SUPERSESSION_RESOLVER, codeText, conflictStatusText, distinctFacts, domainLabel, ingestErrorText, stageNote,
} from "./labelsV3";

it("kept_separate 는 상충 주장에서 '양쪽 모두 옳음'으로 읽히지 않는다(시스템 대체 종결 포함)", () => {
  const system = conflictStatusText({ kind: "value_contradiction", status: "kept_separate", resolved_by: SUPERSESSION_RESOLVER });
  expect(system.label).toBe("새 버전이 양쪽 주장을 대체해 종결");
  expect(system.detail).toContain("양쪽이 옳다는 뜻도 아니에요");
  const user = conflictStatusText({ kind: "polarity_contradiction", status: "kept_separate", resolved_by: "user" });
  expect(user.label).toBe("어느 쪽도 채택하지 않고 종결");
  expect([user.label, user.detail].join(" ")).not.toContain("둘 다 유효");
  // 같은 상태값이라도 모호한 개념에서는 사람이 '분리 확정'한 뜻이다.
  expect(conflictStatusText({ kind: "ambiguous_entity", status: "kept_separate", resolved_by: "user" }).label).toBe("서로 다른 개념으로 분리 확정");
  // 사람이 고른 '둘 다 유효'만 그렇게 표시하고, 시스템이 한쪽을 대체해 닫은 것은 채택으로 읽히지 않는다.
  expect(conflictStatusText({ kind: "value_contradiction", status: "resolved_both_valid", resolved_by: "user" }).label).toContain("둘 다 유효");
  expect(conflictStatusText({ kind: "value_contradiction", status: "resolved_a", resolved_by: SUPERSESSION_RESOLVER }).label).toBe("새 버전이 B를 대체해 종결");
  expect(conflictStatusText({ kind: "value_contradiction", status: "resolved_a", resolved_by: "user" }).label).toBe("A를 정본으로 채택");
  expect(conflictStatusText({ kind: "value_contradiction", status: "open" }).label).toBe("열림");
  expect(conflictStatusText({ kind: "value_contradiction", status: "something_new" }).label).toBe("something_new");
});

it("접수 결과 항목: registered 만 처리 대기이고 held·failed 는 성공 표시가 없다", () => {
  const views = Object.fromEntries(ingestMixed.items.map((i) => [i.status, ingestItemView(i)]));
  expect(views.registered).toMatchObject({ label: "처리 대기", tone: "info", canOpen: true });
  expect(views.duplicate).toMatchObject({ label: "이미 있음", tone: "warning" });
  expect(views.held).toMatchObject({ label: "보류", tone: "warning", canOpen: true });
  expect(views.held.note).toContain("원본만 보관하고 지식으로 만들지 않았어요");
  expect(views.failed).toMatchObject({ label: "실패", tone: "danger", canOpen: false });
  expect(ingestItemView({ name: "x", status: "queued_v9", document_id: null, revision_id: null, job_id: null }).label).toBe("queued_v9");
  expect(ingestSummary(ingestMixed.items)).toBe("처리 대기 1건 · 이미 있음 1건 · 보류 1건 · 실패 1건");
  expect(ingestSummary([ingestMixed.items[2]])).toBe("처리 대기 0건 · 보류 1건");
});

it("ingest 오류 코드는 문장으로, 세부 코드가 붙은 것은 앞부분으로 찾고 모르는 코드는 그대로 보여 준다", () => {
  expect(ingestErrorText("url_rejected:port_not_allowed")).toContain("공개 웹 주소만 가능해요");
  expect(ingestErrorText("url_rejected:port_not_allowed")).toContain("port_not_allowed");
  expect(ingestErrorText("parse_corrupt_pdf")).toBe("파일을 읽지 못했어요(corrupt_pdf).");
  expect(ingestErrorText("file_too_large")).toContain("100MiB");
  expect(ingestErrorText("internal_ValueError")).toContain("서버 내부 오류");
  expect(ingestErrorText("brand_new_code")).toBe("brand_new_code");
  expect(ingestErrorText(null)).toBe("알 수 없는 오류");
});

it("부분 완료·보류 사유 코드는 문장으로 바꾸고, 영구 보류 사유는 재시도 대상에서 뺀다", () => {
  expect(codeText("l2_disabled")).toContain("AI 심층 추출이 꺼져 있어");
  expect(codeText("daily_budget_exhausted")).toContain("예산");
  expect(codeText("unsupported_legacy_office")).toContain("구형 오피스");
  expect(codeText(null)).toBeNull();
  expect(codeText("zzz")).toBe("zzz");
  // 실서버 extracting 단계 detail 모양
  expect(stageNote({ l2: { reason: "l2_disabled", adapter: "disabled" }, reason: "l2_disabled" })).toContain("규칙·사전 기반");
  expect(stageNote({ missing_capability: "unsupported_legacy_office", decided_at: "intake" })).toContain("구형 오피스");
  expect(stageNote({})).toBeNull();
  expect([...PERMANENT_HOLD].sort()).toEqual(["ocr_required", "stt_runtime_unavailable", "unsupported_format", "unsupported_legacy_office"]);
  expect(PERMANENT_HOLD.has("collector_html_structure_revision_required")).toBe(false);
});

it("주제 slug 와 엔터티 domain 을 모두 라벨로 바꾸고, 정의 문장이 정본 요약과 같으면 핵심 사실에서 뺀다", () => {
  expect(domainLabel("dev-infra")).toBe("개발·인프라");
  expect(domainLabel("science")).toBe("과학");
  expect(domainLabel("infra")).toBe("인프라");
  expect(domainLabel("dev")).toBe("개발");
  expect(domainLabel("whatever")).toBe("whatever");
  const canon = { summary: "파드를 관리한다.", key_facts: ["definition: 파드를 관리한다.", "replicas: 3"] };
  expect(distinctFacts(canon)).toEqual(["replicas: 3"]);
  expect(distinctFacts({ summary: "", key_facts: ["a"] })).toEqual(["a"]);
  expect(distinctFacts(null)).toEqual([]);
});

it("이웃이 한 쪽보다 많으면 다음 offset 을 기억하고, 끝나면 지운다", () => {
  const store = seedStore(graph);
  const a = mergeGraph(store, { ...expansion, has_more: true, offset: 0, limit: 30, total_neighbors: 61 }, "e-rs");
  expect(a.more.get("e-rs")).toBe(30);
  expect(a.neighborTotal.get("e-rs")).toBe(61);
  const b = mergeGraph(a, { ...expansion, has_more: true, offset: 30, limit: 30, total_neighbors: 61 }, "e-rs");
  expect(b.more.get("e-rs")).toBe(60);
  const c = mergeGraph(b, { ...expansion, has_more: false, offset: 60, limit: 30, total_neighbors: 61 }, "e-rs");
  expect(c.more.has("e-rs")).toBe(false);
  expect(c.expanded.has("e-rs")).toBe(true);
  // 후보 관계 표시는 방향별 이웃 목록까지 이어진다.
  expect(neighborsOf(a, "e-rs").into.find((x) => x.node.id === "e-hpa")?.candidate).toBe(true);
});
