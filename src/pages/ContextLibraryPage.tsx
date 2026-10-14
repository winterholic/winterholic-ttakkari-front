import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { libOverview } from "../api/client";
import type { LibScope } from "../api/client";
import { OntologyTab } from "../features/contextlib/OntologyTab";
import { OverviewTab } from "../features/contextlib/OverviewTab";
import { QualityTab } from "../features/contextlib/QualityTab";
import { SearchLabTab } from "../features/contextlib/SearchLabTab";
import { StructureTab } from "../features/contextlib/StructureTab";
import { SCOPES, n } from "../features/contextlib/shared";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import "../features/contextlib/contextlib.css";

type Tab = "overview" | "structure" | "ontology" | "search" | "quality";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "개요" },
  { id: "structure", label: "구조" },
  { id: "ontology", label: "온톨로지" },
  { id: "search", label: "검색" },
  { id: "quality", label: "품질" },
];

/**
 * 맥락 도서관(ADR 0009): RAG(문서·조각 색인)와 온톨로지(엔터티·관계·기억)가 무엇으로 이뤄졌고 잘 설계됐는지 눈으로 본다.
 * 읽기 전용이다. 출처 추가·색인·기억 수정은 비서 관리에서 한다.
 */
export function ContextLibraryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "overview") as Tab;
  const scope = (SCOPES.find((s) => s.value === params.get("scope"))?.value ?? "all") as LibScope;
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    if ("scope" in patch) next.delete("page");
    setParams(next, { replace: true });
  };
  const overview = useQuery({ queryKey: ["ctxlib", "overview", scope], queryFn: () => libOverview(scope) });
  const t = overview.data?.totals;
  return (
    <div className="tk-screen">
      <PageHeader
        title="맥락 도서관"
        meta={t ? `문서 ${n(t.documents)} · 조각 ${n(t.chunks)} · 기억 ${n(t.memories)} · 엔터티 ${n(t.entities)}` : undefined}
        actions={
          <Link className="tk-icon-button" to="/assistant?tab=knowledge" aria-label="비서 관리에서 출처 편집" title="비서 관리에서 출처 편집">
            <Icon name="settings" />
          </Link>
        }
      />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--lg">
          <div className="cl-page">
            <div className="tk-segmented tk-segmented--block" role="radiogroup" aria-label="맥락 도서관 화면">
              {TABS.map((x) => (
                <label key={x.id}>
                  <input type="radio" name="cl-tab" checked={tab === x.id} onChange={() => set({ tab: x.id === "overview" ? null : x.id })} />
                  {x.label}
                </label>
              ))}
            </div>
            <div className="cl-scope">
              <span className="cl-note" id="cl-scope-label">범위</span>
              <div className="tk-segmented" role="radiogroup" aria-labelledby="cl-scope-label">
                {SCOPES.map((s) => (
                  <label key={s.value}>
                    <input type="radio" name="cl-scope" checked={scope === s.value} onChange={() => set({ scope: s.value === "all" ? null : s.value })} />
                    {s.label}
                  </label>
                ))}
              </div>
              <span className="cl-note cl-scope__help">{scope === "work" ? "회사·공통 자료만" : scope === "personal" ? "개인·공통 자료만" : "모든 자료"}</span>
            </div>
            {tab === "overview" && <OverviewTab scope={scope} />}
            {tab === "structure" && <StructureTab scope={scope} />}
            {tab === "ontology" && <OntologyTab scope={scope} />}
            {tab === "search" && <SearchLabTab scope={scope} />}
            {tab === "quality" && <QualityTab scope={scope} />}
          </div>
        </div>
      </div>
    </div>
  );
}
