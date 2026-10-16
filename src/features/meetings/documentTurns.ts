import type { MeetingDocument } from "../../api/sharingTypes";
import { buildTurns } from "./transcript";
import type { Turn } from "./transcript";

/** 화면과 HTML 내보내기가 같은 발화 묶음을 쓰도록 한 곳에서 만든다. */
export function documentTurns(doc: MeetingDocument): Turn[] {
  return buildTurns((doc.transcript?.utterances ?? []).map((u) => ({
    id: u.utterance_id, start: u.start, end: u.end, speaker: u.speaker_id,
    person: u.speaker_name ?? u.speaker_label, text: u.text,
    overlap: u.overlap === true, uncertain: u.verification_status === "needs_review", review: false, folded: 0, breakBefore: false,
  })));
}
