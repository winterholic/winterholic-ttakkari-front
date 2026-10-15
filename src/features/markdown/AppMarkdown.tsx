import { useCallback, useMemo, useRef } from "react";
import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useInRouterContext } from "react-router";
import { ApiError, resolveArtifactLink } from "../../api/client";
import type { UUID } from "../../api/types";
import { toast } from "../../ui/toastStore";
import { classifyHref, fileLinkErrorText, joinFromBase, linkUrlTransform } from "./linkTarget";

export interface AppMarkdownProps {
  children: string;
  /** 상대경로를 풀 작업 폴더와, 같은 세션의 결과물을 먼저 찾는 힌트. */
  workspaceId?: UUID | null;
  sessionId?: UUID | null;
  /** 상대경로의 기준 폴더(작업 폴더 기준). 문서를 보는 뷰어가 그 문서의 폴더를 넘긴다. */
  baseDir?: string | null;
  /** 로컬 파일 링크를 결과물 뷰어로 연다. 없으면 파일 링크는 눌리지 않는 경로 표기로만 보인다(뷰어가 없는 화면). */
  onOpenArtifact?: (id: UUID) => void;
}

type AnchorProps = ComponentProps<"a">;

/**
 * 채팅·보고·문서·메모가 함께 쓰는 마크다운. 링크를 종류별로 다룬다.
 * 외부 http(s) 는 새 탭, 앱 라우트는 라우터, 이 Mac 의 파일 경로는 결과물 뷰어로 연다.
 */
export function AppMarkdown({ children, workspaceId, sessionId, baseDir, onOpenArtifact }: AppMarkdownProps) {
  const inRouter = useInRouterContext();
  const busy = useRef(false);
  const canOpen = onOpenArtifact !== undefined;

  const openFile = useCallback(async (path: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const art = await resolveArtifactLink({ path: joinFromBase(baseDir, path), workspace_id: workspaceId, session_id: sessionId });
      onOpenArtifact?.(art.id);
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      toast({
        tone: "danger",
        message: apiErr ? fileLinkErrorText(apiErr.code, apiErr.message) : "Mac Studio 에 연결하지 못했어요. 네트워크를 확인해 주세요.",
      });
    } finally {
      busy.current = false;
    }
  }, [baseDir, workspaceId, sessionId, onOpenArtifact]);

  const components = useMemo<Components>(
    () => ({
      a({ href, children: label }: AnchorProps) {
        const t = classifyHref(href);
        switch (t.kind) {
          case "external":
            return (
              <a href={t.href} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            );
          case "route":
            return inRouter ? (
              <Link to={t.to}>{label}</Link>
            ) : (
              <a href={t.to}>
                {label}
              </a>
            );
          case "anchor":
          case "passthrough":
            return (
              <a href={t.href}>
                {label}
              </a>
            );
          case "file":
            return canOpen ? (
              <a
                href="#"
                title={t.path}
                data-file-link=""
                onClick={(e) => {
                  e.preventDefault();
                  void openFile(t.path);
                }}
              >
                {label}
              </a>
            ) : (
              <code title={t.path}>{label}</code>
            );
          default:
            return <span>{label}</span>;
        }
      },
    }),
    [canOpen, inRouter, openFile],
  );

  return (
    <Markdown remarkPlugins={[remarkGfm]} urlTransform={linkUrlTransform} components={components}>
      {children}
    </Markdown>
  );
}
