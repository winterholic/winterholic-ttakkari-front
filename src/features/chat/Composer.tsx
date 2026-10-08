import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { Icon } from "../../ui/Icon";

const DRAFT_PREFIX = "tk-draft:";

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

/** docs/19 §3: 한글 조합 중 Enter 무시, 터치 Enter 는 줄바꿈, ⌘/Ctrl+Enter 는 항상 보내기. */
export function shouldSubmit(e: Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey" | "keyCode"> & { isComposing: boolean }, coarse: boolean): boolean {
  if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return false;
  const mod = e.metaKey || e.ctrlKey;
  return mod || (!e.shiftKey && !coarse);
}

export interface ComposerProps {
  draftKey: string;
  running: boolean;
  queued: number;
  onSubmit: (text: string) => void;
  onStop?: () => void;
  context?: ReactNode;
  /** 제안 칩이 채우는 값. 바뀔 때마다 입력에 채우고 포커스한다(바로 보내지 않는다). */
  fill?: { text: string; nonce: number } | null;
  label?: string;
}

export function Composer({ draftKey, running, queued, onSubmit, onStop, context, fill, label = "따까리에게 지시하기" }: ComposerProps) {
  const [text, setText] = useState(() => loadDraft(draftKey));
  const [online, setOnline] = useState(() => navigator.onLine);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => saveDraft(draftKey, text), [draftKey, text]);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  // 제안 칩이 채운 값은 렌더 중에 반영한다(이펙트 안 setState 대신, React 권장 패턴).
  const [seenFill, setSeenFill] = useState(fill);
  if (fill !== seenFill) {
    setSeenFill(fill);
    if (fill) setText(fill.text);
  }
  useEffect(() => {
    if (fill) ref.current?.focus();
  }, [fill]);
  useEffect(() => {
    // field-sizing 미지원 브라우저용 높이 맞춤.
    const el = ref.current;
    if (!el || CSS.supports("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  useEffect(() => {
    if (!running || !onStop) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) onStop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, onStop]);

  const empty = text.trim() === "";
  const disabled = empty || !online;

  function submit() {
    if (disabled) return;
    onSubmit(text.trim());
    setText("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const coarse = matchMedia("(pointer: coarse)").matches;
    if (shouldSubmit({ ...e, isComposing: e.nativeEvent.isComposing }, coarse)) {
      e.preventDefault();
      submit();
    }
  }

  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  const hint = !online
    ? "오프라인 · 초안은 이 기기에 남아 있어요"
    : running
      ? queued > 0
        ? `지금 작업이 끝나면 ${queued}개 지시를 이어서 보내요`
        : "실행 중에도 다음 지시를 쓸 수 있어요. 끝나면 이어서 보내요"
      : null;

  return (
    <div className="tk-composer-tray">
      <form className="tk-composer" aria-label={label} onSubmit={onFormSubmit} data-offline={online ? undefined : ""}>
        {context}
        <div className="tk-composer__row">
          <label className="tk-sr-only" htmlFor={`composer-${draftKey}`}>지시</label>
          <textarea
            ref={ref}
            className="tk-composer__input"
            id={`composer-${draftKey}`}
            rows={1}
            placeholder={label}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {running && onStop && empty ? (
            <button className="tk-icon-button tk-icon-button--secondary tk-icon-button--round tk-composer__send" type="button" aria-label="실행 멈추기" onClick={onStop}>
              <Icon name="stop" />
            </button>
          ) : (
            <button
              className="tk-icon-button tk-icon-button--primary tk-icon-button--round tk-composer__send"
              type="submit"
              aria-label={running ? "대기열에 넣기" : "보내기"}
              aria-disabled={disabled || undefined}
            >
              <Icon name="send" />
            </button>
          )}
        </div>
        <p className="tk-composer__hint">
          <span>{hint}</span>
          <span className="tk-composer__keys">
            <kbd>↵</kbd> 보내기 · <kbd>⇧</kbd>
            <kbd>↵</kbd> 줄바꿈
          </span>
        </p>
      </form>
    </div>
  );
}
