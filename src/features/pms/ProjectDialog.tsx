import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPmsProject, deletePmsProject, patchPmsProject } from "../../api/client";
import type { PmsProject, PmsProjectStatus, PmsScope } from "../../api/types";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { DEFAULT_PHASES, PROJECT_STATUSES, PROJECT_STATUS_LABEL, SCOPES } from "./labels";

interface Form {
  name: string;
  description: string;
  scope: PmsScope;
  status: PmsProjectStatus;
  start: string;
  end: string;
  members: string[];
  phases: string[];
}

const blank = (): Form => ({ name: "", description: "", scope: "personal", status: "planning", start: "", end: "", members: [], phases: [...DEFAULT_PHASES] });
const fromProject = (p: PmsProject): Form => ({
  name: p.name, description: p.description, scope: p.scope, status: p.status, start: p.start_date ?? "", end: p.end_date ?? "", members: p.members, phases: [],
});

/** 새 프로젝트(project 없음) 또는 설정 수정. 열 때마다 새로 시작하도록 열린 동안만 폼을 그린다. */
export function ProjectDialog({ open, project, onClose, onCreated, onDeleted, defaultScope }: {
  open: boolean;
  project?: PmsProject;
  onClose: () => void;
  onCreated?: (p: PmsProject) => void;
  onDeleted?: () => void;
  defaultScope?: PmsScope;
}) {
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={project ? "프로젝트 설정" : "새 프로젝트"} modal id="pms-project-dialog">
      {open && <ProjectForm key={project?.id ?? "new"} project={project} onClose={onClose} onCreated={onCreated} onDeleted={onDeleted} defaultScope={defaultScope} />}
    </Dialog>
  );
}

function ProjectForm({ project, onClose, onCreated, onDeleted, defaultScope }: {
  project?: PmsProject;
  onClose: () => void;
  onCreated?: (p: PmsProject) => void;
  onDeleted?: () => void;
  defaultScope?: PmsScope;
}) {
  const id = useId();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => (project ? fromProject(project) : { ...blank(), scope: defaultScope ?? "personal" }));
  const [member, setMember] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (p: Partial<Form>) => setF((cur) => ({ ...cur, ...p }));
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["pms"] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name.trim(),
        description: f.description,
        scope: f.scope,
        status: f.status,
        start_date: f.start || null,
        end_date: f.end || null,
        members: f.members,
      };
      return project ? patchPmsProject(project.id, body) : createPmsProject({ ...body, phases: f.phases });
    },
    onSuccess: (p) => {
      toast({ message: project ? "프로젝트를 고쳤어요." : "프로젝트를 만들었어요.", tone: "success" });
      done();
      if (!project) onCreated?.(p);
    },
  });
  const del = useMutation({
    mutationFn: () => deletePmsProject(project!.id),
    onSuccess: () => {
      toast({ message: "프로젝트를 지웠어요." });
      done();
      onDeleted?.();
    },
  });

  const addMember = (raw: string) => {
    const n = raw.trim().replace(/,$/, "").trim();
    if (n && !f.members.includes(n) && f.members.length < 50) set({ members: [...f.members, n] });
    setMember("");
  };
  const onMemberKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addMember(member);
    } else if (e.key === "Backspace" && !member && f.members.length) {
      set({ members: f.members.slice(0, -1) });
    }
  };
  const submit = () => {
    const v = !f.name.trim() ? "프로젝트 이름을 적어 주세요." : f.start && f.end && f.end < f.start ? "종료일이 시작일보다 빠를 수 없어요." : null;
    setProblem(v);
    if (!v) save.mutate();
  };
  const err = problem ?? (save.error ? errorText(save.error).message : null) ?? (del.error ? errorText(del.error).message : null);

  return (
    <form
      className="pms-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="tk-field">
        <label htmlFor={`${id}-name`}>이름</label>
        <input id={`${id}-name`} className="tk-input tk-input--lg" value={f.name} maxLength={200} autoComplete="off" autoFocus placeholder="예) 웹사이트 리뉴얼" onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div className="tk-field">
        <label htmlFor={`${id}-desc`}>설명 <span className="pms-optional">선택</span></label>
        <textarea id={`${id}-desc`} className="tk-textarea" rows={3} value={f.description} maxLength={10000} onChange={(e) => set({ description: e.target.value })} />
      </div>
      <div className="pms-form__pair">
        <div className="tk-field">
          <span id={`${id}-scope`}>범위</span>
          <div className="tk-segmented tk-segmented--block" role="radiogroup" aria-labelledby={`${id}-scope`}>
            {SCOPES.map((s) => (
              <label key={s.value}><input type="radio" name={`${id}-scope`} checked={f.scope === s.value} onChange={() => set({ scope: s.value })} />{s.label}</label>
            ))}
          </div>
        </div>
        <div className="tk-field">
          <span id={`${id}-status`}>상태</span>
          <Select id={`${id}-statussel`} labelledBy={`${id}-status`} value={f.status} options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }))} onChange={(v) => set({ status: v })} />
        </div>
      </div>
      <div className="pms-form__pair">
        <div className="tk-field">
          <label htmlFor={`${id}-start`}>시작일 <span className="pms-optional">선택</span></label>
          <input id={`${id}-start`} className="tk-input" type="date" value={f.start} onChange={(e) => set({ start: e.target.value })} />
        </div>
        <div className="tk-field">
          <label htmlFor={`${id}-end`}>종료일 <span className="pms-optional">선택</span></label>
          <input id={`${id}-end`} className="tk-input" type="date" min={f.start || undefined} value={f.end} onChange={(e) => set({ end: e.target.value })} />
        </div>
      </div>
      <div className="tk-field">
        <label htmlFor={`${id}-member`}>멤버 <span className="pms-optional">담당자 이름</span></label>
        <div className="pms-members">
          {f.members.map((m) => (
            <span className="tk-chip" key={m}>
              {m}
              <button type="button" className="pms-chip-x" aria-label={`멤버 ${m} 빼기`} onClick={() => set({ members: f.members.filter((x) => x !== m) })}>
                <Icon name="x" />
              </button>
            </span>
          ))}
          <input
            id={`${id}-member`}
            className="pms-members__input"
            value={member}
            placeholder={f.members.length ? "이름 추가" : "이름을 적고 Enter"}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setMember(e.target.value)}
            onKeyDown={onMemberKey}
            onBlur={() => addMember(member)}
          />
        </div>
        <p className="tk-help">로그인 계정이 아니라 담당자 칸에 고르는 이름표예요.</p>
      </div>
      {!project && (
        <div className="tk-field">
          <span id={`${id}-phases`}>처음 만들 단계 <span className="pms-optional">WBS 1단계</span></span>
          <div className="tk-chips tk-chips--wrap" role="group" aria-labelledby={`${id}-phases`}>
            {DEFAULT_PHASES.map((p) => (
              <label className="tk-chip" key={p}>
                <input
                  type="checkbox"
                  checked={f.phases.includes(p)}
                  onChange={(e) => set({ phases: DEFAULT_PHASES.filter((x) => (x === p ? e.target.checked : f.phases.includes(x))) })}
                />
                {p}
              </label>
            ))}
          </div>
          <p className="tk-help">모두 빼면 빈 프로젝트로 시작해요. 나중에 WBS에서 자유롭게 고쳐요.</p>
        </div>
      )}

      {err && <p className="tk-error" role="alert">{err}</p>}
      <div className="tk-button-group pms-form__actions">
        {project && !confirmDelete && <Button variant="danger" onClick={() => setConfirmDelete(true)}>지우기</Button>}
        {project && confirmDelete && (
          <>
            <span className="pms-form__confirm" role="alert">작업·마일스톤·이슈까지 모두 지워져요.</span>
            <Button variant="danger" busy={del.isPending} onClick={() => del.mutate()}>네, 지울게요</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>취소</Button>
          </>
        )}
        {!confirmDelete && (
          <>
            <span className="pms-form__spacer" />
            <Button variant="ghost" onClick={onClose}>닫기</Button>
            <Button variant="primary" type="submit" busy={save.isPending}>{project ? "저장" : "만들기"}</Button>
          </>
        )}
      </div>
    </form>
  );
}
