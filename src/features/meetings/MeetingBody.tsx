import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  analyzeMeeting, cancelMeetingAnalysis, meetingProviders, patchMeeting, patchMeetingItem, putMeetingTranscript, requestMeetingTranscription,
  resolveMeetingProposal,
} from "../../api/client";
import type { MeetingDetail, MeetingItem, MeetingItemKind, MeetingProposal } from "../../api/client";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { EmptyState } from "../viewer/screenStates";
import { useProjectOptions } from "./NewMeetingForm";
import { Callout, PipelineSteps, isRunning, scopeLabel } from "./shared";
import { JobProgress, VectorLine, isJobActive } from "./clova";
import { TranscriptField } from "./TranscriptField";

type Tab = "summary" | "discussion" | "decision" | "action" | "open_issue" | "proposals" | "transcript";

export const detailKey = (id: string) => ["meetings", "detail", id] as const;

/** 상세가 쓰는 동작 모음. 응답으로 받은 최신 상세를 캐시에 바로 넣어 화면이 한 박자 늦지 않게 한다. */
function useActions(m: MeetingDetail) {
  const qc = useQueryClient();
  const put = (d: MeetingDetail) => {
    qc.setQueryData(detailKey(m.id), d);
    void qc.invalidateQueries({ queryKey: ["meetings", "list"] });
  };
  const fail = (e: unknown) => toast({ message: errorText(e).message });
  return {
    analyze: useMutation({ mutationFn: () => analyzeMeeting(m.id), onSuccess: put, onError: fail }),
    cancel: useMutation({ mutationFn: () => cancelMeetingAnalysis(m.id), onSuccess: put, onError: fail }),
    transcribe: useMutation({ mutationFn: () => requestMeetingTranscription(m.id), onSuccess: (d) => { put(d); void qc.invalidateQueries({ queryKey: ["clovanote"] }); } }),
    localTranscribe: useMutation({ mutationFn: () => requestMeetingTranscription(m.id, "local_whisper"), onSuccess: put }),
    transcript: useMutation({ mutationFn: (v: { text: string; source: "paste" | "file" }) => putMeetingTranscript(m.id, v.text, v.source), onSuccess: put }),
    project: useMutation({ mutationFn: (projectId: string) => patchMeeting(m.id, { project_id: projectId || null }), onSuccess: put, onError: fail }),
    item: useMutation({
      mutationFn: (v: { item: MeetingItem; status: "open" | "done" }) => patchMeetingItem(m.id, v.item.id, { status: v.status }),
      onSuccess: () => void qc.invalidateQueries({ queryKey: detailKey(m.id) }),
      onError: fail,
    }),
    resolve: useMutation({
      mutationFn: (v: { id: string; action: "approve" | "reject" }) => resolveMeetingProposal(m.id, v.id, v.action),
      onSuccess: (d, v) => {
        put(d);
        toast({ message: v.action === "approve" ? "맥락 도서관에 반영했어요." : "제안을 거절했어요." });
      },
      onError: fail,
    }),
  };
}
type Actions = ReturnType<typeof useActions>;

export function MeetingBody({ m }: { m: MeetingDetail }) {
  const a = useActions(m);
  const [params, setParams] = useSearchParams();
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "summary", label: "요약" },
    { id: "discussion", label: "논의", count: m.counts.discussion },
    { id: "decision", label: "결정", count: m.counts.decision },
    { id: "action", label: "액션", count: m.counts.action },
    { id: "open_issue", label: "미해결", count: m.counts.open_issue },
    { id: "proposals", label: "제안", count: m.counts.pending_proposals },
    { id: "transcript", label: "전사" },
  ];
  const tab = (tabs.find((t) => t.id === params.get("tab"))?.id ?? "summary") as Tab;
  return (
    <div className="mt-page">
      <StatusPanel m={m} a={a} />
      <ProjectField m={m} a={a} />
      <div className="tk-segmented tk-segmented--block mt-tabs" role="radiogroup" aria-label="회의록 내용">
        {tabs.map((t) => (
          <label key={t.id}>
            <input type="radio" name="mt-tab" checked={tab === t.id} onChange={() => setParams(t.id === "summary" ? {} : { tab: t.id }, { replace: true })} />
            {t.label}
            {!!t.count && <span className="mt-tabs__count" data-alert={t.id === "proposals" || undefined} aria-label={`${t.count}건`}>{t.count}</span>}
          </label>
        ))}
      </div>
      {tab === "summary" && <SummaryTab m={m} />}
      {(tab === "discussion" || tab === "decision" || tab === "action" || tab === "open_issue") && <ItemsTab m={m} kind={tab} a={a} />}
      {tab === "proposals" && <ProposalsTab m={m} a={a} />}
      {tab === "transcript" && <TranscriptTab m={m} a={a} />}
    </div>
  );
}

// ---- 상태 패널

function StatusPanel({ m, a }: { m: MeetingDetail; a: Actions }) {
  const engines = useQuery({ queryKey: ["meetings", "providers"], queryFn: meetingProviders });
  const localReady = engines.data?.providers.some((p) => p.id === "local_whisper" && p.state === "ready");
  const noTranscript = !m.transcript;
  const transcribeErr = a.transcribe.error || a.localTranscribe.error ? errorText(a.transcribe.error || a.localTranscribe.error) : null;
  const job = m.clovanote?.job ?? null;
  // 전사 중이거나 방금 끝난(실패 포함) 클로바노트 작업만 보인다. 오래된 성공 기록은 단계 표시로 충분하다.
  const showJob = !!job && (m.status === "transcribing" || isJobActive(job) || (job.status === "failed" && m.failed_stage === "transcription"));
  const canTranscribe = !!m.audio && (m.status === "uploaded" || (m.status === "failed" && m.failed_stage === "transcription"));
  return (
    <section className="mt-panel" aria-label="진행 상태">
      <PipelineSteps m={m} />
      {showJob && job && <JobProgress job={job} title="클로바노트 전사" />}
      {m.status === "transcribing" && m.provider === "local_whisper" && (
        <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--xs" aria-hidden="true" />이 Mac에서 전사 중이에요. 끝나면 모델 메모리를 해제해요.</p>
      )}
      {m.status === "failed" && !(showJob && job?.status === "failed") && (
        <Callout tone="caution" icon="caution" title={m.failed_stage === "transcription" ? "전사에 실패했어요" : "분석에 실패했어요"}>
          <p>{m.error}</p>
        </Callout>
      )}
      {m.status === "uploaded" && !transcribeErr && (
        <Callout tone="note" icon="info" title="녹음이 전사를 기다려요">
          <p>전사 엔진을 선택하면 녹음을 전사하고 이어서 분석해요. 전사 텍스트가 이미 있으면 전사 탭에 넣어도 돼요.</p>
        </Callout>
      )}
      {transcribeErr && <p className="tk-error" role="alert"><Icon name="warning" />{transcribeErr.message}</p>}
      <div className="tk-button-group">
        {canTranscribe && (
          <Button size="sm" variant="primary" busy={a.transcribe.isPending} disabled={a.localTranscribe.isPending} onClick={() => a.transcribe.mutate()}>
            <Icon name="send" />{m.status === "failed" ? "클로바노트로 다시 전사" : "클로바노트로 전사"}
          </Button>
        )}
        {canTranscribe && localReady && (
          <Button size="sm" busy={a.localTranscribe.isPending} disabled={a.transcribe.isPending} onClick={() => a.localTranscribe.mutate()}>
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

function ProjectField({ m, a }: { m: MeetingDetail; a: Actions }) {
  const id = useId();
  const { options } = useProjectOptions(m.scope);
  return (
    <div className="mt-meta">
      <div className="tk-field mt-meta__project">
        <label className="tk-label" id={`${id}-l`} htmlFor={`${id}-p`}>프로젝트</label>
        <Select id={`${id}-p`} labelledBy={`${id}-l`} size="sm" value={m.project?.id ?? ""} options={options} onChange={(v) => a.project.mutate(v)} />
      </div>
      <dl className="mt-meta__facts">
        <div><dt>범위</dt><dd>{scopeLabel(m.scope)}</dd></div>
        {m.participants.length > 0 && <div><dt>참석자</dt><dd>{m.participants.join(", ")}</dd></div>}
      </dl>
    </div>
  );
}

// ---- 탭

function SummaryTab({ m }: { m: MeetingDetail }) {
  if (!m.summary) return <Pending m={m} what="요약" />;
  return (
    <div className="tk-stack mt-stack">
      <section className="mt-block" aria-label="요약"><p className="mt-prose">{m.summary}</p></section>
      {m.analysis_context.length > 0 && (
        <details className="mt-details">
          <summary>분석에 쓴 기존 맥락 {m.analysis_context.length}건</summary>
          <ul className="mt-plain">
            {m.analysis_context.map((c) => (
              <li key={c.ref}><code>{c.ref}</code> {c.type === "action" ? `열린 액션(${c.meeting_title ?? "이전 회의"}) ` : ""}{c.text}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** 분석 전·실패·결과 없음을 구분해 안내한다. 빈 목록이 오류처럼 보이지 않게. */
function Pending({ m, what }: { m: MeetingDetail; what: string }) {
  if (m.status === "analyzed" || m.status === "review") return <EmptyState icon="info" title={`${what}이(가) 없어요`}>이 회의에서는 찾지 못했어요.</EmptyState>;
  if (m.status === "failed") return <EmptyState icon="warning" title="분석 결과가 없어요">위 오류를 확인하고 다시 분석해 주세요.</EmptyState>;
  if (m.status === "transcribing") return <EmptyState icon="clock" title="전사 중이에요">전사가 끝나면 분석해서 이 자리에 보여 줘요.</EmptyState>;
  if (isRunning(m.status)) return <EmptyState icon="clock" title="분석 중이에요">끝나면 이 자리에 나와요.</EmptyState>;
  return <EmptyState icon="info" title="아직 분석 전이에요">{m.transcript ? "위에서 분석을 시작하세요." : "전사 텍스트가 있어야 분석할 수 있어요."}</EmptyState>;
}

const KIND_TITLE: Record<MeetingItemKind, string> = { discussion: "논의", decision: "결정 사항", action: "액션 아이템", open_issue: "미해결 쟁점" };

function ItemsTab({ m, kind, a }: { m: MeetingDetail; kind: MeetingItemKind; a: Actions }) {
  const items = m.items.filter((i) => i.kind === kind);
  if (!items.length) return <Pending m={m} what={KIND_TITLE[kind]} />;
  const hasStatus = kind === "action" || kind === "open_issue";
  return (
    <ul className="mt-cards" aria-label={KIND_TITLE[kind]}>
      {items.map((it) => (
        <li key={it.id} className="mt-block" data-status={it.status}>
          <div className="mt-item">
            <div className="mt-item__main">
              <p className="mt-item__text">{it.text}</p>
              {it.detail && <p className="mt-prose mt-prose--muted">{it.detail}</p>}
              {(it.owner || it.due) && (
                <p className="mt-item__meta">
                  {it.owner && <span>담당 {it.owner}</span>}
                  {it.due && <span>기한 {it.due}</span>}
                  {it.status === "cancelled" && <Badge>취소됨</Badge>}
                </p>
              )}
              {it.evidence && <blockquote className="mt-quote">{it.evidence}</blockquote>}
              {it.conflicts.map((c) => (
                <p key={c.ref} className="mt-conflict"><Icon name="warning" /><span>기존 {c.type === "action" ? "액션" : "결정"}과 충돌 가능: {c.text} <em>({c.reason})</em></span></p>
              ))}
            </div>
            {hasStatus && it.status !== "cancelled" && (
              <Button size="xs" aria-pressed={it.status === "done"} busy={a.item.isPending && a.item.variables?.item.id === it.id}
                onClick={() => a.item.mutate({ item: it, status: it.status === "done" ? "open" : "done" })}>
                <Icon name="check" />{it.status === "done" ? (kind === "action" ? "완료됨" : "해결됨") : (kind === "action" ? "완료" : "해결")}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

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

const SOURCE_LABEL = (s: string | null) => (s === "paste" ? "붙여넣음" : s === "file" ? "파일에서 불러옴" : s?.startsWith("provider:") ? "전사 서비스에서 받음" : "");

function TranscriptTab({ m, a }: { m: MeetingDetail; a: Actions }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<"paste" | "file">("paste");
  const editable = m.status === "uploaded" || m.status === "failed" || m.status === "transcribed";
  const err = a.transcript.error ? errorText(a.transcript.error) : null;
  return (
    <div className="tk-stack mt-stack">
      {m.transcript && (
        <section className="mt-block" aria-label="전사 원문">
          <p className="mt-item__meta"><span>{m.transcript_chars.toLocaleString("ko-KR")}자</span>{SOURCE_LABEL(m.transcript_source) && <span>{SOURCE_LABEL(m.transcript_source)}</span>}</p>
          <pre className="mt-transcript">{m.transcript}</pre>
        </section>
      )}
      {editable && (
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
      )}
      {!m.transcript && !editable && <EmptyState icon="info" title="전사 텍스트가 없어요" />}
    </div>
  );
}
