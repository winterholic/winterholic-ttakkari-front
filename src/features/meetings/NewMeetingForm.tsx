import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { analyzeMeeting, createMeeting, listEntities, meetingProviders, uploadFile } from "../../api/client";
import type { MeetingScope } from "../../api/client";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { formatSize } from "../viewer/kinds";
import { useDefaultWorkspace } from "../workspace/useDefaultWorkspace";
import { Callout, SCOPE_OPTIONS } from "./shared";
import { TranscriptField } from "./TranscriptField";

type Mode = "audio" | "text";

/** 프로젝트 선택지. 회의 범위와 맞는(같은 범위이거나 공통) 프로젝트만 보인다(서버도 같은 규칙으로 거절한다). */
export function useProjectOptions(scope: MeetingScope) {
  const q = useQuery({ queryKey: ["assistant", "entities", "project"], queryFn: () => listEntities({ type: "project" }) });
  const options = [{ value: "", label: "연결 안 함" }, ...(q.data?.entities ?? [])
    .filter((e) => !e.scope || e.scope === scope || e.scope === "shared")
    .map((e) => ({ value: e.id, label: e.name }))];
  return { options, isPending: q.isPending };
}

/**
 * 새 회의록. 녹음 파일을 올리거나(전사는 클로바노트 연동 뒤 자동) 이미 있는 전사 텍스트를 넣는다.
 * 데스크톱·모바일이 같은 컴포넌트다. 전사 텍스트는 만들자마자 분석을 시작한다.
 */
export function NewMeetingForm() {
  const id = useId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ws = useDefaultWorkspace();
  const providers = useQuery({ queryKey: ["meetings", "providers"], queryFn: meetingProviders });
  const [mode, setMode] = useState<Mode>("text");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<MeetingScope>("personal");
  const [project, setProject] = useState("");
  const [date, setDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [transcript, setTranscript] = useState("");
  const [source, setSource] = useState<"paste" | "file">("paste");
  const { options } = useProjectOptions(scope);

  const submit = useMutation({
    mutationFn: async () => {
      const base = { title: title.trim(), scope, project_id: project || null, held_at: date ? `${date}T00:00:00+09:00` : null };
      if (mode === "audio") {
        if (!file || !ws.data) throw new Error("녹음 파일을 골라 주세요.");
        const art = await uploadFile(file, ws.data.id);
        return { meeting: await createMeeting({ ...base, audio_artifact_id: art.id }), analyze: false };
      }
      return { meeting: await createMeeting({ ...base, transcript, transcript_source: source }), analyze: true };
    },
    onSuccess: async ({ meeting, analyze }) => {
      void qc.invalidateQueries({ queryKey: ["meetings"] });
      if (analyze) {
        try {
          await analyzeMeeting(meeting.id);
        } catch (e) {
          toast({ message: `분석을 시작하지 못했어요. ${errorText(e).message}` });
        }
      }
      navigate(`/meetings/${meeting.id}`);
    },
  });

  const clovanote = providers.data?.providers.find((p) => p.id === "clovanote");
  const ready = !!title.trim() && (mode === "audio" ? !!file && !!ws.data : !!transcript.trim());

  return (
    <form
      className="tk-stack mt-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !submit.isPending) submit.mutate();
      }}
    >
      <div className="tk-field">
        <label className="tk-label" htmlFor={`${id}-title`}>제목</label>
        <input id={`${id}-title`} className="tk-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="예) 10월 2주차 주간 회의" autoComplete="off" />
      </div>

      <div className="tk-grid mt-form__pair">
        <div className="tk-field">
          <span className="tk-label" id={`${id}-scope`}>범위</span>
          <div className="tk-segmented tk-segmented--block" role="radiogroup" aria-labelledby={`${id}-scope`}>
            {SCOPE_OPTIONS.map((s) => (
              <label key={s.value}>
                <input
                  type="radio"
                  name={`${id}-scope`}
                  checked={scope === s.value}
                  onChange={() => {
                    setScope(s.value);
                    setProject("");
                  }}
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>
        <div className="tk-field">
          <label className="tk-label" htmlFor={`${id}-date`}>회의 날짜 <span className="mt-optional">선택</span></label>
          <input id={`${id}-date`} className="tk-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="tk-field">
        <label className="tk-label" id={`${id}-project-label`} htmlFor={`${id}-project`}>프로젝트 <span className="mt-optional">선택</span></label>
        <Select id={`${id}-project`} labelledBy={`${id}-project-label`} value={project} options={options} onChange={setProject} />
        <p className="tk-help">연결하면 그 프로젝트의 기존 결정·열린 액션과 비교해 충돌을 찾아요.</p>
      </div>

      <div className="tk-field">
        <span className="tk-label" id={`${id}-mode`}>입력 방식</span>
        <div className="tk-segmented tk-segmented--block" role="radiogroup" aria-labelledby={`${id}-mode`}>
          <label><input type="radio" name={`${id}-mode`} checked={mode === "text"} onChange={() => setMode("text")} />전사 텍스트</label>
          <label><input type="radio" name={`${id}-mode`} checked={mode === "audio"} onChange={() => setMode("audio")} />녹음 파일</label>
        </div>
      </div>

      {mode === "text" ? (
        <TranscriptField value={transcript} onChange={setTranscript} onSource={setSource} />
      ) : (
        <>
          <div className="tk-field">
            <span className="tk-label" id={`${id}-file-label`}>녹음 파일</span>
            <div className="mt-file">
              <input ref={fileRef} type="file" hidden aria-labelledby={`${id}-file-label`} accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button className="tk-button" type="button" onClick={() => fileRef.current?.click()}><Icon name="paperclip" />{file ? "다른 파일 고르기" : "파일 고르기"}</button>
              <span className="mt-file__name">{file ? `${file.name} · ${formatSize(file.size)}` : "고른 파일 없음"}</span>
            </div>
            <p className="tk-help">MP3, M4A, WAV 등. 올린 파일은 보관함에 저장돼요.</p>
          </div>
          {clovanote?.state === "ready" ? (
            <Callout tone="note" icon="info" title="전사를 요청할 수 있어요">
              <p>올리면 {clovanote.label}로 전사를 요청하고, 끝나면 이어서 분석해요.</p>
            </Callout>
          ) : (
            <Callout tone="note" icon="info" title="클로바노트 연동 준비 중">
              <p>지금은 녹음이 보관함에 저장되기만 해요. 전사 텍스트가 있다면 아래 버튼으로 바꿔 붙여 넣으면 바로 분석할 수 있어요.</p>
              <button className="tk-button tk-button--sm" type="button" onClick={() => setMode("text")}>전사 텍스트로 입력</button>
            </Callout>
          )}
        </>
      )}

      {submit.error && <p className="tk-error" role="alert"><Icon name="warning" />{errorText(submit.error).message}</p>}
      <div className="tk-button-group tk-button-group--end">
        <Button variant="primary" type="submit" busy={submit.isPending} disabled={!ready}>
          {mode === "audio" ? "녹음 올리기" : "분석 시작"}
        </Button>
      </div>
    </form>
  );
}
