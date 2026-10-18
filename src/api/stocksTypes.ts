export interface StocksProvider {
  id: string;
  name: string;
  state: string;
  checked_at: string | null;
  detail: string;
}

export interface TossInvestRun {
  id: string;
  kind: "check" | "sync";
  status: string;
  message: string | null;
  logged_in: boolean | null;
  page_title: string | null;
  api_paths: string[];
  duration_ms: number | null;
  request_source: string;
  created_at: string;
  updated_at: string;
}

export interface TossInvestStatus {
  state: string;
  message: string;
  logged_in: boolean | null;
  checked_at: string | null;
  browser_available: boolean;
  profile_exists: boolean;
  check_interval_seconds: number;
  last_run: TossInvestRun | null;
}

export interface TossInvestLoginHelp {
  profile_dir: string;
  profile_exists: boolean;
  cookie_hosts: string[];
  steps: string[];
  open_command: string[];
  note: string;
}
