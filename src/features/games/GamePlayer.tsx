import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import type { GamePlay } from "../../api/gameTypes";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { requestCapture, requestPause, pngBlobFromDataUrl } from "./captureBridge";
import type { Screenshot } from "./feedback";

/** 사람이 읽는 플레이 불가 사유. 코드는 back api/games.py 의 CODE_STATUS 와 같다. */
export function playProblem(error: unknown): { title: string; detail: string; needsBuild?: boolean } {
  if (error instanceof ApiError) {
    if (error.code === "origin_unconfigured" || error.status === 503)
      return { title: "게임 미리보기 주소가 아직 설정되지 않았어요", detail: "운영 서버에 게임을 보여 줄 전용 주소(hostname)가 아직 연결되지 않았어요. 연결되면 이 자리에 게임이 열립니다." };
    if (error.code === "not_playable")
      return { title: "아직 플레이할 수 있는 빌드가 없어요", detail: "AI에게 개발을 맡기거나 빌드를 시작하면 첫 화면이 만들어져요.", needsBuild: true };
    if (error.code === "snapshot_tampered")
      return { title: "빌드 파일이 기록과 달라 열지 않았어요", detail: "안전을 위해 변조가 의심되는 빌드는 실행하지 않아요. 다른 버전으로 되돌려 보세요." };
    return { title: "게임을 열지 못했어요", detail: error.message };
  }
  return { title: "게임을 열지 못했어요", detail: error instanceof Error ? error.message : String(error) };
}

export function GamePlayer({
  play,
  loading,
  error,
  onRestart,
  onCaptured,
  onStartBuild,
  buildTitle,
}: {
  play: GamePlay | undefined;
  loading: boolean;
  error: unknown;
  /** 새 토큰을 받아 iframe 을 다시 연다. */
  onRestart: () => void;
  onCaptured: (shot: Screenshot) => void;
  onStartBuild?: () => void;
  buildTitle: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  // 어느 play URL 에서 멈췄는지로 기록해, 다른 빌드를 열면 자연스럽게 '재생 중'으로 돌아간다.
  const [pausedUrl, setPausedUrl] = useState<string | null>(null);
  const paused = pausedUrl !== null && pausedUrl === play?.url;
  const [pausing, setPausing] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const capture = useCallback(async () => {
    const frame = frameRef.current;
    if (!frame || !play) return;
    setCapturing(true);
    setCaptureError(null);
    try {
      const r = await requestCapture(frame, play.origin);
      const blob = pngBlobFromDataUrl(r.dataUrl);
      onCaptured({
        blob, url: URL.createObjectURL(blob), width: r.width, height: r.height, source: "bridge-postmessage",
        capturedAt: new Date().toISOString(), buildId: play.build_id, buildSeq: play.build_seq, bundleSha256: play.bundle_sha256,
      });
    } catch (e) {
      setCaptureError(e instanceof Error ? e.message : String(e));
    } finally {
      setCapturing(false);
    }
  }, [play, onCaptured]);

  const togglePause = useCallback(async () => {
    const frame = frameRef.current;
    if (!frame || !play) return;
    setPausing(true);
    setPauseError(null);
    try {
      const r = await requestPause(frame, play.origin, !paused);
      if (!r.supported) setPauseError("이 게임은 일시정지를 지원하지 않아요.");
      else setPausedUrl(r.paused ? play.url : null);
    } catch (e) {
      setPauseError(e instanceof Error ? e.message : String(e));
    } finally {
      setPausing(false);
    }
  }, [play, paused]);

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (fullscreen) {
      if (document.fullscreenElement) void document.exitFullscreen();
      setFullscreen(false);
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => setFullscreen(true));
    } else {
      // iOS Safari 는 일반 요소의 전체화면 API 가 없어 화면을 덮는 방식으로 대신한다.
      setFullscreen(true);
    }
  };

  const problem = error ? playProblem(error) : null;

  return (
    <section className="game-player" aria-label="게임 화면">
      <div className="game-stage" ref={stageRef} data-fullscreen={fullscreen ? "" : undefined}>
        {play && !problem ? (
          <iframe
            key={`${play.url}#${frameKey}`}
            ref={frameRef}
            className="game-stage__frame"
            title={`게임 화면 ${buildTitle}`}
            src={play.url}
            sandbox={play.sandbox}
            allow="fullscreen; autoplay; gamepad"
            referrerPolicy="no-referrer"
            loading="eager"
          />
        ) : (
          <div className="game-stage__empty" role={problem ? "alert" : "status"}>
            {loading && !problem && (
              <>
                <span className="tk-spinner" aria-hidden="true" />
                <p>게임을 여는 중</p>
              </>
            )}
            {problem && (
              <>
                <Icon name={problem.needsBuild ? "info" : "warning"} />
                <p className="game-stage__empty-title">{problem.title}</p>
                <p className="game-stage__empty-detail">{problem.detail}</p>
                {problem.needsBuild && onStartBuild && <Button size="sm" variant="primary" onClick={onStartBuild}>빌드 시작</Button>}
              </>
            )}
          </div>
        )}
        {fullscreen && (
          <button className="tk-icon-button game-stage__exit" type="button" aria-label="전체화면 닫기" onClick={toggleFullscreen}>
            <Icon name="x" />
          </button>
        )}
      </div>
      <div className="tk-toolbar game-toolbar" role="toolbar" aria-label="게임 조작">
        <div className="tk-toolbar__group">
          <Button size="sm" onClick={() => { onRestart(); setFrameKey((k) => k + 1); setPausedUrl(null); setPauseError(null); }} disabled={loading} aria-label="처음부터 다시 재생">
            <Icon name="retry" />
            <span>재생</span>
          </Button>
          {/* 일시정지는 bridge 의 ttakkari:pause/resume 메시지로 게임이 직접 멈춘다(ADR 0051). 이전 템플릿 빌드는 응답이 없어 안내만 보인다. */}
          <Button size="sm" onClick={() => void togglePause()} busy={pausing} disabled={!play || !!problem} aria-pressed={paused} aria-label={paused ? "계속하기" : "일시정지"}>
            <Icon name={paused ? "play" : "hand"} />
            <span>{paused ? "계속" : "일시정지"}</span>
          </Button>
        </div>
        <span className="tk-toolbar__spacer" />
        <div className="tk-toolbar__group">
          <Button size="sm" variant="primary" onClick={() => void capture()} busy={capturing} disabled={!play || !!problem} aria-label="현재 화면 캡처">
            <Icon name="camera" />
            <span>캡처</span>
          </Button>
          <Button size="sm" onClick={toggleFullscreen} disabled={!play || !!problem} aria-label={fullscreen ? "전체화면 닫기" : "전체화면"}>
            <Icon name="expand" />
            <span>전체화면</span>
          </Button>
        </div>
      </div>
      {captureError && <p className="tk-error" role="alert">{captureError}</p>}
      {pauseError && <p className="tk-error" role="alert">{pauseError}</p>}
    </section>
  );
}
