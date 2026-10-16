export type NotificationCategory = "tasks" | "assistant" | "planner" | "meetings" | "system";
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
