import { describe, expect, it } from "vitest";
import type { RunEvent, RunOut } from "../../api/types";
import { leadOf } from "./RunBlock";

const run = (origin: RunOut["origin"], prompt = "x") => ({ origin, prompt }) as RunOut;
const ev = (type: string, payload: object, seq: number) => ({ seq, type, payload, created_at: "" }) as unknown as RunEvent;

describe("leadOf", () => {
  it("접수 메시지는 마지막 desk.delegated 의 기획 세션", () => {
    const events = [ev("desk.route", { action: "delegate" }, 1), ev("desk.delegated", { lead_id: "a" }, 2), ev("desk.delegated", { lead_id: "b" }, 3)];
    expect(leadOf(run("user"), events)).toBe("b");
    expect(leadOf(run("user"), [ev("desk.route", { action: "answer" }, 1)])).toBeNull();
  });
  it("기획 보고는 프롬프트의 lead_id", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(leadOf(run("report", `[기획 보고] 기획 세션 '보고서' (lead_id=${id}) 완료.`), [])).toBe(id);
    expect(leadOf(run("report", "[작업 보고] 작업 세션 'w' 완료."), [])).toBeNull();
  });
});
