import { useId } from "react";
import type { TtsVoice } from "../../api/ttsTypes";
import { Select } from "../../ui/Select";
import { SPEED_OPTIONS, setTtsPrefs, useTtsPrefs } from "./ttsPrefs";
import { pickVoice } from "./useTtsAvailability";

const voiceLabel = (v: TtsVoice) => [v.name, v.gender === "female" ? "여성" : v.gender === "male" ? "남성" : null].filter(Boolean).join(" · ");

/** 음성 종류와 속도. TTS 페이지와 설정 화면이 같은 저장값(ttsPrefs)을 읽고 쓴다. */
export function VoiceSpeedFields({ voices, disabled }: { voices: TtsVoice[]; disabled?: boolean }) {
  const id = useId();
  const prefs = useTtsPrefs();
  const voice = pickVoice(voices, prefs.voice) ?? voices[0]?.id ?? "";
  // 저장된 속도가 프리셋 밖(다른 경로로 들어온 값)이어도 가장 가까운 칸을 켠다.
  const speed = SPEED_OPTIONS.reduce((best, s) => (Math.abs(s - prefs.speed) < Math.abs(best - prefs.speed) ? s : best), SPEED_OPTIONS[0]);
  return (
    <>
      <div className="tk-field">
        <span className="tk-label" id={`${id}-voice`}>음성</span>
        <Select
          id={`${id}-voice-select`}
          labelledBy={`${id}-voice`}
          value={voice}
          options={voices.map((v) => ({ value: v.id, label: voiceLabel(v) }))}
          onChange={(v) => setTtsPrefs({ voice: v })}
          disabled={disabled || voices.length === 0}
        />
      </div>
      <div className="tk-field">
        <span className="tk-label" id={`${id}-speed`}>속도</span>
        <div className="tk-segmented tk-segmented--block" role="radiogroup" aria-labelledby={`${id}-speed`}>
          {SPEED_OPTIONS.map((s) => (
            <label key={s}>
              <input type="radio" name={`${id}-speed-radio`} checked={speed === s} disabled={disabled} onChange={() => setTtsPrefs({ speed: s })} />
              {s === 1 ? "보통" : `${s}배`}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
