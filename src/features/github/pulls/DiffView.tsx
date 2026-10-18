import { useMemo, useState } from "react";
import type { GhPullFile } from "../../../api/githubTypes";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { splitPath } from "../format";
import { GhEmpty } from "../state/StateView";
import { WebLink } from "../parts";
import { safeGithubHref } from "../links";
import { PATCH_COLLAPSE_BYTES, countDiffLines, parsePatch, patchBytes } from "./parsePatch";
import type { Hunk } from "./parsePatch";

/** hunk 를 이만큼 그린 뒤 "다음 hunk" 로 이어 그린다. 큰 파일을 한 번에 수천 행 그리지 않는다. */
const FIRST_RENDER_LINES = 800;

const STATUS_LABEL: Record<string, string> = {
  added: "추가", removed: "삭제", modified: "수정", renamed: "이름 변경", copied: "복사", changed: "변경", unchanged: "변경 없음",
};

function hunksToShow(hunks: Hunk[], shown: number): number {
  let lines = 0;
  for (let i = 0; i < hunks.length; i++) {
    lines += hunks[i].lines.length;
    if (i + 1 >= shown && lines >= FIRST_RENDER_LINES) return i + 1;
  }
  return hunks.length;
}

function HunkTable({ hunks }: { hunks: Hunk[] }) {
  const [more, setMore] = useState(1);
  const count = Math.max(hunksToShow(hunks, more), 1);
  const visible = hunks.slice(0, count);
  const rest = hunks.length - visible.length;
  return (
    <>
      <div className="tk-diff__body" tabIndex={0} role="region" aria-label="변경 내용">
        <table className="tk-diff__table">
          <tbody>
            {visible.map((h, hi) => (
              <HunkRows key={hi} hunk={h} />
            ))}
          </tbody>
        </table>
      </div>
      {rest > 0 && (
        <div className="gh-diff__more">
          <Button variant="ghost" size="sm" onClick={() => setMore(count + 1)}>다음 hunk 더 보기 (남은 {rest}개)</Button>
        </div>
      )}
    </>
  );
}

function HunkRows({ hunk }: { hunk: Hunk }) {
  return (
    <>
      <tr className="tk-diff__hunk"><td colSpan={4}>{hunk.header}</td></tr>
      {hunk.lines.map((l, i) =>
        l.type === "meta" ? (
          <tr key={i} className="tk-diff__hunk"><td colSpan={4}>{l.text}</td></tr>
        ) : (
          <tr key={i} data-diff={l.type === "add" ? "+" : l.type === "del" ? "-" : undefined}>
            <td className="tk-diff__no">{l.oldNo ?? ""}</td>
            <td className="tk-diff__no">{l.newNo ?? ""}</td>
            <td className="tk-diff__sign">{l.type === "add" ? "+" : l.type === "del" ? "−" : ""}</td>
            <td className="tk-diff__code">{l.text}</td>
          </tr>
        ),
      )}
    </>
  );
}

export interface DiffFileProps {
  file: GhPullFile;
  /** patch 가 없을 때 안내에 붙일 GitHub 주소(검증된 것). */
  webUrl: string | null;
  wrap: boolean;
}

/** 파일 하나의 변경. 기본 접힘이며 머리 한 줄에 상태와 +/− 요약만 둔다. 변경 표시는 색과 기호(+/−)를 함께 쓴다. */
export function DiffFile({ file, webUrl, wrap }: DiffFileProps) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const { dir, name } = splitPath(file.filename);
  const patch = file.patch ?? null;
  // 파일 하나의 GitHub 주소가 있으면 그걸, 없으면 PR 의 변경 파일 화면을 연다.
  const link = safeGithubHref(file.blob_url) ?? webUrl;
  const big = patch !== null && patchBytes(patch) > PATCH_COLLAPSE_BYTES;
  const hunks = useMemo(() => (open && patch && (!big || confirmed) ? parsePatch(patch) : []), [open, patch, big, confirmed]);
  const status = STATUS_LABEL[file.status] ?? file.status;
  return (
    <section className="tk-diff gh-diff" data-wrap={wrap || undefined}>
      <header className="tk-diff__file">
        <button type="button" aria-expanded={open} aria-label={file.filename + ", " + status + ", 추가 " + file.additions + " 삭제 " + file.deletions} title={file.filename} onClick={() => setOpen((v) => !v)}>
          <span className="tk-diff__path">
            {dir && <span className="tk-diff__dir">{dir}</span>}
            <span className="tk-diff__name">{name}</span>
          </span>
          {/* 숫자 두 개뿐이라 길어질 수 없다. 레이아웃 검사의 긴 글자 주입에서 뺀다 */}
          <span className="tk-diff__stat" data-stress-skip><span>+{file.additions}</span><span>−{file.deletions}</span></span>
        </button>
      </header>
      {open && (
        <div className="gh-diff__panel">
          <p className="gh-diff__meta">
            <span>{status}</span>
            {file.previous_filename && <span className="gh-diff__rename">이전 이름 {file.previous_filename}</span>}
          </p>
          {file.patch_state === "empty" ? (
            <p className="gh-note">내용 변경 없이 이름·권한만 바뀐 파일이에요.</p>
          ) : file.patch_state === "unavailable" || patch === null ? (
            <GhEmpty icon="file-archive" title="변경 내용(patch)을 받지 못했어요">
              이진 파일이거나 너무 커서 GitHub 가 변경 내용을 주지 않았어요.
              <span className="gh-empty-actions"><WebLink href={link} /></span>
            </GhEmpty>
          ) : big && !confirmed ? (
            <div className="gh-diff__confirm">
              <p><Icon name="warning" /> 변경이 커서({Math.round(patchBytes(patch) / 1024)}KB) 접어 두었어요. 펼치면 느려질 수 있어요.</p>
              <Button size="sm" onClick={() => setConfirmed(true)}>그래도 펼치기</Button>
            </div>
          ) : hunks.length === 0 ? (
            <p className="gh-note">표시할 변경 줄이 없어요.</p>
          ) : (
            <>
              {file.patch_state === "truncated" && <p className="gh-diff__confirm"><Icon name="warning" /> 변경이 커서 앞부분만 보여 줘요(256KiB). 전체는 GitHub 에서 확인하세요. <WebLink href={link} /></p>}
              <HunkTable hunks={hunks} />
              <p className="gh-note gh-diff__count">변경 {countDiffLines(hunks).toLocaleString("ko-KR")}줄</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
