import { describe, expect, it } from "vitest";
import { genReducer } from "./useTtsGeneration";
import type { GenState } from "./useTtsGeneration";
import { chunkSourcesFromJob } from "./ttsJob";
import { defaultRetryable, failureText, prepareSpeechText } from "./ttsText";

const idle: GenState = { phase: "idle" };

describe("genReducer", () => {
  it("submit → accepted(캐시 문장은 이미 끝난 것으로) → progress → succeeded", () => {
    let s = genReducer(idle, { type: "submit" });
    expect(s.phase).toBe("submitting");
    s = genReducer(s, { type: "accepted", jobId: "j", total: 4, cached: 1 });
    expect(s).toMatchObject({ phase: "running", done: 1, total: 4, cached: 1 });
    s = genReducer(s, { type: "progress", done: 3, total: 4 });
    expect(s).toMatchObject({ done: 3 });
    s = genReducer(s, { type: "succeeded", jobId: "j", job: { status: "succeeded" } });
    expect(s.phase).toBe("succeeded");
  });
  it("취소·실패는 진행 중일 때만 먹고, 끝난 뒤의 늦은 이벤트는 무시한다", () => {
    const ok = genReducer({ phase: "running", jobId: "j", done: 0, total: 1, cached: 0 }, { type: "succeeded", jobId: "j", job: { status: "succeeded" } });
    expect(genReducer(ok, { type: "failed", code: "x", message: "m", retryable: true })).toBe(ok);
    expect(genReducer(ok, { type: "cancel" })).toBe(ok);
    expect(genReducer(idle, { type: "cancel" })).toBe(idle);
  });
  it("progress 의 total 이 0 이면 접수 때 안 값을 유지한다", () => {
    const s = genReducer({ phase: "running", jobId: "j", done: 0, total: 5, cached: 0 }, { type: "progress", done: 2, total: 0 });
    expect(s).toMatchObject({ done: 2, total: 5 });
  });
});

describe("chunkSourcesFromJob", () => {
  it("index 순서로 정렬하고 주소 없는 문장은 뺀다", () => {
    const sources = chunkSourcesFromJob({ status: "succeeded", chunks: [{ index: 2, audio_url: "/c" }, { index: 0, audio_url: "/a" }, { index: 1 }] });
    expect(sources).toHaveLength(2);
  });
  it("문장 목록이 없으면 전체 파일 하나로 대신한다", () => {
    expect(chunkSourcesFromJob({ status: "succeeded", audio_full_url: "/full" })).toHaveLength(1);
    expect(chunkSourcesFromJob({ status: "succeeded" })).toHaveLength(0);
  });
});

describe("ttsText", () => {
  it("failureText 는 모르는 코드에도 문구를 준다", () => {
    expect(failureText("owner_gone")).toContain("사라졌어요");
    expect(failureText("something_new")).toBe("음성을 만들지 못했어요.");
    expect(failureText(null)).toBe("음성을 만들지 못했어요.");
  });
  it("retryable 추정: worker_failed·input_missing 만 재시도 불가", () => {
    for (const c of ["input_ttl_expired", "generation_draining", "owner_shutdown", "owner_gone", "server_restarted", "worker_timeout"]) expect(defaultRetryable(c)).toBe(true);
    expect(defaultRetryable("worker_failed")).toBe(false);
    expect(defaultRetryable("input_missing")).toBe(false);
  });
  describe("prepareSpeechText", () => {
    it("한도 이하는 그대로(앞뒤 공백만 제거)", () => {
      expect(prepareSpeechText("  안녕  ")).toEqual({ text: "안녕", truncated: false });
    });
    it("한도를 넘으면 한도 안의 마지막 문장 끝에서 자른다", () => {
      const sentence = "가나다라마바사아자차. ";
      const raw = sentence.repeat(30);
      const r = prepareSpeechText(raw, 100);
      expect(r.truncated).toBe(true);
      expect(r.text.length).toBeLessThanOrEqual(100);
      expect(r.text.endsWith(".")).toBe(true);
    });
    it("문장 끝이 없으면 한도에서 자른다", () => {
      const r = prepareSpeechText("가".repeat(300), 100);
      expect(r).toEqual({ text: "가".repeat(100), truncated: true });
    });
  });
});
