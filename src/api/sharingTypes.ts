export type MeetingSection = "summary" | "decisions" | "actions" | "discussions" | "open_issues" | "transcript";
export type ExportFormat = "txt" | "md" | "json" | "csv";
export type ExportPart = "document" | "utterances" | "decisions" | "actions" | "discussions" | "open_issues";
export interface MeetingSelection { sections: MeetingSection[]; include_people: boolean; include_evidence: boolean }
export interface ShareInput {
  resource: { type: "meeting"; id: string };
  selection: MeetingSelection;
  download_formats?: ExportFormat[];
  confirm_work_scope?: boolean;
}
export interface PublishShareInput extends ShareInput { expected_source_revision: string; expires_at: string }
export interface MeetingExportInput { resource: ShareInput["resource"]; selection: MeetingSelection; format: ExportFormat; part: ExportPart; expected_source_revision: string }
export interface DocumentItem { item_id: string; position: number; text: string; detail: string | null; status: string; evidence_quote: string | null; evidence_start: number | null; evidence_utterance_id: string | null; owner?: string | null; due_text?: string | null }
export interface DocumentUtterance { utterance_id: string; start: number; end: number; speaker_id: string | null; speaker_label: string | null; speaker_name: string | null; text: string; verification_status: string; overlap: boolean | null }
export interface MeetingDocument {
  schema_version: 1; kind: "meeting"; title: string; held_at: string | null;
  included_sections: MeetingSection[];
  section_states: Record<MeetingSection, "available" | "empty" | "not_generated" | "not_selected">;
  analysis_state: "available" | "not_generated";
  participants: string[]; summary: string | null;
  decisions: DocumentItem[]; actions: DocumentItem[]; discussions: DocumentItem[]; open_issues: DocumentItem[];
  transcript: null | { text: string; timed: boolean; utterances: DocumentUtterance[]; review: { status: string; review_utterance_count: number; unknown_speaker_count: number } };
}
export interface FormatOption { format: string; enabled: boolean; applicable: boolean; parts: ExportPart[]; reason: string | null }
export interface SharePreview { document: MeetingDocument; source_revision: string; format_options: FormatOption[]; warnings: string[]; public_sharing_enabled?: boolean }
export interface OwnerShare {
  id: string; state: string; effective_state: "active" | "expired" | "unavailable" | "revoked";
  resource: ShareInput["resource"]; publication_revision: number; source_revision: string;
  selection: MeetingSelection; download_formats: ExportFormat[]; published_at: string; expires_at: string;
  capability_url?: string;
}
export interface PublicMeetingShare { share_id: string; publication_revision: number; published_at: string; expires_at: string; included_sections: MeetingSection[]; document: MeetingDocument; downloads: { format: ExportFormat; parts: ExportPart[] }[] }
