import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteOverride, getOverride, putOverride } from "../../api/client";
import type { AccountOut, AccountPool } from "../../api/types";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { SortableList } from "../../ui/SortableList";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { isOn } from "./mode";
import { OrderButtons } from "./OrderButtons";
import { ErrorState, ListSkeleton } from "../viewer/screenStates";

export const overrideKey = (pool: AccountPool) => ["accounts", "override", pool] as const;
const ENGINE: Record<string, string> = { claude: "Claude Code", codex: "Codex" };

export function useOverride(pool: AccountPool = "personal") {
  // 기한이 지나면 서버가 비활성으로 돌려준다. 화면도 그 즈음 다시 읽는다. 개인·회사 모드가 각자 하나씩 가진다.
  return useQuery({ queryKey: overrideKey(pool), queryFn: () => getOverride(pool), refetchInterval: 60_000 });
}

function untilText(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** datetime-local 입력값(현지 시각, 초 없음) */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function preset(kind: "1h" | "3h" | "tonight" | "tomorrow9"): Date {
  const d = new Date();
  if (kind === "1h") return new Date(d.getTime() + 3600_000);
  if (kind === "3h") return new Date(d.getTime() + 3 * 3600_000);
  if (kind === "tonight") return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9, 0);
}

/** 계정 목록 위에 뜨는 "임시 순서 적용 중" 안내. 활성일 때만 보인다. */
export function OverrideBanner({ accounts, pool, onEdit }: { accounts: AccountOut[]; pool: AccountPool; onEdit: () => void }) {
  const qc = useQueryClient();
  const ov = useOverride(pool);
  const off = useMutation({
    mutationFn: () => deleteOverride(pool),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: overrideKey(pool) });
      toast({ message: "임시 순서를 끝냈어요. 기본 순서로 돌아가요." });
    },
  });
  if (!ov.data?.active || !ov.data.until) return null;
  const names = ov.data.ids.map((id) => accounts.find((a) => a.id === id)?.name).filter(Boolean);
  return (
    <aside className="tk-callout tk-callout--note override-banner" role="status">
      <Icon name="clock" className="tk-callout__icon" />
      <div className="tk-callout__body">
        <strong className="tk-callout__title">임시 순서 적용 중 · {untilText(ov.data.until)}까지</strong>
        <p>{names.map((n, i) => `${i + 1}. ${n}`).join("  ·  ")}</p>
        {/* 목록을 끌어 바꾼 기본 순서는 저장되지만, 임시 순서가 끝나기 전에는 실제로 쓰이지 않는다. */}
        <p>아래 목록을 바꿔도 이 시각까지는 위 순서가 먼저 쓰여요. 기본 순서는 그 뒤부터 적용돼요.</p>
        <div className="tk-button-group">
          <button className="tk-button tk-button--xs" type="button" onClick={onEdit}>고치기</button>
          <button className="tk-button tk-button--xs tk-button--ghost" type="button" aria-busy={off.isPending || undefined} onClick={() => off.mutate()}>지금 끝내기</button>
        </div>
      </div>
    </aside>
  );
}

/** 정한 시각까지만 쓸 순서를 끌어서 정한다. 기본 순서는 그대로 두고, 시각이 지나면 저절로 돌아간다. */
export function OverrideDialog({ accounts, pool, onClose }: { accounts: AccountOut[]; pool: AccountPool; onClose: () => void }) {
  const [opener] = useState(() => document.activeElement);
  // 조회 완료 시 로딩 모달을 편집 모달로 교체하므로 최초 진입 위치는 이 부모가 보존한다.
  useEffect(() => () => {
    if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
  }, [opener]);
  const ov = useOverride(pool);
  if (!ov.data) {
    return (
      <Dialog open onClose={onClose} size="lg" title={pool === "work" ? "회사 계정 임시 순서" : "임시 순서"} id="account-override">
        {ov.isError
          ? <ErrorState error={ov.error} what="임시 순서" onRetry={() => void ov.refetch()} />
          : <ListSkeleton rows={3} label="임시 순서를 불러오는 중" />}
      </Dialog>
    );
  }
  return <OverrideEditor accounts={accounts} pool={pool} onClose={onClose} current={ov.data} />;
}

function OverrideEditor({ accounts, pool, onClose, current }: {
  accounts: AccountOut[];
  pool: AccountPool;
  onClose: () => void;
  current: { active: boolean; ids: string[]; until: string | null };
}) {
  const qc = useQueryClient();
  const initial = (() => {
    if (!current.active) return accounts.filter((a) => isOn(a, pool));
    const pick = current.ids.map((id) => accounts.find((a) => a.id === id)).filter((a): a is AccountOut => !!a);
    return pick.length ? pick : accounts.filter((a) => isOn(a, pool));
  })();
  const [order, setOrder] = useState<AccountOut[]>(initial);
  const [until, setUntil] = useState<string>(current.active && current.until ? localInput(new Date(current.until)) : localInput(preset("tomorrow9")));
  const rest = accounts.filter((a) => !order.some((o) => o.id === a.id));
  // 렌더 중 Date.now() 를 부르지 않는다(react-hooks/purity). 다이얼로그를 연 시각 기준으로 본다.
  const [openedAt] = useState(() => Date.now());
  const save = useMutation({
    mutationFn: () => putOverride(order.map((a) => a.id), new Date(until).toISOString(), pool),
    onSuccess: (r) => {
      qc.setQueryData(overrideKey(pool), r);
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      toast({ message: `${untilText(r.until!)}까지 이 순서로 써요.`, tone: "success" });
      onClose();
    },
  });
  const ready = order.length > 0 && until !== "" && new Date(until).getTime() > openedAt;
  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      modal
      title={pool === "work" ? "회사 계정 임시 순서" : "임시 순서"}
      id="account-override"
      footer={
        <>
          <button className="tk-button" type="button" onClick={onClose}>취소</button>
          <button className="tk-button tk-button--primary" type="button" aria-disabled={!ready || undefined} aria-busy={save.isPending || undefined}
            disabled={save.isPending}
            onClick={() => ready && save.mutate()}>
            적용
          </button>
        </>
      }
    >
      <p className="tk-help"><span>정한 시각까지만 이 순서로 써요. 기본 순서는 바뀌지 않고, 시각이 지나면 저절로 돌아가요. 목록에 없는 계정은 기본 순서대로 뒤에 붙어요.{pool === "work" ? " 회사 업무 탭에만 적용돼요." : " 개인 계정 순서에만 적용되고, 회사 계정 순서는 따로 정해요."}</span></p>
      <div className="override-form">
        <div className="tk-field">
          <label className="tk-label" htmlFor="override-until">언제까지</label>
          <input id="override-until" className="tk-input" type="datetime-local" value={until} min={localInput(new Date(openedAt))} disabled={save.isPending} onChange={(e) => setUntil(e.target.value)} />
          <div className="tk-chips" role="group" aria-label="빠른 선택">
            {([["1h", "1시간"], ["3h", "3시간"], ["tonight", "오늘 밤까지"], ["tomorrow9", "내일 아침 9시"]] as const).map(([k, l]) => (
              <button key={k} className="tk-chip" type="button" disabled={save.isPending} onClick={() => setUntil(localInput(preset(k)))}>{l}</button>
            ))}
          </div>
        </div>
        <SortableList
          items={order}
          label="임시 순서"
          disabled={save.isPending}
          onReorder={setOrder}
          render={(a, i, handle) => (
            <div className="tk-list__item account-row">
              {handle}
              <span className="account-row__rank" aria-label={`${i + 1}순위`}>{i + 1}</span>
              <span className="tk-list__body">
                <span className="tk-list__title">{a.name}{pool === "personal" && a.pool === "work" && <span className="tk-badge tk-badge--info account-group">회사</span>}</span>
                <span className="tk-list__meta"><span>{ENGINE[a.engine]}</span>{!isOn(a, pool) && <span>꺼져 있음(건너뜀)</span>}</span>
              </span>
              <span className="tk-list__end">
                <OrderButtons name={a.name} index={i} count={order.length} disabled={save.isPending} onMove={(to) => {
                  const next = [...order];
                  const [moved] = next.splice(i, 1);
                  next.splice(to, 0, moved);
                  setOrder(next);
                }} />
                <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label={`${a.name} 빼기`} disabled={save.isPending} onClick={() => setOrder(order.filter((x) => x.id !== a.id))}>
                  <Icon name="x" />
                </button>
              </span>
            </div>
          )}
        />
        {rest.length > 0 && (
          <div className="tk-chips" role="group" aria-label="더할 계정">
            {rest.map((a) => (
              <button key={a.id} className="tk-chip" type="button" disabled={save.isPending} onClick={() => setOrder([...order, a])}>
                <Icon name="plus" />{a.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {save.error && <p className="tk-error" role="alert">{errorText(save.error).message}</p>}
    </Dialog>
  );
}
