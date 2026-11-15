import { Link } from "react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import type { AppraisalHistory } from "../../api/repoAppraisalTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { GhEmpty } from "../github/state/StateView";
import { MODE_LABEL, STATUS_LABEL, fmtDelta, fmtScore, shortDate, sparkPoints } from "./format";

/**
 * 같은 저장소의 이전 평가 목록. 점수 추이는 목록 위 스파크라인으로 요약하고,
 * 목록 자체가 접근 가능한 원본이라 그래프는 장식으로 둔다.
 */
export function HistorySection({ query, currentId, account }: { query: UseQueryResult<AppraisalHistory>; currentId: string; account: string | null }) {
  if (query.isPending) {
    return (
      <section className="gh-section" aria-labelledby="ra-history-title">
        <h2 id="ra-history-title" className="gh-section__title">점수 추이</h2>
        <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />이전 평가를 읽는 중</p>
      </section>
    );
  }
  if (query.isError) {
    // 이력 조회 실패는 결과 화면을 막지 않는다. 그 자리에서만 알리고 다시 읽는다.
    return (
      <section className="gh-section" aria-labelledby="ra-history-title">
        <h2 id="ra-history-title" className="gh-section__title">점수 추이</h2>
        <p className="tk-error" role="alert">
          이전 평가를 읽지 못했어요. <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>다시 읽기</Button>
        </p>
      </section>
    );
  }
  const items = query.data.items.filter((i) => i.id !== currentId);
  if (items.length === 0) {
    return (
      <section className="gh-section" aria-labelledby="ra-history-title">
        <h2 id="ra-history-title" className="gh-section__title">점수 추이</h2>
        <GhEmpty icon="history" title="이전 평가가 없어요">이 저장소를 처음 평가했어요. 다시 평가하면 점수 변화가 여기에 쌓여요.</GhEmpty>
      </section>
    );
  }
  const scored = [...items].reverse().map((i) => (i.status === "done" ? i.weighted_score : null));
  const points = sparkPoints(scored, 100, 28);
  const as = account ? `?as=${encodeURIComponent(account)}` : "";
  return (
    <section className="gh-section" aria-labelledby="ra-history-title">
      <h2 id="ra-history-title" className="gh-section__title">점수 추이</h2>
      {scored.filter((s) => s !== null).length >= 2 && (
        <svg className="ra-spark" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label={`최근 ${scored.filter((s) => s !== null).length}회 점수 추이 그래프`}>
          <polyline points={points} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <ul className="tk-list tk-list--inset">
        {items.map((i) => {
          const delta = fmtDelta(i.delta);
          return (
            <li key={i.id}>
              <Link className="tk-list__item" to={`/repo-appraisal/${i.id}${as}`}>
                <span className="tk-list__body">
                  <span className="tk-list__title">
                    {i.status === "done" && i.weighted_score !== null ? `${fmtScore(i.weighted_score)}점` : STATUS_LABEL[i.status]}
                    {i.grade && i.status === "done" ? ` · ${i.grade}` : ""}
                    {delta && delta !== "변동 없음" ? ` · ${delta}` : ""}
                  </span>
                  <span className="tk-list__meta">
                    <span>{shortDate(i.created_at)}</span>
                    <span>{MODE_LABEL[i.mode]} 모드</span>
                    {!i.llm_used && i.status === "done" && <Badge>결정론</Badge>}
                  </span>
                </span>
                <span className="tk-list__end"><Icon name="chevron-right" /></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
