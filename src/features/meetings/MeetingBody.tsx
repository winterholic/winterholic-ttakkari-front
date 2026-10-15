import { useId, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { meetingProviders } from "../../api/client";
import type { MeetingDetail, MeetingProposal } from "../../api/client";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { errorText } from "../viewer/api";
import { EmptyState } from "../viewer/screenStates";
import { AnalysisView, Pending } from "./AnalysisView";
import { useProjectOptions } from "./projects";
import { Callout, PipelineSteps, isRunning } from "./shared";
import { TranscriptField } from "./TranscriptField";
import { TranscriptView } from "./TranscriptView";
import type { TranscriptFocus } from "./TranscriptView";
import { detailKey, useMeetingActions } from "./useMeetingActions";
import type { Actions } from "./useMeetingActions";
import { RelatedMeetings, transcribeStateText, useSttJobs } from "./retranscribe";
import { VectorLine } from "./VectorLine";

export { detailKey };

type Tab = "summary" | "transcript" | "proposals";

export function MeetingBody({ m }: { m: MeetingDetail }) {
  const a = useMeetingActions(m);
  const [params, setParams] = useSearchParams();
  const [focus, setFocus] = useState<TranscriptFocus | null>(null);
  // 일곱 탭을 셋으로 줄였다. 예전 주소(?tab=decision 등 항목별 탭)는 요약·분석으로 열린다.
  // 결정·액션·논의·미해결 수는 요약 화면 맨 위의 바로 가기 칩에서 보인다.
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "summary", label: "요약·분석" },
    { id: "transcript", label: "전사" },
    { id: "proposals", label: "반영 제안", count: m.counts.pending_proposals },
  ];
  const tab: Tab = tabs.find((t) => t.id === params.get("tab"))?.id ?? "summary";
  const select = (id: Tab) => setParams(id === "summary" ? {} : { tab: id }, { replace: true });
  // 분석이 끝난 회의는 단계 표시가 정보가 아니다(헤더 배지가 상태를 말한다). 진행·실패일 때만 패널을 보여 첫 화면을 내용에 쓴다.
  const finished = m.status === "analyzed" || m.status === "review";
  return (
    <div className="mt-page">
      {!finished && <StatusPanel m={m} a={a} />}
      <ProjectField m={m} a={a}>
        {finished && !!m.transcript && (
          <Button size="sm" busy={a.analyze.isPending} onClick={() => a.analyze.mutate()}><Icon name="retry" />다시 분석</Button>
        )}
      </ProjectField>
      <RelatedMeetings m={m} />
      <div className="tk-segmented tk-segmented--block mt-tabs" role="radiogroup" aria-label="회의록 내용">
        {tabs.map((t) => (
          <label key={t.id}>
            <input type="radio" name="mt-tab" checked={tab === t.id} onChange={() => select(t.id)} />
            {t.label}
            {!!t.count && <span className="mt-tabs__count" data-alert={t.id === "proposals" || undefined} aria-label={`${t.count}건`}>{t.count}</span>}
          </label>
        ))}
      </div>
      {tab === "summary" && (
        <AnalysisView
          m={m}
          a={a}
          onJump={(uid) => {
            setFocus((f) => ({ uid, n: (f?.n ?? 0) + 1 }));
            select("transcript");
          }}
        />
      )}
      {tab === "proposals" && <ProposalsTab m={m} a={a} />}
      {tab === "transcript" && <TranscriptTab key={m.id} m={m} a={a} focus={focus} />}
      {finished && m.vector && <VectorLine v={m.vector} />}
    </div>
  );
}

// ---- 상태 패널

function StatusPanel({ m, a }: { m: MeetingDetail; a: Actions }) {
  const engines = useQuery({ queryKey: ["meetings", "providers"], queryFn: meetingProviders });
  const localReady = engines.data?.providers.some((p) => p.id === "local_whisper" && p.state === "ready");
  const localEngine = engines.data?.providers.find((p) => p.id === "local_whisper");
  const noTranscript = !m.transcript;
  const jobs = useSttJobs(m);
  const jobStatus = jobs.data?.jobs.find((j) => !j.candidate_only)?.status;
  const waiting = transcribeStateText(jobStatus);
  const transcribeErr = a.localTranscribe.error ? errorText(a.localTranscribe.error) : null;
  const canTranscribe = !!m.audio && (m.status === "uploaded" || (m.status === "failed" && m.failed_stage === "transcription"));
  return (
    <section className="mt-panel" aria-label="진행 상태">
      <PipelineSteps m={m} />
      {m.status === "transcribing" && m.provider === "local_whisper" && (
        <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--xs" aria-hidden="true" /><span><strong>{waiting.label}</strong> {waiting.text}</span></p>
      )}
      {m.status === "failed" && (
        <Callout tone="caution" icon="caution" title={m.failed_stage === "transcription" ? "전사에 실패했어요" : "분석에 실패했어요"}>
          <p>{m.error}</p>
        </Callout>
      )}
      {m.status === "uploaded" && !transcribeErr && (
        <Callout tone="note" icon="info" title="녹음이 전사를 기다려요">
          <p>로컬로 전사하면 녹음을 전사하고 이어서 분석해요. 전사 텍스트가 이미 있으면 전사 탭에 넣어도 돼요.</p>
        </Callout>
      )}
      {canTranscribe && !localReady && localEngine && <p className="tk-help">{localEngine.message}</p>}
      {transcribeErr && <p className="tk-error" role="alert"><Icon name="warning" />{transcribeErr.message}</p>}
      <div className="tk-button-group">
        {canTranscribe && localReady && (
          <Button size="sm" variant="primary" busy={a.localTranscribe.isPending} onClick={() => a.localTranscribe.mutate()}>
            <Icon name="send" />로컬로 전사
          </Button>
        )}
        {m.status === "analyzing" && (
          <>
            <span className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--xs" aria-hidden="true" />분석 중이에요. 보통 1~3분 걸려요</span>
            <Button size="sm" busy={a.cancel.isPending} onClick={() => a.cancel.mutate()}>분석 취소</Button>
          </>
        )}
        {!isRunning(m.status) && !noTranscript && (
          <Button size="sm" variant={m.status === "transcribed" || m.status === "failed" ? "primary" : undefined} busy={a.analyze.isPending} onClick={() => a.analyze.mutate()}>
            <Icon name={m.status === "transcribed" || m.status === "failed" ? "send" : "retry"} />
            {m.status === "analyzed" || m.status === "review" ? "다시 분석" : "분석 시작"}
          </Button>
        )}
      </div>
      {m.vector && <VectorLine v={m.vector} />}
    </section>
  );
}

function ProjectField({ m, a, children }: { m: MeetingDetail; a: Actions; children?: ReactNode }) {
  const id = useId();
  const { options } = useProjectOptions(m.scope);
  return (
    <div className="mt-meta">
      <div className="tk-field mt-meta__project">
        <label className="tk-label" id={`${id}-l`} htmlFor={`${id}-p`}>프로젝트</label>
        <Select id={`${id}-p`} labelledBy={`${id}-l`} size="sm" value={m.project?.id ?? ""} options={options} onChange={(v) => a.project.mutate(v)} />
      </div>
      {children}
      {m.participants.length > 0 && (
        <dl className="mt-meta__facts">
          <div><dt>참석자</dt><dd>{m.participants.join(", ")}</dd></div>
        </dl>
      )}
    </div>
  );
}

// ---- 반영 제안

const PROPOSAL_TITLE: Record<MeetingProposal["kind"], string> = {
  add_memory: "결정을 맥락 도서관에 기억으로 추가",
  supersede_memory: "기존 기억을 새 결정으로 교체",
  update_action_item: "이전 회의의 액션 변경",
};

function ProposalCard({ p, a }: { p: MeetingProposal; a: Actions }) {
  const pl = p.payload;
  const busy = a.resolve.isPending && a.resolve.variables?.id === p.id;
  return (
    <li className="mt-block" data-status={p.status}>
      <div className="mt-proposal__head">
        <strong className="mt-proposal__title">{PROPOSAL_TITLE[p.kind]}</strong>
        {p.status !== "pending" && <Badge tone={p.status === "approved" ? "success" : undefined}>{p.status === "approved" ? "승인됨" : "거절됨"}</Badge>}
      </div>
      {p.kind === "supersede_memory" && pl.targets?.map((t) => (
        <p key={t.id} className="mt-diff mt-diff--old"><span className="mt-diff__tag">기존</span>{t.content}</p>
      ))}
      {p.kind === "update_action_item" && (
        <p className="mt-diff mt-diff--old"><span className="mt-diff__tag">기존 액션</span>{pl.target_text}{pl.target_meeting_title && <em> · {pl.target_meeting_title}</em>}</p>
      )}
      {p.kind === "update_action_item" ? (
        <p className="mt-diff mt-diff--new"><span className="mt-diff__tag">변경</span>{pl.change === "revise" && pl.new_text ? pl.new_text : "취소 처리"}</p>
      ) : (
        <p className="mt-diff mt-diff--new"><span className="mt-diff__tag">새 기억</span>{pl.content}</p>
      )}
      {p.reason && <p className="mt-prose mt-prose--muted">이유: {p.reason}</p>}
      {p.status === "pending" && (
        <div className="tk-button-group">
          <Button size="sm" variant="primary" busy={busy} onClick={() => a.resolve.mutate({ id: p.id, action: "approve" })}>승인</Button>
          <Button size="sm" disabled={busy} onClick={() => a.resolve.mutate({ id: p.id, action: "reject" })}>거절</Button>
        </div>
      )}
    </li>
  );
}

function ProposalsTab({ m, a }: { m: MeetingDetail; a: Actions }) {
  if (!m.proposals.length) return <Pending m={m} what="반영 제안" />;
  const pending = m.proposals.filter((p) => p.status === "pending");
  const done = m.proposals.filter((p) => p.status !== "pending");
  return (
    <div className="tk-stack mt-stack">
      <p className="tk-help">승인하기 전에는 맥락 도서관과 이전 회의가 바뀌지 않아요. 에이전트는 승인할 수 없어요.</p>
      {pending.length > 0 && <ul className="mt-cards" aria-label="승인 대기 제안">{pending.map((p) => <ProposalCard key={p.id} p={p} a={a} />)}</ul>}
      {done.length > 0 && (
        <>
          <h2 className="mt-sub">처리한 제안</h2>
          <ul className="mt-cards" aria-label="처리한 제안">{done.map((p) => <ProposalCard key={p.id} p={p} a={a} />)}</ul>
        </>
      )}
    </div>
  );
}

// ---- 전사

function TranscriptTab({ m, a, focus }: { m: MeetingDetail; a: Actions; focus: TranscriptFocus | null }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<"paste" | "file">("paste");
  const editable = m.status === "uploaded" || m.status === "failed" || m.status === "transcribed";
  const err = a.transcript.error ? errorText(a.transcript.error) : null;
  const form = (
    <form
      className="tk-stack mt-stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) a.transcript.mutate({ text, source }, { onSuccess: () => setText("") });
      }}
    >
      <TranscriptField value={text} onChange={setText} onSource={setSource} rows={8} />
      {err && <p className="tk-error" role="alert"><Icon name="warning" />{err.message}</p>}
      <div className="tk-button-group tk-button-group--end">
        <Button type="submit" variant="primary" size="sm" busy={a.transcript.isPending} disabled={!text.trim()}>{m.transcript ? "전사 바꾸기" : "전사 저장"}</Button>
      </div>
    </form>
  );
  return (
    <div className="tk-stack mt-stack">
      {m.transcript && <TranscriptView m={m} focus={focus} />}
      {editable && (m.transcript ? (
        <details className="mt-details">
          <summary>전사 텍스트 바꾸기</summary>
          <div className="mt-details__body">{form}</div>
        </details>
      ) : form)}
      {!m.transcript && !editable && <EmptyState icon="info" title="전사 텍스트가 없어요" />}
    </div>
  );
}
