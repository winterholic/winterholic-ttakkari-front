import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { collectRuntime, collectSummary, registerCollectPilot, setCollectRuntime } from "../../api/collector";
import type { CollectBudget, KbScope } from "../../api/collector";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { failure, formatTime } from "../kb/labels";
import { STATUS } from "../kb/Collection";

const FUNNEL: [keyof import("../../api/collector").CollectSummary["funnel"], string][] = [
  ["discovered", "발견"], ["fetched", "가져옴"], ["extracted", "본문 추출"], ["accepted", "기준 통과"], ["held", "보류"],
  ["blocked", "차단"], ["failed", "실패"], ["not_modified", "변경 없음"], ["delivered", "도서관 적재"],
  ["awaiting_delivery", "전달 대기"], ["awaiting_review", "내 검토 대기"],
];

const WAIT_TEXT: Record<string, string> = {
  fetch_deferred: "서버가 요청을 늦추라고 했거나 응답이 없어요", handler_error: "처리 중 오류가 나서 다시 시도해요",
  source_policy_missing: "출처 정책이 없어요", store_not_permitted: "원문 보관 권리가 허용되지 않아요",
};

export function BudgetCard({ budget }: { budget: CollectBudget }) {
  const pct = (b: { used: number; limit: number }) => (b.limit ? Math.min(100, Math.round((b.used / b.limit) * 100)) : 100);
  return <section className="collect-card" aria-label="수집 한도">
    <h3>하루 한도 ({budget.day}, {budget.timezone === "Asia/Seoul" ? "한국 시간" : budget.timezone})</h3>
    {!budget.teacher_enabled && <p className="kb-note">모델 호출은 꺼져 있어요. 규칙 검사만 하므로 수집량이 늘어도 모델 비용은 0이에요.</p>}
    <dl className="kb-facts">
      <div className="kb-facts__row"><dt>호출</dt><dd>{budget.calls.used} / {budget.calls.limit}회 ({pct(budget.calls)}%)</dd></div>
      <div className="kb-facts__row"><dt>토큰</dt><dd>{budget.tokens.used.toLocaleString("ko-KR")} / {budget.tokens.limit.toLocaleString("ko-KR")} ({pct(budget.tokens)}%)</dd></div>
      <div className="kb-facts__row"><dt>비용</dt><dd>${(budget.micro_usd.used / 1_000_000).toFixed(2)} / ${(budget.micro_usd.limit / 1_000_000).toFixed(2)}</dd></div>
      {budget.pages && <div className="kb-facts__row"><dt>페이지</dt><dd>{budget.pages.reserved} / {budget.pages.limit}장</dd></div>}
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
  if (summary.isError) return <div className="kb-error"><p className="tk-error" role="alert">{failure(summary.error)}</p><Button onClick={() => void summary.refetch()}>다시 시도</Button></div>;
  const data = summary.data;
  const total = Object.values(data.funnel).reduce((a, b) => a + b, 0);
  const paused = data.runtime.paused;
  return <section className="kb-results" aria-label="수집 현황">
    <div className="collect-card" data-paused={paused}>
      <div className="kb-actions"><h3>자동 수집</h3><Badge>{!data.runtime.loop_available ? "서버에서 꺼짐" : paused ? "일시정지" : "켜짐"}</Badge></div>
      <p className="kb-note">{!data.runtime.loop_available ? "이 서버 설정에서는 수집 반복 작업이 꺼져 있어요."
        : paused ? `새 수집을 시작하지 않아요${data.runtime.since ? ` (${formatTime(data.runtime.since)}부터)` : ""}. 이미 가져온 자료의 전달은 계속돼요.`
          : "등록한 출처를 주기에 따라 가져와요. 출처마다 일시정지할 수도 있어요."}</p>
      {data.runtime.loop_available && <Button size="sm" variant={paused ? "primary" : "ghost"} busy={pause.isPending} onClick={() => pause.mutate(!paused)}>{paused ? "자동 수집 재개" : "자동 수집 일시정지"}</Button>}
      {pause.isError && <p className="tk-error" role="alert">{failure(pause.error)}</p>}
    </div>
    {total === 0 && <p className="kb-empty">아직 수집한 자료가 없어요. 출처 탭에서 출처를 등록하거나 공식 문서 예시 출처를 추가해 보세요.</p>}
    <ul className="collect-funnel" aria-label="단계별 건수">{FUNNEL.map(([key, label]) => <li key={key} data-key={key}><strong>{data.funnel[key].toLocaleString("ko-KR")}</strong><span>{label}</span></li>)}</ul>
    {data.waiting.length > 0 && <div className="collect-card" role="status"><h3>기다리는 작업</h3>
      <ul className="kb-passages">{data.waiting.map((w) => <li className="kb-passage" key={w.job_id}>
        <div className="kb-badges"><Badge>{STATUS[w.status] || w.status}</Badge></div>
        <p className="kb-hash">{w.source_key}</p>
        <p className="kb-note">{w.reason ? WAIT_TEXT[w.reason] || w.reason : "사유 없음"}{w.not_before ? ` · ${formatTime(w.not_before)} 이후 다시 시도` : ""}</p>
      </li>)}</ul></div>}
    <BudgetCard budget={data.budget} />
    <div className="collect-card"><h3>공식 문서 예시 출처</h3>
      <p className="kb-note">권리를 직접 확인한 공식 출처 3곳(Kubernetes 블로그·한국어 문서, GOV.UK 뉴스)을 한 번에 추가해요. 학습 이용은 허용하지 않고, 이미 있는 출처는 건드리지 않아요.</p>
      {runtime.data?.pilot && <p className="kb-note">처음 한 번 자동으로 등록됐어요 (권리 확인 {formatTime(runtime.data.pilot.rights_checked_at)}).</p>}
      <Button size="sm" busy={pilot.isPending} onClick={() => pilot.mutate()}>예시 출처 추가</Button>
      {pilot.isSuccess && <p role="status" className="kb-note">{pilot.data.created.length ? `${pilot.data.created.length}곳을 추가했어요.` : "이미 모두 등록돼 있어요."}</p>}
      {pilot.isError && <p className="tk-error" role="alert">{failure(pilot.error)}</p>}
    </div>
  </section>;
}
