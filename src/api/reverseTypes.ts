/** 리버스 엔지니어링 API(백엔드 docs/adr/0038-reverse-engineer.md). 디자인시스템 타입과 섞지 않는다. */

export type ReverseStatus = "queued" | "running" | "done" | "failed";
export type ReverseKind = "git_url" | "local_path";

export interface ReverseStage {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
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
  overview: string;
  architecture: ReverseArchitecture[];
  modules: ReverseModule[];
  flows: ReverseFlow[];
  ideas: ReverseIdea[];
  limitations: string[];
  stats: { files: number; bytes: number; langs: [string, number][]; revision: string | null; files_parsed: number };
}

export interface ReverseDetail extends ReverseSummary {
  stages: ReverseStage[];
  result: ReverseResult | null;
}
