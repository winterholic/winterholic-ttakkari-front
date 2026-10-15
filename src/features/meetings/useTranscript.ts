import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMeetingSttJobs, listMeetingSttSegments, listMeetingSttUtterances } from "../../api/client";
import type { MeetingDetail } from "../../api/client";
import { utterancesFromPlain, utterancesFromApi, utterancesFromSegments } from "./transcript";
import type { Utterance } from "./transcript";

const PAGE = 500;
/** 두 시간 회의도 발화는 수천 개 수준이다. 비정상 응답이 끝없이 이어지지 않게 막는다 */
const MAX_PAGES = 40;

export const sttKey = (meetingId: string, transcriptChars: number) => ["meetings", "stt", meetingId, transcriptChars] as const;

/** 본문 전사가 이 Mac의 로컬 Whisper에서 온 것일 때만 구간(시각·화자)이 있다. 붙여넣거나 옛 외부 전사는 평문뿐 */
export const hasSegmentSource = (m: Pick<MeetingDetail, "transcript" | "transcript_source">) =>
  !!m.transcript && m.transcript_source === "provider:local_whisper";

interface Fetched { utterances: Utterance[]; diarization: string | null; speakerCount: number | null }

/** 화자별 발화 API(새 서버). 한 쪽이라도 실패하면 던진다 */
async function fetchUtterances(meetingId: string, jobId: string): Promise<Fetched> {
  const list: Utterance[] = [];
  let diarization: string | null = null;
  let speakerCount: number | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await listMeetingSttUtterances(meetingId, jobId, i * PAGE, PAGE);
    list.push(...utterancesFromApi(page.utterances));
    diarization = page.diarization_status ?? null;
    speakerCount = page.speaker_count ?? null;
    if (!page.has_more || !page.utterances.length) break;
  }
  return { utterances: list, diarization, speakerCount };
}

/** 구간 API(옛 서버·발화 API 실패 때). 화자·중첩은 화자 분리를 켠 작업에만 있다 */
async function fetchSegments(meetingId: string, jobId: string, meta: Record<string, unknown> | null): Promise<Fetched> {
  const list: Utterance[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await listMeetingSttSegments(meetingId, jobId, i * PAGE, PAGE);
    list.push(...utterancesFromSegments(page.segments));
    if (page.segments.length < PAGE) break;
  }
  return {
    utterances: list,
    diarization: typeof meta?.diarization_status === "string" ? meta.diarization_status : null,
    speakerCount: typeof meta?.speaker_count === "number" ? meta.speaker_count : null,
  };
}

async function fetchTranscript(meetingId: string): Promise<Fetched | null> {
  const { jobs } = await listMeetingSttJobs(meetingId);
  // 목록은 최신순. 구간 재처리로 만든 후보 시도는 본문이 아니다.
  const job = jobs.find((j) => j.status === "succeeded" && !j.candidate_only && !j.parent_job_id);
  if (!job) return null;
  try {
    const r = await fetchUtterances(meetingId, job.id);
    if (r.utterances.length) return r;
  } catch {
    // 발화 API가 아직 없는 서버(404)거나 일시 오류면 구간 API로 대신한다.
  }
  return fetchSegments(meetingId, job.id, job.metadata);
}

export interface TranscriptData {
  /** loading: 받는 중 · segments: 시각(과 화자)이 있는 발화 · plain: 평문 전사 · none: 전사 없음 */
  mode: "loading" | "segments" | "plain" | "none";
  utterances: Utterance[];
  /** 구간 조회에 실패해 평문으로 대신 보여 주는가 */
  degraded: boolean;
  /** 화자 분리 상태(서버 metadata). 모르면 null */
  diarization: string | null;
  speakerCount: number | null;
}

const EMPTY: Omit<TranscriptData, "mode"> = { utterances: [], degraded: false, diarization: null, speakerCount: null };

/**
 * 전사 화면과 분석 화면(근거 발화 연결)이 같이 쓴다. 쿼리 키가 같아 한 번만 받는다.
 * 구간이 없거나 실패하면 본문 평문으로 대신해서 화면이 비지 않게 한다.
 */
export function useTranscript(m: MeetingDetail, enabled = true): TranscriptData {
  const wantSegments = enabled && hasSegmentSource(m);
  const q = useQuery({
    queryKey: sttKey(m.id, m.transcript_chars),
    queryFn: () => fetchTranscript(m.id),
    enabled: wantSegments,
    staleTime: 60_000,
    retry: 1,
    retryDelay: 400,
  });
  const fromServer = q.data?.utterances;
  const plain = useMemo(() => (m.transcript ? utterancesFromPlain(m.transcript) : []), [m.transcript]);
  if (!m.transcript) return { mode: "none", ...EMPTY };
  if (wantSegments && q.isPending) return { mode: "loading", ...EMPTY };
  if (wantSegments && fromServer?.length) {
    return { mode: "segments", utterances: fromServer, degraded: false, diarization: q.data?.diarization ?? null, speakerCount: q.data?.speakerCount ?? null };
  }
  return { mode: "plain", utterances: plain, degraded: wantSegments && q.isError, diarization: null, speakerCount: null };
}
