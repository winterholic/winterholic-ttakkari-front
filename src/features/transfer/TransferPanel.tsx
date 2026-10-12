import { useEffect, useId, useRef, useState } from "react";
import type React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { makeTransferFolder, transferFolders } from "../../api/client";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { formatSize } from "../viewer/kinds";
import { addFiles, cancel, clearFinished, isBusy, retry, useTransfers } from "./transferStore";
import type { TransferItem, TransferOptions } from "./transferStore";
import "./transfer.css";

const DEST_KEY = "tk-transfer-dest";
const OPTS_KEY = "tk-transfer-options";
const DEFAULT_OPTS: TransferOptions = { convertHeic: true, stripLocation: true, keepOriginal: false };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // 사파리 개인정보 보호 모드 등에서는 기억만 못 한다.
  }
}

function loadDest(): string | null {
  try {
    return localStorage.getItem(DEST_KEY);
  } catch {
    return null;
  }
}

/** /Users/me/docs/inbox → ~/docs/inbox. 폰 화면에서 경로가 덜 길게 보이게. */
export function shortPath(p: string, home?: string): string {
  const h = home ?? /^\/Users\/[^/]+/.exec(p)?.[0];
  return h && p.startsWith(h) ? `~${p.slice(h.length)}` : p;
}

const isIOS = typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent);

/** 파일 > 보내기. 폰에서 내 컴퓨터의 권한 폴더로 파일을 보낸다. */
export function TransferPanel() {
  const top = useQuery({ queryKey: ["transfer-folders", null], queryFn: () => transferFolders() });
  const [dest, setDest] = useState<string | null>(loadDest);
  const [opts, setOpts] = useState<TransferOptions>(() => load(OPTS_KEY, DEFAULT_OPTS));
  const [picking, setPicking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const items = useTransfers();
  const destPath = dest ?? top.data?.default ?? null;
  const photos = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const anyFile = useRef<HTMLInputElement>(null);
  const id = useId();

  const send = (files: File[]) => {
    if (!destPath || files.length === 0) return;
    addFiles(files, destPath, opts);
  };

  // 데스크톱·아이패드: 붙여넣기(스크린샷 등)도 바로 보낸다.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        send(files);
        toast({ message: `붙여넣은 파일 ${files.length}개를 보내요.` });
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  const setOpt = (k: keyof TransferOptions) => {
    const next = { ...opts, [k]: !opts[k] };
    setOpts(next);
    save(OPTS_KEY, next);
  };

  const busy = items.filter(isBusy).length;
  const finished = items.length - busy;

  return (
    <div
      className="transfer"
      data-dragging={dragging || undefined}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        send(Array.from(e.dataTransfer.files));
      }}
    >
      <section className="transfer__dest" aria-label="받는 폴더">
        <span className="tk-glyph" data-type="other"><Icon name="folder" /></span>
        <span className="transfer__dest-body">
          <span className="transfer__dest-label">받는 폴더 · Mac Studio</span>
          <span className="transfer__dest-path tk-mono">{destPath ? shortPath(destPath) : "불러오는 중"}</span>
        </span>
        <button className="tk-button tk-button--sm" type="button" onClick={() => setPicking(true)} disabled={!top.data}>
          바꾸기
        </button>
      </section>
      {top.isError && <p className="tk-error" role="alert">{errorText(top.error).message}</p>}

      <div className="transfer__actions">
        {/* 아이폰은 accept 에 따라 사진 보관함 / 카메라 / 파일 앱을 각각 연다.
            input 에 hidden(display:none)을 주면 iOS 가 선택 메뉴를 붙일 기준 상자를 못 찾아 엉뚱한 곳에 띄운다.
            그래서 input 을 투명하게 버튼 위에 겹쳐 둔다. */}
        <div className="transfer__slot">
          <button className="transfer__action" type="button" onClick={() => photos.current?.click()} disabled={!destPath}>
            <Icon name="image" />
            <span>사진·동영상</span>
          </button>
          <input className="transfer__file" ref={photos} type="file" accept="image/*,video/*" multiple tabIndex={-1} aria-hidden="true" onChange={(e) => { send(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </div>
        <div className="transfer__slot">
          <button className="transfer__action" type="button" onClick={() => camera.current?.click()} disabled={!destPath}>
            <Icon name="camera" />
            <span>카메라로 찍기</span>
          </button>
          <input className="transfer__file" ref={camera} type="file" accept="image/*,video/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={(e) => { send(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </div>
        <div className="transfer__slot">
          <button className="transfer__action" type="button" onClick={() => anyFile.current?.click()} disabled={!destPath}>
            <Icon name="file-text" />
            <span>파일</span>
          </button>
          <input className="transfer__file" ref={anyFile} type="file" multiple tabIndex={-1} aria-hidden="true" onChange={(e) => { send(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </div>
      </div>
      <p className="transfer__drop-hint">{isIOS ? "여러 장을 한 번에 골라도 돼요." : "여기로 끌어다 놓거나 붙여넣어도 보내져요."}</p>

      {items.length > 0 && (
        <section className="tk-section transfer__queue" aria-labelledby={`${id}-q`}>
          <div className="tk-section__head">
            <h2 className="tk-section__title" id={`${id}-q`}>{busy > 0 ? `보내는 중 ${busy}개` : "보낸 파일"}</h2>
            {finished > 0 && (
              <button className="tk-button tk-button--xs tk-button--ghost" type="button" onClick={clearFinished}>
                목록 정리
              </button>
            )}
          </div>
          {busy > 0 && isIOS && (
            <aside className="tk-callout tk-callout--note" role="status">
              <Icon name="info" className="tk-callout__icon" />
              <div className="tk-callout__body"><p>이 화면을 켜 두면 가장 빨라요. 다른 앱에 다녀오면 끊긴 곳부터 이어서 보내요.</p></div>
            </aside>
          )}
          <ul className="tk-list" aria-label="보내기 목록">
            {[...items].reverse().map((it) => (
              <li key={it.key}><TransferRow it={it} /></li>
            ))}
          </ul>
        </section>
      )}

      {/* legend 에 tk-sr-only 를 주면 .tk-fieldset > legend 의 width:100% 와 겹쳐 페이지가 옆으로 밀린다. */}
      <fieldset className="tk-fieldset transfer__opts" aria-label="사진 옵션">
        <label className="tk-switch tk-switch--row">
          <input type="checkbox" role="switch" checked={opts.convertHeic} onChange={() => setOpt("convertHeic")} />
          <span>HEIC 사진을 JPG로 바꾸기<span className="tk-choice__desc">아이폰 사진이 어디서든 열려요. 방향도 바로잡아요.</span></span>
        </label>
        {opts.convertHeic && (
          <label className="tk-switch tk-switch--row">
            <input type="checkbox" role="switch" checked={opts.keepOriginal} onChange={() => setOpt("keepOriginal")} />
            <span>원본 HEIC도 남기기</span>
          </label>
        )}
        <label className="tk-switch tk-switch--row">
          <input type="checkbox" role="switch" checked={opts.stripLocation} onChange={() => setOpt("stripLocation")} />
          <span>사진 위치 정보 지우기<span className="tk-choice__desc">촬영 장소(GPS)를 빼고 저장해요.</span></span>
        </label>
      </fieldset>

      {picking && top.data && (
        <FolderPicker
          initial={destPath ?? top.data.default}
          roots={top.data.roots}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setDest(p);
            save(DEST_KEY, p);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

const STATE_TEXT: Record<TransferItem["state"], string> = {
  queued: "대기",
  uploading: "보내는 중",
  processing: "마무리 중",
  done: "완료",
  failed: "실패",
  cancelled: "취소됨",
};

function TransferRow({ it }: { it: TransferItem }) {
  const pct = it.size ? it.sent / it.size : 1;
  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast({ message: "경로를 복사했어요." }));
  const delivered = it.files ?? [];
  return (
    <div className="tk-list__item transfer-row" data-state={it.state}>
      <span className="tk-list__body">
        <span className="tk-list__title">{delivered[0]?.name ?? it.name}</span>
        <span className="tk-list__meta">
          <span>{STATE_TEXT[it.state]}</span>
          <span>{it.state === "uploading" ? `${formatSize(it.sent)} / ${formatSize(it.size)}` : formatSize(it.size)}</span>
          {it.state === "done" && delivered[0] && <span className="tk-mono">{shortPath(delivered[0].path.replace(/\/[^/]+$/, ""))}</span>}
        </span>
        {(it.state === "uploading" || it.state === "processing") && (
          <span
            className="tk-progress"
            role="progressbar"
            aria-label={`${it.name} 보내기`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct * 100)}
            data-indeterminate={it.state === "processing" ? "" : undefined}
            style={{ "--tk-progress": pct } as React.CSSProperties}
          />
        )}
        {it.notes && it.notes.length > 0 && <span className="transfer-row__notes">{it.notes.join(" · ")}</span>}
        {delivered.length > 1 && <span className="transfer-row__notes">함께 저장: {delivered.slice(1).map((f) => f.name).join(", ")}</span>}
        {it.error && <span className="tk-error" role="alert">{it.error}</span>}
      </span>
      <span className="tk-list__end">
        {(it.state === "queued" || it.state === "uploading") && (
          <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label={`${it.name} 보내기 취소`} onClick={() => cancel(it.key)}>
            <Icon name="x" />
          </button>
        )}
        {(it.state === "failed" || it.state === "cancelled") && (
          <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label={`${it.name} 다시 보내기`} onClick={() => retry(it.key)}>
            <Icon name="retry" />
          </button>
        )}
        {it.state === "done" && delivered[0] && (
          <>
            <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="저장 경로 복사" onClick={() => copy(delivered[0].path)}>
              <Icon name="copy" />
            </button>
            {delivered[0].artifact_id && (
              <Link className="tk-icon-button tk-icon-button--sm" to={`/library?artifact=${delivered[0].artifact_id}`} aria-label="보관함에서 열기">
                <Icon name="external-link" />
              </Link>
            )}
          </>
        )}
      </span>
    </div>
  );
}

function FolderPicker({ initial, roots, onPick, onClose }: { initial: string; roots: { name: string; path: string }[]; onPick: (p: string) => void; onClose: () => void }) {
  const qc = useQueryClient();
  const [path, setPath] = useState<string | null>(roots.some((r) => initial.startsWith(r.path)) ? initial : null);
  const [newName, setNewName] = useState("");
  const q = useQuery({ queryKey: ["transfer-folders", path], queryFn: () => transferFolders(path ?? undefined), enabled: path !== null, retry: false });
  const mk = useMutation({
    mutationFn: () => makeTransferFolder(`${path}/${newName.trim()}`),
    onSuccess: (f) => {
      setNewName("");
      void qc.invalidateQueries({ queryKey: ["transfer-folders", path] });
      setPath(f.path);
    },
  });
  // 아직 없는 폴더(기본 inbox 등)는 서버가 404 를 준다. 그래도 그 경로를 고를 수 있게 한다.
  const missing = q.isError;
  return (
    <Dialog
      size="lg"
      open
      onClose={onClose}
      title="받는 폴더"
      id="transfer-folder"
      footer={
        <>
          <button className="tk-button" type="button" onClick={onClose}>취소</button>
          <button className="tk-button tk-button--primary" type="button" disabled={!path} onClick={() => path && onPick(path)}>
            이 폴더로
          </button>
        </>
      }
    >
      <p className="transfer-picker__path tk-mono">{path ? shortPath(path) : "권한 폴더를 골라 주세요"}</p>
      {missing && <p className="tk-help"><span>아직 없는 폴더예요. 첫 파일을 보낼 때 만들어요.</span></p>}
      <ul className="tk-list" aria-label="폴더">
        {path === null
          ? roots.map((r) => (
              <li key={r.path}>
                <button className="tk-list__item tk-list__item--interactive" type="button" onClick={() => setPath(r.path)}>
                  <span className="tk-glyph" data-type="other"><Icon name="folder" /></span>
                  <span className="tk-list__body"><span className="tk-list__title tk-mono">{shortPath(r.path)}</span></span>
                </button>
              </li>
            ))
          : (
            <>
              <li>
                <button
                  className="tk-list__item tk-list__item--interactive"
                  type="button"
                  onClick={() => setPath(q.data?.parent ?? (missing ? path.replace(/\/[^/]+$/, "") : null))}
                >
                  <span className="tk-glyph" data-type="other"><Icon name="back" /></span>
                  <span className="tk-list__body"><span className="tk-list__title">{q.data?.parent || missing ? "위로" : "권한 폴더 목록"}</span></span>
                </button>
              </li>
              {(q.data?.dirs ?? []).map((d) => (
                <li key={d.path}>
                  <button className="tk-list__item tk-list__item--interactive" type="button" onClick={() => setPath(d.path)}>
                    <span className="tk-glyph" data-type="other"><Icon name="folder" /></span>
                    <span className="tk-list__body"><span className="tk-list__title">{d.name}</span></span>
                    <Icon name="chevron-right" className="transfer-picker__go" />
                  </button>
                </li>
              ))}
            </>
          )}
      </ul>
      {path && !missing && (
        <form className="transfer-picker__new" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) mk.mutate(); }}>
          <input className="tk-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="새 폴더 이름" aria-label="새 폴더 이름" maxLength={100} />
          <button className="tk-button" type="submit" aria-disabled={!newName.trim() || undefined} aria-busy={mk.isPending || undefined}>만들기</button>
        </form>
      )}
      {mk.error && <p className="tk-error" role="alert">{errorText(mk.error).message}</p>}
    </Dialog>
  );
}
