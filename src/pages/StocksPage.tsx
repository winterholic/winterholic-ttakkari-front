import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { listStocksProviders } from "../api/client";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import "./stocks.css";

/**
 * 주식 투자 상위 화면. 아직은 자리표시만 두고, 실제 연결은 하위 페이지가 맡는다.
 * 새 증권사·기능이 늘면 여기에 카드가 늘어난다.
 */
export function StocksPage() {
  const providers = useQuery({ queryKey: ["stocks", "overview"], queryFn: listStocksProviders });
  useForegroundResync(() => { void providers.refetch(); });
  return <div className="tk-screen stocks-page">
    <PageHeader title="주식 투자" />
    <div className="tk-screen__body"><div className="tk-container tk-container--md">
      <header className="stocks-heading">
        <div>
          <p className="stocks-eyebrow">읽기 전용 · 주문·이체 없음</p>
          <h1>주식 투자</h1>
          <p>보유·관심 종목을 한눈에 보는 기초 틀을 쌓는 중이다. 지금은 토스증권 연결 상태만 확인한다.</p>
        </div>
      </header>

      {providers.isPending && <p className="tk-status" role="status" aria-busy="true"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />연결 목록을 불러오는 중</p>}
      {providers.isError && <p className="tk-status tk-status--warning" role="alert">연결 목록을 불러오지 못했어요.</p>}
      {providers.data && <div className="stocks-grid" role="list" aria-label="증권사 연결">
        {providers.data.map(p => <Link key={p.id} to={p.detail} className="stocks-card">
          <span className="stocks-card__icon"><Icon name="chart" /></span>
          <span className="stocks-card__text">
            <strong>{p.name} 연결</strong>
            <small>{providerHint(p.state)}</small>
          </span>
          <Icon name="chevron-right" />
        </Link>)}
      </div>}

      <section className="tk-section" aria-labelledby="stocks-next-title">
        <div className="tk-section__head"><h2 id="stocks-next-title" className="tk-section__title">다음에 올 것</h2></div>
        <ul className="stocks-next">
          <li>보유 종목·계좌 요약 읽기 (토스증권 연결이 준비되면)</li>
          <li>관심 종목 정리</li>
          <li>다른 증권사 연결</li>
        </ul>
      </section>
    </div></div>
  </div>;
}

function providerHint(state: string): string {
  switch (state) {
    case "running": return "확인 중";
    case "ready": return "연결됨 · 자세히 보기";
    case "login_required": return "로그인이 필요해요 · 자세히 보기";
    case "never_checked": return "아직 확인하지 않았어요 · 자세히 보기";
    default: return "상태 확인하기 · 자세히 보기";
  }
}
