import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getArtcraftAgentConfig } from "../../api/client";
import type { ArtcraftSnippetKind } from "../../api/artcraftTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ErrorState, ListSkeleton } from "../viewer/screenStates";
import { SNIPPET_KINDS, SNIPPET_LABEL, copyText } from "./format";

export function AgentTab({ focus }: { focus?: string | null }) {
  const [kind, setKind] = useState<ArtcraftSnippetKind>("json");
  const [openApp, setOpenApp] = useState<string | null>(focus ?? null);
  const query = useQuery({ queryKey: ["artcraft", "agent-config"], queryFn: getArtcraftAgentConfig, staleTime: 60_000 });
  if (query.isPending) return <ListSkeleton label="MCP 설정을 만드는 중" />;
  if (query.isError) return <ErrorState what="MCP 설정" error={query.error} onRetry={() => void query.refetch()} />;
  const { apps, all, note } = query.data;
  return (
    <section className="ac-stack" aria-label="에이전트 연결 정보">
      <p className="ac-note">{note}</p>
      <div className="ac-pills" role="group" aria-label="복사 형식">
        {SNIPPET_KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{SNIPPET_LABEL[k]}</button>
        ))}
      </div>
      <div className="ac-card">
        <p className="ac-card__lead">13개 전체를 한 번에 넣을 JSON</p>
        <div className="ac-actions">
          <Button size="sm" onClick={() => copyText(all.json, "전체 MCP 설정 JSON")}><Icon name="copy" />전체 JSON 복사</Button>
        </div>
      </div>
      <ul className="ac-list">
        {apps.map((a) => {
          const open = openApp === a.app;
          const text = a.snippets[kind];
          return (
            <li key={a.app} className="ac-card" id={`agent-${a.app}`}>
              <div className="ac-card__head">
                <div className="ac-card__title">
                  <h3>{a.title}</h3>
                  <span className="ac-card__domain ac-mono">{a.server}</span>
                </div>
                {a.tool_count != null && <Badge>{a.tool_count}개 도구</Badge>}
              </div>
              {a.notes.map((n) => <p key={n} className="ac-note">{n}</p>)}
              <div className="ac-actions">
                <Button size="sm" onClick={() => copyText(text, `${a.title} ${SNIPPET_LABEL[kind]} 설정`)}><Icon name="copy" />{SNIPPET_LABEL[kind]} 복사</Button>
                <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpenApp(open ? null : a.app)}>{open ? "미리보기 접기" : "미리보기"}</Button>
              </div>
              {open && <pre className="ac-pre" tabIndex={0}>{text}</pre>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
