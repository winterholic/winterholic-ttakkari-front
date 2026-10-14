import { ResourcesPanel } from "../features/system/ResourcesPanel";
import { PageHeader } from "../shell/PageHeader";

/** 사용자 메뉴 > 서버 리소스. */
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
