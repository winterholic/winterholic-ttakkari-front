import { useQuery } from "@tanstack/react-query";
import { activeTasks, taskTree } from "../../api/client";
import type { TaskNode } from "../../api/types";
import { isActive } from "./buildTree";

/** 사이드바 "진행 중"에서 최근에 끝난 일을 몇 시간까지 남길지. 그보다 오래된 일은 지난 작업 서고로 간다. */
export const RECENT_HOURS = 6;
const anyActive = (nodes: TaskNode[] | undefined) => !!nodes?.some((n) => isActive(n.status));

/** 지금 도는 일의 숲. 실행 중이 있으면 자주, 없으면 가끔 다시 읽는다. 사이드바·드로어·작업 화면이 같은 키를 쓴다. */
export function useActiveTasks() {
  return useQuery({
    queryKey: ["tasks", "active"],
    queryFn: () => activeTasks(RECENT_HOURS),
    refetchInterval: (q) => (anyActive(q.state.data?.nodes) ? 4_000 : 20_000),
  });
}

/** 세션이 속한 일의 트리 전체와 뿌리부터의 경로. */
export function useTaskTree(sessionId: string | undefined) {
  return useQuery({
    enabled: !!sessionId,
    queryKey: ["tasks", "tree", sessionId],
    queryFn: () => taskTree(sessionId!),
    refetchInterval: (q) => (anyActive(q.state.data?.nodes) ? 4_000 : 30_000),
  });
}
