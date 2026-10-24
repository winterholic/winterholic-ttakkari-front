import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { focusDialogBox } from "../../ui/dialogFocus";

/** 네이티브 <dialog> 를 open 값에 맞춰 showModal/close 한다(docs/19 §2). 닫히면 연 요소로 포커스는 브라우저가 돌려준다. */
export function ModalDialog({
  open, onClose, className, children, labelledBy, label,
}: { open: boolean; onClose: () => void; className: string; children: ReactNode; labelledBy?: string; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      focusDialogBox(d);
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={className} tabIndex={-1} aria-labelledby={labelledBy} aria-label={label}
      // React 는 close 도 조상 다이얼로그 핸들러까지 올려 보낸다. 모바일 뷰어 시트 안의 메뉴를 닫을 때 시트까지 닫히지 않게 막는다.
      onClose={(e) => { e.stopPropagation(); onClose(); }}>
      {open && children}
    </dialog>
  );
}
