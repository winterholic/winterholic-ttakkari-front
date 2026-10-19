import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { createNotebook, deleteNotebook, renameNotebook } from "../../api/client";
import type { NlmNotebook } from "../../api/notebooklmTypes";
import { Badge } from "../../ui/Badge";
import { Button, IconButton } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { ErrorNotice } from "./ErrorNotice";
import { describeError, when } from "./labels";
import { nlmKeys } from "./queries";
import type { useNotebookList } from "./queries";

const MAX_TITLE = 200;

function TitleDialog({
  open, onClose, heading, submitLabel, initial, pending, error, onSubmit,
}: {
  open: boolean; onClose: () => void; heading: string; submitLabel: string; initial: string;
  pending: boolean; error: unknown; onSubmit: (title: string) => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(initial);
  const trimmed = title.trim();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={heading}
      modal
      footer={
        <div className="tk-button-group tk-button-group--end">
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button variant="primary" type="submit" form={`${id}-form`} busy={pending} disabled={!trimmed}>{submitLabel}</Button>
        </div>
      }
    >
      <form id={`${id}-form`} onSubmit={(e) => { e.preventDefault(); if (trimmed) onSubmit(trimmed); }}>
        <div className="tk-field">
          <label className="tk-label" htmlFor={`${id}-title`}>노트북 이름</label>
          <input id={`${id}-title`} className="tk-input" value={title} maxLength={MAX_TITLE} autoComplete="off" onChange={(e) => setTitle(e.target.value)} />
        </div>
      </form>
      {error != null && <ErrorNotice error={error} />}
    </Dialog>
  );
}

function NotebookRow({ nb, onRename, onDelete }: { nb: NlmNotebook; onRename: () => void; onDelete: () => void }) {
  const navigate = useNavigate();
  return (
    <li className="nlm-nb">
      <button type="button" className="nlm-nb__open" onClick={() => navigate(`/notebooklm/${encodeURIComponent(nb.id)}`)}>
        <Icon name="notebook" className="nlm-nb__icon" />
        <span className="nlm-nb__text">
          <strong className="nlm-nb__title">{nb.title || "제목 없음"}</strong>
          <small>소스 {nb.source_count}개 · 수정 {when(nb.updated_at ?? nb.created_at)}</small>
        </span>
        {!nb.is_owner && <Badge>공유받음</Badge>}
        <Icon name="chevron-right" className="nlm-nb__chev" />
      </button>
      {nb.is_owner && (
        <div className="nlm-nb__tools">
          <IconButton size="sm" aria-label={`${nb.title} 이름 변경`} onClick={onRename}><Icon name="memo" /></IconButton>
          <IconButton size="sm" aria-label={`${nb.title} 삭제`} onClick={onDelete}><Icon name="trash" /></IconButton>
        </div>
      )}
    </li>
  );
}

/** 노트북 목록·만들기·이름 변경·삭제(확인 대화상자). 쓰기가 Google 에 닿았는지 모르는 오류는 목록을 다시 읽도록 안내한다. */
export function NotebookList({ list }: { list: ReturnType<typeof useNotebookList> }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<NlmNotebook | null>(null);
  const [deleting, setDeleting] = useState<NlmNotebook | null>(null);
  const reload = () => qc.invalidateQueries({ queryKey: nlmKeys.notebooks });

  const create = useMutation({
    mutationFn: createNotebook,
    onSuccess: (nb) => { setCreating(false); void reload(); navigate(`/notebooklm/${encodeURIComponent(nb.id)}`); },
    onError: (e) => { if (describeError(e).kind === "unknown_outcome") void reload(); },
  });
  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameNotebook(id, title),
    onSuccess: () => { setRenaming(null); toast({ message: "이름을 바꿨어요.", tone: "success" }); void reload(); },
    onError: (e) => { if (describeError(e).kind === "unknown_outcome") void reload(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteNotebook(id),
    onSuccess: () => { setDeleting(null); toast({ message: "노트북을 삭제했어요.", tone: "success" }); void reload(); },
    onError: (e) => { if (describeError(e).kind === "unknown_outcome") void reload(); },
  });

  const items = list.data ?? [];
  return (
    <section className="tk-section" aria-labelledby="nlm-list-title">
      <div className="tk-section__head">
        <h2 id="nlm-list-title" className="tk-section__title">노트북</h2>
        <Button variant="primary" size="sm" onClick={() => { create.reset(); setCreating(true); }}>
          <Icon name="plus" />새 노트북
        </Button>
      </div>

      {list.isPending && (
        <ul className="nlm-nblist" aria-busy="true" aria-label="노트북 불러오는 중">
          {[0, 1, 2].map((i) => <li key={i} className="tk-skeleton tk-skeleton--block nlm-nb-skeleton" />)}
        </ul>
      )}
      {list.isError && <ErrorNotice error={list.error} onRetry={() => void list.refetch()} retryLabel="목록 다시 읽기" />}
      {list.isSuccess && items.length === 0 && (
        <div className="tk-empty tk-empty--boxed">
          <Icon name="notebook" className="tk-icon--xl" />
          <p className="tk-empty__title">아직 노트북이 없어요</p>
          <p className="nlm-note">새 노트북을 만들고 URL, YouTube, 텍스트, 파일을 소스로 넣어 보세요.</p>
        </div>
      )}
      {items.length > 0 && (
        <ul className="nlm-nblist">
          {items.map((nb) => (
            <NotebookRow
              key={nb.id}
              nb={nb}
              onRename={() => { rename.reset(); setRenaming(nb); }}
              onDelete={() => { remove.reset(); setDeleting(nb); }}
            />
          ))}
        </ul>
      )}

      {creating && (
        <TitleDialog open heading="새 노트북" submitLabel="만들기" initial="" pending={create.isPending} error={create.error}
          onClose={() => setCreating(false)} onSubmit={(title) => create.mutate(title)} />
      )}
      {renaming && (
        <TitleDialog open heading="이름 변경" submitLabel="바꾸기" initial={renaming.title} pending={rename.isPending} error={rename.error}
          onClose={() => setRenaming(null)} onSubmit={(title) => rename.mutate({ id: renaming.id, title })} />
      )}
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        size="sm"
        title="노트북을 삭제할까요?"
        modal
        footer={
          <div className="tk-button-group tk-button-group--end">
            <Button variant="ghost" onClick={() => setDeleting(null)}>취소</Button>
            <Button variant="danger" busy={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>삭제</Button>
          </div>
        }
      >
        <p><strong>{deleting?.title}</strong> 노트북과 안에 넣은 소스 {deleting?.source_count ?? 0}개가 NotebookLM에서 지워져요.</p>
        <p className="nlm-note">되돌릴 수 없어요.</p>
        {remove.error != null && <ErrorNotice error={remove.error} />}
      </Dialog>
    </section>
  );
}
