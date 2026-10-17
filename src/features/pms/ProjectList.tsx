import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { listPmsProjects } from "../../api/client";
import type { PmsProject, PmsProjectStatus } from "../../api/types";
import { PageHeader } from "../../shell/PageHeader";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { EmptyState, ErrorState, ListSkeleton } from "../viewer/screenStates";
import { dueText, rangeText } from "./dates";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, SCOPES } from "./labels";
import { ProjectDialog } from "./ProjectDialog";
import { KEYS, Meter } from "./shared";

export type Base = "pms" | "wbs";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

const STATUS_TONE: Record<PmsProjectStatus, "info" | "success" | "warning" | undefined> = { planning: undefined, active: "info", on_hold: "warning", done: "success" };
export const ProjectStatusBadge = ({ status }: { status: PmsProjectStatus }) => <Badge tone={STATUS_TONE[status]}>{PROJECT_STATUS_LABEL[status]}</Badge>;

/** 진행 막대 색: 기간보다 많이 뒤처졌을 때만 경고색을 쓴다. 지연 작업이 하나 있다고 전체를 빨갛게 칠하지 않는다. */
export function progressTone(progress: number, planned: number | null, overdue: number): "warning" | "danger" | undefined {
  const behind = planned === null ? 0 : planned - progress;
  if (behind >= 30) return "danger";
  if (behind >= 15 || (overdue > 0 && behind >= 5)) return "warning";
  return undefined;
}

function ProjectCard({ p, base }: { p: PmsProject; base: Base }) {
  const c = p.counts;
  const m = p.next_milestone;
  return (
    <li>
      <Link className="pms-card" to={`/${base}/${p.id}`}>
        <span className="pms-card__top">
          <span className="pms-card__name">{p.name}</span>
          <span className="pms-card__badges">
            <ProjectStatusBadge status={p.status} />
            {p.scope === "work" && <Badge tone="info">회사</Badge>}
          </span>
        </span>
        {p.description && <span className="pms-card__desc">{p.description}</span>}
        <span className="pms-card__progress">
          <Meter value={p.progress} label={`${p.name} 진행률`} tone={progressTone(p.progress, null, c.overdue)} />
          <span className="pms-card__pct">{p.progress}%</span>
        </span>
        <span className="pms-card__meta">
          <span>작업 {c.total}</span>
          <span>완료 {c.done}</span>
          {c.overdue > 0 && <span className="pms-text-danger">지연 {c.overdue}</span>}
          {p.open_notes > 0 && <span>이슈 {p.open_notes}</span>}
          {rangeText(p.start_date, p.end_date) && <span>{rangeText(p.start_date, p.end_date)}</span>}
        </span>
        {m && (
          <span className="pms-card__milestone">
            <Icon name="flag" />
            <span>{m.title}</span>
            <span className={m.overdue ? "pms-text-danger" : undefined}>{dueText(m.days)}</span>
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * 프로젝트 목록. PMS 와 WBS 가 같은 프로젝트를 쓰므로 목록도 같고, 눌렀을 때 가는 곳(base)만 다르다.
 * 범위·상태 필터는 주소(?scope=, ?status=)에 둔다.
 */
export function ProjectList({ base }: { base: Base }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope = SCOPES.find((s) => s.value === params.get("scope"))?.value;
  const status = PROJECT_STATUSES.find((s) => s === params.get("status"));
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim());
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: [...KEYS.projects, "list", scope ?? "all", status ?? "all", search],
    queryFn: () => listPmsProjects({ scope, status, q: search }),
    placeholderData: (prev) => prev,
  });
  const projects = list.data?.projects ?? [];
  const setParam = (k: string, v: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(k, v);
      else next.delete(k);
      return next;
    }, { replace: true });
  const filtered = !!(scope || status || search);

  return (
    <div className="tk-screen">
      <PageHeader
        title={base === "pms" ? "PMS" : "WBS"}
        meta={list.data ? `프로젝트 ${projects.length}개` : undefined}
        actions={<Button variant="primary" size="sm" onClick={() => setCreating(true)}><Icon name="plus" />새 프로젝트</Button>}
      />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--lg">
          <div className="pms-page">
            <p className="pms-lead">
              {base === "pms"
                ? "프로젝트의 진행 상황과 칸반, 이슈를 한곳에서 봐요."
                : "프로젝트를 작업 단위로 쪼개고 담당자·일정을 잡아요."}
              {" "}같은 프로젝트와 작업을 {base === "pms" ? "WBS" : "PMS"}에서도 이어서 볼 수 있어요.
            </p>
            <div className="pms-toolbar">
              <div className="tk-segmented" role="radiogroup" aria-label="범위">
                <label><input type="radio" name="pms-scope" checked={!scope} onChange={() => setParam("scope", null)} />전체</label>
                {SCOPES.map((s) => (
                  <label key={s.value}><input type="radio" name="pms-scope" checked={scope === s.value} onChange={() => setParam("scope", s.value)} />{s.label}</label>
                ))}
              </div>
              <span className="tk-input-wrap pms-toolbar__search">
                <Icon name="search" />
                <input className="tk-input tk-input--sm" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="프로젝트 이름 찾기" aria-label="프로젝트 찾기" />
              </span>
            </div>
            <div className="tk-chips" role="group" aria-label="상태">
              <button className="tk-chip" type="button" aria-pressed={!status} onClick={() => setParam("status", null)}>전체</button>
              {PROJECT_STATUSES.map((s) => (
                <button key={s} className="tk-chip" type="button" aria-pressed={status === s} onClick={() => setParam("status", status === s ? null : s)}>
                  {PROJECT_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            {list.isPending && <ListSkeleton rows={3} label="프로젝트를 불러오는 중" />}
            {list.isError && <ErrorState error={list.error} what="프로젝트" onRetry={() => void list.refetch()} />}
            {list.isSuccess && projects.length === 0 && (
              <EmptyState
                icon={base === "pms" ? "kanban" : "wbs"}
                art={filtered ? "state-no-results" : "empty-work-visualization"}
                title={filtered ? "조건에 맞는 프로젝트가 없어요" : "아직 프로젝트가 없어요"}
                actions={!filtered && <Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" />새 프로젝트</Button>}
              >
                {filtered ? "필터를 바꾸거나 새 프로젝트를 만들어 보세요." : "프로젝트를 만들면 작업을 쪼개고 칸반으로 진행을 관리할 수 있어요."}
              </EmptyState>
            )}
            {projects.length > 0 && (
              <ul className="pms-cards" aria-label="프로젝트 목록">
                {projects.map((p) => <ProjectCard key={p.id} p={p} base={base} />)}
              </ul>
            )}
          </div>
        </div>
      </div>
      <ProjectDialog open={creating} onClose={() => setCreating(false)} defaultScope={scope ?? "personal"} onCreated={(p) => navigate(`/${base}/${p.id}`)} />
    </div>
  );
}

