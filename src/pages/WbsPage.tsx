import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import { listPmsMilestones, listPmsTasks } from "../api/client";
import type { PmsProject } from "../api/types";
import { Gantt } from "../features/pms/Gantt";
import { ProjectFrame } from "../features/pms/ProjectFrame";
import { ProjectList } from "../features/pms/ProjectList";
import { TaskDialog } from "../features/pms/TaskDialog";
import type { TaskTarget } from "../features/pms/TaskDialog";
import { WbsTable } from "../features/pms/WbsTable";
import { KEYS, assigneeOptions, useTaskActions, useTasks } from "../features/pms/shared";
import { downloadCsv, downloadXlsx } from "../features/pms/export";
import { toast } from "../ui/toastStore";
import { ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { errorText } from "../features/viewer/api";
import "../features/pms/pms.css";

const VIEWS = ["table", "gantt"] as const;
type View = (typeof VIEWS)[number];

/** WBS(작업 분해) 목록. PMS 와 같은 프로젝트를 쓰고, 고르면 트리 표/간트로 들어간다. */
export function WbsListPage() {
  return <ProjectList base="wbs" />;
}

function WbsBody({ project, view }: { project: PmsProject; view: View }) {
  const q = useTasks(project.id);
  const actions = useTaskActions(project.id);
  const [target, setTarget] = useState<TaskTarget | null>(null);
  if (q.isPending) return <ListSkeleton rows={6} label="작업을 불러오는 중" />;
  if (q.isError) return <ErrorState error={q.error} what="작업" onRetry={() => void q.refetch()} />;
  const tasks = q.data;
  const open = (id: string) => setTarget({ mode: "edit", id });
  return (
    <>
      {view === "table" ? <WbsTable project={project} tasks={tasks} actions={actions} onOpen={open} /> : <Gantt project={project} tasks={tasks} actions={actions} onOpen={open} />}
      <TaskDialog
        target={target}
        tasks={tasks}
        members={assigneeOptions(project.members, tasks)}
        actions={actions}
        onClose={() => setTarget(null)}
        onAddChild={(id) => setTarget({ mode: "create", parentId: id })}
      />
    </>
  );
}

export function WbsProjectPage() {
  const { projectId = "", view } = useParams();
  const qc = useQueryClient();
  const current: View = VIEWS.find((v) => v === view) ?? "table";

  // 내보내기는 누른 순간의 최신 작업을 받아 만든다(화면 캐시가 낡았어도 파일은 최신).
  const exporter = (p: PmsProject, kind: "csv" | "xlsx") => async () => {
    try {
      const { tasks } = await qc.fetchQuery({ queryKey: KEYS.tasks(p.id), queryFn: () => listPmsTasks(p.id), staleTime: 0 });
      if (tasks.length === 0) return toast({ message: "내보낼 작업이 아직 없어요." });
      if (kind === "csv") downloadCsv(p, tasks);
      else await downloadXlsx(p, tasks, (await listPmsMilestones(p.id)).milestones);
      toast({ message: kind === "csv" ? "CSV 파일을 내려받았어요." : "엑셀 파일을 내려받았어요.", tone: "success" });
    } catch (e) {
      toast({ message: errorText(e).message });
    }
  };

  return (
    <ProjectFrame
      base="wbs"
      projectId={projectId}
      tab={current}
      wide
      tabs={[
        { id: "table", label: "트리 표", icon: "wbs" },
        { id: "gantt", label: "간트", icon: "gantt" },
      ]}
      extraMenu={(p) => [
        { label: "CSV로 내보내기", icon: "download", onSelect: () => void exporter(p, "csv")() },
        { label: "엑셀(xlsx)로 내보내기", icon: "sheet", onSelect: () => void exporter(p, "xlsx")() },
      ]}
    >
      {(p) => <WbsBody project={p} view={current} />}
    </ProjectFrame>
  );
}
