import type { ReactNode } from "react";
import type { MeetingDetail, MeetingItem, MeetingItemKind } from "../../api/client";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { EmptyState } from "../viewer/screenStates";
import { isRunning } from "./shared";
import { formatClock, locateEvidence, startOf, utteranceAtTime } from "./transcript";
import type { Utterance } from "./transcript";
import type { Actions } from "./useMeetingActions";
import { useTranscript } from "./useTranscript";

/** 분석이 어느 문장에서 나왔는지 눌러서 전사로 갈 수 있게 한다. uid 는 전사 발화 id */
export type JumpToTranscript = (uid: string) => void;

const hasEvidence = (i: MeetingItem) => !!i.evidence || i.evidence_start != null;

/** 분석 전·실패·결과 없음을 구분해 안내한다. 빈 목록이 오류처럼 보이지 않게. */
export function Pending({ m, what }: { m: MeetingDetail; what: string }) {
  if (m.status === "analyzed" || m.status === "review") return <EmptyState icon="info" title={`${what}이(가) 없어요`}>이 회의에서는 찾지 못했어요.</EmptyState>;
  if (m.status === "failed") return <EmptyState icon="warning" title="분석 결과가 없어요">위 오류를 확인하고 다시 분석해 주세요.</EmptyState>;
  if (m.status === "transcribing") return <EmptyState icon="clock" title="전사 중이에요">전사가 끝나면 분석해서 이 자리에 보여 줘요.</EmptyState>;
  if (isRunning(m.status)) return <EmptyState icon="clock" title="분석 중이에요">끝나면 이 자리에 나와요.</EmptyState>;
  return <EmptyState icon="info" title="아직 분석 전이에요">{m.transcript ? "위에서 분석을 시작하세요." : "전사 텍스트가 있어야 분석할 수 있어요."}</EmptyState>;
}

/** 요약 문장. 줄이 "-", "•" 로 시작하면 목록으로 그린다 */
function SummaryText({ text }: { text: string }) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const bullet = /^[-•·*]\s+/;
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`u${out.length}`} className="mt-bullets">{list.map((l, i) => <li key={i}>{l}</li>)}</ul>);
    list = [];
  };
  for (const l of lines) {
    if (bullet.test(l)) list.push(l.replace(bullet, ""));
    else {
      flush();
      out.push(<p key={`p${out.length}`} className="mt-prose">{l}</p>);
    }
  }
  flush();
  return <>{out}</>;
}

function EvidenceLink({ item, uid, utts, onJump }: { item: MeetingItem; uid: string | null; utts: Utterance[]; onJump: JumpToTranscript }) {
  if (!uid) return null;
  const t = formatClock(startOf(utts, uid));
  return (
    <button className="mt-evidence" type="button" onClick={() => onJump(uid)} aria-label={`근거 발화${t ? ` ${t}` : ""}로 이동: ${item.text}`}>
      <Icon name="chevron-right" />{t ? <><span className="mt-time">{t}</span> 근거 발화</> : "근거 발화 보기"}
    </button>
  );
}

function Conflicts({ it }: { it: MeetingItem }) {
  return (
    <>
      {it.conflicts.map((c) => (
        <p key={c.ref} className="mt-conflict"><Icon name="warning" /><span>기존 {c.type === "action" ? "액션" : "결정"}과 충돌 가능: {c.text} <em>({c.reason})</em></span></p>
      ))}
    </>
  );
}

function Quote({ it, uid, utts, onJump }: { it: MeetingItem; uid: string | null; utts: Utterance[]; onJump: JumpToTranscript }) {
  return (
    <>
      {it.evidence && <blockquote className="mt-quote">{it.evidence}</blockquote>}
      <EvidenceLink item={it} uid={uid} utts={utts} onJump={onJump} />
    </>
  );
}

function Toggle({ it, kind, a }: { it: MeetingItem; kind: "action" | "open_issue"; a: Actions }) {
  if (it.status === "cancelled") return null;
  return (
    <Button size="xs" aria-pressed={it.status === "done"} busy={a.item.isPending && a.item.variables?.item.id === it.id}
      onClick={() => a.item.mutate({ item: it, status: it.status === "done" ? "open" : "done" })}>
      <Icon name="check" />{it.status === "done" ? (kind === "action" ? "완료됨" : "해결됨") : (kind === "action" ? "완료" : "해결")}
    </Button>
  );
}

function Section({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  return (
    <section className="mt-section" id={id} aria-labelledby={`${id}-h`}>
      <h2 className="mt-section__title" id={`${id}-h`}>{title}<span className="mt-section__count">{count}</span></h2>
      {children}
    </section>
  );
}

export function AnalysisView({ m, a, onJump }: { m: MeetingDetail; a: Actions; onJump: JumpToTranscript }) {
  const needLinks = m.items.some(hasEvidence);
  const data = useTranscript(m, needLinks);
  const utts = data.mode === "loading" ? [] : data.utterances;
  const uidOf = (i: MeetingItem): string | null => {
    if (!utts.length) return null;
    if (i.evidence_start != null) return utteranceAtTime(utts, i.evidence_start);
    return locateEvidence(utts, i.evidence);
  };
  const by = (k: MeetingItemKind) => m.items.filter((i) => i.kind === k);
  const decisions = by("decision");
  const actions = by("action");
  const topics = by("discussion");
  const issues = by("open_issue");
  if (!m.summary && !m.items.length) return <Pending m={m} what="요약" />;

  const openActions = actions.filter((i) => i.status === "open").length;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  const quick = [
    decisions.length && { id: "mt-sec-decision", label: `결정 ${decisions.length}` },
    actions.length && { id: "mt-sec-action", label: openActions ? `액션 ${actions.length} · 미완료 ${openActions}` : `액션 ${actions.length} · 모두 완료` },
    topics.length && { id: "mt-sec-topic", label: `논의 ${topics.length}` },
    issues.length && { id: "mt-sec-issue", label: `미해결 ${issues.length}` },
  ].filter((x): x is { id: string; label: string } => !!x);

  return (
    <div className="mt-analysis">
      {m.summary && (
        <section className="mt-summary" aria-labelledby="mt-summary-h">
          <h2 className="mt-summary__title" id="mt-summary-h"><Icon name="memo" />핵심 요약</h2>
          <div className="mt-summary__body"><SummaryText text={m.summary} /></div>
          {quick.length > 0 && (
            <ul className="mt-quick" aria-label="바로 가기">
              {quick.map((q) => <li key={q.id}><button className="tk-chip" type="button" onClick={() => go(q.id)}>{q.label}</button></li>)}
            </ul>
          )}
        </section>
      )}

      {decisions.length > 0 && (
        <Section id="mt-sec-decision" title="결정 사항" count={decisions.length}>
          <ul className="mt-cards" aria-label="결정 사항">
            {decisions.map((it) => (
              <li key={it.id} className="mt-block mt-block--decision" data-status={it.status}>
                <p className="mt-item__text">{it.text}</p>
                {it.detail && <p className="mt-prose mt-prose--muted">{it.detail}</p>}
                <Conflicts it={it} />
                <Quote it={it} uid={uidOf(it)} utts={utts} onJump={onJump} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {actions.length > 0 && (
        <Section id="mt-sec-action" title="액션 아이템" count={actions.length}>
          <ul className="mt-cards" aria-label="액션 아이템">
            {[...actions].sort((x, y) => Number(x.status === "done") - Number(y.status === "done")).map((it) => (
              <li key={it.id} className="mt-block" data-status={it.status}>
                <div className="mt-item">
                  <div className="mt-item__main">
                    <p className="mt-item__text">{it.text}</p>
                    {it.detail && <p className="mt-prose mt-prose--muted">{it.detail}</p>}
                    {(it.owner || it.due || it.status === "cancelled") && (
                      <p className="mt-item__meta">
                        {it.owner && <span className="mt-fact"><Icon name="users" />담당 {it.owner}</span>}
                        {it.due && <span className="mt-fact"><Icon name="calendar" />기한 {it.due}</span>}
                        {it.status === "cancelled" && <Badge>취소됨</Badge>}
                      </p>
                    )}
                    <Conflicts it={it} />
                    <Quote it={it} uid={uidOf(it)} utts={utts} onJump={onJump} />
                  </div>
                  <Toggle it={it} kind="action" a={a} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {topics.length > 0 && (
        <Section id="mt-sec-topic" title="주제별 논의" count={topics.length}>
          <ul className="mt-cards" aria-label="주제별 논의">
            {topics.map((it) => {
              const body = it.detail || it.evidence || uidOf(it);
              return (
                <li key={it.id} className="mt-block mt-topic">
                  {body ? (
                    <details open={topics.length <= 3 || undefined}>
                      <summary className="mt-item__text">{it.text}</summary>
                      <div className="mt-topic__body">
                        {it.detail && <p className="mt-prose mt-prose--muted">{it.detail}</p>}
                        <Quote it={it} uid={uidOf(it)} utts={utts} onJump={onJump} />
                      </div>
                    </details>
                  ) : <p className="mt-item__text">{it.text}</p>}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {issues.length > 0 && (
        <Section id="mt-sec-issue" title="미해결 쟁점" count={issues.length}>
          <ul className="mt-cards" aria-label="미해결 쟁점">
            {issues.map((it) => (
              <li key={it.id} className="mt-block" data-status={it.status}>
                <div className="mt-item">
                  <div className="mt-item__main">
                    <p className="mt-item__text">{it.text}</p>
                    {it.detail && <p className="mt-prose mt-prose--muted">{it.detail}</p>}
                    <Quote it={it} uid={uidOf(it)} utts={utts} onJump={onJump} />
                  </div>
                  <Toggle it={it} kind="open_issue" a={a} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {m.summary && !m.items.length && <p className="tk-help">이 회의에서는 결정·액션·논의 항목을 찾지 못했어요.</p>}

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
