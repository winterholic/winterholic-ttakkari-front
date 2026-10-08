import { useEffect, useRef, useState } from "react";
import { Icon } from "../../ui/Icon";
import type { RunOut } from "../../api/types";
import { STATUS_LABEL, formatElapsed } from "./runView";
import type { LogLine, RunView, StepView, UiRunState } from "./runView";

const VISIBLE_STEPS = 6;

export function StateBadge({ state, label }: { state: UiRunState; label: string }) {
  const icon = { queued: "clock", waiting: "hand", succeeded: "check", failed: "circle-x", cancelled: "ban" } as const;
  return (
    <span className="tk-badge" data-state={state}>
      {state === "running" ? <span className="tk-dot tk-dot--live" aria-hidden /> : <Icon name={icon[state]} />}
      {label}
    </span>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Step({ s, now }: { s: StepView; now: number }) {
  const icon = { succeeded: "circle-check", failed: "circle-x", cancelled: "ban", waiting: "hand", queued: "clock" } as const;
  return (
    <li data-state={s.state}>
      {s.state === "running" ? <span className="tk-spinner tk-spinner--sm" aria-hidden /> : <Icon name={icon[s.state]} />}
      <span className="tk-step__name">
        {s.name}
        {s.target && <span className="tk-step__target">{s.target}</span>}
        {s.detail && <span className="tk-step__detail">{s.detail}</span>}
      </span>
      <span className="tk-step__time">{formatElapsed(s.startedAt, s.endedAt ?? null, now)}</span>
    </li>
  );
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour12: false });
}

function Log({ lines, live }: { lines: LogLine[]; live: boolean }) {
  const [follow, setFollow] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (follow && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [lines.length, follow]);
  const copy = () => void navigator.clipboard?.writeText(lines.map((l) => `${clock(l.at)} ${l.level} ${l.text}`).join("\n"));
  return (
    <div className="tk-log">
      <div className="tk-log__header">
        {live && <span className="tk-dot tk-dot--live" aria-hidden />}
        <span className="tk-log__title">실행 로그</span>
        <div className="tk-button-group">
          <button className="tk-icon-button tk-icon-button--xs" type="button" aria-label="로그 따라가기" aria-pressed={follow} onClick={() => setFollow((f) => !f)}>
            <Icon name="follow" />
          </button>
          <button className="tk-icon-button tk-icon-button--xs" type="button" aria-label="로그 복사" onClick={copy}>
            <Icon name="copy" />
          </button>
        </div>
      </div>
      <div
        className="tk-log__body"
        tabIndex={0}
        role="region"
        aria-label="실행 로그"
        ref={body}
        onWheel={(e) => e.deltaY < 0 && setFollow(false)}
      >
        <ol className="tk-log__lines">
          {lines.map((l, i) => (
            <li key={l.seq} data-level={l.level} data-live={live && i === lines.length - 1 ? "" : undefined}>
              <span className="tk-log__time">{clock(l.at)}</span>
              <span className="tk-log__level">{l.level}</span>
              <span className="tk-log__msg">{l.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function RunCard({ run, view, onStop, onRetry }: { run: RunOut; view: RunView; onStop?: () => void; onRetry?: () => void }) {
  const live = view.state === "running" || view.state === "queued";
  const now = useNow(live);
  const [showAll, setShowAll] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const title = run.prompt.split("\n")[0].slice(0, 60);
  const writes = view.steps.filter((s) => s.name.startsWith("파일 쓰기") || s.name.startsWith("파일 고치기")).length;
  const steps = live && !showAll ? view.steps.slice(-VISIBLE_STEPS) : view.steps;
  const hidden = view.steps.length - steps.length;

  const meta = (
    <p className="tk-run__meta">
      <span className="tk-run__elapsed">{formatElapsed(run.started_at ?? run.created_at, run.finished_at, now)}</span>
      {view.steps.length > 0 && <span>단계 {view.steps.length}개</span>}
      {writes > 0 && <span>파일 {writes}번 수정</span>}
      {view.artifacts.length > 0 && <span>결과물 {view.artifacts.length}</span>}
      {view.costUsd != null && <span>${view.costUsd.toFixed(3)}</span>}
    </p>
  );

  const stepList = view.steps.length > 0 && (
    <>
      {hidden > 0 && (
        <button className="tk-button tk-button--sm tk-button--ghost" type="button" onClick={() => setShowAll(true)}>
          이전 단계 {hidden}개 더 보기
        </button>
      )}
      <ol className="tk-steps">
        {steps.map((s) => (
          <Step key={s.id} s={s} now={now} />
        ))}
      </ol>
    </>
  );

  return (
    <div className="tk-run" data-state={view.state}>
      <div className="tk-run__head">
        <p className="tk-run__title">{title}</p>
        <StateBadge state={view.state} label={STATUS_LABEL[view.status]} />
      </div>
      {meta}
      {(view.status === "failed" || view.status === "interrupted") && view.error && (
        <p className="tk-run__summary">{view.status === "interrupted" ? "서버가 다시 시작돼서 멈췄어요. 같은 세션에서 이어서 지시하면 돼요." : view.error.slice(0, 300)}</p>
      )}
      {view.blockedCount > 0 && <p className="tk-run__summary">보험 규칙이 위험한 작업 {view.blockedCount}건을 막았어요.</p>}
      {live ? (
        <>
          {stepList}
          {showLog && <Log lines={view.log} live />}
        </>
      ) : (
        view.steps.length + view.log.length > 0 && (
          <details className="tk-run__more" open={view.state === "failed" || undefined}>
            <summary>단계 {view.steps.length}개</summary>
            {stepList}
            <Log lines={view.log} live={false} />
          </details>
        )
      )}
      {view.diff && (view.diff.files.length > 0 || view.diff.new_files.length > 0) && (
        <details className="tk-run__more">
          <summary>
            바뀐 파일 {view.diff.files.length + view.diff.new_files.length}개
          </summary>
          <ul className="tk-steps">
            {view.diff.files.map((f) => (
              <li key={f.path} data-state="succeeded">
                <Icon name="file-code" />
                <span className="tk-step__name">
                  <span className="tk-step__target">{f.path}</span>
                </span>
                <span className="tk-step__time">
                  +{f.added ?? "?"} −{f.removed ?? "?"}
                </span>
              </li>
            ))}
            {view.diff.new_files.map((p) => (
              <li key={p} data-state="succeeded">
                <Icon name="file-text" />
                <span className="tk-step__name">
                  <span className="tk-step__target">{p}</span>
                </span>
                <span className="tk-step__time">새 파일</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(live || onRetry) && (
        <div className="tk-run__actions">
          {live && (
            <button className="tk-button tk-button--sm tk-button--ghost" type="button" aria-pressed={showLog} onClick={() => setShowLog((v) => !v)}>
              로그
            </button>
          )}
          {live && onStop && (
            <button className="tk-button tk-button--sm" type="button" onClick={onStop}>
              멈추기
            </button>
          )}
          {!live && onRetry && view.state === "failed" && (
            <button className="tk-button tk-button--sm" type="button" onClick={onRetry}>
              <Icon name="retry" />
              다시 시도
            </button>
          )}
        </div>
      )}
    </div>
  );
}
