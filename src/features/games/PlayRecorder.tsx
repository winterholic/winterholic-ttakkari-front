import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { GamePlay } from "../../api/gameTypes";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { CLIP_MAX_FRAMES, CLIP_MAX_MS, RECORD_MAX_MS, jpegBlobFromDataUrl, pickSegmentFrames, requestRecordStart, requestRecordStop } from "./recordBridge";
import type { RecordFrame, Recording } from "./recordBridge";

export type RecorderState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "recording"; startedAt: number }
  | { status: "stopping" }
  | { status: "review"; recording: Recording }
  | { status: "error"; message: string };

const LIMIT_NOTE: Record<string, string> = {
  limit_duration: "녹화가 최대 시간(30초)에서 멈췄어요.",
  limit_bytes: "녹화가 최대 용량에서 멈췄어요.",
  limit_frames: "녹화가 최대 프레임 수에서 멈췄어요.",
};

/** 플레이 녹화 상태(back ADR 0060). 녹화는 게임이 프레임으로 모아 두고, 끝내면 한 번에 받는다. 이 단계에서는 서버로 아무것도 보내지 않는다. */
export function usePlayRecorder(frameRef: RefObject<HTMLIFrameElement | null>, play: GamePlay | undefined) {
  const [state, setState] = useState<RecorderState>({ status: "idle" });
  const seq = useRef(0);

  const stop = useCallback(async () => {
    const frame = frameRef.current;
    if (!frame || !play) return;
    const mine = (seq.current += 1);
    setState({ status: "stopping" });
    try {
      const recording = await requestRecordStop(frame, play.origin);
      if (seq.current !== mine) return;
      setState(recording.frames.length === 0
        ? { status: "error", message: "녹화된 화면이 없어요. 게임이 다 열린 뒤 다시 녹화해 주세요." }
        : { status: "review", recording });
    } catch (e) {
      if (seq.current === mine) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [frameRef, play]);

  const start = useCallback(async () => {
    const frame = frameRef.current;
    if (!frame || !play) return;
    const mine = (seq.current += 1);
    setState({ status: "starting" });
    try {
      const r = await requestRecordStart(frame, play.origin);
      if (seq.current !== mine) return;
      setState(r.supported && r.active ? { status: "recording", startedAt: Date.now() } : { status: "error", message: "이 게임은 녹화를 시작하지 못했어요." });
    } catch (e) {
      if (seq.current === mine) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [frameRef, play]);

  const reset = useCallback(() => {
    seq.current += 1;
    setState({ status: "idle" });
  }, []);

  // 게임이 한도(30초)에서 스스로 멈추므로 부모도 그 시각에 맞춰 결과를 받는다.
  const recordingStartedAt = state.status === "recording" ? state.startedAt : null;
  useEffect(() => {
    if (recordingStartedAt === null) return undefined;
    const timer = setTimeout(() => void stop(), Math.max(0, RECORD_MAX_MS + 500 - (Date.now() - recordingStartedAt)));
    return () => clearTimeout(timer);
  }, [recordingStartedAt, stop]);

  return { state, start, stop, reset };
}

const seconds = (ms: number) => (ms / 1000).toFixed(1);

function useFrameUrls(frames: RecordFrame[]) {
  const urls = useMemo(() => frames.map((f) => URL.createObjectURL(jpegBlobFromDataUrl(f.dataUrl))), [frames]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

function Review({ recording, onAgain, onDiscard }: { recording: Recording; onAgain: () => void; onDiscard: () => void }) {
  const { frames } = recording;
  const urls = useFrameUrls(frames);
  const last = frames.length - 1;
  const [view, setView] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, last]);
  const [from, to] = range;
  const startMs = frames[from].tMs;
  const endMs = frames[to].tMs;
  const length = endMs - startMs;
  const tooLong = length > CLIP_MAX_MS;
  const picked = useMemo(() => (from < to ? pickSegmentFrames(frames, startMs, endMs, CLIP_MAX_FRAMES) : []), [frames, from, to, startMs, endMs]);
  const index = (f: RecordFrame) => frames.indexOf(f);
  return (
    <div className="game-record__review">
      {LIMIT_NOTE[recording.reason] && <p className="game-record__note" role="status">{LIMIT_NOTE[recording.reason]}</p>}
      <img className="game-record__preview" src={urls[view]} alt={`녹화 화면 ${seconds(frames[view].tMs)}초`} width={recording.width} height={recording.height} />
      <label className="game-record__field">
        <span>보기 {seconds(frames[view].tMs)}초</span>
        <input type="range" min={0} max={last} value={view} onChange={(e) => setView(Number(e.target.value))} aria-label="녹화 화면 보기 위치" />
      </label>
      <div className="game-record__range">
        <label className="game-record__field">
          <span>시작 {seconds(startMs)}초</span>
          <input type="range" min={0} max={last} value={from} aria-label="구간 시작" onChange={(e) => { const v = Number(e.target.value); setRange([v, Math.max(v, to)]); setView(v); }} />
        </label>
        <label className="game-record__field">
          <span>끝 {seconds(endMs)}초</span>
          <input type="range" min={0} max={last} value={to} aria-label="구간 끝" onChange={(e) => { const v = Number(e.target.value); setRange([Math.min(from, v), v]); setView(v); }} />
        </label>
      </div>
      <p className={tooLong ? "tk-error" : "game-record__note"} role={tooLong ? "alert" : "status"}>
        {from >= to
          ? "시작과 끝을 다르게 골라 주세요."
          : tooLong
            ? `구간이 너무 길어요(${seconds(length)}초). 최대 ${CLIP_MAX_MS / 1000}초까지 보낼 수 있어요.`
            : `선택한 구간 ${seconds(length)}초 · 대표 화면 ${picked.length}장`}
      </p>
      {picked.length > 0 && !tooLong && (
        <ul className="game-record__thumbs" aria-label="수정 요청에 담길 대표 화면">
          {picked.map((f) => (
            <li key={f.tMs}><img src={urls[index(f)]} alt={`${seconds(f.tMs)}초`} width={56} /><span>{seconds(f.tMs)}초</span></li>
          ))}
        </ul>
      )}
      <p className="game-record__note">이 화면은 아직 이 기기에만 있어요. 서버로 보내기 전에는 아무것도 올라가지 않아요.</p>
      <div className="tk-toolbar__group">
        <Button size="sm" onClick={onAgain}>다시 녹화</Button>
        <Button size="sm" variant="danger" onClick={onDiscard}>버리기</Button>
      </div>
    </div>
  );
}

export function PlayRecorderPanel({ recorder }: { recorder: ReturnType<typeof usePlayRecorder> }) {
  const { state } = recorder;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.status !== "recording") return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [state.status]);
  return (
    <section className="game-record" aria-label="플레이 녹화">
      <p className="game-pick-panel__title">플레이 녹화</p>
      {state.status === "idle" && (
        <>
          <p className="game-record__note">게임 화면만 최대 {RECORD_MAX_MS / 1000}초까지 녹화해요. 끝낸 뒤 문제가 보이는 구간을 고르면 그 구간의 대표 화면만 수정 요청에 담을 수 있어요.</p>
          <Button size="sm" variant="primary" onClick={() => void recorder.start()}><Icon name="film" /><span>녹화 시작</span></Button>
        </>
      )}
      {state.status === "starting" && <p className="game-record__note" role="status"><span className="tk-spinner" aria-hidden="true" /> 녹화를 시작하는 중</p>}
      {state.status === "recording" && (
        <>
          <p className="game-record__note" role="status">녹화 중 {seconds(Math.min(RECORD_MAX_MS, now - state.startedAt))}초 / {RECORD_MAX_MS / 1000}초</p>
          <Button size="sm" variant="danger" onClick={() => void recorder.stop()}><Icon name="x" /><span>녹화 끝내기</span></Button>
        </>
      )}
      {state.status === "stopping" && <p className="game-record__note" role="status"><span className="tk-spinner" aria-hidden="true" /> 녹화 화면을 받는 중</p>}
      {state.status === "review" && <Review recording={state.recording} onAgain={() => void recorder.start()} onDiscard={recorder.reset} />}
      {state.status === "error" && (
        <>
          <p className="tk-error" role="alert">{state.message}</p>
          <Button size="sm" onClick={recorder.reset}>닫기</Button>
        </>
      )}
    </section>
  );
}
