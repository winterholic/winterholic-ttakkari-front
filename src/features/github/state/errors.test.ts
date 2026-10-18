import { describe, expect, it } from "vitest";
import { GhApiError } from "../../../api/githubClient";
import { describeGhError } from "./errors";

const err = (code: string, extra: Partial<{ status: number; reason: string; reset: number; retryAfter: number; message: string }> = {}) =>
  new GhApiError({ status: extra.status ?? 400, code, message: extra.message ?? "m", reason: extra.reason, reset: extra.reset, retryAfter: extra.retryAfter });

describe("describeGhError", () => {
  it("없음과 권한 부족을 한 문구로 묶되 계정 전환을 권한다", () => {
    const v = describeGhError(err("gh_not_found", { status: 404 }));
    expect(v.tone).toBe("warning");
    expect(v.title).toMatch(/권한|찾을 수 없/);
    expect(v.switchAccount).toBe(true);
    expect(v.retry).toBe(false);
  });
  it("SSO 와 scope 부족은 서로 다른 안내를 준다", () => {
    const sso = describeGhError(err("gh_forbidden", { status: 403, reason: "sso_required" }));
    const scope = describeGhError(err("gh_forbidden", { status: 403, reason: "scope_missing" }));
    expect(sso.message).toMatch(/SSO/);
    expect(scope.message).toMatch(/권한 범위|scope/i);
    expect(sso.message).not.toBe(scope.message);
    expect(sso.switchAccount).toBe(true);
  });
  it("만료는 Mac Studio 재로그인 안내이고 재시도·계정 전환을 둔다", () => {
    const v = describeGhError(err("gh_auth_expired", { status: 502 }));
    expect(v.message).toMatch(/Mac Studio/);
    expect(v.switchAccount).toBe(true);
    expect(v.tone).toBe("danger");
  });
  it("한도는 reset 시각을 돌려준다", () => {
    const v = describeGhError(err("gh_rate_limited", { status: 429, reset: 1_900_000_000 }));
    expect(v.resetAt).toBe(1_900_000_000);
    expect(v.retry).toBe(false);
  });
  it("retry_after 만 있어도 대기 시각을 준다", () => {
    const now = 1_900_000_000_000;
    const v = describeGhError(err("gh_rate_limited", { status: 429, retryAfter: 60 }), now);
    expect(v.resetAt).toBe(1_900_000_060);
  });
  it("계정 없음은 gh auth login 안내", () => {
    expect(describeGhError(err("no_account", { status: 503 })).message).toMatch(/gh auth login/);
  });
  it("no_account 의 gh_status_failed 는 계정이 없다는 안내가 아니라 상태 조회 일시 실패로 보고 재시도를 준다", () => {
    const v = describeGhError(err("no_account", { status: 503, reason: "gh_status_failed" }));
    const plain = describeGhError(err("no_account", { status: 503 }));
    expect(v.title).toMatch(/상태/);
    expect(v.title).not.toMatch(/계정이 없/);
    expect(v.message).not.toMatch(/gh auth login/);
    expect(v.message).toMatch(/일시|잠시/);
    expect(v.retry).toBe(true);
    expect(v.switchAccount).toBe(false);
    expect(v.title).not.toBe(plain.title);
    expect(v.message).not.toBe(plain.message);
  });
  it("reason 이 없거나 모르는 값이면 no_account 는 기존 로그인 안내를 그대로 둔다", () => {
    for (const reason of [undefined, "something_new"]) {
      const v = describeGhError(err("no_account", { status: 503, reason }));
      expect(v.title).toMatch(/연결된 GitHub 계정이 없어요/);
      expect(v.message).toMatch(/gh auth login/);
      expect(v.retry).toBe(false);
    }
  });
  it("gh_unprocessable 의 ref_resolution_limit 은 크기 문제가 아니라 ref 해석 상한이고 저장소에서 직접 고르라고 한다", () => {
    const v = describeGhError(err("gh_unprocessable", { status: 422, reason: "ref_resolution_limit" }));
    expect(v.message).not.toMatch(/너무 크/);
    expect(v.message).toMatch(/브랜치/);
    expect(v.message).toMatch(/태그/);
    expect(v.message).toMatch(/직접 (골라|선택)/);
    expect(v.message).toMatch(/없다는 뜻은 아니|없는 것이 아니/);
    expect(v.retry).toBe(false);
    expect(v.openOnGithub).toBe(false);
  });
  it("reason 이 없는 gh_unprocessable 은 기존처럼 GitHub 에서 열기를 권한다", () => {
    const v = describeGhError(err("gh_unprocessable", { status: 422 }));
    expect(v.message).toMatch(/너무 크거나/);
    expect(v.openOnGithub).toBe(true);
  });
  it("일시 오류는 재시도를 준다", () => {
    for (const c of ["gh_timeout", "gh_upstream_error", "gh_schema_changed", "network"]) expect(describeGhError(err(c)).retry).toBe(true);
  });
  it("큰 diff 등 상류 거부와 크기 초과는 GitHub 에서 열기를 권한다", () => {
    expect(describeGhError(err("gh_unprocessable", { status: 422 })).openOnGithub).toBe(true);
    expect(describeGhError(err("gh_too_large", { status: 413 })).openOnGithub).toBe(true);
  });
  it("새 오류 코드(ref·README·빈 저장소·로그)도 안내가 있다", () => {
    expect(describeGhError(err("ref_not_found", { status: 404 })).title).toMatch(/브랜치·태그·커밋/);
    expect(describeGhError(err("readme_not_found", { status: 404 })).tone).toBe("neutral");
    expect(describeGhError(err("gh_empty_repository", { status: 409 })).title).toMatch(/비어 있는/);
    expect(describeGhError(err("gh_logs_unavailable", { status: 502, reason: "redirect_host_not_allowed" })).openOnGithub).toBe(true);
  });
  it("알 수 없는 오류도 문구가 있고 내부 구현을 드러내지 않는다", () => {
    const v = describeGhError(new Error("boom /Users/x/file.py"));
    expect(v.message).not.toMatch(/\/Users/);
  });
});
