import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** 트리거와 목록 사이 offset(4) + 목록과 화면 가장자리·고정 막대 사이 여백(8). 열 방향과 높이 상한을 정하는 계산에만 쓴다. */
const EDGE_GAP = 12;

/**
 * 목록이 놓일 수 있는 화면 세로 범위. 아래는 보이는 화면 끝(키보드 포함)과 컴포저·탭바 윗면 중 작은 쪽,
 * 위는 화면 위 끝과 고정 헤더 아랫면 중 큰 쪽이다. 숨겨진 막대(키보드로 가린 탭바)는 높이 0 이라 건너뛴다.
 */
function viewportBounds() {
  const vv = window.visualViewport;
  let top = vv ? vv.offsetTop : 0;
  let bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  bottom = Math.min(bottom, window.innerHeight);
  for (const bar of document.querySelectorAll(".tk-composer, .tk-tabbar")) {
    const r = bar.getBoundingClientRect();
    if (r.height > 0 && r.top < bottom && r.top > top) bottom = r.top;
  }
  const header = document.querySelector(".tk-header")?.getBoundingClientRect();
  if (header && header.height > 0 && header.bottom > top && header.bottom < bottom) top = header.bottom;
  return { top, bottom };
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

  // 열린 목록을 그리기 전에 방향과 높이 상한을 정한다. 아래·위 중 넉넉한 쪽으로 열고, 그래도 모자라면
  // 목록 안에서 스크롤한다(--tk-select-room 이 .tk-select > .tk-menu 의 max-height 를 줄인다).
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = list.current;
      const t = trigger.current?.getBoundingClientRect();
      if (!el || !t) return;
      el.style.removeProperty("--tk-select-room");
      const natural = el.offsetHeight;
      const { top, bottom } = viewportBounds();
      const below = bottom - t.bottom - EDGE_GAP;
      const above = t.top - top - EDGE_GAP;
      const flip = natural > below && above > below;
      const room = flip ? above : below;
      // 옵션이 최소 둘은 보이도록 바닥을 둔다
      const item = el.querySelector<HTMLElement>('[role="option"]')?.offsetHeight ?? 0;
      const floor = Math.min(natural, 2 * item + (el.offsetHeight - el.clientHeight));
      if (room < natural) el.style.setProperty("--tk-select-room", `${Math.max(room, floor)}px`);
      setUp(flip);
    };
    place();
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // 포커스가 문서를 끌고 가지 않게 하고, 고른 항목은 목록 안에서만 보이는 자리로 옮긴다.
    const all = items();
    const start = all.find((el) => el.getAttribute("aria-selected") === "true") ?? all[0];
    start?.focus({ preventScroll: true });
    if (start && list.current) {
      const box = list.current;
      if (start.offsetTop < box.scrollTop) box.scrollTop = start.offsetTop;
      else if (start.offsetTop + start.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = start.offsetTop + start.offsetHeight - box.clientHeight;
    }
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
