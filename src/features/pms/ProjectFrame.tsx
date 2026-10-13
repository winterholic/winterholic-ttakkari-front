import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import type { PmsProject } from "../../api/types";
import { PageHeader } from "../../shell/PageHeader";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/Icon";
import { Menu } from "../../ui/Menu";
import type { MenuItem } from "../../ui/Menu";
import { ErrorState, ListSkeleton } from "../viewer/screenStates";
import { rangeText } from "./dates";
import { scopeLabel } from "./labels";
import { ProjectStatusBadge } from "./ProjectList";
import type { Base } from "./ProjectList";
import { ProjectDialog } from "./ProjectDialog";
import { Meter, useProject } from "./shared";

export interface TabDef {
  id: string;
  label: string;
  icon?: IconName;
  count?: number;
}

/**
 * 프로젝트 하나를 여는 화면의 공통 틀: 헤더(이름·메뉴) → 프로젝트 요약 줄 → 탭. PMS 와 WBS 가 같이 쓴다.
 * 탭은 주소에 둔다(/pms/:id/board). 반대편 도구로 넘어가는 링크가 헤더에 있다.
 */
export function ProjectFrame({ base, projectId, tab, tabs, extraMenu, wide, children }: {
  base: Base;
  projectId: string;
  tab: string;
  tabs: TabDef[] | ((p: PmsProject) => TabDef[]);
  /** 프로젝트 메뉴(⋯)의 맨 위에 더할 항목(내보내기 등) */
  extraMenu?: (p: PmsProject) => MenuItem[];
  wide?: boolean;
  children: (p: PmsProject) => ReactNode;
}) {
  const navigate = useNavigate();
  const q = useProject(projectId);
  const [editing, setEditing] = useState(false);
  const p = q.data;
  const other: Base = base === "pms" ? "wbs" : "pms";
  const extra = p && extraMenu ? extraMenu(p) : [];
  const items: MenuItem[] = [...extra, { label: "프로젝트 설정", icon: "settings", onSelect: () => setEditing(true), separatorBefore: extra.length > 0 }];
  const tabList = p ? (typeof tabs === "function" ? tabs(p) : tabs) : [];

  return (
    <div className="tk-screen">
      <PageHeader
        title={p?.name ?? (base === "pms" ? "PMS" : "WBS")}
        meta={p ? <span className="pms-header-meta"><ProjectStatusBadge status={p.status} /><span>{scopeLabel(p.scope)}</span>{rangeText(p.start_date, p.end_date) && <span>{rangeText(p.start_date, p.end_date)}</span>}</span> : undefined}
        actions={
          p && (
            <>
              <Link className="tk-button tk-button--sm pms-switch" to={`/${other}/${p.id}`}>
                <Icon name={other === "wbs" ? "wbs" : "kanban"} />{other === "wbs" ? "WBS" : "PMS"}
              </Link>
              <Menu label="프로젝트 메뉴" items={items}><Icon name="more" /></Menu>
            </>
          )
        }
      />
      <div className="tk-screen__body">
        <div className={wide ? "tk-container tk-container--full" : "tk-container tk-container--lg"}>
          <div className="pms-page">
            <Link className="pms-back tk-link" to={`/${base}`}><Icon name="chevron-left" />프로젝트 목록</Link>
            {q.isPending && <ListSkeleton rows={3} label="프로젝트를 불러오는 중" />}
            {q.isError && <ErrorState error={q.error} what="프로젝트" onRetry={() => void q.refetch()} />}
            {p && (
              <>
                {tab !== "dashboard" && (
                <div className="pms-summary">
                  <span className="pms-summary__pct">{p.progress}<small>%</small></span>
                  <span className="pms-summary__bar"><Meter value={p.progress} label="전체 진행률" /></span>
                  <span className="pms-summary__meta">작업 {p.counts.total} · 완료 {p.counts.done}{p.counts.overdue > 0 && <b className="pms-text-danger"> · 지연 {p.counts.overdue}</b>}</span>
                </div>
                )}
                <div className="tk-segmented tk-segmented--block pms-tabs" role="radiogroup" aria-label={base === "pms" ? "PMS 화면" : "WBS 보기"}>
                  {tabList.map((t) => (
                    <label key={t.id}>
                      <input type="radio" name="pms-tab" checked={tab === t.id} onChange={() => navigate(`/${base}/${p.id}/${t.id}`, { replace: true })} />
                      {t.icon && <Icon name={t.icon} />}
                      {t.label}
                      {!!t.count && <span className="pms-tabs__count" aria-label={`${t.count}건`}>{t.count}</span>}
                    </label>
                  ))}
                </div>
                {children(p)}
              </>
            )}
          </div>
        </div>
      </div>
      {p && <ProjectDialog open={editing} project={p} onClose={() => setEditing(false)} onDeleted={() => navigate(`/${base}`, { replace: true })} />}
    </div>
  );
}
