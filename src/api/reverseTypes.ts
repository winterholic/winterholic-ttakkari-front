/** 리버스 엔지니어링 API(백엔드 docs/adr/0038-reverse-engineer.md). 디자인시스템 타입과 섞지 않는다. */

export type ReverseStatus = "queued" | "running" | "waiting" | "partial" | "done" | "failed" | "needs_input";
export type ReverseKind = "reconstruction" | "git_url" | "local_path";

export interface ReverseStage {
  key: string;
  label: string;
  status: "pending" | "running" | "waiting" | "done" | "failed";
  started_at: string | null;
  finished_at: string | null;
  evidence: string[];
  notes: string[];
}

export interface ReverseSummary {
  id: string;
  target: string;
  kind: ReverseKind;
  status: ReverseStatus;
  revision: string | null;
  stage: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  overview?: string;
  workspace_id?: string;
  session_id?: string;
  verifier_session_id?: string | null;
  output_path?: string;
  progress?: string | null;
  waiting_reason?: string | null;
}

export interface ReverseArchitecture {
  title: string;
  body: string;
  evidence: string[];
}

export interface ReverseModule {
  path: string;
  role: string;
  evidence: string[];
}

export interface ReverseFlow {
  title: string;
  steps: string[];
  evidence: string[];
}

export interface ReverseIdea {
  title: string;
  body: string;
  evidence: string[];
}

export interface ReverseResult {
  overview: { text: string; evidence: string[] };
  architecture: ReverseArchitecture[];
  modules: ReverseModule[];
  flows: ReverseFlow[];
  ideas: ReverseIdea[];
  limitations: string[];
  stats: {
    files: number; bytes: number; langs: [string, number][]; revision: string | null; files_parsed: number;
    model?: {
      engine: string; model: string; account?: string; via: string; files_read: number;
      merged: boolean; masked: number;
    };
  };
}

export interface ReverseDetail extends ReverseSummary {
  stages: ReverseStage[];
  result: ReverseResult | null;
  reconstruction?: {
    summary: string;
    source_files: string[];
    observations: { finding: string; evidence: string }[];
    checks: { command: string; exit_code: number; log: string }[];
    limitations: string[];
    verification: string;
  } | null;
  rounds?: { id: string; session_id: string; status: string; role: string; result_text: string; error: string | null; engine: string; model: string | null }[];
  activity?: { type: string; at: string; text: string }[];
  outputs?: import("./types").ArtifactOut[];
}
