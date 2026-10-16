export interface Evidence {
 id:string; revision_id:string; quote:string; speaker:string; locator:string;
 revision_sha256:string; start:number; end:number; event_time:string|null; active_branch:boolean|null;
}
export interface Assertion {
 id:string; version:number; subject:string; predicate:string; object:string; state:string;
 review_level:string; modality:string; polarity:boolean; valid_from:string|null; valid_to:string|null;
 evidence:Evidence[]; history:{version:number;actor:string;state:string;review_level:string;reason:string;recorded_at:string}[];
}
export interface KnowledgeStatus {
 counts:{revisions:number;units:number;assertion_states:Record<string,number>};scope:string;
}
export type SearchAssertion = Omit<Assertion,'history'>;
export interface KnowledgeRecall {assertions:SearchAssertion[];evidence:{id:string;body:string;locator:string;speaker:string;revision_sha256:string}[]}
