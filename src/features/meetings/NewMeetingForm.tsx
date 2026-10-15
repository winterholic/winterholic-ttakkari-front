import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { createMeeting, meetingProviders, uploadFile } from "../../api/client";
import type { MeetingScope } from "../../api/client";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { formatSize } from "../viewer/kinds";
import { useDefaultWorkspace } from "../workspace/useDefaultWorkspace";
import { Callout, SCOPE_OPTIONS } from "./shared";
import { useProjectOptions } from "./projects";
import { TranscriptField } from "./TranscriptField";

type Mode = "audio" | "text";


/**
 * 새 회의록. 녹음 파일을 올리거나(전사는 선택 엔진으로 자동) 이미 있는 전사 텍스트를 넣는다.
 * 데스크톱·모바일이 같은 컴포넌트다. 전사 텍스트는 만들자마자 분석을 시작한다.
 */
export function NewMeetingForm() {
  const id = useId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ws = useDefaultWorkspace();
  const engines = useQuery({ queryKey: ["meetings", "providers"], queryFn: meetingProviders });
  const [selection, setProvider] = useState("");
  const provider = selection || "local_whisper";
  const selectedEngine = engines.data?.providers.find((p) => p.id === provider);
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
        return createMeeting({ ...base, audio_artifact_id: art.id, auto_process: true,
          provider_id: provider });
      }
      return createMeeting({ ...base, transcript, transcript_source: source, auto_process: true });
    },
    // 서버가 만들자마자 처리(녹음: 선택 엔진 전사 → 분석, 텍스트: 분석)를 건다. 막힌 사유는 회의는 만든 채로 알려 준다.
    onSuccess: (meeting) => {
      void qc.invalidateQueries({ queryKey: ["meetings"] });
      if (meeting.auto_error) toast({ message: `처리를 시작하지 못했어요. ${meeting.auto_error.message}` });
      navigate(`/meetings/${meeting.id}`);
    },
  });

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
        <label className="tk-label" id={`${id}-project-label`} htmlFor={`${id}-project`}>PMS 프로젝트 <span className="mt-optional">선택</span></label>
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
            <label className="tk-label" id={`${id}-provider-label`} htmlFor={`${id}-provider`}>전사 엔진</label>
            <Select id={`${id}-provider`} labelledBy={`${id}-provider-label`} value={provider} onChange={setProvider}
              options={engines.data?.providers.filter((p) => p.id === "local_whisper").map((p) => ({ value: p.id, label: p.label })) ?? [{ value: "local_whisper", label: "로컬 Whisper large-v3" }]} />
            {engines.error && <p className="tk-help">엔진 상태를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</p>}
          </div>
          <div className="tk-field">
            <span className="tk-label" id={`${id}-file-label`}>녹음 파일</span>
            <div className="mt-file">
              <input ref={fileRef} type="file" hidden aria-labelledby={`${id}-file-label`} accept=".m4a,.mp3,.aac,.amr,.wav,audio/mp4,audio/mpeg,audio/aac,audio/wav"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button className="tk-button" type="button" onClick={() => fileRef.current?.click()}><Icon name="paperclip" />{file ? "다른 파일 고르기" : "파일 고르기"}</button>
              <span className="mt-file__name">{file ? `${file.name} · ${formatSize(file.size)}` : "고른 파일 없음"}</span>
            </div>
            <p className="tk-help">M4A, MP3, AAC, AMR, WAV · 올린 파일은 보관함에도 저장돼요. 업로드 한도는 서버 설정을 따라요.</p>
          </div>
          <>
            <Callout tone="note" icon="info" title="이 Mac에서 전사해요">
              {selectedEngine?.state !== "ready" && <p>{selectedEngine?.message ?? "로컬 엔진 상태를 확인하는 중이에요."}</p>}
              <p>녹음을 외부 전사 서비스로 보내지 않아요. 전사할 때만 모델을 불러오고 끝나면 메모리를 해제해요. 화자 분리는 별도 모델이 준비된 경우에만 실행해요. 이후 결정·액션 분석에는 설정된 AI 서비스를 사용해요.</p>
            </Callout>
          </>

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
