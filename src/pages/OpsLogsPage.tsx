import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { getOpsDeployLog, listOpsDeploys, listOpsIssues, opsTrend } from "../api/client";
import type { OpsDeploy, OpsIssueRow, OpsSource, OpsStatus } from "../api/opsLogTypes";
import { TrendChart } from "../features/opslogs/TrendChart";
import { LEVEL_LABEL, LEVEL_TONE, SOURCE_LABEL, STATUS_LABEL, ago, when } from "../features/opslogs/opsFormat";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { PageHeader } from "../shell/PageHeader";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import "../features/opslogs/opslogs.css";

type Tab = "issues" | "deploys";
const RANGES = [
  { id: "24h", label: "24시간", hours: 24, unit: "hour" },
  { id: "7d", label: "7일", hours: 168, unit: "day" },
  { id: "30d", label: "30일", hours: 720, unit: "day" },
] as const;
const STATUSES: (OpsStatus | "all")[] = ["unresolved", "resolved", "ignored", "all"];
const SOURCES: (OpsSource | "all")[] = ["all", "deploy", "run", "api", "process", "worker"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "불러오지 못했어요.";
}

function IssueRow({ issue }: { issue: OpsIssueRow }) {
  return (
    <li className="ops-row">
      <Link className="ops-row__link" to={`/logs/issues/${issue.id}`}>
        <span className="ops-row__title">{issue.title}</span>
        <span className="ops-row__meta">
          <span className="ops-row__id">{issue.id}</span>
          <Badge tone={LEVEL_TONE[issue.level]}>{LEVEL_LABEL[issue.level]}</Badge>
          <span>{SOURCE_LABEL[issue.source]}</span>
          <span>{issue.count}회</span>
          <span title={when(issue.last_seen)}>최근 {ago(issue.last_seen)}</span>
          {issue.release && <span className="ops-row__id" title="마지막으로 발생한 배포 SHA">{issue.release}</span>}
          {issue.status !== "unresolved" && <Badge>{STATUS_LABEL[issue.status]}</Badge>}
          {issue.regressed ? <Badge tone="warning">재발 {issue.regressed}</Badge> : null}
        </span>
      </Link>
    </li>
  );
}

function IssuesTab() {
  const [status, setStatus] = useState<OpsStatus | "all">("unresolved");
  const [source, setSource] = useState<OpsSource | "all">("all");
  const [q, setQ] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["ops", "issues", status, source, q],
    queryFn: ({ pageParam }) => listOpsIssues({ status, source: source === "all" ? undefined : source, q, cursor: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: 30_000,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total;
  return (
    <section className="ops" aria-label="이슈 목록">
      <div className="ops-card__head">
        <div className="ops-pills" role="group" aria-label="상태">
          {STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === "all" ? "전체" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="ops-pills" role="group" aria-label="출처">
          {SOURCES.map((s) => (
            <button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)}>
              {s === "all" ? "모든 출처" : SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <input className="tk-input ops-search" type="search" placeholder="제목·위치로 찾기" aria-label="이슈 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      {query.isError && <p className="tk-error" role="alert">{errorMessage(query.error)}</p>}
      {query.isPending && (
        <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />불러오는 중</p>
      )}
      {query.isSuccess && items.length === 0 && (
        <div className="tk-empty tk-empty--boxed">
          <Icon name="circle-check" />
          <p>{status === "unresolved" ? "미해결 이슈가 없어요." : "조건에 맞는 이슈가 없어요."}</p>
        </div>
      )}
      {items.length > 0 && (
        <>
          <p className="ops-note">{total}건 중 {items.length}건</p>
          <ul className="ops-list">{items.map((i) => <IssueRow key={i.id} issue={i} />)}</ul>
        </>
      )}
      {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>더 보기</Button>}
    </section>
  );
}

function DeployLog({ id }: { id: string }) {
  const log = useQuery({ queryKey: ["ops", "deploy-log", id], queryFn: () => getOpsDeployLog(id) });
  if (log.isPending) return <p className="ops-note" role="status">로그를 읽는 중</p>;
  if (log.isError) return <p className="tk-error" role="alert">{errorMessage(log.error)}</p>;
  const data = log.data;
  return (
    <div className="ops-row__body">
      <dl className="ops-dl">
        <dt>단계</dt><dd>{data.stage ?? "알 수 없음"}</dd>
        <dt>원인</dt><dd>{data.cause ?? data.error ?? "기록 없음"}</dd>
        <dt>로그</dt><dd>{data.log.exists ? `${data.log.lines}줄` : "로그 파일 없음"}</dd>
      </dl>
      {data.sections?.map((s) => <pre className="ops-pre" key={s.from_line} tabIndex={0}>{s.text}</pre>)}
      {!data.sections?.length && data.tail && <pre className="ops-pre" tabIndex={0}>{data.tail}</pre>}
    </div>
  );
}

function DeployRow({ job }: { job: OpsDeploy }) {
  const [open, setOpen] = useState(false);
  const failed = job.status === "failed" || job.status === "recovery_pending";
  const tone = failed ? "danger" : job.status === "succeeded" ? "success" : "info";
  return (
    <li className="ops-row">
      <div className="ops-row__body">
        <span className="ops-row__meta">
          <Badge tone={tone}>{job.status}</Badge>
          <span className="ops-row__id">{job.revision ?? "-"}</span>
          <span title={when(job.updated_at)}>{ago(job.updated_at)}</span>
          {job.strategy && <span>{job.strategy}</span>}
        </span>
        {failed && <span className="ops-row__title">{job.cause ?? job.error ?? "실패 원인이 기록되지 않았어요."}</span>}
      </div>
      {failed && (
        <div className="ops-row__actions">
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "로그 접기" : "로그 원인 보기"}</Button>
          {job.issue && <Link className="tk-button tk-button--ghost tk-button--sm" to={`/logs/issues/${job.issue}`}><span>이슈 {job.issue}</span></Link>}
        </div>
      )}
      {open && <DeployLog id={job.job_id} />}
    </li>
  );
}

function DeploysTab() {
  const query = useQuery({ queryKey: ["ops", "deploys"], queryFn: () => listOpsDeploys(20), refetchInterval: 30_000 });
  return (
    <section className="ops" aria-label="배포별 오류">
      <p className="ops-note">최근 배포 예약 20건. 실패한 배포는 로그에서 원인 구간만 보여 줘요.</p>
      {query.isError && <p className="tk-error" role="alert">{errorMessage(query.error)}</p>}
      {query.isPending && <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />불러오는 중</p>}
      {query.isSuccess && query.data.items.length === 0 && <div className="tk-empty tk-empty--boxed"><Icon name="server" /><p>배포 기록이 없어요.</p></div>}
      {query.isSuccess && query.data.items.length > 0 && <ul className="ops-list">{query.data.items.map((j) => <DeployRow key={j.job_id} job={j} />)}</ul>}
    </section>
  );
}

/** 부가 기능 > 로그·이슈. 운영 오류를 이슈로 묶어 보고, 배포별 실패 원인을 확인한다(백엔드 ADR 0033). */
export function OpsLogsPage() {
  const [tab, setTab] = useState<Tab>("issues");
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("7d");
  const r = RANGES.find((x) => x.id === range)!;
  const trend = useQuery({ queryKey: ["ops", "trend", range], queryFn: () => opsTrend(r.hours, r.unit), refetchInterval: 60_000 });
  const qc = useQueryClient();
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: ["ops"] }); });
  return (
    <div className="tk-screen">
      <PageHeader title="로그·이슈" meta="운영 오류를 이슈로 묶어 보여 줘요" />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--lg">
          <div className="ops">
            <div className="ops-card">
              <div className="ops-card__head">
                <h2 className="ops-card__title">발생 추이</h2>
                <div className="ops-pills" role="group" aria-label="기간">
                  {RANGES.map((x) => <button key={x.id} type="button" aria-pressed={range === x.id} onClick={() => setRange(x.id)}>{x.label}</button>)}
                </div>
              </div>
              {trend.isError && <p className="tk-error" role="alert">{errorMessage(trend.error)}</p>}
              {trend.data && <TrendChart trend={trend.data} />}
            </div>
            <div className="tk-tablist" role="tablist" aria-label="로그 보기">
              <button role="tab" type="button" className="tk-tab" aria-selected={tab === "issues"} onClick={() => setTab("issues")}>이슈</button>
              <button role="tab" type="button" className="tk-tab" aria-selected={tab === "deploys"} onClick={() => setTab("deploys")}>배포별 오류</button>
            </div>
            {tab === "issues" ? <IssuesTab /> : <DeploysTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
