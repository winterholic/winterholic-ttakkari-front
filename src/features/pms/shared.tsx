import { useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPmsTask, deletePmsTask, getPmsProject, listPmsTasks, movePmsTask, patchPmsTask } from "../../api/client";
import type { PmsPriority, PmsTask, PmsTaskIn, PmsTaskPatch, PmsTaskResult, PmsTaskStatus } from "../../api/types";
import { Icon } from "../../ui/Icon";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { PRIORITY_LABEL, STATUS_LABEL } from "./labels";

export const KEYS = {
  projects: ["pms", "projects"] as const,
  project: (id: string) => ["pms", "project", id] as const,
  tasks: (id: string) => ["pms", "tasks", id] as const,
  dashboard: (id: string) => ["pms", "dashboard", id] as const,
  notes: (id: string) => ["pms", "notes", id] as const,
  milestones: (id: string) => ["pms", "milestones", id] as const,
};

/** 화면 폭 미디어 쿼리. 표(WBS)가 칸으로 펼쳐질 만큼 넓은지 같은 판단에 쓴다. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
/** 표를 칸으로 펼칠 수 있는 폭(태블릿 이상). 폰은 줄마다 두 줄 카드로 보인다. */
export const useWide = (): boolean => useMedia("(min-width: 768px)");

export const useProject = (id: string) => useQuery({ queryKey: KEYS.project(id), queryFn: () => getPmsProject(id) });
export const useTasks = (id: string) =>
  useQuery({ queryKey: KEYS.tasks(id), queryFn: () => listPmsTasks(id), select: (d) => d.tasks });

type Cache = { tasks: PmsTask[] };

/**
 * 작업 변경 모음. 서버가 번호·집계를 다시 계산해 전체 목록을 돌려주므로 응답을 캐시에 그대로 넣는다.
 * 상태·제목 같은 단순 수정은 응답 전에 먼저 화면에 반영해(칸반 드래그가 튕기지 않게) 실패하면 되돌린다.
 */
export function useTaskActions(projectId: string) {
  const qc = useQueryClient();
  const key = KEYS.tasks(projectId);
  const settle = (tasks: PmsTask[]) => {
    qc.setQueryData<Cache>(key, { tasks });
    void qc.invalidateQueries({ queryKey: KEYS.dashboard(projectId) });
    void qc.invalidateQueries({ queryKey: KEYS.project(projectId) });
    void qc.invalidateQueries({ queryKey: KEYS.projects });
  };
  const fail = (e: unknown) => {
    toast({ message: errorText(e).message });
    void qc.invalidateQueries({ queryKey: key });
  };
  // 같은 프로젝트의 작업 변경은 한 줄로 세워 보낸다. 제목 저장(blur)과 들여쓰기가 거의 동시에 나가도 응답 순서가 뒤집혀 옛 목록이 덮지 않게 한다.
  const scope = { id: "pms-tasks-" + projectId };
  return {
    create: useMutation({ scope, mutationFn: (b: PmsTaskIn) => createPmsTask(projectId, b), onSuccess: (r: PmsTaskResult) => settle(r.tasks), onError: fail }),
    patch: useMutation({
      scope,
      mutationFn: (v: { id: string; body: PmsTaskPatch }) => patchPmsTask(v.id, v.body),
      onMutate: async (v) => {
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<Cache>(key);
        if (prev) {
          qc.setQueryData<Cache>(key, { tasks: prev.tasks.map((t) => (t.id === v.id ? ({ ...t, ...v.body } as PmsTask) : t)) });
        }
        return { prev };
      },
      onSuccess: (r: PmsTaskResult) => settle(r.tasks),
      onError: (e, _v, ctx) => {
        if (ctx?.prev) qc.setQueryData<Cache>(key, ctx.prev);
        fail(e);
      },
    }),
    move: useMutation({
      scope,
      mutationFn: (v: { id: string; parent_id: string | null; index?: number }) => movePmsTask(v.id, { parent_id: v.parent_id, index: v.index }),
      onSuccess: (r: PmsTaskResult) => settle(r.tasks),
      onError: fail,
    }),
    remove: useMutation({
      scope,
      mutationFn: (id: string) => deletePmsTask(id),
      onSuccess: (r) => settle(r.tasks),
      onError: fail,
    }),
  };
}
export type TaskActions = ReturnType<typeof useTaskActions>;

export function StatusPill({ status, children }: { status: PmsTaskStatus; children?: ReactNode }) {
  return <span className="pms-pill" data-status={status}>{children ?? STATUS_LABEL[status]}</span>;
}

export function PriorityMark({ priority }: { priority: PmsPriority }) {
  if (priority === "normal") return null;
  return (
    <span className="pms-priority" data-priority={priority} title={`우선순위 ${PRIORITY_LABEL[priority]}`}>
      <Icon name="flag" />
      <span className="tk-sr-only">우선순위 {PRIORITY_LABEL[priority]}</span>
      {priority === "urgent" && <b aria-hidden="true">긴급</b>}
    </span>
  );
}

/** 진행 막대. 값이 0~100 이고 스크린 리더에는 퍼센트로 읽힌다. */
export function Meter({ value, label, tone, large, decorative }: { value: number; label: string; tone?: "agent" | "warning" | "danger"; large?: boolean; decorative?: boolean }) {
  const cls = ["tk-progress", tone && `tk-progress--${tone}`, large && "tk-progress--lg"].filter(Boolean).join(" ");
  // 옆에 같은 값이 글자로 있으면 막대는 장식이라 스크린 리더에서 뺀다.
  if (decorative) return <span className={cls} aria-hidden="true" style={{ "--tk-progress": value / 100 } as CSSProperties} />;
  return <span className={cls} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} style={{ "--tk-progress": value / 100 } as CSSProperties} />;
}

/** 이름 첫 글자 동그라미. 담당자 표시에 쓴다(계정 아님, 이름 텍스트). */
export function Initial({ name }: { name: string | null }) {
  if (!name) return <span className="pms-initial pms-initial--none" aria-hidden="true">?</span>;
  return <span className="pms-initial" aria-hidden="true">{[...name.trim()][0]}</span>;
}

/** 프로젝트 안 작업 목록에서 담당자 후보: 멤버 + 이미 배정된 이름 */
export function assigneeOptions(members: string[], tasks: PmsTask[]): string[] {
  const out = [...members];
  for (const t of tasks) if (t.assignee && !out.includes(t.assignee)) out.push(t.assignee);
  return out;
}
