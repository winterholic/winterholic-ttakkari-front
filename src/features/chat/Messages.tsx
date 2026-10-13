import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { downloadLink } from "../../api/client";
import type { ArtifactOut, RunOut } from "../../api/types";
import { Icon, KIND_GLYPH } from "../../ui/Icon";
import { SentAttachments } from "./Attachments";
import { RunCard, StateBadge } from "./RunCard";
import { formatBytes, isLive, stateLabel } from "./runView";
import type { RunView } from "./runView";

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toUpperCase() : "";
}

export function ArtifactCard({ a, onOpen, isNew }: { a: ArtifactOut; onOpen: (id: string) => void; isNew?: boolean }) {
  const g = KIND_GLYPH[a.kind] ?? KIND_GLYPH.other;
  async function download() {
    const link = await downloadLink(a.id);
    window.location.assign(link.url);
  }
  return (
    <div className="tk-artifact-card" data-new={isNew ? "" : undefined}>
      <a
        className="tk-artifact-card__open"
        href={`?artifact=${a.id}`}
        onClick={(e) => {
          e.preventDefault();
          onOpen(a.id);
        }}
      >
        <span className="tk-glyph tk-glyph--sm" data-type={g.type} data-new={isNew ? "" : undefined}>
          <Icon name={g.icon} />
        </span>
        <span className="tk-artifact-card__body">
          <span className="tk-artifact-card__name">{a.filename}</span>
          <span className="tk-artifact-card__meta">
            {ext(a.filename) && <span className="tk-ext">{ext(a.filename)}</span>}
            <span>{formatBytes(a.size_bytes)}</span>
            {a.source === "agent_modified" && <span>워크스페이스 수정</span>}
            {a.export_policy !== "allow" && <span>반출 차단</span>}
          </span>
        </span>
      </a>
      {a.downloadable && (
        <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label={`${a.filename} 다운로드`} onClick={() => void download()}>
          <Icon name="download" />
        </button>
      )}
    </div>
  );
}

/**
 * 결과 보고. 사용자 말풍선이 아니라 접힌 시스템 줄로 보인다.
 * 작업 보고: 작업 세션 → 오케스트레이터·기획 세션. 기획 보고: 기획 세션 → 접수 대화(ADR 0013), 내용은 아래 따까리 답으로 보인다.
 */
export function ReportMessage({ run }: { run: RunOut }) {
  const kind = run.prompt.startsWith("[기획 보고]") ? "기획 보고" : "작업 보고";
  const count = (run.prompt.match(/\[(작업|기획) 보고\]/g) ?? []).length;
  const titles = [...run.prompt.matchAll(/\[(?:작업|기획) 보고\] (?:작업|기획) 세션 '([^']*)'.*?(완료|실패|취소|중단)/g)].map((m) => `${m[1]} ${m[2]}`);
  return (
    <article className="report-message" data-author="system" aria-label={kind}>
      <details>
        <summary>
          <Icon name="workspace" />
          <span>
            {kind}
            {count > 1 ? ` ${count}건` : ""}
          </span>
          {titles.length > 0 && <span className="report-message__titles">{titles.join(" · ")}</span>}
          <span className="tk-message__time">{time(run.created_at)}</span>
        </summary>
        <pre className="report-message__body">{run.prompt}</pre>
      </details>
    </article>
  );
}

const FROM_LABEL: Partial<Record<RunOut["origin"], string>> = { orchestrator: "오케스트레이터 지시", desk: "접수에서 넘긴 요청" };

export function UserMessage({ run, onOpen }: { run: RunOut; onOpen: (id: string) => void }) {
  const from = FROM_LABEL[run.origin];
  return (
    <article className="tk-message tk-message--user" data-author="user" aria-label={from ?? "내 지시"}>
      {run.context_artifact_ids.length > 0 && <SentAttachments ids={run.context_artifact_ids} onOpen={onOpen} />}
      <div className="tk-message__body">{run.prompt}</div>
      <p className="tk-message__meta">
        {from && <span>{from} · </span>}
        <span className="tk-message__time">{time(run.created_at)}</span>
      </p>
    </article>
  );
}

export function AgentMessage({
  run,
  view,
  onOpen,
  onStop,
  onRetry,
  suggestions,
  onSuggest,
  footer,
}: {
  run: RunOut;
  view: RunView;
  onOpen: (id: string) => void;
  onStop?: () => void;
  onRetry?: () => void;
  suggestions?: { label: string; text: string }[];
  onSuggest?: (text: string) => void;
  /** 본문 맨 아래(제안 칩 다음). 접수 판정 칩 자리. */
  footer?: ReactNode;
}) {
  const live = isLive(view.state);
  const copy = () => view.text && void navigator.clipboard?.writeText(view.text);
  return (
    <article className="tk-message tk-message--agent" data-author="agent" aria-label="따까리의 응답" aria-busy={live || undefined}>
      <div className="tk-message__head">
        <span className="tk-avatar tk-avatar--agent tk-avatar--sm" aria-hidden />
        <span className="tk-message__name">따까리</span>
        {live && <StateBadge state={view.state} label={stateLabel(view)} />}
        <span className="tk-message__time">{time(run.finished_at ?? run.started_at ?? run.created_at)}</span>
      </div>
      <div className="tk-message__body">
        {view.text ? (
          <div className="tk-prose tk-prose--compact">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{view.text}</ReactMarkdown>
            {live && <span className="tk-caret" aria-hidden />}
          </div>
        ) : (
          live && (
            <p className="tk-thinking">
              <span className="tk-dot tk-dot--live" aria-hidden />
              {view.doing}
            </p>
          )
        )}
        <RunCard run={run} view={view} onStop={onStop} onRetry={onRetry} />
        {view.artifacts.length > 0 && (
          <div className="tk-artifacts">
            {view.artifacts.map((a) => (
              <ArtifactCard key={a.id} a={a} onOpen={onOpen} isNew={live} />
            ))}
          </div>
        )}
        {suggestions && suggestions.length > 0 && onSuggest && (
          <div className="tk-chips tk-suggestions" aria-label="후속 지시 제안">
            {suggestions.map((s) => (
              <button key={s.label} className="tk-chip" type="button" onClick={() => onSuggest(s.text)}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        {footer}
      </div>
      {!live && view.text && (
        <div className="tk-message__actions">
          <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="응답 복사" onClick={copy}>
            <Icon name="copy" />
          </button>
        </div>
      )}
    </article>
  );
}
