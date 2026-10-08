import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArtifactViewer } from "./ArtifactViewer";
import type { ArtifactViewerProps } from "./ArtifactViewer";
import { useIsDesktop } from "./hooks";
import { ModalDialog } from "./ModalDialog";
import { useArtifactViewer } from "./useArtifactViewer";
import { Icon } from "../../ui/Icon";

/**
 * 결과물 뷰어 호스트. 어느 화면에서든 `?artifact=<id>` 가 있으면 뷰어를 연다(docs/19 §5).
 *
 * 사용법: 화면의 본문(목록·스레드 등)을 children 으로 감싼다.
 *
 *   <div className="tk-screen">
 *     <PageHeader title="보관함" />
 *     <ArtifactViewerHost>{목록}</ArtifactViewerHost>
 *   </div>
 *
 * - 데스크톱(lg 이상): children 이 `.tk-split` 의 primary, 뷰어가 secondary 분할 패널. 손잡이로 폭을 바꾸고 기억한다.
 * - 모바일: children 만 그리고 뷰어는 전체 화면 `<dialog className="tk-viewer-dialog">`. 열 때 showModal,
 *   Esc·뒤로 가기는 useArtifactViewer().close() 와 같은 history.back() 이다.
 * - 열기: `const { open } = useArtifactViewer(); open(artifact.id)`.
 * - followup: 뷰어 아래에 붙을 컴포저(현재 결과물을 문맥으로 가진 입력). 없으면 생략.
 * - alwaysOpen: 데스크톱에서 선택이 없어도 오른쪽 패널을 두고 placeholder 를 보여 준다(작업 공간).
 */
export interface ArtifactViewerHostProps extends Pick<ArtifactViewerProps, "followup" | "onDelete" | "panel"> {
  children: ReactNode;
  alwaysOpen?: boolean;
  placeholder?: ReactNode;
  /** 목록에서 가진 값(첫 화면 즉시 표시). */
  resolveInitial?: (id: string) => ArtifactViewerProps["initial"];
}

const SPLIT_KEY = "tk-viewer-split";
const SPLIT_MIN = 360;

function readSplit(): number | null {
  try {
    const v = Number(localStorage.getItem(SPLIT_KEY));
    return Number.isFinite(v) && v >= SPLIT_MIN ? v : null;
  } catch {
    return null;
  }
}

export function ArtifactViewerHost({ children, alwaysOpen, placeholder, followup, onDelete, panel, resolveInitial }: ArtifactViewerHostProps) {
  const { current, close } = useArtifactViewer();
  const desktop = useIsDesktop();
  const [split, setSplit] = useState<number | null>(readSplit);
  const paneRef = useRef<HTMLElement>(null);

  const viewer = current ? (
    <ArtifactViewer artifactId={current} initial={resolveInitial?.(current)} onClose={close} followup={followup} onDelete={onDelete} panel={panel} />
  ) : null;

  const saveSplit = useCallback((w: number) => {
    const next = Math.max(SPLIT_MIN, Math.round(w));
    setSplit(next);
    try {
      localStorage.setItem(SPLIT_KEY, String(next));
    } catch {
      // 저장소를 쓸 수 없으면 이번 화면에서만 기억한다.
    }
  }, []);

  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const pane = paneRef.current;
    if (!pane) return;
    const startX = e.clientX;
    const startW = pane.getBoundingClientRect().width;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    target.dataset.dragging = "";
    const move = (ev: PointerEvent) => saveSplit(startW + (startX - ev.clientX));
    const up = () => {
      delete target.dataset.dragging;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  const onHandleKey = (e: React.KeyboardEvent) => {
    const w = paneRef.current?.getBoundingClientRect().width ?? 0;
    if (e.key === "ArrowLeft") saveSplit(w + 24);
    else if (e.key === "ArrowRight") saveSplit(w - 24);
  };

  if (desktop) {
    const open = alwaysOpen || current;
    return (
      <div className="tk-split" data-open={open ? "" : undefined}>
        <section className="tk-split__pane tk-split__pane--primary" aria-label="목록">{children}</section>
        <div
          className="tk-split__handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="목록과 미리보기 폭 조절"
          tabIndex={0}
          onPointerDown={onHandleDown}
          onKeyDown={onHandleKey}
        />
        <section
          className="tk-split__pane tk-split__pane--secondary"
          aria-label="미리보기"
          ref={paneRef}
          style={split ? ({ "--tk-_split": `${split}px` } as React.CSSProperties) : undefined}
        >
          {viewer ?? (
            <div className="tk-empty">
              <Icon name="eye" />
              <p className="tk-empty__title">미리볼 결과물을 골라 주세요</p>
              {placeholder ?? <p>왼쪽 목록에서 결과물을 누르면 여기에서 열려요.</p>}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <>
      {children}
      <MobileViewerDialog open={Boolean(current)} onClose={close}>{viewer}</MobileViewerDialog>
    </>
  );
}

/** 모바일 전체 화면 뷰어. 닫힘 이벤트(Esc 등)가 URL 에도 반영되게 한다. */
export function MobileViewerDialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const { current } = useArtifactViewer();
  // dialog 가 스스로 닫혔는데(Esc) URL 에 아직 ?artifact 가 남아 있으면 URL 도 닫는다. 뒤로 가기로 URL 이 먼저 바뀐 경우는 건드리지 않는다.
  const handleClose = useCallback(() => {
    if (current) onClose();
  }, [current, onClose]);
  useEffect(() => {
    // 뷰어가 열려 있는 동안 배경 스크롤을 막는다.
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  return <ModalDialog open={open} onClose={handleClose} className="tk-viewer-dialog" label="결과물 미리보기">{children}</ModalDialog>;
}
