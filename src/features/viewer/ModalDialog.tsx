import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** 네이티브 <dialog> 를 open 값에 맞춰 showModal/close 한다(docs/19 §2). 닫히면 연 요소로 포커스는 브라우저가 돌려준다. */
export function ModalDialog({
  open, onClose, className, children, labelledBy, label,
}: { open: boolean; onClose: () => void; className: string; children: ReactNode; labelledBy?: string; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={className} aria-labelledby={labelledBy} aria-label={label} onClose={onClose}>
      {open && children}
    </dialog>
  );
}
