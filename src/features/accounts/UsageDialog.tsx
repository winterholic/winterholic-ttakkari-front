import { useEffect, useState } from "react";
import type React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { accountUsage, codexReset, qwenFlashUsage, qwenUsage } from "../../api/client";
import type { AccountUsage, QwenFlashPeriod, QwenUsagePeriod, UsageWindow } from "../../api/client";
import type { AccountPool } from "../../api/types";
import { Art } from "../../ui/Art";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { EngineBadge } from "../../ui/EngineBadge";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import "./usage.css";

// ezwork fsw(ezChat) 와 같은 경계: 80% 부터 아끼고, 95% 부터 거의 없다.
const WARN = 80;
const DANGER = 95;
const ENGINE: Record<string, string> = { claude: "Claude Code", codex: "Codex", antigravity: "Antigravity CLI", muse: "Muse Code" };
const SOURCE: Record<string, string> = { api: "구독 사용량 기준", stream: "따까리 실행 기록 기준", session_log: "Codex 실행 기록 기준", antigravity_cli: "Antigravity 공식 CLI 기준", muse_cli: "Muse Code 구독 사용량 기준" };

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

/** pool 모드에서의 상태. 켜기는 개인·회사 모드가 따로라 그 모드의 값으로 본다. */
function statusOf(a: AccountUsage, isActive: boolean, pool: AccountPool): Status {
  if (!(pool === "work" ? a.work_enabled : a.enabled)) return { tone: "neutral", text: "꺼짐" };
  if (a.engine === "muse" && !a.windows.length) return { tone: "neutral", text: a.login === "ok" ? "사용량 미제공" : "사용량 미관측" };
  if (a.engine === "muse" && a.stale) return { tone: "warning", text: "오래된 측정" };
  if (a.engine === "antigravity" && !a.windows.length) return { tone: a.error ? "warning" : "neutral", text: a.error ? "조회 실패" : "사용량 미관측" };
  if (a.engine === "antigravity" && a.stale) return { tone: "warning", text: "오래된 측정" };
  if (a.execution_enabled === false) return { tone: "neutral", text: "검증 대기" };
  if (a.login !== "ok" && a.engine === "claude") return { tone: "warning", text: "로그인 필요" };
  if (a.cooldown_seconds > 0) return { tone: "warning", text: `한도 대기 ${Math.ceil(a.cooldown_seconds / 60)}분` };
  if (!a.stale && a.remaining_to_limit_percent === 0) return { tone: "warning", text: "상한 대기" };
  const checkedWindows = a.engine === "antigravity" ? a.windows.filter((w) => w.key.startsWith("agy_gemini_models_")) : a.windows;
  if (checkedWindows.some((w) => w.percent >= 100)) return { tone: "warning", text: "한도 도달" };
  return isActive ? { tone: "success", text: "지금 사용" } : { tone: "info", text: "대기" };
}

type UsageTab = "accounts" | "flash" | "intake";
const USAGE_TABS: { id: UsageTab; label: string }[] = [
  { id: "accounts", label: "계정·모델별" },
  { id: "flash", label: "Flash Next" },
  { id: "intake", label: "접수 Qwen" },
];

/** 사용자 메뉴 > 사용량. 계정마다 5시간·주간(·모델별 주간) 한도를 지금 적용되는 순서로 보여 준다. */
export function UsageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [refresh, setRefresh] = useState(false);
  const [pool, setPool] = useState<AccountPool>("personal");
  const [selected, setSelected] = useState<Partial<Record<AccountPool, string>>>({});
  const [tab, setTab] = useState<UsageTab>(() => {
    try {
      const saved = localStorage.getItem("ttakkari:usage-tab");
      if (saved === "flash" || saved === "intake" || saved === "accounts") return saved;
    } catch {
      // ignore local storage error
    }
    return "accounts";
  });

  const selectTab = (next: UsageTab) => {
    setTab(next);
    try {
      localStorage.setItem("ttakkari:usage-tab", next);
    } catch {
      // ignore
    }
  };

  const q = useQuery({
    queryKey: ["accounts", "usage", refresh],
    queryFn: () => accountUsage(refresh),
    enabled: open,
    refetchInterval: open ? 120_000 : false,
  });
  const qwen = useQuery({
    queryKey: ["accounts", "qwen-usage"],
    queryFn: qwenUsage,
    enabled: open,
    refetchInterval: open ? 120_000 : false,
  });
  const flash = useQuery({
    queryKey: ["accounts", "qwen-flash-usage"],
    queryFn: qwenFlashUsage,
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });
  // 남은 시간 글자를 1분마다 다시 그린다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [open]);
  const rows = q.data ?? [];
  const usageWindows = (a: AccountUsage) => a.engine === "antigravity"
    ? a.windows.filter((w) => w.key.startsWith("agy_gemini_models_"))
    : a.windows;
  const usable = (a: AccountUsage, pool: AccountPool) =>
    a.execution_enabled !== false && (pool === "work" ? a.work_enabled : a.enabled) && a.cooldown_seconds === 0 &&
    (a.stale || a.remaining_to_limit_percent !== 0) && !usageWindows(a).some((w) => w.percent >= 100) && (a.login === "ok" || a.engine === "codex" || a.engine === "antigravity" || (a.engine === "muse" && a.windows.length > 0 && !a.stale));
  // 개인·회사 모드가 켜기·순서를 따로 가지므로 지금 쓰는 계정도 모드마다 따로 있다.
  // 회사 계정은 개인 계정 중 회사 모드에 들인 계정이고, 순서는 회사 순위(work_rank)다.
  const groups = (["personal", "work"] as const)
    .map((pool) => ({
      pool,
      title: pool === "work" ? "회사 계정" : "개인 계정",
      rows: pool === "work" ? rows.filter((a) => a.work_rank != null).sort((a, b) => a.work_rank! - b.work_rank!) : rows,
    }))
    .filter((g) => g.rows.length > 0);
  const rankOf = (a: AccountUsage, pool: AccountPool) => (pool === "work" ? a.work_rank! : a.rank);
  const group = groups.find((g) => g.pool === pool) ?? groups[0];
  const activeId = group?.rows.find((a) => usable(a, group.pool))?.id;
  const selectedAccount = group?.rows.find((a) => a.id === selected[group.pool])
    ?? group?.rows.find((a) => a.id === activeId) ?? group?.rows[0];

  // 켜진 계정이 있는데 전부 사용량 한도(쿨다운·100%)에 걸린 경우만 한도 화면으로 본다. 꺼짐·로그인 필요는 한도가 아니다.
  const allLimited = groups.length > 0 && groups.every((g) => {
    const on = g.rows.filter((a) => (g.pool === "work" ? a.work_enabled : a.enabled));
    return on.length > 0 && on.every((a) => a.cooldown_seconds > 0 || usageWindows(a).some((w) => w.percent >= 100));
  });
  const onCount = rows.filter((a) => a.enabled).length;
  const workOnCount = rows.filter((a) => a.work_rank != null && a.work_enabled).length;

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % USAGE_TABS.length
      : event.key === "ArrowLeft"
        ? (currentIndex + USAGE_TABS.length - 1) % USAGE_TABS.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? USAGE_TABS.length - 1
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(USAGE_TABS[nextIndex].id);
    const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[nextIndex];
    target?.focus();
  };

  return (
    <Dialog size="lg" open={open} onClose={onClose} title="사용량" id="account-usage">
      <div className="usage">
        <div className="usage__tabs-wrap">
          <div className="tk-tablist usage__tabs" role="tablist" aria-label="사용량 부문">
            {USAGE_TABS.map((t, idx) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                className="tk-tab"
                id={`usage-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`usage-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => selectTab(t.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="usage__bar">
            <p className="usage__meta">
              {q.isFetching || qwen.isFetching || flash.isFetching ? "불러오는 중" : q.dataUpdatedAt ? `${ago(Math.round(q.dataUpdatedAt / 1000), now)} 갱신` : ""}
            </p>
            <button
              className="tk-icon-button tk-icon-button--sm"
              type="button"
              aria-label="새로 고침"
              aria-busy={q.isFetching || qwen.isFetching || flash.isFetching || undefined}
              onClick={() => {
                if (refresh) void q.refetch();
                else setRefresh(true);
                void qwen.refetch();
                void flash.refetch();
              }}
            >
              <Icon name="retry" />
            </button>
          </div>
        </div>

        <section
          role="tabpanel"
          id="usage-panel-accounts"
          aria-labelledby="usage-tab-accounts"
          data-active={tab === "accounts"}
          tabIndex={0}
        >
          {allLimited && (
            <div className="tk-empty" role="status">
              <Art name="state-usage-limit" size="sm" />
              <p className="tk-empty__title">켜진 계정이 모두 한도에 걸렸어요</p>
              <p>한도가 풀리는 계정부터 이어서 진행해요. 아래에서 풀리는 시각을 볼 수 있어요.</p>
            </div>
          )}
          {q.isPending && <p className="usage__note" role="status">사용량을 불러오는 중이에요.</p>}
          {q.isError && <p className="tk-error" role="alert">{errorText(q.error).message}</p>}
          {!q.isPending && !q.isError && !rows.length && <p className="usage__note">등록된 계정이 없어요. 계정 관리에서 추가해 주세요.</p>}

          {group && <>
            <div className="usage__pools" role="group" aria-label="계정 모드">
              {groups.map((g) => (
                <button key={g.pool} type="button" className="tk-button tk-button--secondary tk-button--sm"
                  aria-pressed={group.pool === g.pool} onClick={() => setPool(g.pool)}>
                  {g.title} {g.rows.length}개
                </button>
              ))}
            </div>
            <div className="usage__explorer">
              <nav className="usage-accounts" aria-label={`${group.title} 선택`}>
                <p className="usage-accounts__hint">계정을 골라 상세 보기</p>
                <ol className="usage-accounts__list">
                  {group.rows.map((a) => {
                    const st = statusOf(a, activeId === a.id, group.pool);
                    return <li key={a.id}>
                      <button type="button" className="usage-account" title={`${a.name} · ${st.text}`}
                        aria-label={`${a.name} · ${ENGINE[a.engine] ?? a.engine} · ${st.text}`}
                        aria-pressed={selectedAccount?.id === a.id}
                        aria-controls="usage-account-detail"
                        onClick={() => setSelected((prev) => ({ ...prev, [group.pool]: a.id }))}>
                        <span className="usage-account__top"><span className="usage-card__rank">{rankOf(a, group.pool)}</span><EngineBadge engine={a.engine} /></span>
                        <span className="usage-account__name">{a.name}</span>
                      </button>
                    </li>;
                  })}
                </ol>
              </nav>
              {selectedAccount && (() => {
                const a = selectedAccount;
                const on = group.pool === "work" ? a.work_enabled : a.enabled;
                const st = statusOf(a, activeId === a.id, group.pool);
                return <section key={a.id} id="usage-account-detail" className="usage-card usage-card--detail"
                  aria-label={`${a.name} 사용량 상세`} data-off={!on || undefined}>
                  <div className="usage-card__identity"><EngineBadge engine={a.engine} /><span>{group.title} · {rankOf(a, group.pool)}순위</span></div>
                  <div className="usage-card__head">
                    <span className="usage-card__title">
                      <span className="usage-card__name">{a.name}</span>
                      <span className="usage-card__sub">{ENGINE[a.engine] ?? a.engine}{a.plan ? ` · ${a.plan}` : ""}</span>
                    </span>
                  </div>
                  <div className="usage-card__status">
                    <span className={st.tone === "neutral" ? "tk-badge" : `tk-badge tk-badge--${st.tone}`}>{st.text}</span>
                    {a.engine === "muse" && a.execution_enabled === false && <span className="tk-badge">실행 검증 전</span>}
                    {a.engine === "muse" && a.login === "ok" && <span className="tk-badge tk-badge--success">로그인 확인</span>}
                  </div>
                  {a.windows.length > 0 ? (
                    <div className="usage-card__windows">
                      {a.engine === "antigravity"
                        ? <p className="usage__note">모델 그룹 quota · 각 그룹이 별도 한도를 공유해요.</p>
                        : <p className="usage__note">계정 상한 {a.max_used_percent}% · 상한까지 여유 {a.remaining_to_limit_percent == null ? "측정 대기" : `${a.remaining_to_limit_percent}%`}</p>}
                      {a.windows.map((w) => <WindowRow key={w.key} w={w} now={now} remaining={a.engine === "antigravity"} />)}
                    </div>
                  ) : <p className="usage__note">{a.error ?? "아직 사용량 기록이 없어요."}</p>}
                  {a.engine === "antigravity" && <p className="usage__note">AI 크레딧 잔액: {a.credits_balance == null ? (a.credits_error ?? (a.error ? "조회 실패" : "미측정")) : `${a.credits_balance} 크레딧`}</p>}
                  {a.engine === "codex" && a.reset_credits && <ResetRow account={a} now={now} onDone={() => void q.refetch()} />}
                  {a.windows.length > 0 && <p className="usage-card__foot">
                    {a.source ? (a.source === "api" ? (a.engine === "codex" ? "ChatGPT 사용량 기준" : "Claude 구독 사용량 기준") : SOURCE[a.source]) : ""}
                    {a.updated_at ? ` · ${ago(a.updated_at, now)}` : ""}
                  </p>}
                </section>;
              })()}
            </div>
          </>}
          <p className="usage__note">
            순서와 켜기는 <Link to="/settings#accounts" onClick={onClose}>계정 관리</Link>에서 바꿔요. 한도에 걸린 계정은 자동으로 건너뛰어요.
            {rows.length > 0 ? ` · 켜진 계정 개인 ${onCount}개${workOnCount || groups.length > 1 ? ` · 회사 ${workOnCount}개` : ""}` : ""}
          </p>
        </section>

        <section
          role="tabpanel"
          id="usage-panel-flash"
          aria-labelledby="usage-tab-flash"
          data-active={tab === "flash"}
          tabIndex={0}
        >
          <section className="usage-card qwen-usage" aria-label="Qwen Flash Next 사용량">
            <div className="usage-card__head">
              <span className="usage-card__title">
                <span className="usage-card__name">Qwen Flash Next</span>
                <span className="usage-card__sub">{flash.data?.model ?? "Qwen3.8-Flash-Next Q2_K"} · 별도 로컬 하네스</span>
              </span>
              {flash.data?.server && <span className={`tk-badge${flash.data.server.status === "model_mismatch" ? " tk-badge--warning" : ""}`}>
                {{ running: "실행 중", starting: "시작 중", unavailable: "서버 미연결", model_mismatch: "모델 확인 필요" }[flash.data.server.status]}
              </span>}
            </div>
            {flash.isPending && <p className="usage__note" role="status">Flash Next 사용량을 불러오는 중이에요.</p>}
            {flash.isError && <p className="tk-error" role="alert">Flash Next 사용량을 불러오지 못했어요.{flash.data ? " 마지막 측정값을 표시합니다." : ""}</p>}
            {flash.data && <>
              {flash.data.today && flash.data.week ? (
                <>
                  <div className="qwen-usage__periods">
                    <FlashPeriod title="오늘" period={flash.data.today} now={now} hasHistory={Boolean(flash.data.collection_started_at)} />
                    <FlashPeriod title="이번 주" period={flash.data.week} now={now} hasHistory={Boolean(flash.data.collection_started_at)} />
                  </div>
                  <p className="usage__note">처리 중 {flash.data.requests_processing ?? "—"}건 · 대기 {flash.data.requests_deferred ?? "—"}건</p>
                  {flash.data.server?.status === "model_mismatch" && <p className="usage__note">연결된 서버의 모델이 Flash Next와 달라 사용량을 표시하지 않아요.</p>}
                  {flash.data.metrics_status !== "available" && <p className="usage__note">일부 계측값을 읽지 못했어요. 미확인 값은 —로 표시합니다.</p>}
                  <p className="usage-card__foot">
                    {flash.data.collection_started_at
                      ? `오늘 00:00부터 · 이번 주 월요일 00:00부터 KST · 영속 집계(서버 재시작 후에도 유지) · 수집 시작 ${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(flash.data.collection_started_at))} KST`
                      : "오늘 00:00부터 · 이번 주 월요일 00:00부터 KST · 영속 집계(서버 재시작 후에도 유지) · 이력 없음"}
                  </p>
                  <p className="usage__note">{new Date(flash.data.observed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" })} KST 측정 · 30초마다 갱신 · 입력은 캐시 제외 처리 토큰입니다.</p>
                </>
              ) : (
                <>
                  <div className="qwen-usage__numbers">
                    <span>입력 토큰<b>{flash.data.input_tokens?.toLocaleString("ko-KR") ?? "—"}</b></span>
                    <span>캐시 재사용 토큰<b>{flash.data.cached_input_tokens?.toLocaleString("ko-KR") ?? "—"}</b></span>
                    <span>출력 토큰<b>{flash.data.output_tokens?.toLocaleString("ko-KR") ?? "—"}</b></span>
                  </div>
                  <p className="usage__note">처리 중 {flash.data.requests_processing ?? "—"}건 · 대기 {flash.data.requests_deferred ?? "—"}건</p>
                  {flash.data.server?.status === "model_mismatch" && <p className="usage__note">연결된 서버의 모델이 Flash Next와 달라 사용량을 표시하지 않아요.</p>}
                  {flash.data.metrics_status !== "available" && <p className="usage__note">일부 계측값을 읽지 못했어요. 미확인 값은 —로 표시합니다.</p>}
                  <p className="usage-card__foot">현재 서버 실행 누적 · 서버를 재시작하면 초기화돼요. 해당 서버를 쓰는 모든 요청을 포함하며 접수 사용량과 별도로 집계합니다. 입력은 캐시 제외 처리 토큰입니다.</p>
                  <p className="usage__note">{new Date(flash.data.observed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" })} KST 측정 · 30초마다 갱신</p>
                </>
              )}
            </>}
          </section>
        </section>

        <section
          role="tabpanel"
          id="usage-panel-intake"
          aria-labelledby="usage-tab-intake"
          data-active={tab === "intake"}
          tabIndex={0}
        >
          <section className="usage-card qwen-usage" aria-label="Qwen 로컬 모델 토큰 사용량">
            <div className="usage-card__head">
              <span className="usage-card__title">
                <span className="usage-card__name">Qwen 접수 · 경량 모델</span>
                <span className="usage-card__sub">Qwen3.5-4B · 실제 응답 토큰 · 운영 접수만</span>
              </span>
              {qwen.data?.server.enabled === false && <span className="tk-badge">사용 중지</span>}
              {qwen.data?.server.enabled && qwen.data.server.status === "not_started" && <span className="tk-badge">요청 시 기동</span>}
              {qwen.data?.server.enabled && ["unavailable", "starting"].includes(qwen.data.server.status) && <span className="tk-badge tk-badge--warning">{qwen.data.server.status === "starting" ? "시작 중" : "서버 확인 필요"}</span>}
            </div>
            {qwen.isPending && <p className="usage__note">Qwen 사용량을 불러오는 중이에요.</p>}
            {qwen.isError && <p className="tk-error" role="alert">{errorText(qwen.error).message}</p>}
            {qwen.data?.server.enabled === false && <p className="usage__note">Qwen 접수가 사용 중지되어 있어요.</p>}
            {qwen.data && qwen.data.server.enabled && <>
              <div className="qwen-usage__periods">
                <QwenPeriod title="오늘" period={qwen.data.today} now={now} hasHistory={Boolean(qwen.data.collection_started_at)} />
                <QwenPeriod title="이번 주" period={qwen.data.week} now={now} hasHistory={Boolean(qwen.data.collection_started_at)} />
              </div>
              <p className="usage-card__foot">
                {qwen.data.collection_started_at
                  ? `오늘 00:00부터 · 이번 주 월요일 00:00부터 KST · 수집 시작 ${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(qwen.data.collection_started_at))} KST · 토큰 누락 오늘 ${qwen.data.today.usage_missing_calls}회 / 실패 ${qwen.data.today.failed_calls}회 · 이번 주 누락 ${qwen.data.week.usage_missing_calls}회 / 실패 ${qwen.data.week.failed_calls}회`
                  : "이력 없음 · 토큰 수집 시작 후부터 집계돼요."}
              </p>
              {qwen.data.server.detail && <p className="usage__note">서버 상태: {qwen.data.server.detail}</p>}
            </>}
          </section>
        </section>
      </div>
    </Dialog>
  );
}

function FlashPeriod({ title, period, now, hasHistory }: { title: string; period: QwenFlashPeriod; now: number; hasHistory: boolean }) {
  const fmt = new Intl.NumberFormat("ko-KR");
  const range = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const last = period.last_used_at ? `마지막 측정 ${ago(Date.parse(period.last_used_at) / 1000, now)}` : "측정 없음";
  return (
    <div className="qwen-usage__period">
      <div className="qwen-usage__heading">
        <strong>{title}</strong>
        <span>{range.format(new Date(period.starts_at))}–현재 KST</span>
      </div>
      <div className="qwen-usage__numbers--4">
        <span><b>{hasHistory ? fmt.format(period.input_tokens) : "—"}</b> 입력</span>
        <span><b>{hasHistory ? fmt.format(period.cached_input_tokens) : "—"}</b> 캐시 재사용</span>
        <span><b>{hasHistory ? fmt.format(period.output_tokens) : "—"}</b> 출력</span>
        <span><b>{hasHistory ? fmt.format(period.total_tokens) : "—"}</b> 합계</span>
      </div>
      <p className="usage__note">{hasHistory ? `${last}` : "아직 수집한 사용량이 없어요."}</p>
    </div>
  );
}

function QwenPeriod({ title, period, now, hasHistory }: { title: string; period: QwenUsagePeriod; now: number; hasHistory: boolean }) {
  const fmt = new Intl.NumberFormat("ko-KR");
  const range = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const last = period.last_used_at ? `마지막 호출 ${ago(Date.parse(period.last_used_at) / 1000, now)}` : "호출 없음";
  const showTokens = hasHistory && (period.calls === 0 || period.metered_calls > 0);
  return (
    <div className="qwen-usage__period">
      <div className="qwen-usage__heading">
        <strong>{title}</strong>
        <span>{range.format(new Date(period.starts_at))}–현재 KST</span>
      </div>
      <div className="qwen-usage__numbers">
        <span><b>{showTokens ? fmt.format(period.input_tokens) : "—"}</b> 입력</span>
        <span><b>{showTokens ? fmt.format(period.output_tokens) : "—"}</b> 출력</span>
        <span><b>{showTokens ? fmt.format(period.total_tokens) : "—"}</b> 합계</span>
      </div>
      <p className="usage__note">{hasHistory ? `${fmt.format(period.calls)}회 호출 · ${last}` : "아직 수집한 사용량이 없어요."}</p>
    </div>
  );
}

function WindowRow({ w, now, remaining = false }: { w: UsageWindow; now: number; remaining?: boolean }) {
  const lv = level(w.percent);
  const reset = resetText(w.resets_at, now);
  return (
    <div className="usage-win" data-level={lv}>
      <div className="usage-win__top">
        <span className="usage-win__label">{w.label}</span>
        <span className="usage-win__pct">{remaining ? `${w.remaining_percent?.toFixed(1) ?? 100 - w.percent}% 남음` : `${w.percent}%`}</span>
      </div>
      <span
        className={`tk-progress tk-progress--lg${lv === "danger" ? " tk-progress--danger" : lv === "warn" ? " tk-progress--warning" : ""}`}
        role="progressbar"
        aria-label={`${w.label} ${remaining ? "사용량" : "사용량"}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, w.percent))}
        style={{ "--tk-progress": Math.min(1, Math.max(0, w.percent / 100)) } as React.CSSProperties}
      />
      {reset && <span className="usage-win__reset">{reset}</span>}
    </div>
  );
}

function ResetRow({ account, now, onDone }: { account: AccountUsage; now: number; onDone: () => void }) {
  const credits = account.reset_credits;
  const reset = useMutation({
    mutationFn: () => codexReset(account.id),
    onSuccess: (data) => {
      toast({ message: data.message, tone: data.outcome === "reset" ? "success" : "neutral" });
      onDone();
    },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  if (!credits) return null;
  const expire = resetText(credits.next_expires_at, now);
  return (
    <div className="usage-reset" data-empty={credits.available === 0 || undefined}>
      <div className="usage-reset__body">
        <span className="usage-reset__title">ChatGPT 재설정 크레딧 {credits.available}개</span>
        <span className="usage-reset__sub">{credits.available > 0 ? (expire ? `${expire} 소멸` : "보유 중") : "남은 크레딧 없음"}</span>
      </div>
      <button
        className="tk-button tk-button--secondary tk-button--sm"
        type="button"
        disabled={credits.available === 0 || reset.isPending}
        onClick={() => reset.mutate()}
      >
        한도 재설정
      </button>
    </div>
  );
}
