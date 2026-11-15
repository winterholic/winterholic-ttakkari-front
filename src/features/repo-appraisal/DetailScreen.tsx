import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../shell/PageHeader";
import { Button, IconButton } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/Icon";
import { useForegroundResync } from "../../hooks/useForegroundResync";
import { safeGithubHref } from "../github/links";
import { GhSkeleton } from "../github/state/StateView";
import { useAppraisal, useAppraisalHistory } from "./data";
import { describeAppraisalError } from "./errors";
import { STATUS_LABEL, fmtScore } from "./format";
import { pushRecentAppraisal } from "./recent";
import { HistorySection } from "./HistorySection";
import { ProgressSteps } from "./ProgressSteps";
import { ResultCard } from "./ResultCard";
import "./repo-appraisal.css";

/**
 * 평가 조회 실패 상태. 탐색 화면의 `GhErrorState` 와 같은 모양이지만 문구는
 * 평가 API 기준(`describeAppraisalError`)으로 낸다. 계정 전환은 없다. 상세 조회에 계정이 필요 없기 때문이다.
 */
function AppraisalErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const view = describeAppraisalError(error);
  const sso = safeGithubHref(view.ssoUrl);
  const icon: IconName = view.tone === "danger" ? "warning" : view.resetAt ? "clock" : "info";
  return (
    <div className="gh-state" role="alert" data-tone={view.tone}>
      <Icon name={icon} />
      <div className="gh-state__body">
        <p className="gh-state__title">{view.title}</p>
        <p className="gh-state__text">{view.message}</p>
        <div className="gh-state__actions">
          {view.retry && <Button size="sm" onClick={onRetry}>다시 시도</Button>}
          {sso && <a className="tk-button tk-button--sm" href={sso} target="_blank" rel="noopener noreferrer"><span>SSO 승인 화면 열기</span><Icon name="external-link" /></a>}
        </div>
      </div>
    </div>
  );
}

/** 평가 상세. 진행 중이면 단계와 함께 폴링하고, 끝나면 결과와 같은 저장소 이력을 보여 준다. */
export function DetailScreen() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const account = params.get("as");
  const query = useAppraisal(id);
  const data = query.data;
  const history = useAppraisalHistory(data?.owner ?? null, data?.repo ?? null);
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: ["repo-appraisal"] }); });

  useEffect(() => {
    if (data) {
      pushRecentAppraisal({
        id: data.id, owner: data.owner, repo: data.repo, mode: data.mode,
        grade: data.grade, weighted_score: data.weighted_score, created_at: data.created_at,
      });
    }
  }, [data]);

  const asQuery = account ? `?as=${encodeURIComponent(account)}` : "";
  const back = () => navigate({ pathname: "/repo-appraisal", search: asQuery });
  const retryWithSameTarget = () => {
    if (!data) return;
    const next = new URLSearchParams();
    next.set("target", `${data.owner}/${data.repo}`);
    if (account) next.set("as", account);
    navigate({ pathname: "/repo-appraisal", search: `?${next}` });
  };

  const title = data ? `${data.owner}/${data.repo}` : "저장소 평가";
  const meta = !data
    ? "평가를 읽는 중"
    : data.status === "done" && data.weighted_score !== null && data.grade
      ? `${data.grade} · ${fmtScore(data.weighted_score)}점`
      : STATUS_LABEL[data.status];

  let content;
  if (query.isPending || !data) {
    content = query.isError
      ? <AppraisalErrorState error={query.error} onRetry={() => void query.refetch()} />
      : <GhSkeleton kind="card" label="평가를 읽는 중" />;
  } else if (data.status === "failed") {
    content = (
      <div className="gh-state" role="alert" data-tone="danger">
        <Icon name="warning" />
        <div className="gh-state__body">
          <p className="gh-state__title">평가에 실패했어요</p>
          <p className="gh-state__text">{data.error ?? "이유를 알 수 없어요. 다시 평가해 보세요."}</p>
          <div className="gh-state__actions">
            <Button size="sm" onClick={retryWithSameTarget}>다시 평가</Button>
          </div>
        </div>
      </div>
    );
  } else if (data.status === "queued" || data.status === "running") {
    content = (
      <section className="gh-section" aria-labelledby="ra-progress-title">
        <h2 id="ra-progress-title" className="gh-section__title">
          {data.status === "queued" ? "평가를 기다리는 중" : "평가하는 중"}
        </h2>
        <ProgressSteps appraisal={data} />
        <p className="gh-note" role="status">
          {data.status === "queued" ? "곧 시작해요. 이 화면을 벗어나도 평가는 계속돼요." : "끝날 때까지 두면 결과가 바로 보여요. 벗어나도 평가는 계속돼요."}
        </p>
      </section>
    );
  } else {
    content = <ResultCard appraisal={data} />;
  }

  return (
    <div className="tk-screen">
      <PageHeader
        title={title}
        meta={meta}
        actions={<IconButton aria-label="목록으로" onClick={back}><Icon name="back" /></IconButton>}
      />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--lg ra">
          <div className="ra-grid">
            <div className="ra-main">{content}</div>
            {data && <HistorySection query={history} currentId={data.id} account={account} />}
          </div>
        </div>
      </div>
    </div>
  );
}
