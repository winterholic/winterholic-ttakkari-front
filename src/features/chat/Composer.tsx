import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import { FileButton } from "../../ui/FileButton";
import { Icon } from "../../ui/Icon";
import { filesFromClipboard } from "./clipboardFiles";
import "./attachments.css";
import "./composer.css";

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

let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, font: string): number | null {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement("canvas").getContext("2d");
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return null;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/**
 * 한 줄에 들어가면 클립·입력·보내기를 한 줄에 두고, 넘치면 입력을 카드 전폭 윗줄로 올리고 버튼을 아래 줄로 내린다(data-stacked).
 * 판정은 언제나 한 줄 배치의 입력 폭으로 한다. 펼친 폭으로 재면 펼침과 접힘이 번갈아 깜빡인다.
 * React 상태 대신 속성을 직접 바꿔 글자마다 다시 그리지 않는다.
 */
function fitLayout(form: HTMLFormElement, el: HTMLTextAreaElement, text: string, hasContext: boolean) {
  let stacked = hasContext || text.includes("\n");
  if (!stacked && text) {
    form.removeAttribute("data-stacked");
    const cs = getComputedStyle(el);
    const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const width = textWidth(text, cs.font || `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`);
    // 캐럿 자리만큼 여유를 둔다. 측정이 안 되면 실제 줄 수로 가린다.
    stacked = width != null ? width + 2 > room : el.scrollHeight > el.clientHeight + 1;
  }
  form.toggleAttribute("data-stacked", stacked);
  // field-sizing 미지원 브라우저용 높이 맞춤.
  if (!CSS.supports("field-sizing", "content")) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }
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
  /** 있으면 첨부 버튼이 생긴다. */
  onAttach?: (files: File[]) => void;
  /** 첨부 업로드 중이면 보내기를 막는다. */
  blocked?: boolean;
  /** 힌트 자리에 잠깐 보여 줄 안내(예: 파일을 끌어 놓는 중). */
  notice?: string | null;
}

export function Composer({ draftKey, running, queued, onSubmit, onStop, context, fill, label = "따까리에게 지시하기", onAttach, blocked, notice }: ComposerProps) {
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
  const formRef = useRef<HTMLFormElement>(null);
  const hasContext = !!context;
  useLayoutEffect(() => {
    const form = formRef.current;
    const el = ref.current;
    if (!form || !el) return;
    const fit = () => fitLayout(form, el, el.value, hasContext);
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(form);
    return () => ro.disconnect();
  }, [text, hasContext]);
  useEffect(() => {
    if (!running || !onStop) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) onStop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, onStop]);

  const empty = text.trim() === "";
  const disabled = empty || !online || !!blocked;

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

  // 이미지·파일은 첨부하고, 본문이 섞인 복사는 기본 붙여넣기를 유지한다.
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!onAttach) return;
    const files = filesFromClipboard(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();
    onAttach(files);
  }

  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  const hint = notice
    ? notice
    : blocked
    ? "첨부를 올리는 중이에요"
    : !online
    ? "오프라인 · 초안은 이 기기에 남아 있어요"
    : running
      ? queued > 0
        ? `${queued}개 지시가 차례를 기다려요`
        : "기다리지 않고 계속 보내도 돼요. 순서대로 전달해요"
      : null;

  return (
    <div className="tk-composer-tray">
      <form ref={formRef} className="tk-composer" aria-label={label} onSubmit={onFormSubmit} data-offline={online ? undefined : ""} data-has-context={context ? "" : undefined}>
        {context}
        <div className="tk-composer__row">
          {onAttach && (
            <FileButton className="tk-icon-button tk-composer__attach" slotClassName="tk-composer__attach-slot" aria-label="파일 첨부" multiple onFiles={onAttach}>
              <Icon name="paperclip" />
            </FileButton>
          )}
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
            onPaste={onPaste}
          />
          {/* 실행 중에도 보내기는 그대로 둔다. 응답을 기다리지 않고 계속 보내면 대기열에 쌓인다(사용자 결정 10-11). */}
          {running && onStop && (
            <button className="tk-icon-button tk-icon-button--secondary tk-icon-button--round tk-composer__send" type="button" aria-label="실행 멈추기" onClick={onStop}>
              <Icon name="stop" />
            </button>
          )}
          <button
            className="tk-icon-button tk-icon-button--primary tk-icon-button--round tk-composer__send"
            type="submit"
            aria-label={running ? "대기열에 넣기" : "보내기"}
            aria-disabled={disabled || undefined}
          >
            <Icon name="send" />
          </button>
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
