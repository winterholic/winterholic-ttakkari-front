import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { AuthStatusCard, StatusLoadError } from "../features/notebooklm/AuthStatusCard";
import { NotebookList } from "../features/notebooklm/NotebookList";
import { describeError, STATE_LABEL } from "../features/notebooklm/labels";
import { isConnected, nlmKeys, useNotebookList, useNotebookLMStatus } from "../features/notebooklm/queries";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import "./notebooklm.css";

function ConnectedList() {
  const qc = useQueryClient();
  const list = useNotebookList(true);
  // 연결 상태 카드는 마지막 기록이라, 목록이 인증·쿨다운·보안 신호로 막히면 카드도 새로 읽는다.
  useEffect(() => {
    if (!list.error) return;
    if (["auth", "cooldown", "blocked", "disabled"].includes(describeError(list.error).kind)) void qc.invalidateQueries({ queryKey: nlmKeys.status });
  }, [list.error, qc]);
  return <NotebookList list={list} />;
}

/** NotebookLM 플랫폼 첫 화면: 연결 상태와 노트북 목록. 연결되지 않았으면 Google 에 닿는 요청을 만들지 않는다. */
export function NotebookLMPage() {
  const qc = useQueryClient();
  const status = useNotebookLMStatus();
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: nlmKeys.status }); });
  const data = status.data;

  return (
    <div className="tk-screen nlm-page">
      <PageHeader title="NotebookLM" meta={data ? STATE_LABEL[data.state].label : undefined} />
      <div className="tk-screen__body"><div className="tk-container tk-container--md">
        <header className="nlm-heading">
          <p className="nlm-eyebrow">내 Google 계정의 NotebookLM · 유료 API 키 없음</p>
          <h1>NotebookLM 플랫폼</h1>
          <p>자료를 노트북에 모으고, 소스를 근거로 질문해 인용과 함께 답을 받아요.</p>
        </header>

        {status.isPending && (
          <div className="nlm-loading" role="status" aria-busy="true">
            <span className="tk-spinner tk-spinner--sm" aria-hidden="true" />연결 상태를 불러오는 중
            <div className="tk-skeleton tk-skeleton--block nlm-status-skeleton" />
          </div>
        )}
        {status.isError && <StatusLoadError error={status.error} onRetry={() => void status.refetch()} />}
        {data && <AuthStatusCard status={data} />}

        {data && isConnected(data) && <ConnectedList />}
        {data && !isConnected(data) && (
          <section className="tk-section" aria-labelledby="nlm-wait-title">
            <div className="tk-section__head"><h2 id="nlm-wait-title" className="tk-section__title">노트북</h2></div>
            <div className="tk-empty tk-empty--boxed" data-testid="list-locked">
              <Icon name="lock" className="tk-icon--xl" />
              <p className="tk-empty__title">연결되면 노트북이 보여요</p>
              <p className="nlm-note">{data.state === "session_saved" ? "먼저 위에서 접속 확인을 눌러 주세요." : "위 연결 상태의 안내를 먼저 따라 주세요. 이 동안에는 Google에 요청하지 않아요."}</p>
            </div>
          </section>
        )}
      </div></div>
    </div>
  );
}
