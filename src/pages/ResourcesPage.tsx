import { ResourcesPanel } from "../features/system/ResourcesPanel";
import { PageHeader } from "../shell/PageHeader";

/** 부가 기능 > 서버 리소스. 사용자 메뉴의 같은 이름 항목도 여기로 온다. */
export function ResourcesPage() {
  return (
    <div className="tk-screen">
      <PageHeader title="서버 리소스" meta="Mac Studio 자원 현황 · 4초마다 갱신" />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--lg">
          <ResourcesPanel />
        </div>
      </div>
    </div>
  );
}
