import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router";
import { getOpsIssue, patchOpsIssue } from "../api/client";
import type { OpsStatus } from "../api/opsLogTypes";
import { LEVEL_LABEL, LEVEL_TONE, SOURCE_LABEL, STATUS_LABEL, ago, when } from "../features/opslogs/opsFormat";
import { PageHeader } from "../shell/PageHeader";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { toast } from "../ui/toastStore";
import "../features/opslogs/opslogs.css";

function crumbText(item: string | { ts?: string | null; message?: string }): string {
  if (typeof item === "string") return item;
  return `${item.ts ? `${when(item.ts)} ` : ""}${item.message ?? ""}`.trim();
}

/** 이슈 상세: 대표 스택·직전 맥락(breadcrumbs)·마스킹된 로그 발췌·릴리스별 발생. 상태 변경과 메모. */
export function OpsIssuePage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const query = useQuery({ queryKey: ["ops", "issue", id], queryFn: () => getOpsIssue(id) });
  const change = useMutation({
    mutationFn: (body: { status?: OpsStatus; note?: string }) => patchOpsIssue(id, body),
    onSuccess: () => { setNote(""); void qc.invalidateQueries({ queryKey: ["ops"] }); },
    onError: () => toast({ message: "변경을 저장하지 못했어요. 다시 시도해 주세요.", tone: "danger" }),
  });
  const submitNote = (e: FormEvent) => {
    e.preventDefault();
    if (note.trim()) change.mutate({ note: note.trim() });
  };

  const data = query.data;
  const issue = data?.issue;
  const event = data?.latest_event;
  const peak = Math.max(1, ...(data?.recent_hours.map((h) => h.count) ?? [1]));
  return (
    <div className="tk-screen">
      <PageHeader
        title={issue ? issue.id : "이슈"}
        meta={issue ? `${SOURCE_LABEL[issue.source]} · ${issue.count}회 · 최근 ${ago(issue.last_seen)}` : undefined}
        actions={<Link className="tk-button tk-button--ghost tk-button--sm" to="/logs"><Icon name="back" /><span>목록</span></Link>}
      />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--lg">
          <div className="ops">
            {query.isError && <p className="tk-error" role="alert">{query.error instanceof Error ? query.error.message : "불러오지 못했어요."}</p>}
            {query.isPending && <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />불러오는 중</p>}
            {issue && (
              <>
                <div className="ops-card">
                  <h2 className="ops-card__title">{issue.title}</h2>
                  <p className="ops-row__meta">
                    <Badge tone={LEVEL_TONE[issue.level]}>{LEVEL_LABEL[issue.level]}</Badge>
                    <Badge>{STATUS_LABEL[issue.status]}</Badge>
                    {issue.regressed ? <Badge tone="warning">재발 {issue.regressed}회</Badge> : null}
                  </p>
                  <dl className="ops-dl">
                    <dt>처음</dt><dd>{when(issue.first_seen)}{issue.first_release ? ` · ${issue.first_release}` : ""}</dd>
                    <dt>최근</dt><dd>{when(issue.last_seen)}{issue.release ? ` · ${issue.release}` : ""}</dd>
                    {issue.resolved_at && <><dt>해결</dt><dd>{when(issue.resolved_at)}{issue.resolved_release ? ` · ${issue.resolved_release}` : ""}</dd></>}
                    {issue.culprit && <><dt>위치</dt><dd>{issue.culprit}</dd></>}
                  </dl>
                  <div className="ops-pills" role="group" aria-label="상태 변경">
                    {(["unresolved", "resolved", "ignored"] as OpsStatus[]).map((s) => (
                      <button key={s} type="button" aria-pressed={issue.status === s} disabled={change.isPending} onClick={() => change.mutate({ status: s })}>
                        {s === "unresolved" ? "다시 열기" : s === "resolved" ? "해결 처리" : "무시"}
                      </button>
                    ))}
                  </div>
                </div>

                {data.recent_hours.length > 0 && (
                  <div className="ops-card">
                    <h2 className="ops-card__title">최근 발생 시간대</h2>
                    <ul className="ops-crumbs" aria-label="시간별 발생">
                      {data.recent_hours.map((h) => (
                        <li key={h.hour}>{when(h.hour)} · {h.count}회 <span aria-hidden="true">{"█".repeat(Math.max(1, Math.round((h.count / peak) * 12)))}</span></li>
                      ))}
                    </ul>
                  </div>
                )}

                {event && (
                  <div className="ops-card">
                    <h2 className="ops-card__title">최근 이벤트 · {when(event.at)}</h2>
                    <p className="ops-row__title">{event.message}</p>
                    {event.stack && <pre className="ops-pre" tabIndex={0}>{event.stack}</pre>}
                    {event.excerpt && <pre className="ops-pre" tabIndex={0}>{event.excerpt}</pre>}
                    {event.breadcrumbs && event.breadcrumbs.length > 0 && (
                      <>
                        <h3 className="ops-card__title">직전 맥락</h3>
                        <ul className="ops-crumbs">{event.breadcrumbs.map((c, i) => <li key={i}>{crumbText(c)}</li>)}</ul>
                      </>
                    )}
                    {Object.keys(event.tags).length > 0 && (
                      <dl className="ops-dl">{Object.entries(event.tags).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></Fragment>)}</dl>
                    )}
                  </div>
                )}

                {data.releases.length > 0 && (
                  <div className="ops-card">
                    <h2 className="ops-card__title">배포별 발생</h2>
                    <dl className="ops-dl">{data.releases.map((r) => <Fragment key={r.release ?? "none"}><dt>{r.release ?? "알 수 없음"}</dt><dd>{r.events}건</dd></Fragment>)}</dl>
                  </div>
                )}

                <div className="ops-card">
                  <h2 className="ops-card__title">메모</h2>
                  {issue.notes.length === 0 && <p className="ops-note">남긴 메모가 없어요.</p>}
                  <ul className="ops-crumbs">{issue.notes.map((n) => <li key={n.at}>{when(n.at)} · {n.by} · {n.text}</li>)}</ul>
                  <form className="ops-note-form" onSubmit={submitNote}>
                    <input className="tk-input" aria-label="메모" placeholder="원인이나 조치를 한 줄로" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                    <Button type="submit" busy={change.isPending} disabled={!note.trim()}>남기기</Button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
