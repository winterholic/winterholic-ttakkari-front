import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listArtcraftBugs, setArtcraftBug } from "../../api/client";
import type { ArtcraftBug, ArtcraftBugStatus } from "../../api/artcraftTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { ErrorState, ListSkeleton } from "../viewer/screenStates";
import { BUG_STATUSES, BUG_STATUS_LABEL, when } from "./format";

const SEVERITY_TONE = { S1: "danger", S2: "warning", S3: undefined } as const;
const SEVERITY_HELP = "S1 에이전트 사용을 막음 · S2 사용성 저하 · S3 다듬기";
type Filter = ArtcraftBugStatus | "all";

function BugRow({ bug, open, onToggle }: { bug: ArtcraftBug; open: boolean; onToggle: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState(bug.note);
  const save = useMutation({
    mutationFn: (v: { status: ArtcraftBugStatus; note: string }) => setArtcraftBug(bug.id, v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["artcraft", "bugs"] }),
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const dirty = note.trim() !== bug.note;
  return (
    <li className="ac-card ac-bug" id={`bug-${bug.id}`} data-status={bug.status}>
      <button type="button" className="ac-bug__head" aria-expanded={open} onClick={onToggle}>
        <span className="ac-bug__title">{bug.title}</span>
        <span className="ac-bug__meta">
          <span className="ac-mono">{bug.id}</span>
          <Badge tone={bug.severity ? SEVERITY_TONE[bug.severity] : undefined}>{bug.severity ?? "-"}</Badge>
          <span>{bug.apps}</span>
          <Badge tone={bug.status === "resolved" ? "success" : bug.status === "reported" ? "info" : undefined}>{BUG_STATUS_LABEL[bug.status]}</Badge>
        </span>
        <span className="ac-bug__summary">{bug.summary}</span>
      </button>
      <div className="ac-seg" role="group" aria-label={`${bug.id} 상태`}>
        {BUG_STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={bug.status === s} disabled={save.isPending}
            onClick={() => bug.status !== s && save.mutate({ status: s, note: note.trim() })}>
            {BUG_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {open && (
        <div className="ac-bug__body">
          <p className="ac-note">검증: {bug.verified} · 이 목록은 BUGS.md 기준이고, 상태·메모는 따까리에만 저장돼요.</p>
          {bug.body ? <pre className="ac-pre" tabIndex={0}>{bug.body}</pre> : <p className="ac-note">상세 설명이 BUGS.md 에 없어요.</p>}
          {bug.truncated && <p className="ac-note">내용이 길어 앞부분만 보여 줘요. 전체는 BUGS.md 를 보세요.</p>}
          <label className="tk-field">
            <span className="tk-label">메모(업스트림 이슈 링크 등)</span>
            <textarea className="tk-textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="ac-actions">
            <Button size="sm" disabled={!dirty} busy={save.isPending} onClick={() => save.mutate({ status: bug.status, note: note.trim() })}>메모 저장</Button>
            {bug.updated_at && <span className="ac-note">상태 변경 {when(bug.updated_at)}</span>}
          </div>
        </div>
      )}
    </li>
  );
}

export function BugsTab({ focus }: { focus?: string | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(focus ?? null);
  const query = useQuery({ queryKey: ["artcraft", "bugs"], queryFn: listArtcraftBugs });
  if (query.isPending) return <ListSkeleton label="버그 후보를 불러오는 중" />;
  if (query.isError) return <ErrorState what="버그 후보" error={query.error} onRetry={() => void query.refetch()} />;
  const { bugs, counts } = query.data;
  const shown = filter === "all" ? bugs : bugs.filter((b) => b.status === filter);
  return (
    <section className="ac-stack" aria-label="버그 후보">
      <p className="ac-note">설치와 스모크 중 찾은 업스트림 기여 후보예요. {SEVERITY_HELP}.</p>
      <div className="ac-pills" role="group" aria-label="상태 필터">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>전체 {bugs.length}</button>
        {BUG_STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>{BUG_STATUS_LABEL[s]} {counts[s]}</button>
        ))}
      </div>
      {shown.length === 0 && (
        <div className="tk-empty tk-empty--boxed"><Icon name="circle-check" /><p>이 상태의 항목이 없어요.</p></div>
      )}
      <ul className="ac-list">
        {shown.map((b) => <BugRow key={b.id + b.note + b.status} bug={b} open={openId === b.id} onToggle={() => setOpenId(openId === b.id ? null : b.id)} />)}
      </ul>
    </section>
  );
}
