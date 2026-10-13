import { useParams } from "react-router";
import { Board } from "../features/pms/Board";
import { Dashboard } from "../features/pms/Dashboard";
import { Notes } from "../features/pms/Notes";
import { ProjectFrame } from "../features/pms/ProjectFrame";
import { ProjectList } from "../features/pms/ProjectList";
import "../features/pms/pms.css";

const TABS = ["dashboard", "board", "notes"] as const;
type Tab = (typeof TABS)[number];

/** PMS(프로젝트 관리) 목록. 프로젝트를 고르면 대시보드·칸반·이슈로 들어간다. */
export function PmsListPage() {
  return <ProjectList base="pms" />;
}

export function PmsProjectPage() {
  const { projectId = "", tab } = useParams();
  const current: Tab = TABS.find((t) => t === tab) ?? "dashboard";
  return (
    <ProjectFrame
      base="pms"
      projectId={projectId}
      tab={current}
      tabs={(p) => [
        { id: "dashboard", label: "대시보드", icon: "gauge" },
        { id: "board", label: "칸반", icon: "kanban" },
        { id: "notes", label: "이슈·리스크", icon: "warning", count: p.open_notes },
      ]}
    >
      {(p) => (current === "board" ? <Board project={p} /> : current === "notes" ? <Notes project={p} /> : <Dashboard project={p} />)}
    </ProjectFrame>
  );
}
