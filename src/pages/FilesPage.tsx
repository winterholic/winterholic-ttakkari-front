import { useId, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWorkspace, listFiles, listWorkspaces, registerArtifact, searchFiles } from "../api/client";
import type { FileEntry, UUID, WorkspaceOut } from "../api/types";
import { ApiError } from "../api/client";
import { errorText } from "../features/viewer/api";
import { ArtifactViewerHost } from "../features/viewer/ArtifactViewerHost";
import { useDebounced } from "../features/viewer/hooks";
import { formatSize, formatWhen, glyphTypeForFilename } from "../features/viewer/kinds";
import { EmptyState, ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { useArtifactViewer } from "../features/viewer/useArtifactViewer";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";

/** 백엔드 오류 코드 → 사람 말. 모르는 코드는 서버 메시지를 그대로 보여 준다. */
const REGISTER_ERRORS: Record<string, string> = {
  outside_root: "허용된 위치 밖의 경로예요. 서버에 허용된 루트 안의 폴더를 입력해 주세요.",
};

export function FilesPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const wsList = useQuery({ queryKey: ["workspaces"], queryFn: () => listWorkspaces() });
  const workspaces = wsList.data ?? [];
  const wsParam = params.get("ws");
  const ws: WorkspaceOut | undefined = workspaces.find((w) => w.id === wsParam) ?? workspaces[0];
  const path = params.get("path") ?? ".";
  const showHidden = params.get("hidden") === "1";
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 300);
  const [adding, setAdding] = useState(false);

  const setNav = (patch: Record<string, string | null>) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      return next;
    });

  const listing = useQuery({
    queryKey: ["files", ws?.id, path, showHidden],
    queryFn: () => listFiles(ws!.id, path, showHidden),
    enabled: Boolean(ws) && q === "",
  });
  const found = useQuery({
    queryKey: ["file-search", ws?.id, q],
    queryFn: () => searchFiles(ws!.id, q),
    enabled: Boolean(ws) && q !== "",
  });

  const form = !wsList.isLoading && (workspaces.length === 0 || adding);
  const onCreated = (w: WorkspaceOut) => {
    void qc.invalidateQueries({ queryKey: ["workspaces"] });
    setAdding(false);
    setNav({ ws: w.id, path: null });
  };

  return (
    <div className="tk-screen">
      <PageHeader title="파일 찾기" meta={ws ? `${ws.name} · ${ws.root_path}` : undefined} />
      <ArtifactViewerHost>
        <div className="tk-screen__body">
          <div className="tk-container tk-container--md">
            {wsList.isLoading && <ListSkeleton rows={4} label="워크스페이스를 불러오는 중" />}
            {wsList.isError && <ErrorState error={wsList.error} what="워크스페이스" onRetry={() => void wsList.refetch()} />}
            {form && <WorkspaceForm first={workspaces.length === 0} onCreated={onCreated} onCancel={workspaces.length ? () => setAdding(false) : undefined} />}
            {ws && !form && (
              <>
                <div className="tk-filterbar" role="search">
                  <div className="tk-filterbar__row">
                    <span className="tk-select">
                      <select aria-label="워크스페이스" value={ws.id} onChange={(e) => { setText(""); setNav({ ws: e.target.value, path: null }); }}>
                        {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </span>
                    <button className="tk-icon-button tk-icon-button--secondary" type="button" aria-label="워크스페이스 등록" onClick={() => setAdding(true)}><Icon name="plus" /></button>
                  </div>
                  <div className="tk-filterbar__row">
                    <span className="tk-input-wrap">
                      <Icon name="search" />
                      <input className="tk-input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="파일 이름으로 찾기" aria-label="파일 이름 검색" />
                    </span>
                  </div>
                  <div className="tk-chips" role="group" aria-label="보기 옵션">
                    <button className="tk-chip" type="button" aria-pressed={showHidden} onClick={() => setNav({ hidden: showHidden ? null : "1" })}><Icon name="eye" />숨김 파일</button>
                  </div>
                  {q === "" && <Breadcrumb ws={ws} path={path} onGo={(p) => setNav({ path: p === "." ? null : p })} />}
                  <p className="tk-filterbar__count" role="status">
                    {q !== "" ? (found.isSuccess ? `${found.data.length}개 찾음 · 이름 기준` : "") : listing.isSuccess ? `${listing.data.entries.length}개 항목` : ""}
                  </p>
                </div>

                {q !== "" ? (
                  <FileResults query={found} wsId={ws.id} showPath empty={<EmptyState icon="folder-search" title="허용된 위치에서 못 찾았어요">검색어를 바꿔 보세요. 허용된 위치 밖과 인증 정보 파일은 결과에 나오지 않아요.</EmptyState>} onRetry={() => void found.refetch()} onOpenDir={() => {}} />
                ) : (
                  <FileResults
                    query={listing}
                    wsId={ws.id}
                    entriesOf={(d) => d.entries}
                    empty={<EmptyState icon="folder-open" title="이 폴더는 비어 있어요">{showHidden ? "숨김 파일까지 봐도 비어 있어요." : "숨김 파일은 위의 숨김 파일 칩으로 볼 수 있어요."}</EmptyState>}
                    onRetry={() => void listing.refetch()}
                    onOpenDir={(p) => setNav({ path: p })}
                    notice={listing.data?.truncated ? "항목이 많아 앞부분만 보여요. 파일 이름 검색으로 좁혀 보세요." : undefined}
                  />
                )}
                <aside className="tk-callout tk-callout--note" role="note">
                  <Icon name="info" className="tk-callout__icon" />
                  <div className="tk-callout__body"><strong className="tk-callout__title">찾을 수 있는 곳만 찾아요</strong><p>워크스페이스 밖 경로와 인증 정보(키·토큰·.env)는 목록에 나오지 않거나 민감으로 표시돼요.</p></div>
                </aside>
              </>
            )}
          </div>
        </div>
      </ArtifactViewerHost>
    </div>
  );
}

function Breadcrumb({ ws, path, onGo }: { ws: WorkspaceOut; path: string; onGo: (p: string) => void }) {
  const segs = path === "." ? [] : path.split("/").filter(Boolean);
  return (
    <nav className="tk-path" aria-label="현재 위치">
      <ol>
        <li>{segs.length === 0 ? <span aria-current="location">{ws.name}</span> : <a href="#root" onClick={(e) => { e.preventDefault(); onGo("."); }}>{ws.name}</a>}</li>
        {segs.map((s, i) => {
          const to = segs.slice(0, i + 1).join("/");
          return (
            <li key={to}>
              {i === segs.length - 1 ? <span aria-current="location">{s}</span> : <a href={`#${to}`} onClick={(e) => { e.preventDefault(); onGo(to); }}>{s}</a>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type Q<T> = { isLoading: boolean; isError: boolean; isSuccess: boolean; error: unknown; data: T | undefined };

function FileResults<T extends FileEntry[] | { entries: FileEntry[]; truncated: boolean }>({
  query, wsId, entriesOf, showPath, empty, onRetry, onOpenDir, notice,
}: {
  query: Q<T>;
  wsId: UUID;
  entriesOf?: (d: T) => FileEntry[];
  showPath?: boolean;
  empty: React.ReactNode;
  onRetry: () => void;
  onOpenDir: (relPath: string) => void;
  notice?: string;
}) {
  if (query.isLoading) return <ListSkeleton label="파일을 찾는 중" />;
  if (query.isError) return <ErrorState error={query.error} what="파일 목록" onRetry={onRetry} />;
  if (!query.data) return null;
  const entries = entriesOf ? entriesOf(query.data) : (query.data as FileEntry[]);
  if (entries.length === 0) return <>{empty}</>;
  return (
    <>
      {notice && <p className="tk-banner tk-banner--warning" role="status"><Icon name="warning" /><span className="tk-banner__text">{notice}</span></p>}
      <ul className="tk-list" aria-label="파일 목록">
        {entries.map((e) => <li key={e.rel_path}><FileRow e={e} wsId={wsId} showPath={showPath} onOpenDir={onOpenDir} /></li>)}
      </ul>
    </>
  );
}

function FileRow({ e, wsId, showPath, onOpenDir }: { e: FileEntry; wsId: UUID; showPath?: boolean; onOpenDir: (p: string) => void }) {
  const { open } = useArtifactViewer();
  const qc = useQueryClient();
  const reg = useMutation({
    mutationFn: () => registerArtifact({ workspace_id: wsId, rel_path: e.rel_path }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ["artifacts"] });
      open(a.id);
    },
  });
  const isDir = e.type === "dir";
  const glyph = isDir ? { type: "other", icon: "folder" as const } : glyphTypeForFilename(e.name);
  const err = reg.error ? (reg.error instanceof ApiError ? { message: REGISTER_ERRORS[reg.error.code] ?? reg.error.message, code: reg.error.code } : errorText(reg.error)) : null;
  const body = (
    <>
      <span className="tk-glyph" data-type={glyph.type}><Icon name={glyph.icon} /></span>
      <span className="tk-list__body">
        <span className="tk-list__title">{e.name}{isDir && "/"}</span>
        <span className="tk-list__meta">
          {showPath && <span className="tk-mono">{e.rel_path}</span>}
          {!isDir && e.size !== null && <span>{formatSize(e.size)}</span>}
          {e.modified_at && <span>{formatWhen(e.modified_at)}</span>}
        </span>
        {err && <span className="tk-error" role="alert">{err.message}{err.code && <> <code>{err.code}</code></>}</span>}
      </span>
    </>
  );
  const sensitive = e.sensitive && <span className="tk-policy" data-policy="restricted"><Icon name="lock" />민감</span>;
  if (isDir) {
    return (
      <button className="tk-list__item tk-artifact tk-list__item--interactive" type="button" onClick={() => onOpenDir(e.rel_path)}>
        {body}
        {sensitive && <span className="tk-list__end">{sensitive}</span>}
      </button>
    );
  }
  return (
    <div className="tk-list__item tk-artifact" aria-disabled={e.type !== "file" || undefined}>
      {body}
      <span className="tk-list__end">
        {sensitive}
        {e.type === "file" && (
          <button className="tk-button tk-button--sm" type="button" aria-busy={reg.isPending || undefined} onClick={() => !reg.isPending && reg.mutate()}>
            {reg.isPending ? "등록 중" : "결과물로 등록"}
          </button>
        )}
      </span>
    </div>
  );
}

function WorkspaceForm({ first, onCreated, onCancel }: { first: boolean; onCreated: (w: WorkspaceOut) => void; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [root, setRoot] = useState("");
  const m = useMutation({ mutationFn: () => createWorkspace({ name: name.trim(), root_path: root.trim() }), onSuccess: onCreated });
  const err = m.error instanceof ApiError ? { message: REGISTER_ERRORS[m.error.code] ?? m.error.message, code: m.error.code, fields: m.error.errors } : m.error ? { ...errorText(m.error), fields: undefined } : null;
  const ready = name.trim() !== "" && root.trim() !== "";
  const nameId = useId();
  return (
    <form className="tk-fieldset" onSubmit={(e) => { e.preventDefault(); if (ready && !m.isPending) m.mutate(); }} aria-label="워크스페이스 등록">
      {first && (
        <EmptyState icon="folder-search" title="워크스페이스를 먼저 등록해 주세요">
          에이전트가 일하고 파일을 찾을 폴더예요. 서버에 허용된 위치 안의 폴더만 등록할 수 있어요.
        </EmptyState>
      )}
      <div className="tk-field">
        <label className="tk-label" htmlFor={nameId}>이름</label>
        <input id={nameId} className="tk-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: e2e" aria-invalid={Boolean(err) || undefined} />
      </div>
      <div className="tk-field">
        <label className="tk-label" htmlFor={`${nameId}-root`}>폴더 경로</label>
        <input id={`${nameId}-root`} className="tk-input tk-input--mono" value={root} onChange={(e) => setRoot(e.target.value)} placeholder="/Users/me/development/project" aria-invalid={Boolean(err) || undefined} aria-describedby={err ? `${nameId}-err` : undefined} />
        {err && (
          <p className="tk-error" id={`${nameId}-err`} role="alert">
            {err.message} <code>{err.code}</code>
            {err.fields?.map((f, i) => <span key={i}> {f.loc.join(".")}: {f.msg}</span>)}
          </p>
        )}
      </div>
      <div className="tk-button-group">
        {onCancel && <button className="tk-button" type="button" onClick={onCancel}>취소</button>}
        <button className="tk-button tk-button--primary" type="submit" aria-disabled={!ready || undefined} aria-busy={m.isPending || undefined}>등록</button>
      </div>
    </form>
  );
}
