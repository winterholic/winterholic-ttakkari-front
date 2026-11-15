import { Link } from "react-router";
import { Icon } from "../../ui/Icon";
import { GhEmpty } from "../github/state/StateView";
import { getRecentAppraisals } from "./recent";
import { MODE_LABEL, fmtScore, shortDate } from "./format";

/** 저장소 무관 최근 평가. 이력 API 가 저장소별이라 이 기기에서 본 것만 기억한다. */
export function RecentSection({ account }: { account: string | null }) {
  const recents = getRecentAppraisals();
  const as = account ? `?as=${encodeURIComponent(account)}` : "";
  return (
    <section className="gh-section" aria-labelledby="ra-recent-title">
      <h2 id="ra-recent-title" className="gh-section__title">최근 평가</h2>
      {recents.length === 0 ? (
        <GhEmpty icon="gauge" title="아직 평가한 저장소가 없어요">위에서 저장소 주소를 넣고 평가를 시작해 보세요.</GhEmpty>
      ) : (
        <ul className="tk-list tk-list--inset">
          {recents.map((r) => (
            <li key={r.id}>
              <Link className="tk-list__item" to={`/repo-appraisal/${r.id}${as}`}>
                <span className="tk-list__body">
                  <span className="tk-list__title tk-list__title--wrap">{r.owner}/{r.repo}</span>
                  <span className="tk-list__meta">
                    {r.weighted_score !== null ? <span>{fmtScore(r.weighted_score)}점</span> : <span>결과 미확인</span>}
                    {r.grade && <span>{r.grade}</span>}
                    <span>{MODE_LABEL[r.mode as "quick" | "deep"] ?? r.mode} 모드</span>
                    <span>{shortDate(r.created_at)}</span>
                  </span>
                </span>
                <span className="tk-list__end"><Icon name="chevron-right" /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
