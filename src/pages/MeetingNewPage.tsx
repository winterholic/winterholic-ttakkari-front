import { Link } from "react-router";
import { NewMeetingForm } from "../features/meetings/NewMeetingForm";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import "../features/meetings/meetings.css";

/** 새 회의록. 목록으로 돌아가는 길은 헤더 오른쪽에 둔다(왼쪽은 모바일 세션 메뉴 자리다). */
export function MeetingNewPage() {
  return (
    <div className="tk-screen">
      <PageHeader
        title="새 회의록"
        actions={<Link className="tk-icon-button" to="/meetings" aria-label="목록으로" title="목록으로"><Icon name="x" /></Link>}
      />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--md">
          <div className="mt-page">
            <NewMeetingForm />
          </div>
        </div>
      </div>
    </div>
  );
}
