import { useEffect, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router";
import { ApiError, patchWorkspace } from "../api/client";
import type { WorkspaceOut } from "../api/types";
import { errorText } from "../features/viewer/api";
import { ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { DEFAULT_WORKSPACE_KEY, useDefaultWorkspace } from "../features/workspace/useDefaultWorkspace";
import { AccountsSection } from "../features/accounts/AccountsSection";
import { QwenWorkerSection } from "../features/accounts/QwenWorkerSection";
import { GoogleAccountSection } from "../features/google-account/GoogleAccountSection";
import { ShortcutSection } from "../features/transfer/ShortcutSection";
import { TtsSection } from "../features/tts/TtsSection";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import "./settings.css";

const ROOT_ERRORS: Record<string, string> = {
  outside_root: "허용된 상위 경로 밖이에요. 서버 설정(TTAKKARI_ALLOWED_ROOTS)에 든 폴더 안쪽만 추가할 수 있어요.",
  sensitive: "민감한 폴더라 추가할 수 없어요.",
  not_found: "그런 폴더가 없어요.",
  not_a_dir: "폴더가 아니에요.",
  bad_path: "절대 경로로 적어 주세요. 예: /Users/me/docs",
};

export function AccountsPage() {
  const { hash } = useLocation();
  // 기존 섹션 링크도 통합 화면에서 유지한다.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);
  return (
    <div className="tk-screen">
      <PageHeader title="계정 관리" />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--md">
          <AccountsSection />
          <QwenWorkerSection />
          <GoogleAccountSection />
          <TtsSection />
          <ShortcutSection />
          <WritableRootsSection />
        </div>
      </div>
    </div>
  );
}

/** Old bookmarks keep their section and query; the duplicate Settings page is retired. */
export function LegacySettingsRedirect() {
  const { search, hash } = useLocation();
  return <Navigate replace to={`/accounts${search}${hash}`} />;
}

function WritableRootsSection() {
  const ws = useDefaultWorkspace();
  const id = useId();
  if (ws.data) return <WritableRoots ws={ws.data} />;
  return <section className="tk-section" aria-labelledby={`${id}-title`}>
    <div className="tk-section__head"><h2 className="tk-section__title" id={`${id}-title`}>권한 폴더</h2></div>
    {ws.isPending && <ListSkeleton rows={2} label="권한 폴더를 불러오는 중" />}
    {ws.isError && <ErrorState error={ws.error} what="권한 폴더" onRetry={() => void ws.refetch()} />}
  </section>;
}

function WritableRoots({ ws }: { ws: WorkspaceOut }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const id = useId();
  const save = useMutation({
    mutationFn: (roots: string[]) => patchWorkspace(ws.id, { extra_writable_roots: roots }),
    onSuccess: (next) => {
      qc.setQueryData(DEFAULT_WORKSPACE_KEY, next);
      setDraft("");
    },
  });
  const err = save.error
    ? save.error instanceof ApiError
      ? { message: ROOT_ERRORS[save.error.code] ?? save.error.message, code: save.error.code }
      : errorText(save.error)
    : null;
  const roots = ws.extra_writable_roots;
  const add = () => {
    const p = draft.trim();
    if (p && !save.isPending) save.mutate([...roots, p]);
  };

  return (
    <section className="tk-section" aria-labelledby={`${id}-title`}>
      <div className="tk-section__head">
        <h2 className="tk-section__title" id={`${id}-title`}>권한 폴더</h2>
      </div>
      <p className="tk-fieldset__help">따까리가 파일을 만들고 고칠 수 있는 폴더예요. 목록 밖은 읽기만 하고, 인증 정보 파일은 읽지도 못해요.</p>
      <ul className="tk-list" aria-label="권한 폴더 목록">
        <li>
          <div className="tk-list__item">
            <span className="tk-glyph" data-type="other"><Icon name="terminal" /></span>
            <span className="tk-list__body">
              <span className="tk-list__title tk-list__title--wrap tk-mono">{ws.root_path}</span>
              <span className="tk-list__meta"><span>실행 위치 · 뺄 수 없어요</span></span>
            </span>
          </div>
        </li>
        {roots.map((r) => (
          <li key={r}>
            <div className="tk-list__item">
              <span className="tk-glyph" data-type="other"><Icon name="folder" /></span>
              <span className="tk-list__body">
                <span className="tk-list__title tk-list__title--wrap tk-mono">{r}</span>
              </span>
              <span className="tk-list__end">
                <button
                  className="tk-icon-button tk-icon-button--sm"
                  type="button"
                  aria-label={`${r} 권한 빼기`}
                  aria-disabled={save.isPending || undefined}
                  onClick={() => !save.isPending && save.mutate(roots.filter((x) => x !== r))}
                >
                  <Icon name="trash" />
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <form className="tk-field" onSubmit={(e) => { e.preventDefault(); add(); }} aria-label="권한 폴더 추가">
        <label className="tk-label" htmlFor={`${id}-path`}>폴더 추가</label>
        <div className="settings-add">
          <input
            id={`${id}-path`}
            className="tk-input tk-input--mono"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="/Users/me/docs"
            aria-invalid={Boolean(err) || undefined}
            aria-describedby={err ? `${id}-err` : undefined}
          />
          <button className="tk-button tk-button--primary" type="submit" aria-disabled={!draft.trim() || undefined} aria-busy={save.isPending || undefined}>
            추가
          </button>
        </div>
        {err && (
          <p className="tk-error" id={`${id}-err`} role="alert">
            {err.message} {err.code && <code>{err.code}</code>}
          </p>
        )}
      </form>
    </section>
  );
}
