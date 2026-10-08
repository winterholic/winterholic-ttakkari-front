import { describe, expect, it } from "vitest";
import { derivePushState, urlBase64ToBytes } from "./pushState";
import type { PushEnv } from "./pushState";

const base: PushEnv = { supported: true, ios: false, standalone: false, permission: "default", subscribed: false };

describe("derivePushState", () => {
  it("PushManager 가 없으면 지원 안 함", () => {
    expect(derivePushState({ ...base, supported: false, permission: "unsupported" })).toBe("unsupported");
  });
  it("iOS 에서 설치 전이면 지원 안 함이 아니라 설치 안내", () => {
    expect(derivePushState({ ...base, supported: false, ios: true })).toBe("needs-install");
    expect(derivePushState({ ...base, supported: false, ios: true, standalone: true })).toBe("unsupported");
  });
  it("권한이 거부되면 구독이 남아 있어도 거부됨", () => {
    expect(derivePushState({ ...base, permission: "denied", subscribed: true })).toBe("denied");
  });
  it("허용 + 구독이 있어야 켜짐, 나머지는 꺼짐", () => {
    expect(derivePushState({ ...base, permission: "granted", subscribed: true })).toBe("on");
    expect(derivePushState({ ...base, permission: "granted" })).toBe("off");
    expect(derivePushState({ ...base, subscribed: true })).toBe("off");
  });
});

describe("urlBase64ToBytes", () => {
  it("base64url 을 패딩 없이 디코드한다", () => {
    expect([...urlBase64ToBytes("_-8")]).toEqual([255, 239]);
  });
});
