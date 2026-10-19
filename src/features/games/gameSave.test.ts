import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_SAVE_CHARS, SAVE_KEY_PREFIX, acceptReadyMessage, acceptSaveExportMessage, acceptSaveImportMessage, clearSave, isEmptySave, isValidSaveData, readSave, writeSave,
} from "./gameSave";

const frameWindow = {} as Window;
const ctx = { frameWindow, gameOrigin: "http://127.0.0.1:18795" };

beforeEach(() => window.localStorage.clear());

describe("세이브 데이터 검증", () => {
  it("64KB 이하의 JSON 객체만 받는다", () => {
    expect(isValidSaveData('{"hp":3}')).toBe(true);
    expect(isValidSaveData("{}")).toBe(true);
    for (const bad of ["[1]", "3", "null", '"x"', "{oops", "", undefined, 5, { a: 1 }]) expect(isValidSaveData(bad), String(bad)).toBe(false);
    expect(isValidSaveData(JSON.stringify({ a: "x".repeat(MAX_SAVE_CHARS) }))).toBe(false);
  });

  it("빈 세이브는 저장하지 않는다", () => {
    expect(isEmptySave("{}")).toBe(true);
    expect(isEmptySave('{"a":1}')).toBe(false);
    expect(writeSave("g1", "{}", 1)).toBe(false);
    expect(readSave("g1")).toBeNull();
  });
});

describe("localStorage 슬롯", () => {
  it("게임별로 따로 저장하고 읽고 지운다", () => {
    expect(writeSave("g1", '{"hp":3}', 2)).toBe(true);
    expect(writeSave("g2", '{"hp":9}', 1)).toBe(true);
    expect(readSave("g1")).toMatchObject({ data: '{"hp":3}', buildSeq: 2 });
    expect(readSave("g2")?.data).toBe('{"hp":9}');
    clearSave("g1");
    expect(readSave("g1")).toBeNull();
    expect(readSave("g2")?.data).toBe('{"hp":9}'); // 다른 게임의 저장은 그대로
  });

  it("깨진 값·잘못된 모양은 없는 것으로 본다", () => {
    window.localStorage.setItem(SAVE_KEY_PREFIX + "g1", "not json");
    expect(readSave("g1")).toBeNull();
    window.localStorage.setItem(SAVE_KEY_PREFIX + "g1", JSON.stringify({ data: "[1]", savedAt: "x" }));
    expect(readSave("g1")).toBeNull();
  });

  it("저장소가 막히면 던지지 않고 실패를 알린다", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("denied"); } } as unknown as Storage;
    expect(writeSave("g1", '{"a":1}', 1, broken)).toBe(false);
    expect(readSave("g1", broken)).toBeNull();
    expect(() => clearSave("g1", broken)).not.toThrow();
  });
});

describe("게임에서 온 메시지 검증", () => {
  const msg = (data: unknown, over: Partial<{ origin: string; source: unknown }> = {}) => ({ origin: "null", source: frameWindow, data, ...over });

  it("ready 는 우리 iframe 이 보냈을 때만 인정한다", () => {
    expect(acceptReadyMessage(msg({ type: "ttakkari:ready" }), ctx)).toBe(true);
    expect(acceptReadyMessage(msg({ type: "ttakkari:ready" }, { origin: ctx.gameOrigin }), ctx)).toBe(true);
    expect(acceptReadyMessage(msg({ type: "ttakkari:ready" }, { source: {} }), ctx)).toBe(false);
    expect(acceptReadyMessage(msg({ type: "ttakkari:ready" }, { origin: "https://evil.example" }), ctx)).toBe(false);
    expect(acceptReadyMessage(msg({ type: "ttakkari:ready" }), { ...ctx, frameWindow: null })).toBe(false);
    expect(acceptReadyMessage(msg({ type: "other" }), ctx)).toBe(false);
    expect(acceptReadyMessage(msg(["ttakkari:ready"]), ctx)).toBe(false);
  });

  it("내보내기 응답은 id 가 같고 세이브 모양일 때만 받는다", () => {
    const c = { ...ctx, expectedId: "a1" };
    expect(acceptSaveExportMessage(msg({ type: "ttakkari:save-export:result", id: "a1", data: '{"x":1}' }), c)).toBe('{"x":1}');
    expect(acceptSaveExportMessage(msg({ type: "ttakkari:save-export:result", id: "zz", data: '{"x":1}' }), c)).toBeNull();
    expect(acceptSaveExportMessage(msg({ type: "ttakkari:save-export:result", id: "a1", data: "[1]" }), c)).toBeNull();
    expect(acceptSaveExportMessage(msg({ type: "ttakkari:save-export:result", id: "a1", data: '{"x":1}' }, { source: {} }), c)).toBeNull();
  });

  it("불러오기 응답은 id 가 같고 ok 가 불리언일 때만 받는다", () => {
    const c = { ...ctx, expectedId: "b2" };
    expect(acceptSaveImportMessage(msg({ type: "ttakkari:save-import:result", id: "b2", ok: true }), c)).toBe(true);
    expect(acceptSaveImportMessage(msg({ type: "ttakkari:save-import:result", id: "b2", ok: false }), c)).toBe(false);
    expect(acceptSaveImportMessage(msg({ type: "ttakkari:save-import:result", id: "b2", ok: "yes" }), c)).toBeNull();
    expect(acceptSaveImportMessage(msg({ type: "ttakkari:save-import:result", id: "other", ok: true }), c)).toBeNull();
  });
});
