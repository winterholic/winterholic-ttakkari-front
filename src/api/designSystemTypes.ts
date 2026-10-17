export type DesignKind = "token" | "document" | "component" | "example";
export interface DesignCatalog {
  revision: string;
  source_mode: "committed";
  items: { id: string; name: string; version: string; counts: Record<DesignKind, number> }[];
}
export interface DesignRow {
  id: string;
  kind: DesignKind;
  title: string;
  source: string;
  excerpt: string;
  type?: string | null;
  css_variable?: string;
}
export interface DesignSearch {
  revision: string;
  system: string;
  total: number;
  items: DesignRow[];
  next_cursor: number | null;
}
export interface DesignTheme {
  raw: unknown;
  resolved: unknown;
  type: string | null;
  description: string;
  references: string[];
  source: string;
  pointer: string;
  error: string | null;
}
export interface DesignItem {
  revision: string;
  system: string;
  id: string;
  kind: DesignKind;
  title: string;
  source: string;
  type?: string | null;
  description?: string;
  css_variable?: string;
  light?: DesignTheme | null;
  dark?: DesignTheme | null;
  content?: string;
  offset?: number;
  total_chars?: number;
  next_offset?: number | null;
}
