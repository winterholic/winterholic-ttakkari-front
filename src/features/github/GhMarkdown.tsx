import { useContext, useMemo } from "react";
import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router";
import { GhContext } from "./GithubContext";
import { ghPath, resolveRelative, safeGithubHref } from "./links";

export interface GhMarkdownBase {
  owner: string;
  repo: string;
  ref?: string;
  /** 이 문서의 저장소 안 경로. 상대 링크의 기준이다. */
  file: string;
}

/**
 * README·이슈·댓글처럼 GitHub 에서 온 마크다운(남이 쓴 글). 신뢰하지 않는다.
 * - 원시 HTML 은 렌더하지 않는다(skipHtml).
 * - 이미지는 불러오지 않고 이름만 보이거나, https://github.com 이면 링크로만 둔다.
 * - 외부 링크는 https://github.com 만 새 탭(noopener noreferrer)으로 열고, 나머지는 눌리지 않는 글자로 남긴다.
 * - 저장소 상대 링크는 base 가 있을 때만 같은 계정·ref 의 코드 화면으로 잇는다.
 */
export function GhMarkdown({ children, base }: { children: string; base?: GhMarkdownBase }) {
  const ctx = useContext(GhContext);
  const account = ctx?.account;
  const components = useMemo<Components>(
    () => ({
      a({ href, children: label }: ComponentProps<"a">) {
        const safe = safeGithubHref(href);
        if (safe) return <a href={safe} target="_blank" rel="noopener noreferrer">{label}</a>;
        if (href && base && account) {
          const path = resolveRelative(base.file, href);
          if (path) return <Link to={ghPath(account, { owner: base.owner, repo: base.repo, section: "code", ref: base.ref, path })}>{label}</Link>;
        }
        return <span className="gh-md__blocked" title={href ?? undefined}>{label}</span>;
      },
      img({ src, alt }: ComponentProps<"img">) {
        const text = "이미지: " + (alt || "설명 없음");
        const safe = typeof src === "string" ? safeGithubHref(src) : null;
        return safe
          ? <a className="gh-md__image" href={safe} target="_blank" rel="noopener noreferrer">{text}</a>
          : <span className="gh-md__image" title={typeof src === "string" ? src : undefined}>{text}</span>;
      },
      table({ children: rows }: ComponentProps<"table">) {
        return <div className="tk-table-wrap"><table>{rows}</table></div>;
      },
    }),
    [base, account],
  );
  return (
    <div className="tk-prose tk-prose--compact gh-md">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={components}>{children}</Markdown>
    </div>
  );
}
