import { useState } from "react";
import type { GhFile, GhSubmodule, GhSymlink } from "../../../api/githubTypes";
import { Badge } from "../../../ui/Badge";
import { Icon } from "../../../ui/Icon";
import { GhMarkdown } from "../GhMarkdown";
import type { GhMarkdownBase } from "../GhMarkdown";
import { bytes } from "../format";
import { githubWebUrl, safeGithubHref } from "../links";
import { WebLink } from "../parts";
import { GhEmpty } from "../state/StateView";
import { CodeBlock } from "./CodeBlock";

const MARKDOWN = /\.(md|markdown|mdx)$/i;

export interface FileViewProps {
  file: GhFile;
  owner: string;
  repo: string;
  /** URL 의 ref(없으면 기본 브랜치). */
  refName?: string;
}

/** 파일 하나. 이진·대용량·잘림은 본문 대신 이유와 GitHub 링크를 보인다. */
export function FileView({ file, owner, repo, refName }: FileViewProps) {
  const [wrap, setWrap] = useState(false);
  const isMarkdown = MARKDOWN.test(file.name);
  const [rendered, setRendered] = useState(true);
  const web = safeGithubHref(file.html_url) ?? githubWebUrl({ kind: "blob", owner, repo, ref: refName ?? file.ref, path: file.path });
  const base: GhMarkdownBase = { owner, repo, ref: refName, file: file.path };
  const hasText = !file.binary && !file.too_large && typeof file.text === "string";

  return (
    <section className="gh-file" aria-label={file.name + " 파일"}>
      <header className="gh-file__head">
        <p className="gh-file__name" title={file.path}>{file.name}</p>
        <p className="gh-file__meta">
          <span>{bytes(file.size)}</span>
          {file.truncated && <Badge tone="warning">일부만</Badge>}
        </p>
        <div className="gh-file__tools">
          {hasText && isMarkdown && (
            <div className="gh-pills" role="group" aria-label="보기 방식">
              <button type="button" aria-pressed={rendered} onClick={() => setRendered(true)}>서식</button>
              <button type="button" aria-pressed={!rendered} onClick={() => setRendered(false)}>원문</button>
            </div>
          )}
          {hasText && (!isMarkdown || !rendered) && (
            <button type="button" className="tk-button tk-button--ghost tk-button--sm" aria-pressed={wrap} onClick={() => setWrap((v) => !v)}>
              <Icon name="wrap" /><span>줄바꿈</span>
            </button>
          )}
          <WebLink href={web} />
        </div>
      </header>

      {file.binary && <GhEmpty icon="file-archive" title="이진 파일은 미리 볼 수 없어요">이미지·압축 파일 같은 이진 파일은 여기서 열지 않아요. GitHub 에서 열어 보세요.</GhEmpty>}
      {!file.binary && file.too_large && <GhEmpty icon="file-archive" title="파일이 너무 커서 보여 줄 수 없어요">{bytes(file.size)}라 이 화면에서는 내용을 불러오지 않아요. GitHub 에서 열어 보세요.</GhEmpty>}
      {!file.binary && !file.too_large && typeof file.text !== "string" && <GhEmpty icon="info" title="내용을 받지 못했어요">GitHub 에서 직접 열어 보세요.</GhEmpty>}
      {hasText && file.truncated && <p className="tk-banner tk-banner--warning" role="status"><Icon name="warning" /><span className="tk-banner__text">파일이 커서 앞부분만 보여 줘요. 전체는 GitHub 에서 열어 보세요.</span></p>}
      {hasText && isMarkdown && rendered && <GhMarkdown base={base}>{file.text ?? ""}</GhMarkdown>}
      {hasText && (!isMarkdown || !rendered) && <CodeBlock key={file.path + ":" + file.sha} text={file.text ?? ""} wrap={wrap} />}
    </section>
  );
}

/** 심볼릭 링크: 가리키는 경로만 알려 준다(따라가지 않는다). */
export function SymlinkView({ link, owner, repo, refName }: { link: GhSymlink; owner: string; repo: string; refName?: string }) {
  const web = safeGithubHref(link.html_url) ?? githubWebUrl({ kind: "blob", owner, repo, ref: refName ?? link.ref, path: link.path });
  return (
    <GhEmpty icon="child" title="심볼릭 링크예요">
      {link.target ? "이 항목은 " + link.target + " 를 가리켜요." : "가리키는 경로를 알 수 없어요."}
      <span className="gh-empty-actions"><WebLink href={web} /></span>
    </GhEmpty>
  );
}

/** 서브모듈: 다른 저장소의 한 시점이라 이 화면에서 열지 않는다. */
export function SubmoduleView({ sub }: { sub: GhSubmodule }) {
  return (
    <GhEmpty icon="git-branch" title="서브모듈이에요">
      다른 저장소를 가리키는 항목이라 여기서 열 수 없어요.
      <span className="gh-empty-actions"><WebLink href={safeGithubHref(sub.html_url)} /></span>
    </GhEmpty>
  );
}
