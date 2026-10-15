import { useCallback, useState } from "react";

/**
 * 화자 이름 바꾸기. 서버에 저장 API가 없어서 지금은 이 기기(브라우저)에만 저장한다.
 * 저장 API가 생기면 load/save 두 함수만 서버 호출로 바꾸면 된다(화면은 훅만 안다).
 */
const key = (meetingId: string) => `tk:meeting-speakers:${meetingId}`;

export function loadSpeakerNames(meetingId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(key(meetingId));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (!v || typeof v !== "object") return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, n]) => typeof n === "string" && n.trim()).map(([k, n]) => [k, String(n).trim().slice(0, 40)]));
  } catch {
    return {};
  }
}

function saveSpeakerNames(meetingId: string, names: Record<string, string>) {
  try {
    if (Object.keys(names).length) window.localStorage.setItem(key(meetingId), JSON.stringify(names));
    else window.localStorage.removeItem(key(meetingId));
  } catch {
    // 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)에서는 이번 방문 동안만 유지한다.
  }
}

export function useSpeakerNames(meetingId: string) {
  const [names, setNames] = useState(() => loadSpeakerNames(meetingId));
  const rename = useCallback((speaker: string, name: string) => {
    setNames((prev) => {
      const next = { ...prev };
      const v = name.trim().slice(0, 40);
      if (v) next[speaker] = v;
      else delete next[speaker];
      saveSpeakerNames(meetingId, next);
      return next;
    });
  }, [meetingId]);
  return { names, rename };
}
