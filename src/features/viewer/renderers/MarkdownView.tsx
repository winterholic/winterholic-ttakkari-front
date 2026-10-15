import { memo } from "react";
import type { UUID } from "../../../api/types";
import { AppMarkdown } from "../../markdown/AppMarkdown";

export interface MarkdownLinkContext {
  workspaceId: UUID | null;
  sessionId: UUID | null;
  /** 이 문서가 놓인 폴더(작업 폴더 기준). 문서 안의 상대 링크를 푸는 기준이다. */
  baseDir: string | null;
  onOpenArtifact: (id: UUID) => void;
}

/** 찾기가 DOM 을 직접 감싸므로 text 가 바뀌지 않는 한 다시 그리지 않는다(memo). */
export const MarkdownView = memo(function MarkdownView({
  text,
  articleRef,
  links,
}: {
  text: string;
  articleRef: React.Ref<HTMLElement>;
  links?: MarkdownLinkContext;
}) {
  return (
    <div className="tk-viewer__doc">
      <article className="tk-prose" ref={articleRef}>
        <AppMarkdown workspaceId={links?.workspaceId} sessionId={links?.sessionId} baseDir={links?.baseDir} onOpenArtifact={links?.onOpenArtifact}>
          {text}
        </AppMarkdown>
      </article>
    </div>
  );
});
