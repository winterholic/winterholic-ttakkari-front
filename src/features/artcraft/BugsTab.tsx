import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listArtcraftBugs, setArtcraftBug } from "../../api/client";
import type { ArtcraftBug, ArtcraftBugStatus } from "../../api/artcraftTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/toastStore";
import { AppMarkdown } from "../markdown/AppMarkdown";
import { errorText } from "../viewer/api";
import { ErrorState, ListSkeleton } from "../viewer/screenStates";
import {
  BUG_DIFFICULTY_LABEL, BUG_FLOW, BUG_KIND_LABEL, BUG_NEXT, BUG_SECTIONS, BUG_STATUSES, BUG_STATUS_LABEL, BUG_UPSTREAM_LABEL, copyText, when,
} from "./format";

type Severity = "all" | "S1" | "S2" | "S3";
const SEVERITY_TONE = { S1: "danger", S2: "warning", S3: undefined } as const;
const SEVERITY_HELP = "S1 에이전트 사용을 막음 · S2 사용성 저하 · S3 다듬기";
const HANDOFF_STATES: ArtcraftBugStatus[] = ["selected", "in_progress", "reported"];
const UPSTREAM_TONE = { unchecked: undefined, none: "success", related: "warning", duplicate: "danger" } as const;

const kindTone = (kind: ArtcraftBug["kind"]) => (kind === "security" ? "danger" : kind === "pr" ? "success" : undefined);
const statusTone = (s: ArtcraftBugStatus) => (s === "resolved" ? "success" : s === "candidate" || s === "excluded" || s === "deferred" ? undefined : "info");
const appsText = (apps: string[]) => (apps.length > 3 ? `${apps.slice(0, 3).join(", ")} 외 ${apps.length - 3}개` : apps.join(", "));

function Flow({ status }: { status: ArtcraftBugStatus }) {
  const side = status === "deferred" || status === "excluded";
  const at = BUG_FLOW.indexOf(status);
  return (
    <div className="ac-flow-wrap">
      <ol className="ac-flow" aria-label="진행 단계">
        {BUG_FLOW.map((s, i) => (
          <li key={s} aria-current={s === status ? "step" : undefined} data-done={!side && i < at ? "true" : undefined}>{BUG_STATUS_LABEL[s]}</li>
        ))}
      </ol>
      {side && <Badge>{BUG_STATUS_LABEL[status]}</Badge>}
    </div>
  );
}

function Handoff({ bug }: { bug: ArtcraftBug }) {
  return (
    <div className="ac-handoff">
      <h4 className="ac-sec__title">에이전트에게 넘길 요청 문구</h4>
      {bug.kind === "security" && (
        <aside className="tk-callout tk-callout--warning" role="note">
          <Icon name="shield-alert" className="tk-callout__icon" />
          <div className="tk-callout__body">
            <strong className="tk-callout__title">보안 후보예요</strong>
            <p>공개 이슈나 PR 로 올리지 마세요. 저장소의 SECURITY.md 가 안내하는 비공개 채널로만 신고해요.</p>
          </div>
        </aside>
      )}
      <p className="ac-note">이 문구를 에이전트에게 붙여 넣으면 로컬에서 초안만 준비해요. GitHub 에 올리는 일은 이 화면에도 에이전트에도 자동으로 없고, 초안을 확인하고 직접 시킬 때만 해요.</p>
      <pre className="ac-pre" tabIndex={0}>{bug.handoff}</pre>
      <Button size="sm" onClick={() => copyText(bug.handoff, "요청 문구")}><Icon name="copy" />요청 문구 복사</Button>
    </div>
  );
}

function Detail({ bug }: { bug: ArtcraftBug }) {
  const qc = useQueryClient();
  const [note, setNote] = useState(bug.note);
  const [url, setUrl] = useState(bug.url);
  const statusId = useId();
  const save = useMutation({
    mutationFn: (v: { status: ArtcraftBugStatus; note: string; url: string }) => setArtcraftBug(bug.id, v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["artcraft"] }),
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const move = (status: ArtcraftBugStatus) => save.mutate({ status, note: note.trim(), url: url.trim() });
  const dirty = note.trim() !== bug.note || url.trim() !== bug.url;
  const next = BUG_NEXT[bug.status];
  const showUrl = bug.status === "in_progress" || bug.status === "reported" || bug.status === "resolved" || Boolean(bug.url);
  return (
    <div className="ac-bug__body">
      {bug.problems.length > 0 && (
        <aside className="tk-callout tk-callout--warning" role="note">
          <Icon name="warning" className="tk-callout__icon" />
          <div className="tk-callout__body">
            <strong className="tk-callout__title">BUGS.md 형식이 어긋났어요</strong>
            <ul className="ac-problems">{bug.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        </aside>
      )}
      <dl className="ac-dl">
        <dt>앱</dt><dd>{bug.apps.join(", ") || "-"}</dd>
        <dt>저장소</dt>
        <dd>{bug.repos.length ? bug.repos.map((r) => <a key={r} className="ac-mono" href={`https://github.com/${r}`} target="_blank" rel="noopener noreferrer">{r}</a>) : "-"}</dd>
        <dt>심각도</dt><dd>{bug.severity ? <Badge tone={SEVERITY_TONE[bug.severity]}>{bug.severity}</Badge> : "-"}</dd>
        <dt>종류</dt><dd>{bug.kind ? <Badge tone={kindTone(bug.kind)}>{BUG_KIND_LABEL[bug.kind]}</Badge> : "-"}</dd>
        <dt>난이도</dt><dd>{bug.difficulty ? BUG_DIFFICULTY_LABEL[bug.difficulty] : "-"}<span className="ac-sub">에이전트 추정</span></dd>
        <dt>업스트림</dt>
        <dd><Badge tone={UPSTREAM_TONE[bug.upstream.state]}>{BUG_UPSTREAM_LABEL[bug.upstream.state]}</Badge>{bug.upstream.note && <span className="ac-sub">{bug.upstream.note}</span>}</dd>
        <dt>발견·검증</dt><dd>{bug.found ?? "-"} · {bug.verified || "-"}</dd>
      </dl>
      {BUG_SECTIONS.map(({ key, label, open }) => {
        const text = bug.sections[key];
        if (!text) return null;
        return (
          <details key={key} className="ac-sec" open={open}>
            <summary className="ac-sec__title">{label}</summary>
            <div className="tk-prose ac-md"><AppMarkdown>{text}</AppMarkdown></div>
            {bug.truncated.includes(key) && <p className="ac-note">내용이 길어 앞부분만 보여 줘요. 전체는 BUGS.md 를 보세요.</p>}
          </details>
        );
      })}
      <div className="ac-sec">
        <h4 className="ac-sec__title">상태</h4>
        <Flow status={bug.status} />
        <div className="ac-actions">
          {next && <Button size="sm" busy={save.isPending} onClick={() => move(next.to)}>{next.label}</Button>}
          {(bug.status === "deferred" || bug.status === "excluded" || bug.status === "resolved") && (
            <Button size="sm" variant="ghost" busy={save.isPending} onClick={() => move("candidate")}>후보로 되돌리기</Button>
          )}
          {BUG_FLOW.slice(0, 4).includes(bug.status) && (
            <>
              <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => move("deferred")}>보류</Button>
              <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => move("excluded")}>제외</Button>
            </>
          )}
        </div>
        <div className="tk-field">
          <label className="tk-label" id={`${statusId}-label`} htmlFor={statusId}>상태 직접 바꾸기</label>
          <Select id={statusId} labelledBy={`${statusId}-label`} value={bug.status} disabled={save.isPending}
            options={BUG_STATUSES.map((s) => ({ value: s, label: BUG_STATUS_LABEL[s] }))} onChange={(s) => move(s)} />
        </div>
        {bug.updated_at && <p className="ac-note">마지막 변경 {when(bug.updated_at)}{bug.history.length > 1 ? ` · 이력 ${bug.history.length}건` : ""}</p>}
      </div>
      {HANDOFF_STATES.includes(bug.status) && <Handoff bug={bug} />}
      {showUrl && (
        <label className="tk-field">
          <span className="tk-label">올린 이슈·PR 링크(https://github.com/…)</span>
          <input className="tk-input" type="url" inputMode="url" maxLength={300} placeholder="https://github.com/storytold/…/issues/1" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
      )}
      <label className="tk-field">
        <span className="tk-label">메모</span>
        <textarea className="tk-textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="ac-actions">
        <Button size="sm" disabled={!dirty} busy={save.isPending} onClick={() => move(bug.status)}>링크·메모 저장</Button>
      </div>
    </div>
  );
}

function BugCard({ bug, open, onToggle }: { bug: ArtcraftBug; open: boolean; onToggle: () => void }) {
  return (
    <li className="ac-card ac-bug" id={`bug-${bug.id}`} data-status={bug.status}>
      <button type="button" className="ac-bug__head" aria-expanded={open} onClick={onToggle}>
        <span className="ac-bug__title">{bug.title}</span>
        <span className="ac-bug__meta">
          <span className="ac-mono">{bug.id}</span>
          {bug.severity && <Badge tone={SEVERITY_TONE[bug.severity]}>{bug.severity}</Badge>}
          {bug.kind && <Badge tone={kindTone(bug.kind)}>{BUG_KIND_LABEL[bug.kind]}</Badge>}
          <Badge tone={statusTone(bug.status)}>{BUG_STATUS_LABEL[bug.status]}</Badge>
          {bug.problems.length > 0 && <Badge tone="warning">형식 확인</Badge>}
        </span>
        <span className="ac-bug__summary">{appsText(bug.apps)}</span>
      </button>
      {/* key 가 바뀌면 입력 중이던 메모·링크를 서버 값으로 다시 맞춘다 */}
      {open && <Detail key={`${bug.id}:${bug.updated_at}`} bug={bug} />}
    </li>
  );
}

export function BugsTab({ focus }: { focus?: string | null }) {
  const [status, setStatus] = useState<ArtcraftBugStatus | "all">("all");
  const [severity, setSeverity] = useState<Severity>("all");
  const [app, setApp] = useState("all");
  const [openId, setOpenId] = useState<string | null>(focus ?? null);
  const appId = useId();
  const query = useQuery({ queryKey: ["artcraft", "bugs"], queryFn: listArtcraftBugs });
  if (query.isPending) return <ListSkeleton label="버그 후보를 불러오는 중" />;
  if (query.isError) return <ErrorState what="버그 후보" error={query.error} onRetry={() => void query.refetch()} />;
  const { bugs, counts, apps, problems } = query.data;
  // 프런트가 백엔드보다 먼저 배포된 짧은 사이에는 예전 응답(sections 없음)이 온다. 깨지지 않게 안내만 보인다.
  if (bugs.some((b) => !b.sections || !Array.isArray(b.apps))) {
    return (
      <div className="tk-empty tk-empty--boxed" role="status">
        <Icon name="clock" />
        <p>백엔드가 새 버전으로 바뀌는 중이에요. 잠시 뒤 다시 열어 주세요.</p>
        <div className="tk-button-group"><Button size="sm" onClick={() => void query.refetch()}>다시 불러오기</Button></div>
      </div>
    );
  }
  const shown = bugs.filter((b) => (status === "all" || b.status === status) && (severity === "all" || b.severity === severity) && (app === "all" || b.apps.includes(app)));
  return (
    <section className="ac-stack" aria-label="버그 후보">
      <p className="ac-note">
        에이전트가 찾은 후보는 BUGS.md 에 기록만 해요. 업스트림 기여로 진행할 것만 여기서 직접 골라요.
        이 화면은 GitHub 에 아무것도 올리지 않아요. {SEVERITY_HELP}.
      </p>
      {problems > 0 && <p className="tk-error" role="status">BUGS.md 형식이 어긋난 항목이 {problems}개 있어요. 해당 항목의 안내를 확인하세요.</p>}
      <div className="ac-pills" role="group" aria-label="상태 필터">
        <button type="button" aria-pressed={status === "all"} onClick={() => setStatus("all")}>전체 {bugs.length}</button>
        {BUG_STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{BUG_STATUS_LABEL[s]} {counts[s]}</button>
        ))}
      </div>
      <div className="ac-filters">
        <div className="ac-pills" role="group" aria-label="심각도 필터">
          {(["all", "S1", "S2", "S3"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={severity === s} onClick={() => setSeverity(s)}>{s === "all" ? "모든 심각도" : s}</button>
          ))}
        </div>
        <div className="tk-field">
          <label className="tk-label" id={`${appId}-label`} htmlFor={appId}>앱</label>
          <Select id={appId} labelledBy={`${appId}-label`} value={app} onChange={setApp}
            options={[{ value: "all", label: "모든 앱" }, ...apps.map((a) => ({ value: a, label: a }))]} />
        </div>
      </div>
      {shown.length === 0 && (
        <div className="tk-empty tk-empty--boxed"><Icon name="circle-check" /><p>조건에 맞는 항목이 없어요.</p></div>
      )}
      <ul className="ac-list">
        {shown.map((b) => <BugCard key={b.id} bug={b} open={openId === b.id} onToggle={() => setOpenId(openId === b.id ? null : b.id)} />)}
      </ul>
    </section>
  );
}
