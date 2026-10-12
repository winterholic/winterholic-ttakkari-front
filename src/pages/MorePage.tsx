import { Link } from "react-router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/ShellContext";
import { moreAreas } from "../shell/ShellNav";
import { Icon } from "../ui/Icon";
import "./more.css";

/**
 * 모바일 하단 탭의 더보기. 탭 다섯(채팅·회사·메모·캘린더·더보기)에 들지 못한 영역을 타일로 모은다.
 * 바텀 시트를 쓰지 않기로 해서(ui/sheetGuard.test.ts) 시트 대신 화면 하나로 둔다.
 */
export function MorePage() {
  const { lastSession } = useShell();
  return (
    <div className="tk-screen">
      <PageHeader title="더보기" />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--md">
          <nav className="more-grid" aria-label="더보기 메뉴">
            {moreAreas(lastSession).map((a) => (
              <Link key={a.root} className="more-grid__item" to={a.to}>
                <Icon name={a.icon} />
                <span>{a.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
