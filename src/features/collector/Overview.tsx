import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collectRuntime, collectSummary, registerCollectPilot, setCollectRuntime } from "../../api/collector";
import type { CollectBudget, KbScope } from "../../api/collector";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { failure, formatTime } from "../kb/labels";
import { STATUS } from "../kb/Collection";
import "./review-workspace.css";

const WAIT_TEXT: Record<string, string> = {
  fetch_deferred: "서버가 요청을 늦추라고 했거나 응답이 없어요", handler_error: "처리 중 오류가 나서 다시 시도해요",
  source_policy_missing: "출처 정책을 확인해야 해요", store_not_permitted: "원문 보관 권리를 확인할 수 없어요",
};
const userFailure = (error: unknown) => {
  const message = failure(error);
  return STATUS[message] || /^[a-z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)*$/.test(message)
    ? STATUS[message] || "요청을 처리하지 못했어요. 잠시 뒤 다시 읽어 주세요."
    : message;
};

export function BudgetCard({ budget }: { budget: CollectBudget }) {
  const pct = (b: { used: number; limit: number }) => (b.limit ? Math.min(100, Math.round((b.used / b.limit) * 100)) : 100);
  return <section className="collect-card" aria-label="수집 한도">
    <h3>하루 한도 ({budget.day}, {budget.timezone === "Asia/Seoul" ? "한국 시간" : budget.timezone})</h3>
    <p className="kb-note">호출·토큰·비용은 API가 보고한 일일 집계 한도입니다. 사용 엔진·모델과 정밀 판정에 사용된 양은 이 응답에서 확인할 수 없습니다.</p>
    <dl className="kb-facts">
      <div className="kb-facts__row"><dt>호출</dt><dd>{budget.calls.used} / {budget.calls.limit}회 ({pct(budget.calls)}%)</dd></div>
      <div className="kb-facts__row"><dt>토큰</dt><dd>{budget.tokens.used.toLocaleString("ko-KR")} / {budget.tokens.limit.toLocaleString("ko-KR")} ({pct(budget.tokens)}%)</dd></div>
      <div className="kb-facts__row"><dt>비용</dt><dd>${(budget.micro_usd.used / 1_000_000).toFixed(2)} / ${(budget.micro_usd.limit / 1_000_000).toFixed(2)}</dd></div>
      <div className="kb-facts__row"><dt>정산 대기</dt><dd>{budget.unsettled}건{budget.unsettled > 0 ? " (결과가 확인될 때까지 한도에서 빼요)" : ""}</dd></div>
    </dl>
  </section>;
}

export function Overview({ scope }: { scope?: KbScope } = {}) {
  const cache = useQueryClient();
  const summary = useQuery({ queryKey: ["kb-collect-summary", scope], queryFn: () => collectSummary(scope), refetchInterval: 10000 });
  const runtime = useQuery({ queryKey: ["kb-collect-runtime", scope], queryFn: () => collectRuntime(scope) });
  const refresh = () => Promise.all([cache.invalidateQueries({ queryKey: ["kb-collect-summary", scope] }),
    cache.invalidateQueries({ queryKey: ["kb-collect-runtime", scope] }), cache.invalidateQueries({ queryKey: ["kb-collect-sources", scope] })]);
  const pause = useMutation({ mutationFn: (paused: boolean) => setCollectRuntime(scope, paused, paused ? "owner pause" : "owner resume"), onSuccess: refresh });
  const pilot = useMutation({ mutationFn: () => registerCollectPilot(scope), onSuccess: refresh });
  if (summary.isPending) return <p role="status">수집 현황을 읽는 중</p>;
  if (summary.isError) return <div className="kb-error"><p className="tk-error" role="alert">{userFailure(summary.error)}</p><Button onClick={() => void summary.refetch()}>다시 시도</Button></div>;
  const data = summary.data;
  const paused = data.runtime.paused;
  const reviewTotal = data.funnel.awaiting_review;
  return <section className="kb-results review-overview" aria-label="수집 현황">
    <div className="collect-card" data-paused={paused}>
      <div className="kb-actions"><h3>자동 수집</h3><Badge>{!data.runtime.loop_available ? "서버에서 꺼짐" : paused ? "일시정지" : "켜짐"}</Badge></div>
      <p className="kb-note">{!data.runtime.loop_available ? "이 서버 설정에서는 수집 반복 작업이 꺼져 있어요."
        : paused ? `새 수집을 시작하지 않아요${data.runtime.since ? ` (${formatTime(data.runtime.since)}부터)` : ""}. 이미 가져온 자료의 전달은 계속돼요.`
          : "등록한 출처를 주기에 따라 가져와요. 출처마다 일시정지할 수도 있어요."}</p>
      {data.runtime.loop_available && <Button size="sm" variant={paused ? "primary" : "ghost"} busy={pause.isPending} onClick={() => pause.mutate(!paused)}>{paused ? "자동 수집 재개" : "자동 수집 일시정지"}</Button>}
      {pause.isError && <p className="tk-error" role="alert">{userFailure(pause.error)}</p>}
    </div>
    <section className="review-overview__status" aria-label="검토와 운영 상태">
      <div><span>서버 검토 대기 총량</span><strong>{reviewTotal.toLocaleString("ko-KR")}건</strong></div>
      <p className="kb-note">사용자 조치가 필요한 자료의 전체 수는 API에서 분리 제공하지 않습니다. 화면에서 불러온 큐 항목 수와 전체 총량을 따로 확인하세요.</p>
      <p className="kb-note">자동 평가 대기와 정책 차단은 별도 총량이 제공되지 않습니다. 정책·권리·robots 차단은 재처리로 우회하지 마세요.</p>
      <p className="kb-note">이 현황 응답에는 정밀 판정 엔진·모델·실행 상태가 없습니다 · 미확인.</p>
      <p className="kb-note">이 현황 응답에는 정밀 평가 대기 건수가 없습니다 · 미확인. 사용자 조치 필요 총량과는 별도 항목이며, 두 수를 서로 대신해 해석하지 않습니다.</p>
      <p className="kb-note">운영 단계별 건수(서로 더하지 않음): 차단 {data.funnel.blocked} · 실패 {data.funnel.failed} · 전달 대기 {data.funnel.awaiting_delivery}</p>
    </section>
    {reviewTotal === 0 && data.funnel.blocked === 0 && data.funnel.failed === 0 && data.funnel.awaiting_delivery === 0 && <p className="kb-empty">현재 표시할 검토 대기나 운영 문제가 없습니다. 출처를 등록하면 수집 상태가 여기에 나타납니다.</p>}
    {runtime.isPending && <p className="kb-note" role="status">추가 운영 설정을 읽는 중이에요.</p>}
    {runtime.isError && <div className="kb-error"><p className="tk-error" role="alert">운영 설정을 읽지 못했어요: {userFailure(runtime.error)}</p><Button size="sm" onClick={() => void runtime.refetch()}>운영 설정 다시 읽기</Button></div>}
    {data.waiting.length > 0 && <div className="collect-card" role="status"><h3>기다리는 작업</h3>
      <ul className="kb-passages">{data.waiting.map((w) => <li className="kb-passage" key={w.job_id}>
        <div className="kb-badges"><Badge>{STATUS[w.status] || "상태 확인 필요"}</Badge></div>
        <p className="kb-hash">{w.source_key}</p>
        <p className="kb-note">{w.reason ? WAIT_TEXT[w.reason] || "대기 사유를 기술 상세에서 확인해 주세요." : "대기 사유 정보가 없습니다."}{w.not_before ? ` · ${formatTime(w.not_before)} 이후 다시 시도` : ""}</p>
      </li>)}</ul></div>}
    <BudgetCard budget={data.budget} />
    <div className="collect-card"><h3>공식 문서 예시 출처</h3>
      <p className="kb-note">권리를 직접 확인한 공식 출처 3곳(Kubernetes 블로그·한국어 문서, GOV.UK 뉴스)을 한 번에 추가해요. 학습 이용은 허용하지 않고, 이미 있는 출처는 건드리지 않아요.</p>
      {runtime.data?.pilot && <p className="kb-note">처음 한 번 자동으로 등록됐어요 (권리 확인 {formatTime(runtime.data.pilot.rights_checked_at)}).</p>}
      <Button size="sm" busy={pilot.isPending} onClick={() => pilot.mutate()}>예시 출처 추가</Button>
      {pilot.isSuccess && <p role="status" className="kb-note">{pilot.data.created.length ? `${pilot.data.created.length}곳을 추가했어요.` : "이미 모두 등록돼 있어요."}</p>}
      {pilot.isError && <p className="tk-error" role="alert">{userFailure(pilot.error)}</p>}
    </div>
  </section>;
}
