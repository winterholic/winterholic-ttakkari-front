import { useEffect, useId, useState } from "react";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { ErrorNotice } from "../features/notebooklm/ErrorNotice";
import { QueryPanel } from "../features/notebooklm/QueryPanel";
import { SourcePanel } from "../features/notebooklm/SourcePanel";
import { STATE_LABEL, STATE_SENTENCE, describeError } from "../features/notebooklm/labels";
import { isConnected, nlmKeys, useNotebookDetail, useNotebookJobs, useNotebookLMStatus } from "../features/notebooklm/queries";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import "./notebooklm.css";

type Tab = "sources" | "query";

/** 노트북 상세: 소스 관리와 질의. 넓은 화면은 두 칸, 폰은 탭으로 나눈다. */
export function NotebookLMDetailPage() {
  const { notebookId = "" } = useParams();
  const qc = useQueryClient();
  const tabId = useId();
  const [tab, setTab] = useState<Tab>("sources");
  const status = useNotebookLMStatus();
  const connected = isConnected(status.data);
  const detail = useNotebookDetail(notebookId, connected);
  const jobs = useNotebookJobs(notebookId, connected);
  useForegroundResync(() => {
    void qc.invalidateQueries({ queryKey: nlmKeys.status });
    void qc.invalidateQueries({ queryKey: nlmKeys.notebook(notebookId) });
    void qc.invalidateQueries({ queryKey: nlmKeys.jobs });
  });
  useEffect(() => {
    if (!detail.error) return;
    if (["auth", "cooldown", "blocked", "disabled"].includes(describeError(detail.error).kind)) void qc.invalidateQueries({ queryKey: nlmKeys.status });
  }, [detail.error, qc]);

  const nb = detail.data;
  return (
    <div className="tk-screen nlm-page">
      <PageHeader title={nb?.title || "노트북"} meta={nb ? `소스 ${nb.sources.length}개` : undefined} />
      <div className="tk-screen__body"><div className="tk-container tk-container--lg">
        <nav className="nlm-crumb" aria-label="상위 메뉴">
          <Link to="/notebooklm"><Icon name="back" />NotebookLM</Link>
        </nav>

        {status.isPending && <p className="tk-status" role="status" aria-busy="true"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />연결 상태를 불러오는 중</p>}
        {status.isError && <ErrorNotice error={status.error} onRetry={() => void status.refetch()} retryLabel="상태 다시 읽기" />}
        {status.data && !connected && (
          <aside className="tk-callout tk-callout--warning nlm-notice" role="status" data-testid="not-connected">
            <Icon name="lock" className="tk-callout__icon" />
            <div className="tk-callout__body">
              <strong className="tk-callout__title">지금은 연결되어 있지 않아요 · {STATE_LABEL[status.data.state].label}</strong>
              <p>{STATE_SENTENCE[status.data.state]}</p>
              <Link className="tk-link" to="/notebooklm">연결 상태 화면으로</Link>
            </div>
          </aside>
        )}

        {connected && detail.isPending && (
          <div className="nlm-loading" role="status" aria-busy="true">
            <span className="tk-spinner tk-spinner--sm" aria-hidden="true" />노트북을 불러오는 중
            <div className="tk-skeleton tk-skeleton--block nlm-status-skeleton" />
          </div>
        )}
        {detail.isError && <ErrorNotice error={detail.error} onRetry={() => void detail.refetch()} retryLabel="다시 읽기" />}

        {nb && (
          <>
            <div className="tk-segmented tk-segmented--block nlm-tabs" role="radiogroup" aria-label="보기">
              <label>
                <input type="radio" name={`${tabId}-tab`} checked={tab === "sources"} onChange={() => setTab("sources")} />
                소스 {nb.sources.length}
              </label>
              <label>
                <input type="radio" name={`${tabId}-tab`} checked={tab === "query"} onChange={() => setTab("query")} />
                질의
              </label>
            </div>
            <div className="nlm-split">
              <SourcePanel notebook={nb} jobs={jobs.data ?? []} active={tab === "sources"} />
              <QueryPanel key={nb.id} notebook={nb} jobs={jobs.data} active={tab === "query"} />
            </div>
          </>
        )}
      </div></div>
    </div>
  );
}
