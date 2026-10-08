import { Fragment, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** 이 항목 앞에 구분선을 그린다. */
  separatorBefore?: boolean;
}

export interface MenuProps {
  /** 트리거 버튼의 aria-label 이자 메뉴 이름. */
  label: string;
  items: MenuItem[];
  /** 트리거 안쪽(아이콘 등). */
  children: ReactNode;
  align?: "start" | "end";
  /** 화면 아래쪽 트리거는 위로 연다. */
  up?: boolean;
  triggerClassName?: string;
}

/** docs/06 §13 키보드 계약: ↓↑ 열기, Home/End, 글자 점프, Esc 닫고 트리거로 복귀, Tab 닫기, 바깥 클릭 닫기. */
export function Menu({ label, items, children, align = "end", up, triggerClassName = "tk-icon-button" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const focusAt = useRef<"first" | "last">("first");
  const typed = useRef({ text: "", timer: 0 });

  const enabled = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];

  useEffect(() => {
    if (!open) return;
    const list = enabled();
    (focusAt.current === "last" ? list.at(-1) : list[0])?.focus();
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusAt.current = e.key === "ArrowUp" ? "last" : "first";
      setOpen(true);
    }
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const list = enabled();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const move = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      list[(move + list.length) % list.length]?.focus();
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
      list.find((it) => it.textContent?.trim().toLowerCase().startsWith(t.text))?.focus();
    }
  };

  return (
    <div className="tk-dropdown">
      <button
        ref={trigger}
        className={triggerClassName}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          focusAt.current = "first";
          setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKey}
      >
        {children}
      </button>
      <div
        ref={menu}
        id={menuId}
        role="menu"
        aria-label={label}
        hidden={!open}
        className={["tk-menu", align === "end" && "tk-menu--end", up && "tk-menu--up"].filter(Boolean).join(" ")}
        onKeyDown={onMenuKey}
      >
        {items.map((it) => (
          <Fragment key={it.label}>
            {it.separatorBefore && <hr className="tk-menu__separator" />}
            <button
              className={it.danger ? "tk-menu__item tk-menu__item--danger" : "tk-menu__item"}
              role="menuitem"
              type="button"
              tabIndex={-1}
              aria-disabled={it.disabled || undefined}
              onClick={() => {
                if (it.disabled) return;
                close(true);
                it.onSelect();
              }}
            >
              {it.icon && <Icon name={it.icon} />}
              {it.label}
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
