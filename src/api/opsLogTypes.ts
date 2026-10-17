// 운영 로그·이슈 API(백엔드 ADR 0033). 응답은 서버가 마스킹하고 크기를 제한한다.
export type OpsStatus = "unresolved" | "resolved" | "ignored";
export type OpsLevel = "warning" | "error" | "fatal";
export type OpsSource = "deploy" | "run" | "api" | "process" | "worker" | "code";

export interface OpsIssueRow {
  id: string; // LOG-12
  title: string;
  source: OpsSource;
  level: OpsLevel;
  status: OpsStatus;
  count: number;
  first_seen: string | null;
  last_seen: string | null;
  release: string | null;
  culprit: string | null;
  regressed?: number;
}

export interface OpsIssueList {
  total: number;
  items: OpsIssueRow[];
  next_cursor: number | null;
  truncated?: boolean;
}

export interface OpsEvent {
  event_id: number;
  at: string | null;
  level: OpsLevel;
  release: string | null;
  message: string;
  tags: Record<string, string | number | boolean | null>;
  ref: string | null;
  stack?: string;
  excerpt?: string;
  breadcrumbs?: ({ ts?: string | null; message?: string } | string)[];
}

export interface OpsIssueDetail {
  issue: OpsIssueRow & {
    first_release: string | null;
    resolved_at: string | null;
    resolved_release: string | null;
    last_regressed_at: string | null;
    tags: Record<string, string | number | boolean | null>;
    notes: { at: string; by: string; text: string }[];
  };
  latest_event: OpsEvent | null;
  earlier_events: { event_id: number; at: string | null; release: string | null; message: string }[];
  releases: { release: string | null; events: number }[];
  recent_hours: { hour: string | null; count: number }[];
  truncated?: boolean;
}

export interface OpsTrend {
  unit: "hour" | "day";
  hours: number;
  points: { at: string; count: number }[];
  total: number;
}

export interface OpsDeploy {
  job_id: string;
  revision: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  strategy: string | null;
  issue?: string;
  cause?: string;
  stage?: string;
  error?: string;
}

export interface OpsDeployLog {
  job_id: string;
  revision: string | null;
  status: string;
  stage?: string;
  cause?: string;
  error: string | null;
  log: { exists: boolean; bytes: number; lines: number };
  sections?: { from_line: number; to_line: number; text: string }[];
  tail?: string;
  truncated?: boolean;
}
