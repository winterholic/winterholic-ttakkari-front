import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router";
import { createMemo, deleteMemo, getMemo, listMemoTags, patchMemo } from "../../api/client";
import type { MemoOut } from "../../api/client";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { ErrorState } from "../viewer/screenStates";
import { CategoryDot, useMemoCategories } from "./MemoCategories";
import { useAutosave } from "./useAutosave";
import type { SaveStatus } from "./useAutosave";

interface Doc {
  title: string;
  body: string;
  tags: string[];
  category_id: string | null;
  pinned: boolean;
}

const sameDoc = (a: Doc, b: Doc) =>
  a.title === b.title && a.body === b.body && a.pinned === b.pinned && a.category_id === b.category_id && a.tags.join("\n") === b.tags.join("\n");
// 카테고리만 고른 새 메모는 아직 빈 메모다(목록 화면의 카테고리가 기본으로 들어오므로).
const isBlank = (d: Doc) => !d.title.trim() && !d.body.trim() && d.tags.length === 0;
const blank = (category_id: string | null): Doc => ({ title: "", body: "", tags: [], category_id, pinned: false });
const docOf = (m: MemoOut): Doc => ({ title: m.title, body: m.body, tags: m.tags, category_id: m.category_id, pinned: m.pinned });
const MAX_SUGGESTIONS = 12;

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "저장됨",
  dirty: "저장 대기 중",
  saving: "저장 중…",
  error: "저장하지 못했어요. 다시 시도 중",
  conflict: "다른 곳에서 먼저 수정됐어요",
};

/**
 * `/memos/new` 는 아직 서버에 없는 새 메모다. 첫 글자가 들어가고 잠시 뒤에 만들어져서, 빈 메모가 쌓이지 않는다.
 * defaultCategory 는 새 메모가 들어갈 카테고리(목록에서 고르고 있던 것).
 */
export function MemoEditor({ memoId, defaultCategory = null }: { memoId: string; defaultCategory?: string | null }) {
  const isNew = memoId === "new";
  const q = useQuery({ queryKey: ["memo", memoId], queryFn: () => getMemo(memoId), enabled: !isNew, gcTime: 0 });
  if (!isNew && q.isPending) {
    return (
      <p className="tk-status tk-status--agent" role="status">
        <span className="tk-spinner tk-spinner--sm" aria-hidden />
        불러오는 중
      </p>
    );
  }
  if (!isNew && q.isError) return <ErrorState error={q.error} what="메모" onRetry={() => void q.refetch()} />;
  const memo = isNew ? null : q.data!;
  return <MemoForm key={memoId} memo={memo} defaultCategory={defaultCategory} />;
}

function MemoForm({ memo, defaultCategory }: { memo: MemoOut | null; defaultCategory: string | null }) {
  const id = useId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Doc>(memo ? docOf(memo) : blank(defaultCategory));
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [tagDraft, setTagDraft] = useState("");
  const [tagFocus, setTagFocus] = useState(false);
  const cats = useMemoCategories();
  const knownTags = useQuery({ queryKey: ["memos", "tags", null], queryFn: () => listMemoTags() });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 서버에 만든 뒤의 id 와 마지막으로 받은 버전. 렌더와 무관한 값이라 ref 로 둔다.
  const meta = useRef({ id: memo?.id ?? null, rev: memo?.rev ?? 0 });
  const [initial] = useState<Doc>(memo ? docOf(memo) : blank(defaultCategory));

  const { status, flush, reset } = useAutosave(
    doc,
    initial,
    async (d) => {
      const cur = meta.current;
      if (!cur.id) {
        if (isBlank(d)) return;
        const m = await createMemo(d);
        cur.id = m.id;
        cur.rev = m.rev;
      } else {
        const m = await patchMemo(cur.id, { ...d, rev: cur.rev });
        cur.rev = m.rev;
      }
      void qc.invalidateQueries({ queryKey: ["memos"] });
    },
    { same: sameDoc },
  );

  const conflict = status === "conflict";
  const reload = useMutation({
    mutationFn: () => getMemo(meta.current.id!),
    onSuccess: (m) => {
      meta.current.rev = m.rev;
      setDoc(docOf(m));
      reset(docOf(m));
    },
  });
  const overwrite = useMutation({
    mutationFn: () => getMemo(meta.current.id!),
    onSuccess: (m) => {
      // 서버의 최신 버전을 기준으로 삼되 화면의 내용은 그대로 두고 다시 저장한다.
      meta.current.rev = m.rev;
      reset(docOf(m));
      void flush();
    },
  });
  const del = useMutation({
    mutationFn: async () => {
      if (meta.current.id) await deleteMemo(meta.current.id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["memos"] });
      toast({ message: "메모를 지웠어요." });
      navigate("/memos", { replace: true });
    },
  });

  const set = (p: Partial<Doc>) => setDoc((d) => ({ ...d, ...p }));
  const all = knownTags.data?.tags ?? [];
  const addTag = (raw: string) => {
    let t = raw.trim().replace(/^#+/, "").trim();
    // 대소문자만 다른 기존 태그가 있으면 그것을 다시 쓴다(같은 태그가 둘로 갈리지 않게).
    t = all.find((x) => x.name.toLowerCase() === t.toLowerCase())?.name ?? t;
    if (!t || t.length > 30 || doc.tags.includes(t) || doc.tags.length >= 20) return;
    set({ tags: [...doc.tags, t] });
  };
  const needle = tagDraft.trim().replace(/^#+/, "").trim().toLowerCase();
  const suggestions = all
    .filter((t) => !doc.tags.includes(t.name) && (!needle || t.name.toLowerCase().includes(needle)))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(needle)) - Number(a.name.toLowerCase().startsWith(needle)))
    .slice(0, MAX_SUGGESTIONS);
  const isNewTag = needle !== "" && !all.some((t) => t.name.toLowerCase() === needle) && !doc.tags.some((t) => t.toLowerCase() === needle);
  const pickTag = (name: string) => {
    addTag(name);
    setTagDraft("");
  };
  const catList = cats.data?.categories ?? [];
  const docCat = catList.find((c) => c.id === doc.category_id);
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // 한글 조합 중의 Enter 는 글자 확정이라 태그로 넣지 않는다.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
      setTagDraft("");
    } else if (e.key === "Backspace" && !tagDraft && doc.tags.length) {
      set({ tags: doc.tags.slice(0, -1) });
    }
  };
  const agentOwned = memo?.source === "agent";

  return (
    <div className="memo-editor">
      <div className="memo-editor__bar">
        <div className="tk-segmented" role="radiogroup" aria-label="편집 방식">
          <label>
            <input type="radio" name={`${id}-mode`} checked={mode === "edit"} onChange={() => setMode("edit")} />
            편집
          </label>
          <label>
            <input type="radio" name={`${id}-mode`} checked={mode === "preview"} onChange={() => setMode("preview")} />
            미리보기
          </label>
        </div>
        <span className="memo-editor__status" role="status" data-status={status}>
          {STATUS_TEXT[status]}
        </span>
        <button className="tk-icon-button" type="button" aria-pressed={doc.pinned} aria-label={doc.pinned ? "고정 풀기" : "맨 위에 고정"} onClick={() => set({ pinned: !doc.pinned })}>
          <Icon name="pin" />
        </button>
        <button className="tk-icon-button" type="button" aria-label="메모 지우기" onClick={() => (meta.current.id ? setConfirmDelete(true) : navigate("/memos", { replace: true }))}>
          <Icon name="trash" />
        </button>
      </div>

      {conflict && (
        <div className="tk-banner tk-banner--warning" role="alert">
          <p className="tk-banner__text">다른 기기나 따까리가 이 메모를 먼저 고쳤어요. 어느 쪽을 쓸지 골라 주세요.</p>
          <div className="tk-button-group">
            <Button size="sm" busy={reload.isPending} onClick={() => reload.mutate()}>
              저쪽 내용으로 바꾸기
            </Button>
            <Button size="sm" variant="primary" busy={overwrite.isPending} onClick={() => overwrite.mutate()}>
              내 내용으로 덮어쓰기
            </Button>
          </div>
        </div>
      )}

      {mode === "edit" ? (
        <div className="memo-editor__fields">
          <input
            className="tk-input tk-input--lg memo-editor__title"
            value={doc.title}
            maxLength={200}
            placeholder="제목"
            aria-label="제목"
            autoComplete="off"
            onChange={(e) => set({ title: e.target.value })}
          />
          {catList.length > 0 && (
            <div className="tk-chips memo-editor__cats" role="radiogroup" aria-label="카테고리">
              <Icon name="folder" />
              <label className="tk-chip">
                <input type="radio" name={`${id}-cat`} checked={doc.category_id === null} onChange={() => set({ category_id: null })} />
                미분류
              </label>
              {catList.map((c) => (
                <label className="tk-chip" key={c.id}>
                  <input type="radio" name={`${id}-cat`} checked={doc.category_id === c.id} onChange={() => set({ category_id: c.id })} />
                  <CategoryDot color={c.color} />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          )}
          <div className="memo-editor__tags">
            <Icon name="tag" />
            {doc.tags.map((t) => (
              <span className="tk-chip" key={t}>
                {t}
                <button type="button" className="memo-editor__tag-x" aria-label={`태그 ${t} 빼기`} onClick={() => set({ tags: doc.tags.filter((x) => x !== t) })}>
                  <Icon name="x" />
                </button>
              </span>
            ))}
            <input
              className="tk-input memo-editor__tag-input"
              value={tagDraft}
              placeholder={doc.tags.length ? "태그 추가" : "태그 추가 (입력 후 Enter)"}
              aria-label="태그 추가"
              aria-controls={`${id}-tag-suggest`}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={onTagKey}
              onFocus={() => setTagFocus(true)}
              onBlur={() => {
                setTagFocus(false);
                addTag(tagDraft);
                setTagDraft("");
              }}
            />
          </div>
          {tagFocus && (suggestions.length > 0 || isNewTag) && (
            // 누르는 동안 입력칸이 포커스를 잃지 않게 pointerdown 을 막는다(키보드가 내려갔다 올라오지 않게).
            <div className="tk-chips memo-editor__suggest" id={`${id}-tag-suggest`} role="group" aria-label="태그 제안" onPointerDown={(e) => e.preventDefault()}>
              {isNewTag && (
                <button type="button" className="tk-chip memo-editor__suggest-new" onClick={() => pickTag(tagDraft)}>
                  <Icon name="plus" />
                  <span>{tagDraft.trim().replace(/^#+/, "")}</span>
                </button>
              )}
              {suggestions.map((t) => (
                <button type="button" className="tk-chip" key={t.name} onClick={() => pickTag(t.name)}>
                  #{t.name}
                </button>
              ))}
            </div>
          )}
          <textarea
            className="tk-textarea memo-editor__body"
            value={doc.body}
            placeholder="마크다운으로 적어요. 예) # 제목, - 목록, **굵게**"
            aria-label="본문"
            onChange={(e) => set({ body: e.target.value })}
          />
        </div>
      ) : (
        <div className="memo-editor__preview">
          {doc.title && <h2 className="memo-editor__preview-title">{doc.title}</h2>}
          {(docCat || doc.tags.length > 0) && (
            <p className="tk-list__meta memo-editor__preview-meta">
              {docCat && (
                <span className="memo-item__cat">
                  <CategoryDot color={docCat.color} />
                  {docCat.name}
                </span>
              )}
              {doc.tags.length > 0 && <span>{doc.tags.map((t) => `#${t}`).join(" ")}</span>}
            </p>
          )}
          {doc.body.trim() ? (
            <article className="tk-prose">
              <Markdown remarkPlugins={[remarkGfm]}>{doc.body}</Markdown>
            </article>
          ) : (
            <p className="tk-help">본문이 비어 있어요.</p>
          )}
        </div>
      )}
      {agentOwned && <p className="tk-help memo-editor__note">따까리가 만든 메모예요.</p>}
      {(reload.error || overwrite.error || del.error) && (
        <p className="tk-error" role="alert">
          {errorText(reload.error ?? overwrite.error ?? del.error).message}
        </p>
      )}

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="메모를 지울까요?"
        footer={
          <div className="tk-button-group tk-button-group--end">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              취소
            </Button>
            <Button variant="danger" busy={del.isPending} onClick={() => del.mutate()}>
              지우기
            </Button>
          </div>
        }
        id="memo-delete"
      >
        <p>지운 메모는 되돌릴 수 없어요.</p>
      </Dialog>
    </div>
  );
}
