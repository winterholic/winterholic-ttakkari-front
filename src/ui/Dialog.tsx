import { useEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { IconButton } from "./Button";
import { Icon } from "./Icon";

type Kind = "dialog" | "sheet" | "drawer";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  kind?: Kind;
  size?: "sm" | "lg";
  /** 접근 가능한 이름. title 이 있으면 제목이 이름이 된다. */
  label?: string;
  /** 있으면 .tk-dialog__header 와 닫기 버튼을 그린다. drawer 는 자체 머리를 children 에 넣는다. */
  title?: string;
  /** 입력·결정을 잃을 수 있으면 true: 스크림 클릭을 무시한다. "strict" 는 Esc 도 막는다. */
  modal?: boolean | "strict";
  footer?: ReactNode;
  children: ReactNode;
  id?: string;
}

/**
 * 네이티브 <dialog> 래퍼(docs/06 §14-16, docs/19 §2). 포커스 가두기·Esc·배경 inert 는 브라우저가 한다.
 * 우리가 보태는 것은 스크림 클릭 닫기와, 닫힐 때 연 요소로 포커스를 돌려주는 것이다.
 */
export function Dialog({ open, onClose, kind = "dialog", size, label, title, modal, footer, children, id }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = id ? `${id}-title` : undefined;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  const handleClose = () => {
    const o = opener.current;
    opener.current = null;
    if (o instanceof HTMLElement && document.contains(o)) o.focus();
    onClose();
  };

  const onClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget && !modal) e.currentTarget.close();
  };

  const cls = [
    `tk-${kind}`,
    kind === "dialog" && size && `tk-dialog--${size}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <dialog
      ref={ref}
      id={id}
      className={cls}
      aria-label={title ? undefined : label}
      aria-labelledby={title ? titleId : undefined}
      data-tk-modal={modal ? (modal === "strict" ? "strict" : "") : undefined}
      onClick={onClick}
      onClose={handleClose}
      onCancel={(e) => {
        if (modal === "strict") e.preventDefault();
      }}
    >
      {title && (
        <div className="tk-dialog__header">
          <h2 className="tk-dialog__title" id={titleId}>
            {title}
          </h2>
          <IconButton size="sm" aria-label="닫기" onClick={() => ref.current?.close()}>
            <Icon name="x" />
          </IconButton>
        </div>
      )}
      {kind === "dialog" || kind === "sheet" ? <div className="tk-dialog__body">{children}</div> : children}
      {footer && <div className="tk-dialog__footer">{footer}</div>}
    </dialog>
  );
}
