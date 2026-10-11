import { useEffect, useState } from "react";
import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { accountUsage } from "../../api/client";
import type { AccountUsage, UsageWindow } from "../../api/client";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
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
  const active = rows.find((a) => a.enabled && a.cooldown_seconds === 0 && !a.windows.some((w) => w.percent >= 100) && (a.login === "ok" || a.engine === "codex"));
  const onCount = rows.filter((a) => a.enabled).length;
  return (
    <Dialog kind="sheet" open={open} onClose={onClose} title="사용량" id="account-usage">
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

        {active && (
          <section className="usage-now" aria-label="지금 쓰는 계정">
            <span className="usage-now__label">지금 쓰는 계정</span>
            <span className="usage-now__name">{active.name}</span>
            <span className="usage-now__stats">
              {active.windows.slice(0, 2).map((w) => (
                <span key={w.key} data-level={level(w.percent)}>{w.label} {w.percent}%</span>
              ))}
            </span>
          </section>
        )}

        {q.isPending && <p className="usage__note">사용량을 불러오는 중이에요.</p>}
        {q.isError && <p className="tk-error" role="alert">{errorText(q.error).message}</p>}

        <ol className="usage__list" aria-label="계정별 사용량">
          {rows.map((a) => {
            const st = statusOf(a, a.id === active?.id);
            return (
              <li key={a.id} className="usage-card" data-off={!a.enabled || undefined} data-active={a.id === active?.id || undefined}>
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
                {a.windows.length > 0 && (
                  <p className="usage-card__foot">
                    {a.source ? SOURCE[a.source] : ""}{a.updated_at ? ` · ${ago(a.updated_at, now)}` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
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
