import { Link } from "react-router";
import type { GhEntry } from "../../../api/githubTypes";
import { Badge } from "../../../ui/Badge";
import { Icon } from "../../../ui/Icon";
import type { IconName } from "../../../ui/Icon";
import { bytes } from "../format";
import { ghPath } from "../links";

const ORDER: Record<GhEntry["type"], number> = { dir: 0, submodule: 1, file: 2, symlink: 3 };
const ICON: Record<GhEntry["type"], IconName> = { dir: "folder", file: "file-text", symlink: "child", submodule: "git-branch" };

/** 폴더가 먼저, 같은 종류는 이름순. 서버가 이미 정렬해 주지만 순서를 가정하지 않는다. */
export function sortEntries(entries: GhEntry[]): GhEntry[] {
  return [...entries].sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.name.localeCompare(b.name));
}

export interface TreeListProps {
  account: string;
  owner: string;
  repo: string;
  /** URL 에 있던 ref. 없으면 기본 브랜치라 쿼리에 싣지 않는다. */
  ref_?: string;
  entries: GhEntry[];
}

/** 파일 이름은 줄바꿈해 전부 보이고, 한 줄 높이가 아니라 내용만큼 커진다. */
export function TreeList({ account, owner, repo, ref_, entries }: TreeListProps) {
  return (
    <ul className="tk-list tk-list--inset" aria-label="파일 목록">
      {sortEntries(entries).map((e) => {
        const inner = (
          <>
            <Icon name={ICON[e.type]} />
            <span className="tk-list__body">
              <span className="tk-list__title tk-list__title--wrap gh-filename" title={e.name}>{e.name}</span>
              <span className="tk-list__meta">
                {e.type === "submodule" && <Badge>서브모듈 · 열 수 없어요</Badge>}
                {e.type === "symlink" && <Badge>심볼릭 링크</Badge>}
                {e.type === "file" && <span>{bytes(e.size)}</span>}
              </span>
            </span>
          </>
        );
        return (
          <li key={e.path}>
            {e.type === "submodule" ? (
              <div className="tk-list__item" aria-disabled="true">{inner}</div>
            ) : (
              <Link className="tk-list__item" to={ghPath(account, { owner, repo, section: "code", ref: ref_, path: e.path })}>
                {inner}
                <span className="tk-list__end"><Icon name="chevron-right" /></span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
