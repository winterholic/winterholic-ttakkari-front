import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  /** <label htmlFor> 와 잇는 트리거 id. */
  id: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** 바깥 <label> 의 id. 목록의 접근 가능한 이름이 된다. */
  labelledBy?: string;
  size?: "sm" | "lg";
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * 커스텀 Select(디자인 시스템 docs/06 §4). 네이티브 <select> 는 OS 팝업으로 열려 화면 톤이 끊겨서 쓰지 않는다.
 * 키보드: 트리거 ↓↑·Enter·Space 열기, 목록 ↓↑·Home·End 이동, Enter·Space 고르기, Esc 닫고 복귀, Tab 닫기, 글자 점프.
 */
export function Select<T extends string>({ id, value, options, onChange, labelledBy, size, disabled, invalid, describedBy }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", timer: 0 });
  const current = options.find((o) => o.value === value) ?? options[0];

  const items = () => [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];

  useEffect(() => {
    if (!open) return;
    // 아래 공간이 모자라면 위로 연다. 화면 아래쪽 컴포저·탭바에 목록이 가리지 않게 한다.
    const t = trigger.current?.getBoundingClientRect();
    const h = list.current?.offsetHeight ?? 0;
    const bottomEdge = document.querySelector(".tk-composer, .tk-tabbar")?.getBoundingClientRect().top ?? window.innerHeight;
    if (t) setUp(t.bottom + h > Math.min(bottomEdge, window.innerHeight) && t.top - h > 0);
    const all = items();
    (all.find((el) => el.getAttribute("aria-selected") === "true") ?? all[0])?.focus();
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };

  const pick = (v: T) => {
    close(true);
    if (v !== value) onChange(v);
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLElement);
    const move = { ArrowDown: Math.min(i + 1, all.length - 1), ArrowUp: Math.max(i - 1, 0), Home: 0, End: all.length - 1 }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      all[move]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const t = typed.current;
      t.text += e.key.toLowerCase();
      window.clearTimeout(t.timer);
      t.timer = window.setTimeout(() => (t.text = ""), 500);
      all.find((el) => el.textContent?.trim().toLowerCase().startsWith(t.text))?.focus();
    }
  };

  return (
    <span className={size ? `tk-select tk-select--${size}` : "tk-select"}>
      <button
        ref={trigger}
        id={id}
        className="tk-select__trigger"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className="tk-select__value">{current?.label}</span>
      </button>
      <div ref={list} id={listId} className={up ? "tk-menu tk-menu--up" : "tk-menu"} role="listbox" aria-labelledby={labelledBy} hidden={!open} onKeyDown={onListKey}>
        {options.map((o) => (
          <button
            key={o.value}
            className="tk-menu__item"
            role="option"
            type="button"
            tabIndex={-1}
            aria-selected={o.value === value}
            onClick={() => pick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </span>
  );
}
