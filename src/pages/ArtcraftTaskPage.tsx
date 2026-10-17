import { useParams } from "react-router";
import { TaskScreen } from "../features/artcraft/work/TaskScreen";
import "../features/artcraft/artcraft.css";
import "../features/artcraft/work/work.css";

/** ArtCraft 작업 상세(/artcraft/t/:taskId): 라운드별 지시·진행·결과와 이어서 수정 요청. */
export function ArtcraftTaskPage() {
  const { taskId = "" } = useParams();
  return <TaskScreen key={taskId} taskId={taskId} />;
}
