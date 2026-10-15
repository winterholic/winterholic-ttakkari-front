import { memo, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import type { MeetingDetail } from "../../api/client";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { EmptyState, ListSkeleton } from "../viewer/screenStates";
import { sourceLabel } from "./shared";
import { useSpeakerNames } from "./speakerNames";
import { buildTurns, defaultSpeakerName, findHits, formatClock, speakerOrder, splitByQuery } from "./transcript";
import type { Turn, Utterance } from "./transcript";
import { useTranscript } from "./useTranscript";

/** 분석 화면에서 근거 발화를 눌러 넘어올 때의 목표. n 이 바뀌면 같은 발화로도 다시 이동한다 */
export interface TranscriptFocus { uid: string; n: number }

const SLOTS = 6;
const slotOf = (order: string[], speaker: string | null) => {
  const i = speaker ? order.indexOf(speaker) : -1;
  return i < 0 ? 0 : (i % SLOTS) + 1;
};

interface Mark { hit: { uid: string; inner: number } | null; flash: string | null }

interface TurnProps {
  turn: Turn;
  label: string | null;
  slot: number;
  query: string;
  hitStart: Map<string, number>;
  mark: Mark | null;
  onRename: (speaker: string) => void;
}

function Text({ u, query, hitStart, mark }: { u: Utterance; query: string; hitStart: Map<string, number>; mark: Mark | null }) {
  const base = hitStart.get(u.id);
  const parts = base == null ? [u.text] : splitByQuery(u.text, query);
  return (
    <span className="mt-u" data-uid={u.id} data-uncertain={u.uncertain || undefined} data-overlap={u.overlap || undefined} data-flash={mark?.flash === u.id || undefined}>
      {parts.map((p, i) => {
        if (i % 2 === 0) return p;
        const n = (base ?? 0) + (i - 1) / 2;
        const current = mark?.hit?.uid === u.id && mark.hit.inner === (i - 1) / 2;
        return <mark key={i} data-hit={n} aria-current={current || undefined}>{p}</mark>;
      })}
      {u.review && <span className="mt-review">검증 필요{u.folded ? ` · 반복 ${u.folded}회 접힘` : ""}</span>}
      {" "}
    </span>
  );
}

/**
 * 한 화자의 연속 발화. 화면 밖 차례는 브라우저가 그리기를 건너뛰어(content-visibility) 2만 자 전사도 가볍게 스크롤된다.
 * 검색어·현재 위치가 바뀌어도 그 차례에 해당하지 않으면 다시 그리지 않는다.
 */
const TurnView = memo(function TurnView({ turn, label, slot, query, hitStart, mark, onRename }: TurnProps) {
  const labeled = turn.speaker !== null || label !== null;
  return (
    <article className="mt-turn" data-slot={slot || undefined} data-labeled={labeled || undefined} data-overlap={turn.overlap || undefined} data-turn={turn.id}>
      {labeled && (
        <header className="mt-turn__head">
          <button className="mt-turn__who" type="button" disabled={!turn.speaker} onClick={() => turn.speaker && onRename(turn.speaker)} aria-label={turn.speaker ? `${label} 이름 바꾸기` : undefined}>
            <span className="mt-turn__dot" aria-hidden="true" />
            <span className="mt-turn__name">{label}</span>
          </button>
          {turn.overlap && <span className="mt-turn__tag" title="다른 화자와 말이 겹친 구간이 있어요">겹침</span>}
          {turn.start != null && <span className="mt-time">{formatClock(turn.start)}</span>}
        </header>
      )}
      {turn.paragraphs.map((p, i) => (
        <p key={p.id} className="mt-para">
          {p.start != null && (!labeled || i > 0) && <span className="mt-time mt-time--inline">{formatClock(p.start)}</span>}
          {p.utterances.map((u) => <Text key={u.id} u={u} query={query} hitStart={hitStart} mark={mark} />)}
        </p>
      ))}
    </article>
  );
}, (a, b) => a.turn === b.turn && a.label === b.label && a.slot === b.slot && a.query === b.query && a.mark === b.mark && a.onRename === b.onRename);

export function TranscriptView({ m, focus }: { m: MeetingDetail; focus?: TranscriptFocus | null }) {
  const data = useTranscript(m);
  const { names, rename } = useSpeakerNames(m.id);
  const [input, setInput] = useState("");
  const query = useDeferredValue(input.trim());
  // 현재 일치 번호는 검색어와 함께 들고 있어서, 검색어가 바뀌면 자동으로 처음으로 돌아간다.
  const [pos, setPos] = useState({ q: "", i: 0 });
  const cur = pos.q === query ? pos.i : 0;
  const [editing, setEditing] = useState<string | null>(null);
  const [flashDone, setFlashDone] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searchId = useId();

  const order = useMemo(() => speakerOrder(data.utterances), [data.utterances]);
  const turns = useMemo(() => buildTurns(data.utterances), [data.utterances]);
  const hits = useMemo(() => findHits(data.utterances, query), [data.utterances, query]);
  const turnOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of turns) for (const p of t.paragraphs) for (const u of p.utterances) map.set(u.id, t.id);
    return map;
  }, [turns]);
  const labelOf = (speaker: string | null, person: string | null) => (speaker ? names[speaker] ?? defaultSpeakerName(order, speaker, person) : null);

  // 현재 일치가 속한 발화. 일치 번호 → 발화는 시작 번호가 가장 큰 발화로 찾는다.
  const hitIdx = hits.total ? Math.min(cur, hits.total - 1) : 0;
  const activeHit = useMemo(() => {
    if (!hits.total) return null;
    let uid = hits.uids[0];
    for (const id of hits.uids) if ((hits.start.get(id) ?? 0) <= hitIdx) uid = id;
    return { uid, inner: hitIdx - (hits.start.get(uid) ?? 0) };
  }, [hits, hitIdx]);

  useEffect(() => {
    if (!activeHit) return;
    listRef.current?.querySelector('mark[aria-current="true"]')?.scrollIntoView({ block: "center" });
  }, [activeHit, query]);

  // 근거 발화로 이동: 화면 밖 차례는 높이가 추정치라, 한 번 더 맞춘다.
  useEffect(() => {
    if (!focus || data.mode === "loading") return;
    const go = () => [...(listRef.current?.querySelectorAll<HTMLElement>("[data-uid]") ?? [])].find((el) => el.dataset.uid === focus.uid)?.scrollIntoView({ block: "center" });
    go();
    const again = window.setTimeout(go, 120);
    const off = window.setTimeout(() => setFlashDone(focus.n), 2600);
    return () => { window.clearTimeout(again); window.clearTimeout(off); };
  }, [focus, data.mode]);

  if (data.mode === "loading") return <ListSkeleton rows={4} label="전사를 불러오는 중" />;
  if (data.mode === "none") return <EmptyState icon="info" title="전사 텍스트가 없어요" />;

  const speakers = order.map((s) => ({ id: s, label: names[s] ?? defaultSpeakerName(order, s, data.utterances.find((u) => u.speaker === s && u.person)?.person), slot: slotOf(order, s) }));
  const flash = focus && flashDone !== focus.n ? focus : null;
  const move = (d: 1 | -1) => hits.total && setPos({ q: query, i: (hitIdx + d + hits.total) % hits.total });
  const markFor = (t: Turn): Mark | null => {
    const hit = activeHit && turnOf.get(activeHit.uid) === t.id ? activeHit : null;
    const f = flash && turnOf.get(flash.uid) === t.id ? flash.uid : null;
    return hit || f ? { hit, flash: f } : null;
  };
  const sourceText = sourceLabel(m.transcript_source);
  const noSpeakers = data.mode === "segments" && !order.length;

  return (
    <div className="mt-tr">
      <div className="mt-tr__bar">
        <div className="tk-findbar">
          <span className="tk-input-wrap">
            <Icon name="search" />
            <input
              id={searchId}
              className="tk-input tk-input--sm"
              type="search"
              value={input}
              placeholder="전사에서 찾기"
              aria-label="전사에서 찾기"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  move(e.shiftKey ? -1 : 1);
                } else if (e.key === "Escape") setInput("");
              }}
            />
          </span>
          <span className="tk-findbar__count" aria-live="polite">{query ? (hits.total ? `${hitIdx + 1}/${hits.total}` : "0건") : ""}</span>
          <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="이전 결과" disabled={!hits.total} onClick={() => move(-1)}><Icon name="chevron-up" /></button>
          <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="다음 결과" disabled={!hits.total} onClick={() => move(1)}><Icon name="chevron-down" /></button>
        </div>
      </div>

      <p className="mt-item__meta" aria-label="전사 정보">
        <span>{m.transcript_chars.toLocaleString("ko-KR")}자</span>
        {sourceText && <span>{sourceText}</span>}
        {speakers.length > 0 && <span>화자 {speakers.length}명</span>}
      </p>
      {speakers.length > 0 && (
        <ul className="mt-speakers" aria-label="화자">
          {speakers.map((s) => (
            <li key={s.id}>
              <button className="mt-speakers__chip" type="button" data-slot={s.slot} onClick={() => setEditing(s.id)} aria-label={`${s.label} 이름 바꾸기`}>
                <span className="mt-turn__dot" aria-hidden="true" />{s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {data.degraded && <p className="tk-help">구간 정보를 불러오지 못해 본문 텍스트로 보여 드려요.</p>}
      {noSpeakers && (
        <p className="tk-help">{data.diarization === "unavailable" || data.diarization === "failed" ? "화자 구분을 하지 못해서 시각별로만 나눠 보여 드려요." : "화자 구분 정보가 없어서 시각별로만 나눠 보여 드려요."}</p>
      )}

      <div className="mt-tr__list" ref={listRef}>
        {turns.map((t) => (
          <TurnView
            key={t.id}
            turn={t}
            label={labelOf(t.speaker, t.person) ?? (order.length && !t.speaker ? "화자 미상" : null)}
            slot={slotOf(order, t.speaker)}
            query={query}
            hitStart={hits.start}
            mark={markFor(t)}
            onRename={setEditing}
          />
        ))}
      </div>

      <RenameDialog
        speaker={editing}
        current={editing ? names[editing] ?? "" : ""}
        fallback={editing ? defaultSpeakerName(order, editing, data.utterances.find((u) => u.speaker === editing && u.person)?.person) : ""}
        suggestions={m.participants}
        onClose={() => setEditing(null)}
        onSave={(name) => { if (editing) rename(editing, name); setEditing(null); }}
      />
    </div>
  );
}

function RenameDialog({ speaker, current, fallback, suggestions, onClose, onSave }: {
  speaker: string | null;
  current: string;
  fallback: string;
  suggestions: string[];
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [text, setText] = useState(current);
  const [seen, setSeen] = useState<string | null>(speaker);
  // 다른 화자를 열 때마다 입력칸을 그 화자의 현재 이름으로 되돌린다.
  if (seen !== speaker) {
    setSeen(speaker);
    setText(current);
  }
  const id = useId();
  return (
    <Dialog
      open={speaker !== null}
      onClose={onClose}
      modal
      size="sm"
      title="화자 이름"
      id="speaker-rename"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={() => onSave(text)}>저장</Button>
        </>
      }
    >
      <form className="tk-stack" onSubmit={(e) => { e.preventDefault(); onSave(text); }}>
        <div className="tk-field">
          <label className="tk-label" htmlFor={`${id}-n`}>{fallback} 이름</label>
          <input id={`${id}-n`} className="tk-input" value={text} maxLength={40} placeholder={fallback} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </div>
        {suggestions.length > 0 && (
          <div className="tk-chips tk-chips--wrap" role="group" aria-label="참석자에서 고르기">
            {suggestions.map((n) => <button key={n} type="button" className="tk-chip" onClick={() => setText(n)}>{n}</button>)}
          </div>
        )}
        <p className="tk-help">화자 이름은 이 기기에만 저장돼요. 비우고 저장하면 기본 이름으로 돌아가요.</p>
      </form>
    </Dialog>
  );
}
