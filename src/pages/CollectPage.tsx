import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";
import { BudgetCard, Overview } from "../features/collector/Overview";
import { Deliveries } from "../features/collector/Deliveries";
import { Review } from "../features/collector/Review";
import { Missions } from "../features/collector/Missions";
import { RunsPanel, SourcesPanel } from "../features/kb/Collection";
import { QualityPanel } from "../features/kb/Quality";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { useQuery } from "@tanstack/react-query";
import { collectBudgets } from "../api/collector";
import { failure } from "../features/kb/labels";
import "../features/kb/kb.css";
import "../features/collector/collector.css";

type View = "overview" | "sources" | "runs" | "review" | "quality";
const VIEWS: { id: View; label: string }[] = [
  { id: "overview", label: "현황" },
  { id: "sources", label: "출처" },
  { id: "runs", label: "실행" },
  { id: "review", label: "검토" },
  { id: "quality", label: "품질·한도" },
];

function QualityAndLimits() {
  const budget = useQuery({ queryKey: ["kb-collect-budgets"], queryFn: () => collectBudgets(), refetchInterval: 30000 });
  return <section className="kb-results" aria-label="품질과 한도">
    {budget.isPending && <p role="status">한도를 읽는 중</p>}
    {budget.isError && <div className="kb-error"><p className="tk-error" role="alert">{failure(budget.error)}</p><Button onClick={() => void budget.refetch()}>다시 시도</Button></div>}
    {budget.data && <BudgetCard budget={budget.data} />}
    <QualityPanel />
  </section>;
}

/**
 * Intent is the primary task. Source administration remains available in advanced controls.
 */
export function CollectPage() {
  const [params, setParams] = useSearchParams();
  const [operationsOpen, setOperationsOpen] = useState(params.has("view"));
  const queryClient = useQueryClient();
  const view: View = VIEWS.find((v) => v.id === params.get("view"))?.id ?? "overview";
  const update = useCallback((values: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(values)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    });
  }, [setParams]);
  return <div className="tk-screen">
    <PageHeader title="지식 수집" meta="수집 목적에서 지식 도서관까지" actions={
      <button type="button" className="tk-icon-button" aria-label="다시 읽기" onClick={() => void queryClient.invalidateQueries({ predicate: (qy) => /^(kb-collect|collection-mission)/.test(String(qy.queryKey[0])) })}><Icon name="retry" /></button>
    } />
    <div className="tk-screen__body"><div className="tk-container tk-container--lg kb-page collect-page">
      <Missions />
      <details className="mission-operations" open={operationsOpen} onToggle={event => setOperationsOpen(event.currentTarget.open)}>
      <summary>운영·고급 설정</summary>
      {operationsOpen && <>
      <nav className="kb-tabs" aria-label="수집 관리 화면">
        {VIEWS.map((v) => <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => update({ view: v.id === "overview" ? null : v.id })}>{v.label}</button>)}
      </nav>
      {view === "overview" && <Overview />}
      {view === "sources" && <SourcesPanel />}
      {view === "runs" && <><RunsPanel /><Deliveries /></>}
      {view === "review" && <Review />}
      {view === "quality" && <QualityAndLimits />}
      </>}
      </details>
    </div></div>
  </div>;
}
