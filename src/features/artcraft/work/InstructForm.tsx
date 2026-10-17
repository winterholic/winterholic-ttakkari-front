import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { createArtcraftTask } from "../../../api/client";
import type { ArtcraftCategory, ArtcraftSpeed, ArtcraftTemplate } from "../../../api/artcraftTypes";
import { Button } from "../../../ui/Button";
import { FileButton } from "../../../ui/FileButton";
import { Icon } from "../../../ui/Icon";
import { errorText } from "../../viewer/api";
import { shouldSubmitOnEnter } from "../../viewer/kinds";
import { useAttachments } from "./useAttachments";

const DRAFT_PREFIX = "tk-artcraft-draft:";
const SPEEDS: { value: ArtcraftSpeed; label: string; hint: string }[] = [
  { value: "fast", label: "빠르게", hint: "간단한 일을 서둘러 처리해요" },
  { value: "normal", label: "보통", hint: "기본 설정이에요" },
  { value: "careful", label: "꼼꼼하게", hint: "시간이 더 걸려도 결과를 더 살펴봐요" },
];

function loadDraft(key: string): string {
  try {
    return localStorage.getItem(DRAFT_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}
function saveDraft(key: string, value: string) {
  try {
    if (value) localStorage.setItem(DRAFT_PREFIX + key, value);
    else localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    // 저장소가 막힌 환경에서는 초안 보존만 포기한다.
  }
}

export function Segmented({ name, label, value, choices, onChange }: { name: string; label: string; value: string; choices: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="tk-segmented tk-segmented--scroll" role="radiogroup" aria-label={label}>
      {choices.map((c) => (
        <label key={c.value}>
          <input type="radio" name={name} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} />
          {c.label}
        </label>
      ))}
    </div>
  );
}

/**
 * 범주 세부의 "지시" 탭 본문: 템플릿 버튼 → 지시문 → 파일 첨부 → 옵션 → 보내기.
 * 보내면 작업이 만들어지고 작업 상세로 간다. 지시문 초안은 범주별로 이 기기에 남긴다.
 */
export function InstructForm({ category, workspaceId, maxFiles, initialTemplate }: { category: ArtcraftCategory; workspaceId: string | null; maxFiles: number; initialTemplate?: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const uid = useId();
  const draftKey = category.id;
  const [text, setText] = useState(() => loadDraft(draftKey));
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [speed, setSpeed] = useState<ArtcraftSpeed>("normal");
  const area = useRef<HTMLTextAreaElement>(null);
  const att = useAttachments(workspaceId, category.accepts, maxFiles);
  const tpl: ArtcraftTemplate | undefined = category.templates.find((t) => t.id === templateId);

  const pick = (t: ArtcraftTemplate) => {
    setTemplateId(t.id);
    setText(t.prompt);
    saveDraft(draftKey, t.prompt);
    setOptions(Object.fromEntries(t.options.map((o) => [o.id, o.default])));
    area.current?.focus();
  };
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !initialTemplate) return;
    const t = category.templates.find((x) => x.id === initialTemplate);
    if (t) {
      seeded.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      pick(t);
    }
    // 링크로 들어온 템플릿 한 번만 채운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplate, category]);

  const send = useMutation({
    mutationFn: () => createArtcraftTask({
      category: category.id, prompt: text.trim(), template_id: tpl?.id ?? null, input_artifact_ids: att.ids,
      options: tpl ? options : {}, speed,
    }),
    onSuccess: (task) => {
      saveDraft(draftKey, "");
      setText("");
      att.clear();
      void qc.invalidateQueries({ queryKey: ["artcraft", "tasks"] });
      void qc.invalidateQueries({ queryKey: ["artcraft", "outputs"] });
      navigate(`/artcraft/t/${task.id}`);
    },
  });

  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const needFiles = tpl?.min_files ?? 0;
  const missing = att.ids.length < needFiles ? `이 작업에는 파일이 ${needFiles}개 이상 필요해요` : null;
  const blocker = !text.trim() ? "무엇을 시킬지 적어 주세요" : att.busy ? "파일을 올리는 중이에요" : att.failed ? "올리지 못한 파일을 다시 올리거나 빼 주세요" : missing ?? (offline ? "오프라인이에요" : null);
  const submit = () => {
    if (blocker || send.isPending) return;
    send.mutate();
  };
  const err = send.error ? errorText(send.error) : null;
  const accepted = category.accepts.map((e) => e.toUpperCase()).join(" ");

  return (
    <form className="acw-form" aria-label={`${category.title} 작업 지시`} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <section className="acw-block" aria-labelledby={`${uid}-tpl`}>
        <h2 className="acw-block__title" id={`${uid}-tpl`}>이런 일을 시킬 수 있어요</h2>
        <div className="acw-chips" role="group" aria-label="작업 예시 템플릿">
          {category.templates.map((t) => (
            <button key={t.id} type="button" className="acw-chip" aria-pressed={templateId === t.id} onClick={() => pick(t)}>
              {t.title}
              {t.min_files > 0 && <Icon name="paperclip" />}
            </button>
          ))}
        </div>
        {tpl ? (
          <p className="ac-note">{tpl.example}{tpl.min_files > 0 ? ` · 파일 ${tpl.min_files}개 이상 필요` : ""}</p>
        ) : (
          <p className="ac-note">템플릿을 누르면 지시문이 채워져요. 그대로 보내거나 고쳐서 보내세요. 직접 써도 돼요.</p>
        )}
      </section>

      <div className="tk-field">
        <label className="tk-label" htmlFor={`${uid}-prompt`}>무엇을 시킬까요?</label>
        <textarea
          id={`${uid}-prompt`}
          ref={area}
          className="tk-textarea"
          rows={5}
          value={text}
          maxLength={8000}
          placeholder={tpl?.example ?? category.templates[0]?.example ?? "하고 싶은 일을 편하게 적어 주세요"}
          onChange={(e) => { setText(e.target.value); saveDraft(draftKey, e.target.value); }}
          onKeyDown={(e) => {
            const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
            // 폰의 Enter 는 줄바꿈이다. 데스크톱은 ⌘/Ctrl+Enter 로만 보낸다(지시문이 길어 Enter 만으로는 보내지 않는다).
            if ((e.metaKey || e.ctrlKey) && shouldSubmitOnEnter({ key: e.key, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, keyCode: e.keyCode, isComposing: e.nativeEvent.isComposing }, coarse)) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>

      <section className="acw-block" aria-label="파일 첨부">
        <div className="acw-attach">
          <FileButton className="tk-button" aria-label="파일 붙이기" multiple disabled={!workspaceId} onFiles={att.attach}>
            <Icon name="paperclip" />
            <span>파일 붙이기</span>
          </FileButton>
          <span className="ac-note">{att.items.length}/{maxFiles}개 · 사진첩·파일 앱에서 고를 수 있어요</span>
        </div>
        {att.tiles}
        <p className="ac-note">받는 형식: {accepted}</p>
      </section>

      {tpl && tpl.options.length > 0 && (
        <section className="acw-block" aria-label="옵션">
          {tpl.options.map((o) => (
            <div className="tk-field" key={o.id}>
              <span className="tk-label">{o.label}</span>
              <Segmented name={`${uid}-${o.id}`} label={o.label} value={options[o.id] ?? o.default} choices={o.choices} onChange={(v) => setOptions((cur) => ({ ...cur, [o.id]: v }))} />
            </div>
          ))}
        </section>
      )}

      <div className="tk-field">
        <span className="tk-label">작업 강도</span>
        <Segmented name={`${uid}-speed`} label="작업 강도" value={speed} choices={SPEEDS.map((s) => ({ value: s.value, label: s.label }))} onChange={(v) => setSpeed(v as ArtcraftSpeed)} />
        <p className="tk-help">{SPEEDS.find((s) => s.value === speed)?.hint}</p>
      </div>

      {err && (
        <p className="tk-error" role="alert">
          <Icon name="warning" />
          <span>{err.message}{err.code && <> <code>{err.code}</code></>}</span>
        </p>
      )}
      <div className="acw-submit">
        <Button variant="primary" size="lg" block type="submit" busy={send.isPending} aria-disabled={!!blocker || undefined} disabled={false}>
          <Icon name="send" />
          <span>작업 시키기</span>
        </Button>
        {blocker && <p className="tk-help" role="status">{blocker}</p>}
      </div>
    </form>
  );
}
