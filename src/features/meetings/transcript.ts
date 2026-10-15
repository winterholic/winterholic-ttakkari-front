import type { SttSegment, SttUtterance } from "../../api/client";

/**
 * 전사 화면의 데이터 모델. 서버가 주는 형태(로컬 STT 구간, 옛 평문 전사)를 발화 → 문단 → 차례(화자 연속 구간)로 바꾼다.
 * 서버 계약이 바뀌면 이 파일의 변환 함수만 고친다. 화면은 Utterance 만 안다.
 */
export interface Utterance {
  id: string;
  /** 원음 기준 초. 평문 전사는 null */
  start: number | null;
  end: number | null;
  /** 서버가 준 화자 식별자(SPEAKER_00 등) 또는 가져온 전사에 적힌 이름. 없으면 null */
  speaker: string | null;
  /** 서버가 검증된 인물로 연결해 둔 이름(identified_person). 참석자 이름으로 추정하지 않는다 */
  person: string | null;
  text: string;
  overlap: boolean;
  /** 모델 지표·반복 감지로 확인이 필요한 구간(점선 밑줄로만 은은하게 표시) */
  uncertain: boolean;
  /** 서버가 검증 필요로 표시했거나 반복을 접은 문장. "검증 필요" 배지를 반드시 붙인다 */
  review: boolean;
  /** 같은 문장 반복을 접은 횟수(접힌 만큼 원문에서 줄었다). 0이면 접지 않음 */
  folded: number;
  /** 평문에서 새 줄로 시작했는가(문단을 끊는다) */
  breakBefore: boolean;
}

export interface Paragraph { id: string; start: number | null; utterances: Utterance[] }
export interface Turn {
  id: string;
  /** null 이면 화자 정보가 없는 블록(라벨을 그리지 않는다) */
  speaker: string | null;
  person: string | null;
  start: number | null;
  paragraphs: Paragraph[];
  overlap: boolean;
  uncertain: boolean;
}

/** 확인이 필요하다고 보는 서버 표식. 반복·무음·낮은 확신도처럼 환각 가능성을 가리키는 것만 */
const UNCERTAIN_FLAGS = new Set([
  "low_logprob", "possible_silence", "high_compression", "repetition", "phrase_repetition", "consecutive_duplicate", "speaker_ambiguous",
  "repetition_folded", "quality_retry",
]);
/** 검수가 끝났거나 아직 안 본 상태. 이 밖의 값(needs_review 등)은 확인이 필요한 구간으로 본다 */
const SETTLED_STATUS = new Set(["unverified", "verified", "human_verified", "ok", "accepted"]);

const needsReview = (status: string | undefined, flags: string[]) => !SETTLED_STATUS.has(status ?? "unverified") || flags.includes("repetition_folded");

/** 화자별 발화 API. 화자 번호·라벨은 아래 speakerOrder 가 처음 나온 순서로 다시 매기므로 서버 라벨과 같다 */
export function utterancesFromApi(list: SttUtterance[]): Utterance[] {
  const out: Utterance[] = [];
  for (const s of list) {
    const text = (s.text ?? "").trim();
    if (!text) continue;
    const flags = s.flags ?? [];
    out.push({
      id: `u${s.id}`,
      start: Number.isFinite(s.start) ? s.start : null,
      end: Number.isFinite(s.end) ? s.end : null,
      speaker: s.speaker_id || null,
      person: null,
      text,
      overlap: s.overlap === true || flags.includes("overlapping_speech"),
      uncertain: flags.some((f) => UNCERTAIN_FLAGS.has(f)) || needsReview(s.verification_status, flags),
      review: needsReview(s.verification_status, flags),
      folded: 0,
      breakBefore: false,
    });
  }
  return foldUtterances(out);
}

export function utterancesFromSegments(segments: SttSegment[]): Utterance[] {
  const out: Utterance[] = [];
  for (const s of segments) {
    const text = (s.original_text ?? "").trim();
    if (!text) continue;
    out.push({
      id: `s${s.position}`,
      start: Number.isFinite(s.start) ? s.start : null,
      end: Number.isFinite(s.end) ? s.end : null,
      speaker: s.speaker_id || null,
      person: s.identified_person || null,
      text,
      overlap: s.overlap === true || (s.flags ?? []).includes("overlapping_speech"),
      uncertain: (s.flags ?? []).some((f) => UNCERTAIN_FLAGS.has(f)) || needsReview(s.verification_status, s.flags ?? []),
      review: needsReview(s.verification_status, s.flags ?? []),
      folded: 0,
      breakBefore: false,
    });
  }
  return foldUtterances(out);
}

// ---- 평문 전사(붙여넣기·파일·옛 외부 서비스에서 가져온 것)

const PARA_MAX = 300;
/** 클로바노트 내보내기: "참석자 1 00:03" 한 줄 뒤에 발화 본문이 이어진다 */
const EXPORT_HEAD = /^(\S.{0,23}?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/;

function clockToSeconds(t: string): number {
  const p = t.split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}

/** 한 줄이 너무 길면(2만 자가 한 줄인 전사) 문장 끝에서 끊어 목록으로 그릴 수 있게 한다 */
export function splitLongLine(line: string, max = PARA_MAX): string[] {
  if (line.length <= max) return [line];
  const out: string[] = [];
  let rest = line;
  while (rest.length > max) {
    const win = rest.slice(0, max);
    let cut = Math.max(win.lastIndexOf(". "), win.lastIndexOf("? "), win.lastIndexOf("! "), win.lastIndexOf("다. "), win.lastIndexOf("요. "));
    if (cut > max * 0.4) cut += 1;
    else cut = win.lastIndexOf(" ");
    if (cut < max * 0.4) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

export function utterancesFromPlain(text: string): Utterance[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const heads = lines.filter((l) => EXPORT_HEAD.test(l.trim())).length;
  const out: Utterance[] = [];
  let n = 0;
  // 가져온 전사에 적힌 이름은 이미 사람이 붙인 이름이라 person 으로 둔다(화자 N 으로 바꿔 부르지 않는다).
  const push = (u: Omit<Utterance, "id" | "end" | "person" | "overlap" | "uncertain" | "review" | "folded">) => out.push({ ...u, id: `p${n++}`, end: null, person: u.speaker, overlap: false, uncertain: false, review: false, folded: 0 });
  if (heads >= 2) {
    let speaker: string | null = null;
    let start: number | null = null;
    let first = true;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const m = EXPORT_HEAD.exec(line);
      if (m) {
        speaker = m[1].trim();
        start = clockToSeconds(m[2]);
        first = true;
        continue;
      }
      for (const chunk of splitLongLine(line)) {
        push({ start, speaker, text: chunk, breakBefore: first });
        first = false;
      }
    }
    return foldUtterances(out);
  }
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    splitLongLine(line).forEach((chunk, i) => push({ start: null, speaker: null, text: chunk, breakBefore: i === 0 }));
  }
  return foldUtterances(out);
}

// ---- 문단·차례로 묶기

const PARA_GAP_SEC = 3;
const PARA_MAX_CHARS = 420;

function paragraphs(utts: Utterance[]): Paragraph[] {
  const out: Paragraph[] = [];
  let cur: Paragraph | null = null;
  let chars = 0;
  let prevEnd: number | null = null;
  for (const u of utts) {
    const gap = prevEnd != null && u.start != null ? u.start - prevEnd : 0;
    if (!cur || u.breakBefore || chars + u.text.length > PARA_MAX_CHARS || gap > PARA_GAP_SEC) {
      cur = { id: u.id, start: u.start, utterances: [] };
      out.push(cur);
      chars = 0;
    }
    cur.utterances.push(u);
    chars += u.text.length + 1;
    prevEnd = u.end ?? u.start;
  }
  return out;
}

/**
 * 연속된 같은 화자는 한 차례로 묶는다. 화자 정보가 하나도 없으면 문단마다 라벨 없는 차례가 된다
 * (화자 분리를 안 돌렸거나 평문 전사. 없는 화자를 지어내지 않는다).
 */
export function buildTurns(utts: Utterance[]): Turn[] {
  const labeled = utts.some((u) => u.speaker);
  const mk = (speaker: string | null, person: string | null, group: Utterance[]): Turn => {
    const paras = paragraphs(group);
    return {
      id: group[0].id, speaker, person, start: group[0].start, paragraphs: paras,
      overlap: group.some((u) => u.overlap), uncertain: group.some((u) => u.uncertain),
    };
  };
  if (!labeled) return paragraphs(utts).map((p) => mk(null, null, p.utterances));
  const turns: Turn[] = [];
  let run: Utterance[] = [];
  const flush = () => {
    if (run.length) turns.push(mk(run[0].speaker, run.find((u) => u.person)?.person ?? null, run));
    run = [];
  };
  for (const u of utts) {
    if (run.length && run[0].speaker !== u.speaker) flush();
    run.push(u);
  }
  flush();
  return turns;
}

// ---- 화자 이름

/** 처음 나온 순서대로 번호를 매긴다. 같은 화자는 어디서든 같은 번호·색 */
export function speakerOrder(utts: Utterance[]): string[] {
  const seen: string[] = [];
  for (const u of utts) if (u.speaker && !seen.includes(u.speaker)) seen.push(u.speaker);
  return seen;
}

export function defaultSpeakerName(order: string[], speaker: string | null, person?: string | null): string {
  if (person) return person;
  if (!speaker) return "화자 미상";
  const i = order.indexOf(speaker);
  return i < 0 ? speaker : `화자 ${i + 1}`;
}

// ---- 시각

export function formatClock(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm.padStart(2, "0")}:${ss}`;
}

// ---- 검색

export interface Hit { uid: string; /** 전체에서 몇 번째 */ index: number }

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 발화 텍스트를 검색어 기준으로 쪼갠다. 짝수 인덱스는 일반, 홀수 인덱스는 일치 */
export function splitByQuery(text: string, query: string): string[] {
  const q = query.trim();
  if (!q) return [text];
  return text.split(new RegExp(`(${escapeRe(q)})`, "i"));
}

/** 발화마다 일치 수를 세어 전체 일련번호를 매긴다. start[uid] 는 그 발화의 첫 일치 번호 */
export function findHits(utts: Utterance[], query: string): { total: number; start: Map<string, number>; uids: string[] } {
  const q = query.trim();
  const start = new Map<string, number>();
  const uids: string[] = [];
  if (!q) return { total: 0, start, uids };
  const re = new RegExp(escapeRe(q), "gi");
  let total = 0;
  for (const u of utts) {
    const n = u.text.match(re)?.length ?? 0;
    if (!n) continue;
    start.set(u.id, total);
    uids.push(u.id);
    total += n;
  }
  return { total, start, uids };
}

// ---- 분석 항목 → 전사 위치

const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

/** 시각(초) 이하에서 가장 가까운 발화 */
export function utteranceAtTime(utts: Utterance[], sec: number): string | null {
  let found: string | null = null;
  for (const u of utts) {
    if (u.start == null) continue;
    if (u.start <= sec + 0.5) found = u.id;
    else break;
  }
  return found;
}

/**
 * 분석이 인용한 근거 문장이 전사의 어느 발화인지 찾는다. 인용문이 여러 구간에 걸치거나 구두점이 달라도 찾도록
 * 공백·문장부호를 뺀 이어 붙인 문자열에서 비교한다. 못 찾으면(요약하며 바꿔 쓴 인용) null 이라 화면은 연결을 생략한다.
 */
export function locateEvidence(utts: Utterance[], evidence: string | null | undefined): string | null {
  const needle = norm(evidence ?? "");
  if (needle.length < 6 || !utts.length) return null;
  let hay = "";
  const offsets: number[] = [];
  for (const u of utts) {
    offsets.push(hay.length);
    hay += norm(u.text);
  }
  let at = hay.indexOf(needle);
  if (at < 0 && needle.length > 24) at = hay.indexOf(needle.slice(0, 24));
  if (at < 0) return null;
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  return utts[lo].id;
}

export function startOf(utts: Utterance[], uid: string): number | null {
  return utts.find((u) => u.id === uid)?.start ?? null;
}

// ---- 반복 환각 접기

/**
 * Whisper 는 무음·잡음 구간에서 같은 문장을 수십 번 되풀이한다. 화면에서는 한 번만 보여 주고 "반복 N회 접힘"과 검증 필요를 붙인다.
 * 서버 원본은 그대로이고(구간 API), 여기서는 표시만 줄인다. 6자 미만 단위("네 네 네")는 실제 말버릇일 수 있어 건드리지 않는다.
 */
// 6자 이상 단위가 3번 이상, 또는 20자 이상 단위가 2번 연달아("…따라갔다 네 그리고 이제 …따라갔다 네 그리고 이제" 꼴) 나오면 환각으로 본다.
const REPEAT = /(\S.{5,79}?)(?:\s*\1){2,}|(\S.{19,79}?)\s*\2/u;

export function foldRepeats(text: string): { text: string; folded: number } {
  let folded = 0;
  let out = text;
  for (let guard = 0; guard < 20; guard++) {
    const m = REPEAT.exec(out);
    if (!m) break;
    const unit = m[1] ?? m[2];
    let k = 0;
    for (let i = m[0].indexOf(unit); i >= 0; i = m[0].indexOf(unit, i + unit.length)) k++;
    folded += k - 1;
    out = out.slice(0, m.index) + unit + out.slice(m.index + m[0].length);
  }
  return { text: out, folded };
}

const sameText = (a: string, b: string) => {
  const x = norm(a);
  return x.length >= 4 && x === norm(b);
};

/** 한 발화 안의 반복과, 같은 화자가 같은 문장을 3번 이상 연달아 말한 구간(구간이 쪼개져 나온 반복)을 접는다 */
export function foldUtterances(utts: Utterance[]): Utterance[] {
  const out: Utterance[] = [];
  for (let i = 0; i < utts.length; i++) {
    let u = utts[i];
    let j = i + 1;
    while (j < utts.length && utts[j].speaker === u.speaker && sameText(utts[j].text, u.text)) j++;
    if (j - i >= 3) {
      u = { ...u, end: utts[j - 1].end, overlap: utts.slice(i, j).some((x) => x.overlap), folded: u.folded + (j - i - 1) };
      i = j - 1;
    }
    const f = foldRepeats(u.text);
    if (f.folded) u = { ...u, text: f.text, folded: u.folded + f.folded };
    out.push(u.folded ? { ...u, review: true, uncertain: true } : u);
  }
  return out;
}
