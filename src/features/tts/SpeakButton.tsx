import { useEffect } from "react";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { useTtsPrefs } from "./ttsPrefs";
import { synthesizeSources } from "./ttsJob";
import { ttsPlayer, useOwnedPlayer } from "./ttsPlayer";
import { prepareSpeechText } from "./ttsText";
import { pickVoice, useTtsAvailability } from "./useTtsAvailability";

/**
 * 채팅 응답의 음성 재생 버튼. 설정에서 음성 출력을 켜지 않았거나(기본) 서버에 TTS 가 없으면 아무것도 그리지 않는다.
 * 켜지 않은 사용자는 availability 요청도 보내지 않도록 바깥 컴포넌트가 설정만 먼저 본다.
 */
export function SpeakButton({ ownerId, text }: { ownerId: string; text: string }) {
  const prefs = useTtsPrefs();
  if (!prefs.voiceOutput) return null;
  return <SpeakControl ownerId={ownerId} text={text} />;
}

function SpeakControl({ ownerId, text }: { ownerId: string; text: string }) {
  const prefs = useTtsPrefs();
  const availability = useTtsAvailability();
  const mine = useOwnedPlayer(ownerId);
  // 이 메시지가 사라지면(화면 이동) 그 메시지가 쥔 소리도 멈춘다.
  useEffect(() => () => ttsPlayer.stop(ownerId), [ownerId]);

  if (availability.data?.state !== "ready") return null;
  const voices = availability.data.voices;

  const onClick = () => {
    switch (mine.phase) {
      case "playing":
        ttsPlayer.pause();
        return;
      case "paused":
      case "blocked":
        ttsPlayer.resume();
        return;
      case "loading":
        ttsPlayer.stop(ownerId);
        return;
      default:
        break;
    }
    // iOS Safari: 비동기 작업 전에, 이 클릭과 같은 동기 구간에서 엘리먼트를 연다.
    ttsPlayer.unlock();
    const { text: speech, truncated } = prepareSpeechText(text);
    if (!speech) return;
    if (truncated) toast({ message: "답이 길어서 앞 5000자까지만 읽어요.", tone: "neutral" });
    const voice = pickVoice(voices, prefs.voice);
    void ttsPlayer.play({
      ownerId,
      title: "따까리의 응답",
      prepare: (signal) => synthesizeSources({ text: speech, voice, speed: prefs.speed }, signal),
    });
  };

  const LABELS = { playing: "응답 음성 일시정지", loading: "음성 준비 취소", paused: "응답 음성 이어서 듣기", blocked: "이어서 듣기" } as const;
  const label = LABELS[mine.phase as keyof typeof LABELS] ?? "응답 음성으로 듣기";
  return (
    <>
      <button
        className="tk-icon-button tk-icon-button--sm"
        type="button"
        aria-label={label}
        aria-busy={mine.phase === "loading" || undefined}
        onClick={onClick}
      >
        {mine.phase === "loading" ? <span className="tk-spinner tk-spinner--xs" aria-hidden /> : <Icon name={mine.phase === "playing" ? "pause" : "play"} />}
      </button>
      {(mine.phase === "playing" || mine.phase === "paused" || mine.phase === "blocked") && (
        <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="응답 음성 중지" onClick={() => ttsPlayer.stop(ownerId)}>
          <Icon name="stop" />
        </button>
      )}
      {mine.phase === "blocked" && (
        <button className="tk-button tk-button--xs" type="button" onClick={() => ttsPlayer.resume()}>
          다음 문장 듣기 (터치)
        </button>
      )}
      {mine.phase === "error" && (
        <span className="tk-status tk-status--danger" role="alert">
          {mine.message ?? "음성을 재생하지 못했어요."}
        </span>
      )}
    </>
  );
}
