import { useQuery } from "@tanstack/react-query";
import { listPmsProjects } from "../../api/client";
import type { MeetingScope } from "../../api/client";

/** 프로젝트 선택지. 회의 범위와 맞는(같은 개인·회사 범위의 PMS) 프로젝트만 보인다(서버도 같은 규칙으로 거절한다). */
export function useProjectOptions(scope: MeetingScope) {
  const q = useQuery({ queryKey: ["pms", "projects", { scope }], queryFn: () => listPmsProjects({ scope }) });
  const options = [{ value: "", label: "연결 안 함" }, ...(q.data?.projects ?? [])
    .filter((e) => e.scope === scope)
    .map((e) => ({ value: e.id, label: e.name }))];
  return { options, isPending: q.isPending };
}

