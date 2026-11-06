export type NotificationCategory = "tasks" | "assistant" | "planner" | "weather" | "meetings" | "system";
export interface NotificationOut {
  id: number;
  kind: string;
  category: NotificationCategory;
  title: string;
  body: string;
  url: string;
  created_at: string;
  read_at: string | null;
}
export interface NotificationPage {
  items: NotificationOut[];
  next_before: number | null;
  unread_counts: Record<NotificationCategory | "all", number>;
}
export interface NotificationListParams {
  category?: NotificationCategory;
  unread_only?: boolean;
  before?: number;
  limit?: number;
}

export interface NotificationPreference {
  kind: string;
  category: NotificationCategory;
  label: string;
  description: string;
  enabled: boolean;
  default_enabled: boolean;
}
export interface NotificationPreferencesOut { items: NotificationPreference[] }

export const notificationKindLabels: Record<string, string> = {
  "push.agent": "메인 직접 알림", "push.run_finished": "메인 작업 실패", "push.run_waiting": "메인 작업 대기",
  "push.worker_agent": "하위 직접 알림", "push.worker_failed": "하위 작업 실패", "push.worker_waiting": "하위 작업 대기",
  "push.calendar_reminder": "일정", "push.checklist_reminder": "할 일", "push.weather": "날씨 브리핑",
  "push.meeting": "회의록 분석", "push.google_account": "계정 로그인", "push.notebooklm": "계정 로그인",
  "push.deployment": "배포 결과", "push.test_sent": "테스트 알림",
};
