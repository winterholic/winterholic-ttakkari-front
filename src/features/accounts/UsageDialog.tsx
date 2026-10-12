import { useEffect, useState } from "react";
import type React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { accountUsage, codexReset } from "../../api/client";
import type { AccountUsage, UsageWindow } from "../../api/client";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import "./usage.css";

// ezwork fsw(ezChat) 와 같은 경계: 80% 부터 아끼고, 95% 부터 거의 없다.
const WARN = 80;
const DANGER = 95;
const ENGINE: Record<string, string> = { claude: "Claude Code", codex: "Codex" };
const SOURCE: Record<string, string> = { api: "구독 사용량 기준", stream: "따까리 실행 기록 기준", session_log: "Codex 실행 기록 기준" };

function level(p: number): "ok" | "warn" | "danger" {
  return p >= DANGER ? "danger" : p >= WARN ? "warn" : "ok";
}

function resetText(at: number | null, now: number): string | null {
  if (!at) return null;
  const s = at - now / 1000;
  if (s <= 0) return "곧 초기화";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) {
    const d = new Date(at * 1000);
    return `${d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" })} 초기화`;
  }
  return h > 0 ? `${h}시간 ${m}분 뒤 초기화` : `${Math.max(1, m)}분 뒤 초기화`;
}

function ago(ts: number | null, now: number): string {
  if (!ts) return "";
  const s = Math.max(0, Math.round(now / 1000 - ts));
  if (s < 60) return "방금 전";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

type Status = { tone: "success" | "warning" | "neutral" | "info"; text: string };

function statusOf(a: AccountUsage, isActive: boolean): Status {
  if (!a.enabled) return { tone: "neutral", text: "꺼짐" };
  if (a.login !== "ok" && a.engine === "claude") return { tone: "warning", text: "로그인 필요" };
  if (a.cooldown_seconds > 0) return { tone: "warning", text: `한도 대기 ${Math.ceil(a.cooldown_seconds / 60)}분` };
  if (a.windows.some((w) => w.percent >= 100)) return { tone: "warning", text: "한도 도달" };
  return isActive ? { tone: "success", text: "지금 사용" } : { tone: "info", text: "대기" };
}

/** 사용자 메뉴 > 사용량. 계정마다 5시간·주간(·모델별 주간) 한도를 지금 적용되는 순서로 보여 준다. */
export function UsageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [refresh, setRefresh] = useState(false);
  const q = useQuery({
    queryKey: ["accounts", "usage", refresh],
    queryFn: () => accountUsage(refresh),
    enabled: open,
    refetchInterval: open ? 120_000 : false,
  });
  // 남은 시간 글자를 1분마다 다시 그린다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [open]);
  const rows = q.data ?? [];
  const usable = (a: AccountUsage) => a.enabled && a.cooldown_seconds === 0 && !a.windows.some((w) => w.percent >= 100) && (a.login === "ok" || a.engine === "codex");
  // 묶음(개인·회사)마다 지금 쓰는 계정이 따로 있다.
  const groups = (["personal", "work"] as const)
    .map((pool) => ({ pool, title: pool === "work" ? "회사 계정" : "개인 계정", rows: rows.filter((a) => a.pool === pool) }))
    .filter((g) => g.rows.length > 0);
  const activeIds = new Set(groups.map((g) => g.rows.find(usable)?.id).filter(Boolean));
  const onCount = rows.filter((a) => a.enabled).length;
  return (
    <Dialog kind="panel" open={open} onClose={onClose} title="사용량" id="account-usage">
      <div className="usage">
        <div className="usage__bar">
          <p className="usage__meta">
            {q.isFetching ? "불러오는 중" : q.dataUpdatedAt ? `${ago(Math.round(q.dataUpdatedAt / 1000), now)} 갱신 · 켜진 계정 ${onCount}개` : ""}
          </p>
          <button
            className="tk-icon-button tk-icon-button--sm"
            type="button"
            aria-label="새로 고침"
            aria-busy={q.isFetching || undefined}
            onClick={() => (refresh ? void q.refetch() : setRefresh(true))}
          >
            <Icon name="retry" />
          </button>
        </div>

        {groups.map((g) => {
          const active = g.rows.find(usable);
          return active ? (
            <section key={g.pool} className="usage-now" aria-label={`${g.title} 지금 쓰는 계정`}>
              <span className="usage-now__label">{g.pool === "work" ? "회사 업무에 지금 쓰는 계정" : "지금 쓰는 계정"}</span>
              <span className="usage-now__name">{active.name}</span>
              <span className="usage-now__stats">
                {active.windows.slice(0, 2).map((w) => (
                  <span key={w.key} data-level={level(w.percent)}>{w.label} {w.percent}%</span>
                ))}
              </span>
            </section>
          ) : null;
        })}

        {q.isPending && <p className="usage__note">사용량을 불러오는 중이에요.</p>}
        {q.isError && <p className="tk-error" role="alert">{errorText(q.error).message}</p>}

        {groups.map((g) => (
          <section key={g.pool} className="usage__group" aria-label={g.title}>
            {groups.length > 1 && <h3 className="usage__group-title">{g.title}</h3>}
            <ol className="usage__list" aria-label={`${g.title} 사용량`}>
          {g.rows.map((a) => {
            const st = statusOf(a, activeIds.has(a.id));
            return (
              <li key={a.id} className="usage-card" data-off={!a.enabled || undefined} data-active={activeIds.has(a.id) || undefined}>
                <div className="usage-card__head">
                  <span className="usage-card__rank" aria-label={`${a.rank}순위`}>{a.rank}</span>
                  <span className="usage-card__title">
                    <span className="usage-card__name">{a.name}</span>
                    <span className="usage-card__sub">{ENGINE[a.engine]}{a.plan ? ` · ${a.plan}` : ""}</span>
                  </span>
                  <span className={st.tone === "neutral" ? "tk-badge" : `tk-badge tk-badge--${st.tone}`}>{st.text}</span>
                </div>
                {a.windows.length > 0 ? (
                  <div className="usage-card__windows">
                    {a.windows.map((w) => <WindowRow key={w.key} w={w} now={now} />)}
                  </div>
                ) : (
                  <p className="usage__note">{a.error ?? "아직 사용량 기록이 없어요."}</p>
                )}
                {a.engine === "codex" && a.reset_credits && <ResetRow account={a} now={now} onDone={() => void q.refetch()} />}
                {a.windows.length > 0 && (
                  <p className="usage-card__foot">
                    {a.source ? (a.source === "api" ? (a.engine === "codex" ? "ChatGPT 사용량 기준" : "Claude 구독 사용량 기준") : SOURCE[a.source]) : ""}
                    {a.updated_at ? ` · ${ago(a.updated_at, now)}` : ""}
                  </p>
                )}
              </li>
            );
          })}
            </ol>
          </section>
        ))}
        <p className="usage__note">
          순서와 켜기는 <Link to="/settings#accounts" onClick={onClose}>계정 관리</Link>에서 바꿔요. 한도에 걸린 계정은 자동으로 건너뛰어요.
        </p>
      </div>
    </Dialog>
  );
}

function WindowRow({ w, now }: { w: UsageWindow; now: number }) {
  const lv = level(w.percent);
  const reset = resetText(w.resets_at, now);
  return (
    <div className="usage-win" data-level={lv}>
      <div className="usage-win__top">
        <span className="usage-win__label">{w.label}</span>
        <span className="usage-win__pct">{w.percent}%</span>
      </div>
      <span
        className={`tk-progress tk-progress--lg${lv === "danger" ? " tk-progress--danger" : lv === "warn" ? " tk-progress--warning" : ""}`}
        role="progressbar"
        aria-label={`${w.label} 사용량`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, w.percent)}
        style={{ "--tk-progress": Math.min(1, w.percent / 100) } as React.CSSProperties}
      />
      {reset && <span className="usage-win__reset">{reset}</span>}
    </div>
  );
}

function untilText(at: number | null, now: number): string | null {
  if (!at) return null;
  const s = at - now / 1000;
  if (s <= 0) return "곧";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d > 0 ? `${d}일 ${h}시간` : `${Math.max(1, h)}시간`;
}

/**
 * Codex rate-limit 재설정(Orca 의 「지금 재설정」). 크레딧 한 개를 쓰면 5시간·주간 한도가 바로 풀린다.
 * 되돌릴 수 없어 한 번 더 묻는다. 한도에 걸린 창이 없으면 쓸 필요가 없다고 함께 알린다.
 */
function ResetRow({ account, now, onDone }: { account: AccountUsage; now: number; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const c = account.reset_credits!;
  const limited = account.windows.some((w) => w.percent >= 100);
  const reset = useMutation({
    mutationFn: () => codexReset(account.id),
    onSuccess: (r) => {
      setAsking(false);
      toast({ message: r.message, tone: r.outcome === "reset" ? "success" : r.outcome === "nothing_to_reset" ? "neutral" : "danger" });
      onDone();
    },
  });
  const left = untilText(c.next_expires_at, now);
  return (
    <div className="usage-reset" data-empty={c.available === 0 || undefined}>
      <span className="usage-reset__body">
        <span className="usage-reset__title">rate-limit 재설정 {c.available}회 사용 가능</span>
        {c.available > 0 && left && <span className="usage-reset__sub">다음 항목이 {left} 후 만료돼요</span>}
      </span>
      {c.available > 0 && (
        <button className={limited ? "tk-button tk-button--sm tk-button--primary" : "tk-button tk-button--sm"} type="button" onClick={() => setAsking(true)}>
          지금 재설정
        </button>
      )}
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        size="sm"
        title="지금 재설정할까요?"
        id={`codex-reset-${account.id}`}
        footer={
          <>
            <button className="tk-button" type="button" onClick={() => setAsking(false)}>취소</button>
            <button className="tk-button tk-button--primary" type="button" aria-busy={reset.isPending || undefined} onClick={() => !reset.isPending && reset.mutate()}>
              재설정 1회 쓰기
            </button>
          </>
        }
      >
        <p>
          <strong>{account.name}</strong> 의 Codex 사용량 한도를 지금 초기화해요. 재설정 크레딧 {c.available}회 중 1회를 쓰고, 되돌릴 수 없어요.
        </p>
        {!limited && <p className="tk-help"><span>지금은 한도에 걸린 창이 없어요. 걸렸을 때 쓰는 편이 좋아요.</span></p>}
        {reset.error && <p className="tk-error" role="alert">{errorText(reset.error).message}</p>}
      </Dialog>
    </div>
  );
}

