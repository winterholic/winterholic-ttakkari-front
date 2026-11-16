import { expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { describeShareError } from "./errors";
import { buildUsageGuide } from "./usage";

const err = (status: number, code: string, message = "서버 메시지", extra: Record<string, unknown> = {}) =>
  new ApiError(status, { code, message, extra });

it("Gateway 미설정 503 은 서버 설정이 필요하고 초안은 그대로라고 안내한다", () => {
  const p = describeShareError(err(503, "gateway_not_configured", "x", { gateway: { missing: ["context_gateway_control_url"] } }));
  expect(p.title).toMatch(/Gateway/);
  expect(p.body).toMatch(/서버 설정/);
  expect(p.body).toMatch(/초안/);
  expect(p.body).toMatch(/context_gateway_control_url/);
  expect(p.retryable).toBe(true);
});

it("contract_incomplete 는 게시는 됐지만 키를 만들 수 없고 재시도해도 소용없다고 알린다", () => {
  const p = describeShareError(err(503, "gateway_contract_incomplete"));
  expect(p.body).toMatch(/게시/);
  expect(p.body).toMatch(/키를 (발급할|만들) 수 없/);
  expect(p.body).toMatch(/Gateway 계약/);
  expect(p.retryable).toBe(false);
});

it("verification_required 는 대조하지 않은 문서 개수와 직접 대조 확인이 필요함을 알린다", () => {
  const p = describeShareError(err(422, "verification_required", "x", { document_ids: ["a", "b"] }));
  expect(p.body).toMatch(/2개/);
  expect(p.body).toMatch(/원본/);
});

it("digest_mismatch 는 내용이 바뀌었으니 다시 읽고 승인하라고 안내한다", () => {
  const p = describeShareError(err(409, "digest_mismatch", "x", { current_digest: "f".repeat(64) }));
  expect(p.body).toMatch(/다시/);
  expect(p.body).toMatch(/승인/);
});

it("sensitive_content_blocked 는 고위험 건수를 말하고 본문을 고치라고 한다", () => {
  const p = describeShareError(err(422, "sensitive_content_blocked", "x", { counts: { high: 3, medium: 1 } }));
  expect(p.body).toMatch(/3건/);
  expect(p.body).toMatch(/고쳐|제거/);
});

it("Gateway 거절은 상태·코드를 함께 보여 주고 아무것도 바뀌지 않았다고 말한다", () => {
  const p = describeShareError(err(502, "gateway_rejected", "x", { gateway_status: 401, gateway_code: "bad_token" }));
  expect(p.body).toMatch(/401/);
  expect(p.body).toMatch(/bad_token/);
  expect(p.body).toMatch(/바뀌지 않/);
});

it("철회 부분 실패는 남은 항목 수를 알린다", () => {
  const p = describeShareError(
    err(503, "gateway_unavailable", "x", { partial: { revoked_snapshots: 1, remaining_snapshots: 1, revoked_keys: 0, remaining_keys: 2 } }),
  );
  expect(p.body).toMatch(/스냅샷 1개/);
  expect(p.body).toMatch(/키 2개/);
  expect(p.body).toMatch(/같은 버튼/);
});

it("알 수 없는 코드는 서버 메시지를 그대로 쓰고 네트워크 오류는 연결 문제로 안내한다", () => {
  expect(describeShareError(err(500, "weird", "서버가 이상해요")).body).toBe("서버가 이상해요");
  expect(describeShareError(new TypeError("Failed to fetch")).body).toMatch(/연결/);
});

it("사용 안내는 환경변수만 쓰고 키 값을 받을 수 없다", () => {
  const g = buildUsageGuide("https://ctx.example.test");
  expect(buildUsageGuide.length).toBe(1);
  expect(g).toContain("$CONTEXT_GATEWAY_KEY");
  expect(g).toContain("https://ctx.example.test");
  expect(g).toMatch(/read -rs/);
  expect(g).not.toMatch(/Bearer [A-Za-z0-9_-]{20,}/);
  expect(buildUsageGuide(null)).toContain("<Gateway 공개 주소>");
});
