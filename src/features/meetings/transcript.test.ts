import { describe, expect, it } from "vitest";
import type { SttSegment } from "../../api/client";
import {
  buildTurns, defaultSpeakerName, foldRepeats, findHits, formatClock, locateEvidence, speakerOrder, splitByQuery, splitLongLine,
  utteranceAtTime, utterancesFromApi, utterancesFromPlain, utterancesFromSegments,
} from "./transcript";

const seg = (position: number, start: number, end: number, text: string, over: Partial<SttSegment> = {}): SttSegment => ({
  id: `g${position}`, position, start, end, original_text: text, corrected_text: null, speaker_id: null, identified_person: null,
  overlap: null, verification_status: "unverified", flags: [], ...over,
});

describe("utterancesFromSegments", () => {
  it("화자·중첩·확인 필요 표식을 옮기고 빈 구간은 건너뛴다", () => {
    const u = utterancesFromSegments([
      seg(0, 0, 2, "안녕하세요", { speaker_id: "SPEAKER_00" }),
      seg(1, 2, 3, "  ", { speaker_id: "SPEAKER_00" }),
      seg(2, 3, 5, "네 맞아요", { speaker_id: "SPEAKER_01", overlap: true }),
      seg(3, 5, 6, "음음음음음음", { flags: ["repetition"] }),
      seg(4, 6, 7, "검수 필요", { verification_status: "needs_review" }),
      seg(5, 7, 8, "검수 완료", { verification_status: "verified" }),
    ]);
    expect(u.map((x) => x.id)).toEqual(["s0", "s2", "s3", "s4", "s5"]);
    expect(u[0]).toMatchObject({ speaker: "SPEAKER_00", overlap: false, uncertain: false });
    expect(u[1]).toMatchObject({ speaker: "SPEAKER_01", overlap: true });
    expect(u[2].uncertain).toBe(true);
    expect(u[3].uncertain).toBe(true);
    expect(u[4].uncertain).toBe(false);
  });

  it("교정 후보(corrected_text)가 있어도 원문을 본문으로 쓴다", () => {
    const [u] = utterancesFromSegments([seg(0, 0, 1, "원문", { corrected_text: "후보" })]);
    expect(u.text).toBe("원문");
  });
});

describe("utterancesFromApi", () => {
  it("화자별 발화 API 응답을 발화로 바꾼다(겹침 true 만 겹침, 알 수 없는 상태는 검증 필요)", () => {
    const base = { start: 1, end: 2, speaker_label: null, flags: [] as string[] };
    const u = utterancesFromApi([
      { ...base, id: "0", speaker_id: "S0", text: " 안녕 ", verification_status: "unverified", overlap: false },
      { ...base, id: "1", speaker_id: "S1", text: "겹침", verification_status: "unverified", overlap: true },
      { ...base, id: "2", speaker_id: null, text: "새 상태", verification_status: "future", overlap: null },
      { ...base, id: "3", speaker_id: null, text: "", verification_status: "unverified", overlap: null },
      { ...base, id: "4", speaker_id: null, text: "접힘", verification_status: "unverified", overlap: null, flags: ["repetition_folded"] },
    ]);
    expect(u.map((x) => x.id)).toEqual(["u0", "u1", "u2", "u4"]);
    expect(u[0]).toMatchObject({ text: "안녕", speaker: "S0", overlap: false, review: false, uncertain: false });
    expect(u[1].overlap).toBe(true);
    expect(u[2]).toMatchObject({ review: true, uncertain: true });
    expect(u[3]).toMatchObject({ review: true });
  });
});

describe("반복 환각 접기", () => {
  it("한 발화 안에서 같은 문장이 되풀이되면 한 번만 남기고 횟수를 센다", () => {
    const r = foldRepeats("시안 B는 조금 레거시한 디자인 패턴을 따라갔다 네 그리고 이제 시안 B는 조금 레거시한 디자인 패턴을 따라갔다 네 그리고 이제 시안 B는 조금 레거시한 디자인 패턴을 따라갔다");
    expect(r.folded).toBeGreaterThanOrEqual(1);
    expect(r.text.length).toBeLessThan(80);
    expect(foldRepeats("크기 차이가 많이 나나? ".repeat(30)).text.trim()).toBe("크기 차이가 많이 나나?");
  });
  it("짧은 말버릇(네 네 네)이나 두 번 말한 문장은 건드리지 않는다", () => {
    expect(foldRepeats("네 네 네 네 맞아요")).toEqual({ text: "네 네 네 네 맞아요", folded: 0 });
    expect(foldRepeats("크기 차이가 많이 나나? 크기 차이가 많이 나나?").folded).toBe(0);
  });
  it("구간이 쪼개져 연달아 나온 같은 문장은 한 발화로 접고 검증 필요로 표시한다", () => {
    const segs = Array.from({ length: 40 }, (_, i) => seg(i, 130 + i * 3, 133 + i * 3, "크기 차이가 많이 나나?"));
    const u = utterancesFromSegments([seg(99, 100, 129, "앞선 정상 발언입니다"), ...segs]);
    expect(u).toHaveLength(2);
    expect(u[1]).toMatchObject({ text: "크기 차이가 많이 나나?", folded: 39, review: true, uncertain: true, start: 130, end: 250 });
    expect(u[0].folded).toBe(0);
  });
  it("화자가 다르면 같은 문장이어도 접지 않는다", () => {
    const u = utterancesFromSegments([
      seg(0, 0, 1, "그렇게 하겠습니다", { speaker_id: "A" }), seg(1, 1, 2, "그렇게 하겠습니다", { speaker_id: "B" }), seg(2, 2, 3, "그렇게 하겠습니다", { speaker_id: "A" }),
    ]);
    expect(u).toHaveLength(3);
  });
});

describe("buildTurns", () => {
  it("연속된 같은 화자는 한 차례로 묶고 화자가 바뀌면 나눈다", () => {
    const u = utterancesFromSegments([
      seg(0, 0, 2, "하나", { speaker_id: "A" }), seg(1, 2, 4, "둘", { speaker_id: "A" }),
      seg(2, 4, 6, "셋", { speaker_id: "B" }), seg(3, 6, 8, "넷", { speaker_id: "A" }),
    ]);
    const turns = buildTurns(u);
    expect(turns.map((t) => [t.speaker, t.paragraphs.flatMap((p) => p.utterances.map((x) => x.text)).join("")])).toEqual([["A", "하나둘"], ["B", "셋"], ["A", "넷"]]);
    expect(turns[0].start).toBe(0);
  });

  it("같은 화자라도 3초 넘게 쉬면 문단을 나눈다(시각을 다시 붙인다)", () => {
    const [t] = buildTurns(utterancesFromSegments([seg(0, 0, 2, "앞", { speaker_id: "A" }), seg(1, 10, 12, "뒤", { speaker_id: "A" })]));
    expect(t.paragraphs.map((p) => p.start)).toEqual([0, 10]);
  });

  it("화자가 하나도 없으면 문단마다 라벨 없는 블록이다", () => {
    const turns = buildTurns(utterancesFromSegments([seg(0, 0, 2, "가"), seg(1, 10, 12, "나")]));
    expect(turns.map((t) => t.speaker)).toEqual([null, null]);
    expect(turns).toHaveLength(2);
  });

  it("처음 나온 순서로 화자 번호를 매기고 서버 인물 이름이 있으면 그것을 쓴다", () => {
    const u = utterancesFromSegments([seg(0, 0, 1, "a", { speaker_id: "S9" }), seg(1, 1, 2, "b", { speaker_id: "S2" })]);
    const order = speakerOrder(u);
    expect(order).toEqual(["S9", "S2"]);
    expect(defaultSpeakerName(order, "S2")).toBe("화자 2");
    expect(defaultSpeakerName(order, "S2", "김민수")).toBe("김민수");
    expect(defaultSpeakerName(order, null)).toBe("화자 미상");
  });
});

describe("평문 전사", () => {
  it("줄 단위로 나누고 화자·시각은 만들지 않는다", () => {
    const u = utterancesFromPlain("첫 줄입니다.\n\n둘째 줄입니다.");
    expect(u.map((x) => [x.text, x.speaker, x.start])).toEqual([["첫 줄입니다.", null, null], ["둘째 줄입니다.", null, null]]);
    expect(buildTurns(u)).toHaveLength(2);
  });

  it("줄바꿈 없는 2만 자도 문장 끝에서 잘라 목록으로 만든다", () => {
    const line = Array.from({ length: 900 }, (_, i) => `오늘 회의의 ${i}번째 안건으로 릴리스 일정을 논의했습니다.`).join(" ");
    expect(line.length).toBeGreaterThan(20000);
    const parts = splitLongLine(line.trim());
    expect(parts.length).toBeGreaterThan(50);
    expect(parts.every((p) => p.length <= 300)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, "")).toBe(line.replace(/\s+/g, ""));
    const turns = buildTurns(utterancesFromPlain(line));
    expect(turns.length).toBeGreaterThan(20);
  });

  it("'참석자 1 00:03' 형식의 내보내기는 이름과 시각을 읽는다", () => {
    const u = utterancesFromPlain("참석자 1 00:03\n안녕하세요\n참석자 2 01:05\n반갑습니다\n이어지는 말");
    expect(u.map((x) => [x.person, x.start, x.text])).toEqual([["참석자 1", 3, "안녕하세요"], ["참석자 2", 65, "반갑습니다"], ["참석자 2", 65, "이어지는 말"]]);
    const turns = buildTurns(u);
    expect(turns.map((t) => t.person)).toEqual(["참석자 1", "참석자 2"]);
  });

  it("시각처럼 보이는 줄이 하나뿐이면 일반 평문으로 본다", () => {
    const u = utterancesFromPlain("회의 시작 10:00\n본문입니다");
    expect(u.every((x) => x.speaker === null)).toBe(true);
  });
});

describe("formatClock", () => {
  it("mm:ss, 한 시간 넘으면 h:mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(75.9)).toBe("01:15");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(null)).toBe("");
  });
});

describe("검색", () => {
  const u = utterancesFromPlain("릴리스는 목요일.\n목요일에 릴리스합니다. 릴리스 맞죠?\n무관한 줄");
  it("발화마다 일치 수를 세어 일련번호를 매긴다(대소문자 무시)", () => {
    const h = findHits(u, "릴리스");
    expect(h.total).toBe(3);
    expect(h.uids).toEqual(["p0", "p1"]);
    expect(h.start.get("p1")).toBe(1);
    expect(findHits(u, "").total).toBe(0);
    expect(findHits(utterancesFromPlain("API api Api"), "api").total).toBe(3);
  });
  it("정규식 특수문자를 그대로 찾는다", () => {
    expect(splitByQuery("가격은 (1+1) 입니다", "(1+1)")).toEqual(["가격은 ", "(1+1)", " 입니다"]);
    expect(splitByQuery("그대로", "")).toEqual(["그대로"]);
  });
});

describe("근거 발화 찾기", () => {
  const u = utterancesFromSegments([
    seg(0, 0, 4, "먼저 일정부터 볼게요.", { speaker_id: "A" }),
    seg(1, 4, 9, "릴리스는 이번 주 목요일로", { speaker_id: "B" }),
    seg(2, 9, 12, "앞당기는 게 좋겠습니다.", { speaker_id: "B" }),
    seg(3, 70, 75, "그럼 체크리스트는 제가 쓸게요", { speaker_id: "A" }),
  ]);
  it("구두점·공백이 달라도 인용문이 들어 있는 발화를 찾는다", () => {
    expect(locateEvidence(u, "체크리스트는 제가 쓸게요")).toBe("s3");
    expect(locateEvidence(u, "릴리스는 이번 주 목요일로")).toBe("s1");
  });
  it("여러 구간에 걸친 인용문은 시작 발화를 가리킨다", () => {
    expect(locateEvidence(u, "릴리스는 이번 주 목요일로 앞당기는 게 좋겠습니다")).toBe("s1");
  });
  it("너무 짧거나 전사에 없는(바꿔 쓴) 인용문은 연결하지 않는다", () => {
    expect(locateEvidence(u, "네")).toBeNull();
    expect(locateEvidence(u, "배포 날짜를 금요일로 미루기로 했다")).toBeNull();
    expect(locateEvidence(u, null)).toBeNull();
  });
  it("시각으로 가장 가까운 앞 발화를 찾는다", () => {
    expect(utteranceAtTime(u, 10)).toBe("s2");
    expect(utteranceAtTime(u, 70)).toBe("s3");
    expect(utteranceAtTime(u, 0)).toBe("s0");
  });
});
