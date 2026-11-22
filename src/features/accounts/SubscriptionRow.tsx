import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, subscriptionAction, subscriptionState, subscriptionToggle } from "../../api/client";
import type { SubscriptionObservation, SubscriptionState } from "../../api/client";
import { errorText } from "../viewer/api";

const RESULTS: Record<string, string> = {
  succeeded: "활성화 요청을 마쳤어요.",
  dispatching: "활성화 요청을 실행 중이에요.",
  already_dispatching: "활성화 요청을 실행 중이에요.",
  already_dispatched: "이 주기에 이미 요청을 보냈어요.",
  already_used: "이미 사용한 주기라 요청을 생략했어요.",
  already_active_or_unverifiable: "사용 여부를 확정할 수 없어 중복 요청을 생략했어요.",
  unknown: "실행 결과를 확인하지 못했어요. 중복 요청을 막고 있어요.",
  auth_error: "계정 로그인이 필요해요.",
  included_usage_unavailable: "구독으로 사용할 수 있는지 확인이 필요해요.",
  preflight_failed: "실행 전에 구독 상태를 확인하지 못했어요.",
  rate_limit: "사용량 한도로 요청을 보내지 않았어요.",
  spawn_failed: "CLI를 시작하지 못했어요.",
  account_disabled: "사용 중지된 계정이에요.",
  verification_exhausted: "초기화를 확인하지 못해 재확인을 멈췄어요.",
  awaiting_reset_confirmation: "초기화를 다시 확인할 예정이에요.",
  reset_confirmed: "초기화를 확인했어요.",
  auto_disabled: "자동 활성화가 꺼져 있어요.",
  observed: "구독 상태를 확인했어요.",
  observation_failed: "구독 상태를 확인하지 못했어요.",
};

function stamp(value?: number | null) {
  if (!value) return "미정";
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value * 1000))} KST`;
}

function weekly(value: SubscriptionObservation | undefined, antigravity: boolean) {
  const key = antigravity ? "agy_gemini_models_weekly" : "seven_day";
  return value?.windows.find((window) => window.key === key);
}

export function SubscriptionRow({ accountId, accountName, accountEnabled, engine = "codex", active = true, onUpdated }: {
  accountId: string; accountName: string; accountEnabled: boolean; engine?: "codex" | "antigravity"; active?: boolean; onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const key = ["accounts", "subscription", accountId];
  const q = useQuery({ queryKey: key, queryFn: () => subscriptionState(accountId), retry: false, enabled: active,
    staleTime: 120_000, refetchInterval: active ? 120_000 : false });
  const update = (data: SubscriptionState) => { qc.setQueryData(key, data); onUpdated(); };
  const toggle = useMutation({ mutationFn: (enabled: boolean) => subscriptionToggle(accountId, enabled), onSuccess: update });
  const action = useMutation({ mutationFn: (kind: "refresh" | "activate") => subscriptionAction(accountId, kind), onSuccess: update });
  const busy = toggle.isPending || action.isPending;
  const disabled = !accountEnabled || busy;
  const data = q.data;
  const antigravity = data?.provider === "antigravity";
  const before = weekly(data?.last_result?.before, antigravity);
  const after = weekly(data?.last_result?.after, antigravity);
  const result = data?.action_result?.status;

  if (engine === "antigravity" && q.error instanceof ApiError && q.error.status === 400) return null;

  return <section className="subscription" aria-label={`${accountName} 주간 자동 활성화 관리`} aria-busy={busy || undefined}>
    <div className="subscription__head">
      <span className="subscription__title">주간 자동 활성화</span>
      {data && <label className="tk-switch">
        <input type="checkbox" role="switch" checked={data.auto_enabled} disabled={disabled}
          aria-label={`${accountName} 주간 자동 활성화`} onChange={(event) => toggle.mutate(event.target.checked)} />
        <span>{data.auto_enabled ? "켜짐" : "꺼짐"}</span>
      </label>}
    </div>
    {q.isPending && <p className="usage__note" role="status">예약 정보를 불러오는 중이에요.</p>}
    {q.isError && <p className="usage__note usage-card__retry" role="alert">
      자동 활성화 정보를 불러오지 못했어요.
      <button className="tk-button tk-button--secondary tk-button--sm" type="button" onClick={() => void q.refetch()}>예약 정보 다시 읽기</button>
    </p>}
    {data && <>
      {antigravity && <p className="usage__note">Gemini 모델 그룹에 적용돼요.</p>}
      <dl className="subscription__dates">
        <div><dt>주간 초기화 예상</dt><dd>{stamp(data.reset_at)}</dd></div>
        <div><dt>자동 활성화 확인</dt><dd>{data.auto_enabled ? stamp(data.next_activation_at) : "자동 활성화 꺼짐"}</dd></div>
        <div><dt>다음 상태 확인</dt><dd>{stamp(data.next_check_at)}</dd></div>
        <div><dt>마지막 상태 확인</dt><dd>{data.last_checked_at ? stamp(data.last_checked_at) : "아직 확인하지 않았어요"}</dd></div>
      </dl>
      <p className="usage__note" role="status">{data.last_result
        ? RESULTS[data.last_result.status] ?? "실행 결과 확인이 필요해요."
        : "아직 실행 기록이 없어요."}</p>
      {data.last_check_outcome && !["observed", "waiting_for_reset"].includes(data.last_check_outcome) &&
        <p className="usage__note">{RESULTS[data.last_check_outcome] ?? "상태 확인이 필요해요."}</p>}
      {data.last_error && <p className="usage__note usage__note--error">{(data.last_error.includes("auth_error") || data.last_error.includes("로그인이 만료"))
        ? "계정 로그인을 확인해 주세요." : "최근 상태 조회에 실패했어요. 마지막 관측값을 참고해 주세요."}</p>}
      {(before || after) && <details className="subscription__comparison">
        <summary>실행 전후 비교</summary>
        <p className="usage__note">주간 사용량 {before ? `${before.percent}%` : "미관측"} → {after ? `${after.percent}%` : "미관측"}</p>
        <p className="usage__note">다음 초기화 {stamp(before?.resets_at)} → {stamp(after?.resets_at)}</p>
      </details>}
      <div className="subscription__actions">
        <button className="tk-button tk-button--secondary tk-button--sm" type="button" disabled={disabled}
          onClick={() => action.mutate("refresh")}>{action.isPending && action.variables === "refresh" ? "확인 중…" : "상태 확인"}</button>
        <button className="tk-button tk-button--secondary tk-button--sm" type="button" disabled={disabled}
          onClick={() => action.mutate("activate")}>{action.isPending && action.variables === "activate" ? "실행 중…" : "지금 활성화"}</button>
      </div>
      {result && <p className="usage__note" role="status">{RESULTS[result] ?? "처리 결과를 확인해 주세요."}</p>}
      {(toggle.isError || action.isError) && <p className="usage__note usage__note--error" role="alert">{errorText(toggle.error ?? action.error).message}</p>}
      <p className="usage__note">자동 활성화 상태는 12시간마다, 주간 초기화 뒤에는 10초 후에 확인해요. 이미 사용한 주기에는 요청을 생략해요.</p>
      <p className="usage__note">최소 요청이 다음 주간 갱신 시각을 앞당기는지는 검증 중이에요.</p>
    </>}
  </section>;
}
