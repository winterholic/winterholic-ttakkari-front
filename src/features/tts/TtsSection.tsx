import { useId } from "react";
import { Link } from "react-router";
import { VoiceSpeedFields } from "./VoiceSpeedFields";
import { NOT_DEPLOYED_TEXT, reasonText } from "./ttsText";
import { setTtsPrefs, useTtsPrefs } from "./ttsPrefs";
import { useTtsAvailability } from "./useTtsAvailability";

/** 설정 화면의 음성 출력. 켜야만 채팅 응답에 재생 버튼이 생긴다. 서버에 TTS 가 없으면 켤 수 없고 '준비 중'으로 보인다. */
export function TtsSection() {
  const id = useId();
  const prefs = useTtsPrefs();
  const q = useTtsAvailability();
  const a = q.data;
  const ready = a?.state === "ready";
  // 이미 켜 둔 사람은 서버가 준비 중이어도 끌 수는 있어야 한다.
  const canToggle = ready || prefs.voiceOutput;
  return (
    <section className="tk-section" id="tts" aria-labelledby={`${id}-title`}>
      <div className="tk-section__head">
        <h2 className="tk-section__title" id={`${id}-title`}>음성 출력</h2>
      </div>
      <p className="tk-fieldset__help" id={`${id}-help`}>
        따까리의 답에 듣기 버튼을 붙여요. 기본은 글자만 나오고, 켜면 이 기기에서만 버튼이 보여요. 음성은 Mac Studio에서 만들어서 외부로 나가지 않아요.
      </p>
      <label className="tk-switch tk-switch--row">
        <input
          type="checkbox"
          role="switch"
          checked={prefs.voiceOutput}
          disabled={!canToggle}
          aria-describedby={`${id}-help ${id}-status`}
          onChange={(e) => setTtsPrefs({ voiceOutput: e.target.checked })}
        />
        채팅 응답 음성 재생
      </label>
      <p className="tk-fieldset__help" id={`${id}-status`} role="status" aria-live="polite">
        {q.isPending && "음성 기능을 확인하는 중이에요."}
        {q.isError && "음성 기능을 확인하지 못했어요."}
        {a?.state === "unavailable" && (a.reason === "disabled" ? reasonText("disabled") : `준비 중 · ${NOT_DEPLOYED_TEXT}`)}
        {a?.state === "preparing" && `준비 중 · ${reasonText(a.reason)}`}
        {ready && "사용할 수 있어요."}
      </p>
      {ready && (
        <>
          <VoiceSpeedFields voices={a.voices} />
          <p className="tk-fieldset__help">
            음성과 속도는 <Link to="/tts">음성 생성</Link> 화면과 같은 값을 써요.
          </p>
        </>
      )}
      {(q.isError || a?.state === "unavailable" || a?.state === "preparing") && (
        <button className="tk-button tk-button--sm" type="button" disabled={q.isFetching} onClick={() => void q.refetch()}>다시 확인</button>
      )}
    </section>
  );
}
