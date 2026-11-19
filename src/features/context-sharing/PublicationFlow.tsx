import type { ReactNode } from "react";

/** Existing document selection, draft editing, review and approval stages stay in this named boundary. */
export function PublicationFlow({ children, open = false }: { children: ReactNode; open?: boolean }) {
  return <details className="share-secondary share-publication-flow" open={open}>
    <summary>게시 및 갱신</summary>
    <div className="share-publication-content" aria-label="게시 흐름">{children}</div>
  </details>;
}
