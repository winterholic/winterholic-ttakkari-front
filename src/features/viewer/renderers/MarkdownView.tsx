import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** 찾기가 DOM 을 직접 감싸므로 text 가 바뀌지 않는 한 다시 그리지 않는다(memo). */
export const MarkdownView = memo(function MarkdownView({ text, articleRef }: { text: string; articleRef: React.Ref<HTMLElement> }) {
  return (
    <div className="tk-viewer__doc">
      <article className="tk-prose" ref={articleRef}>
        <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
      </article>
    </div>
  );
});
