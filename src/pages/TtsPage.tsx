import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { fetchTtsAudio } from "../api/client";
import { TTS_MAX_TEXT_CHARS } from "../api/ttsTypes";
import type { TtsJob, TtsVoice } from "../api/ttsTypes";
import { ErrorState, EmptyState, ListSkeleton } from "../features/viewer/screenStates";
import { VoiceSpeedFields } from "../features/tts/VoiceSpeedFields";
import { chunkSourcesFromJob } from "../features/tts/ttsJob";
import { ttsPlayer, useOwnedPlayer } from "../features/tts/ttsPlayer";
import { setTtsPrefs, useTtsPrefs } from "../features/tts/ttsPrefs";
import { addRecent, clearRecent, removeRecent, useRecentTts } from "../features/tts/ttsRecent";
import type { RecentTts } from "../features/tts/ttsRecent";
import { NOT_DEPLOYED_TEXT, PREPARING_TITLE, formatClock, reasonText } from "../features/tts/ttsText";
import { pickVoice, useTtsAvailability } from "../features/tts/useTtsAvailability";
import { useTtsGeneration } from "../features/tts/useTtsGeneration";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import { toast } from "../ui/toastStore";
import "./tts.css";

const OWNER = "tts-page";

/**
 * 로컬 TTS 생성 페이지(설계서 §10.1). 글 → 음성·속도 → 생성(진행·취소·재요청) → 문장 순서 재생 → 다운로드, 아래에 최근 생성.
 * 서버에 TTS 가 아직 없거나 준비 중이면 입력 칸 대신 '준비 중'만 보인다.
 */
export function TtsPage() {
  const q = useTtsAvailability();
  const a = q.data;
  return (
    <div className="tk-screen tts-page">
      <PageHeader title="음성 생성" meta={a?.state === "ready" ? `${a.status.engine ?? "로컬"} · 음성 ${a.voices.length}개` : undefined} />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--md">
          {q.isPending && <ListSkeleton rows={3} label="음성 기능을 확인하는 중" />}
          {q.isError && <ErrorState error={q.error} what="음성 기능" onRetry={() => void q.refetch()} />}
          {a?.state === "unavailable" && (
            <EmptyState
              icon="volume"
              title={a.reason === "disabled" ? "음성 기능이 꺼져 있어요" : PREPARING_TITLE}
              actions={<button className="tk-button" type="button" disabled={q.isFetching} onClick={() => void q.refetch()}><Icon name="retry" />다시 확인</button>}
            >
              {a.reason === "disabled" ? reasonText("disabled") : NOT_DEPLOYED_TEXT}
            </EmptyState>
          )}
          {a?.state === "preparing" && (
            <EmptyState
              icon="volume"
              title={PREPARING_TITLE}
              actions={<button className="tk-button" type="button" disabled={q.isFetching} onClick={() => void q.refetch()}><Icon name="retry" />다시 확인</button>}
            >
              {reasonText(a.reason)}
            </EmptyState>
          )}
          {a?.state === "ready" && <TtsWorkspace voices={a.voices} />}
        </div>
      </div>
    </div>
  );
}

function fileExt(type: string): string {
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4") || type.includes("aac")) return "m4a";
  return "wav";
}

function TtsWorkspace({ voices }: { voices: TtsVoice[] }) {
  const id = useId();
  const prefs = useTtsPrefs();
  const recent = useRecentTts();
  const gen = useTtsGeneration();
  const player = useOwnedPlayer(OWNER);
  const [text, setText] = useState("");
  const [downloading, setDownloading] = useState(false);
  const sent = useRef<{ text: string; voice: string | null; speed: number } | null>(null);
  const busy = gen.state.phase === "submitting" || gen.state.phase === "running";
  const job: TtsJob | null = gen.state.phase === "succeeded" ? gen.state.job : null;

  // 이 화면을 떠나면 이 화면이 쥔 소리를 멈춘다. 채팅 쪽 소리는 건드리지 않는다.
  useEffect(() => () => ttsPlayer.stop(OWNER), []);

  const playJob = useCallback((j: TtsJob) => {
    void ttsPlayer.play({ ownerId: OWNER, title: "음성 생성", prepare: async () => chunkSourcesFromJob(j) });
  }, []);

  // 생성이 끝나면 곧바로 재생을 시작하고 최근 생성에 남긴다. 제스처 안에서 unlock 해 둔 엘리먼트로 이어 재생한다.
  const succeededId = gen.state.phase === "succeeded" ? gen.state.jobId : null;
  useEffect(() => {
    if (!succeededId || !job || !sent.current) return;
    const s = sent.current;
    addRecent({ jobId: succeededId, text: s.text, voice: s.voice, speed: s.speed, chunks: job.chunks?.length ?? job.progress?.total ?? 1, createdAt: new Date().toISOString() });
    playJob(job);
    // job 객체는 succeededId 가 바뀔 때 함께 바뀐다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [succeededId]);

  const generate = (body: { text: string; voice: string | null; speed: number }, reuseJobId?: string) => {
    // iOS Safari: 합성을 기다리기 전에, 이 클릭과 같은 동기 구간에서 재생 엘리먼트를 연다.
    ttsPlayer.unlock();
    ttsPlayer.stop(OWNER);
    sent.current = body;
    gen.start({ text: body.text, voice: pickVoice(voices, body.voice), speed: body.speed }, reuseJobId);
  };

  const trimmed = text.trim();
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || busy) return;
    generate({ text: trimmed, voice: prefs.voice, speed: prefs.speed });
  };

  const reuse = (r: RecentTts) => {
    if (busy) return;
    setText(r.text);
    setTtsPrefs({ voice: r.voice, speed: r.speed });
    generate({ text: r.text, voice: r.voice, speed: r.speed }, r.jobId);
  };

  const download = async () => {
    const url = job?.audio_full_url;
    if (!url || downloading) return;
    setDownloading(true);
    try {
      const blob = await fetchTtsAudio(url);
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `ttakkari-tts-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}.${fileExt(blob.type)}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "내려받지 못했어요.", tone: "danger" });
    } finally {
      setDownloading(false);
    }
  };

  const total = player.total || (job?.chunks?.length ?? 0);
  const g = gen.state;
  return (
    <>
      <form className="tk-section" onSubmit={onSubmit} aria-label="음성 만들기">
        <div className="tk-field">
          <label className="tk-label" htmlFor={`${id}-text`}>읽을 글</label>
          <textarea
            id={`${id}-text`}
            className="tk-textarea tts-text"
            rows={6}
            value={text}
            maxLength={TTS_MAX_TEXT_CHARS}
            placeholder="음성으로 만들 글을 붙여 넣거나 적어 주세요."
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={`${id}-count`}
          />
          <p className="tk-help tts-count" id={`${id}-count`}>{text.length.toLocaleString("ko-KR")} / {TTS_MAX_TEXT_CHARS.toLocaleString("ko-KR")}자</p>
        </div>
        <VoiceSpeedFields voices={voices} disabled={busy} />
        <div className="tk-button-group">
          {busy ? (
            <button className="tk-button" type="button" onClick={gen.cancel}><Icon name="x" />취소</button>
          ) : (
            <button className="tk-button tk-button--primary" type="submit" aria-disabled={!trimmed || undefined}><Icon name="volume" />음성 만들기</button>
          )}
        </div>

        {g.phase === "submitting" && (
          <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--xs" aria-hidden />요청을 보내는 중이에요.</p>
        )}
        {g.phase === "running" && <GenProgress done={g.done} total={g.total} cached={g.cached} />}
        {g.phase === "cancelled" && <p className="tk-status" role="status">취소했어요. 같은 글로 다시 만들 수 있어요.</p>}
        {g.phase === "failed" && (
          <div className="tk-banner tk-banner--danger" role="alert">
            <Icon name="warning" />
            <span className="tk-banner__text"><strong>만들지 못했어요</strong> · {g.message} <code>{g.code}</code></span>
            {g.retryable && trimmed && (
              <button className="tk-button tk-button--sm" type="button" onClick={() => generate({ text: trimmed, voice: prefs.voice, speed: prefs.speed })}>
                <Icon name="retry" />다시 요청
              </button>
            )}
          </div>
        )}
      </form>

      {job && (
        <section className="tk-section" aria-label="재생">
          <div className="tk-section__head"><h2 className="tk-section__title">재생</h2></div>
          <div className="tts-player" data-phase={player.phase}>
            <div className="tts-player__controls">
              {player.phase === "playing" && <button className="tk-button" type="button" onClick={() => ttsPlayer.pause()}><Icon name="pause" />일시정지</button>}
              {player.phase === "paused" && <button className="tk-button" type="button" onClick={() => ttsPlayer.resume()}><Icon name="play" />이어서 듣기</button>}
              {player.phase === "blocked" && <button className="tk-button tk-button--primary" type="button" onClick={() => ttsPlayer.resume()}><Icon name="play" />다음 문장 듣기 (터치)</button>}
              {(player.phase === "idle" || player.phase === "error") && (
                <button className="tk-button" type="button" onClick={() => { ttsPlayer.unlock(); playJob(job); }}><Icon name="play" />{player.phase === "error" ? "다시 듣기" : "처음부터 듣기"}</button>
              )}
              {player.phase === "loading" && <span className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--xs" aria-hidden />소리를 불러오는 중이에요.</span>}
              {(player.phase === "playing" || player.phase === "paused" || player.phase === "blocked") && (
                <button className="tk-button" type="button" onClick={() => ttsPlayer.stop(OWNER)}><Icon name="stop" />중지</button>
              )}
              <button className="tk-button" type="button" disabled={!job.audio_full_url || downloading} aria-busy={downloading || undefined} onClick={() => void download()}>
                <Icon name="download" />다운로드
              </button>
            </div>
            {total > 1 && player.phase !== "idle" && (
              <div className="tts-player__progress">
                <span
                  className="tk-progress"
                  role="progressbar"
                  aria-label="재생 위치"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={player.index + 1}
                  style={{ "--tk-progress": (player.index + 1) / total } as CSSProperties}
                />
                <span className="tk-help">문장 {player.index + 1} / {total}</span>
              </div>
            )}
            {player.phase === "blocked" && <p className="tk-help">브라우저가 자동으로 다음 문장을 재생하지 못하게 막았어요. 버튼을 한 번 누르면 이어서 들려요.</p>}
            {player.phase === "error" && <p className="tk-error" role="alert">{player.message}</p>}
            {!job.audio_full_url && <p className="tk-help">전체 파일이 없어 다운로드는 쓸 수 없어요.</p>}
          </div>
        </section>
      )}

      <section className="tk-section" aria-labelledby={`${id}-recent`}>
        <div className="tk-section__head">
          <h2 className="tk-section__title" id={`${id}-recent`}>최근 생성</h2>
          {recent.length > 0 && <button className="tk-button tk-button--ghost tk-button--sm" type="button" onClick={clearRecent}>모두 지우기</button>}
        </div>
        {recent.length === 0 ? (
          <p className="tk-help">만든 음성이 여기에 남아요. 서버 캐시에 있으면 바로 다시 들려요.</p>
        ) : (
          <>
            <ul className="tk-list" aria-label="최근 생성 목록">
              {recent.map((r) => (
                <li key={r.jobId}>
                  <div className="tk-list__item">
                    <span className="tk-glyph" data-type="other"><Icon name="volume" /></span>
                    <span className="tk-list__body">
                      <span className="tk-list__title">{r.text.replace(/\s+/g, " ").slice(0, 80)}</span>
                      <span className="tk-list__meta">
                        <span>{formatClock(r.createdAt)}</span>
                        <span>{r.chunks}문장</span>
                        <span>{r.speed === 1 ? "보통 속도" : `${r.speed}배`}</span>
                      </span>
                    </span>
                    <span className="tk-list__end">
                      <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label={`${r.text.slice(0, 20)} 다시 듣기`} disabled={busy} onClick={() => reuse(r)}>
                        <Icon name="play" />
                      </button>
                      <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label={`${r.text.slice(0, 20)} 목록에서 지우기`} onClick={() => removeRecent(r.jobId)}>
                        <Icon name="trash" />
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="tk-help">글 원문은 이 기기에만 남고 서버는 저장하지 않아요.</p>
          </>
        )}
      </section>
    </>
  );
}

function GenProgress({ done, total, cached }: { done: number; total: number; cached: number }) {
  const known = total > 0;
  return (
    <div className="tts-progress" role="status" aria-live="polite">
      <span
        className="tk-progress tk-progress--agent"
        role="progressbar"
        aria-label="음성 생성 진행"
        aria-valuemin={0}
        aria-valuemax={known ? total : undefined}
        aria-valuenow={known ? done : undefined}
        data-indeterminate={known ? undefined : ""}
        style={known ? ({ "--tk-progress": Math.min(1, done / total) } as CSSProperties) : undefined}
      />
      <span className="tk-help">
        {known ? `문장 ${done} / ${total} 만드는 중` : "만드는 중"}
        {cached > 0 && ` · 캐시 ${cached}문장`}
      </span>
    </div>
  );
}
