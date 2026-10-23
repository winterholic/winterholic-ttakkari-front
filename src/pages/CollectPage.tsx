import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { BudgetCard, Overview } from "../features/collector/Overview";
import { Deliveries } from "../features/collector/Deliveries";
import { Review } from "../features/collector/Review";
import { RunsPanel, SourcesPanel } from "../features/kb/Collection";
import { QualityPanel } from "../features/kb/Quality";
import { useKbScope } from "../features/kb/scope";
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

function QualityAndLimits({ scope }: { scope: "personal" | "work" }) {
  const budget = useQuery({ queryKey: ["kb-collect-budgets", scope], queryFn: () => collectBudgets(scope), refetchInterval: 30000 });
  return <section className="kb-results" aria-label="품질과 한도">
    {budget.isPending && <p role="status">한도를 읽는 중</p>}
    {budget.isError && <div className="kb-error"><p className="tk-error" role="alert">{failure(budget.error)}</p><Button onClick={() => void budget.refetch()}>다시 시도</Button></div>}
    {budget.data && <BudgetCard budget={budget.data} />}
    <QualityPanel scope={scope} />
  </section>;
}

/**
 * 수집 관리. 지식 도서관과 독립된 화면이라 도서관 없이도 출처·실행·검토·한도를 다룬다.
 * 자료 범위(개인/회사)는 도서관과 같은 `scope` 쿼리를 쓰고, 화면 상태는 모두 URL 에 둔다.
 */
export function CollectPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const scope = useKbScope();
  const view: View = VIEWS.find((v) => v.id === params.get("view"))?.id ?? "overview";
  const update = useCallback((values: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(values)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    });
  }, [setParams]);
  return <div className="tk-screen">
    <PageHeader title="수집 관리" meta="출처 등록부터 검토·전달·한도까지" actions={
      <button type="button" className="tk-icon-button" aria-label="다시 읽기" onClick={() => void queryClient.invalidateQueries({ predicate: (qy) => String(qy.queryKey[0]).startsWith("kb-collect") })}><Icon name="retry" /></button>
    } />
    <div className="tk-screen__body"><div className="tk-container tk-container--lg kb-page collect-page">
      <div className="kb-actions" role="group" aria-label="자료 범위">
        <Button size="sm" variant={scope === "personal" ? "primary" : "ghost"} aria-pressed={scope === "personal"} onClick={() => update({ scope: null })}>개인</Button>
        <Button size="sm" variant={scope === "work" ? "primary" : "ghost"} aria-pressed={scope === "work"} onClick={() => update({ scope: "work" })}>회사</Button>
      </div>
      <nav className="kb-tabs" aria-label="수집 관리 화면">
        {VIEWS.map((v) => <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => update({ view: v.id === "overview" ? null : v.id })}>{v.label}</button>)}
      </nav>
      {view === "overview" && <Overview key={scope} scope={scope} />}
      {view === "sources" && <SourcesPanel key={scope} scope={scope} />}
      {view === "runs" && <><RunsPanel key={scope} scope={scope} /><Deliveries key={`d-${scope}`} scope={scope} /></>}
      {view === "review" && <Review key={scope} scope={scope} />}
      {view === "quality" && <QualityAndLimits key={scope} scope={scope} />}
    </div></div>
  </div>;
}
