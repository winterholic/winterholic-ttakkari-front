import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEvent, deleteEvent, getEvent, patchEvent } from "../../api/client";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { ErrorState } from "../viewer/screenStates";
import { blankForm, formFromEvent, formToPayload, validateForm } from "./eventForm";
import type { EventForm } from "./eventForm";
import { FREQ_LABEL } from "./recurrence";
import type { Freq, RepeatEnd } from "./recurrence";

/** create: 날짜(와 시각)를 눌러 만든다. edit: 일정(시리즈) id 로 연다. */
export type EditorTarget = { mode: "create"; date: string; time?: string } | { mode: "edit"; eventId: string };

const FREQ_OPTIONS = [
  { value: "none" as const, label: "반복 안 함" },
  ...(Object.keys(FREQ_LABEL) as Freq[]).map((f) => ({ value: f, label: FREQ_LABEL[f] })),
];
const END_OPTIONS: { value: RepeatEnd; label: string }[] = [
  { value: "never", label: "계속" },
  { value: "until", label: "날짜까지" },
  { value: "count", label: "횟수만큼" },
];

export function EventDialog({ target, onClose }: { target: EditorTarget | null; onClose: () => void }) {
  const edit = target?.mode === "edit" ? target.eventId : null;
  const series = useQuery({ queryKey: ["calendar", "event", edit], queryFn: () => getEvent(edit!), enabled: !!edit, gcTime: 0 });
  const title = edit ? "일정 수정" : "새 일정";
  return (
    <Dialog open={target !== null} onClose={onClose} kind="panel" size="lg" title={title} modal id="event-dialog">
      {target && edit && series.isPending && <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--sm" aria-hidden />불러오는 중</p>}
      {target && edit && series.isError && <ErrorState error={series.error} what="일정" onRetry={() => void series.refetch()} />}
      {target?.mode === "create" && <EventFormView key={`${target.date}${target.time ?? ""}`} initial={blankForm(target.date, target.time)} eventId={null} onClose={onClose} />}
      {edit && series.data && <EventFormView key={series.data.id} initial={formFromEvent(series.data)} eventId={edit} recurring={series.data.recurring} onClose={onClose} />}
    </Dialog>
  );
}

function EventFormView({ initial, eventId, recurring, onClose }: { initial: EventForm; eventId: string | null; recurring?: boolean; onClose: () => void }) {
  const id = useId();
  const qc = useQueryClient();
  const [f, setF] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (p: Partial<EventForm>) => setF((cur) => ({ ...cur, ...p }));
  const setRepeat = (p: Partial<EventForm["repeat"]>) => setF((cur) => ({ ...cur, repeat: { ...cur.repeat, ...p } }));
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["calendar"] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => {
      const body = formToPayload(f);
      return eventId ? patchEvent(eventId, { ...body, rrule: body.rrule ?? "" }) : createEvent(body);
    },
    onSuccess: () => {
      toast({ message: eventId ? "일정을 고쳤어요." : "일정을 만들었어요.", tone: "success" });
      done();
    },
  });
  const del = useMutation({
    mutationFn: () => deleteEvent(eventId!),
    onSuccess: () => {
      toast({ message: "일정을 지웠어요." });
      done();
    },
  });
  const submit = () => {
    const v = validateForm(f);
    setProblem(v);
    if (!v) save.mutate();
  };
  // 시작을 옮기면 끝도 같은 간격으로 따라가고, 끝이 시작보다 앞서지 않게 한다.
  const moveStart = (date: string, time: string) => {
    const shiftedEnd = f.endDate < date || (f.endDate === date && !f.allDay && f.endTime < time);
    set({ startDate: date, startTime: time, ...(shiftedEnd ? { endDate: date, endTime: time } : {}) });
  };
  const err = problem ?? (save.error ? errorText(save.error).message : null) ?? (del.error ? errorText(del.error).message : null);

  return (
    <form
      className="planner-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="tk-field">
        <label htmlFor={`${id}-title`}>제목</label>
        <input id={`${id}-title`} className="tk-input tk-input--lg" value={f.title} maxLength={200} autoComplete="off" onChange={(e) => set({ title: e.target.value })} />
      </div>
      <label className="tk-switch tk-switch--row">
        <input type="checkbox" role="switch" checked={f.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
        종일
      </label>
      <div className="planner-form__when">
        <div className="tk-field">
          <label htmlFor={`${id}-sd`}>시작</label>
          <div className="planner-form__pair">
            <input id={`${id}-sd`} className="tk-input" type="date" value={f.startDate} onChange={(e) => moveStart(e.target.value, f.startTime)} />
            {!f.allDay && <input className="tk-input" type="time" aria-label="시작 시각" value={f.startTime} onChange={(e) => moveStart(f.startDate, e.target.value)} />}
          </div>
        </div>
        <div className="tk-field">
          <label htmlFor={`${id}-ed`}>끝</label>
          <div className="planner-form__pair">
            <input id={`${id}-ed`} className="tk-input" type="date" min={f.startDate} value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
            {!f.allDay && <input className="tk-input" type="time" aria-label="끝 시각" value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} />}
          </div>
        </div>
      </div>
      <p className="tk-help">한국 표준시(Asia/Seoul) 기준이에요.</p>

      <div className="tk-field">
        <span id={`${id}-rep`}>반복</span>
        <div className="planner-form__pair">
          <Select
            id={`${id}-repsel`}
            labelledBy={`${id}-rep`}
            value={f.repeat.freq}
            options={f.repeat.freq === "custom" ? [{ value: "custom" as const, label: "사용자 지정" }, ...FREQ_OPTIONS] : FREQ_OPTIONS}
            onChange={(v) => setRepeat({ freq: v })}
          />
          {f.repeat.freq !== "none" && f.repeat.freq !== "custom" && (
            <Select id={`${id}-repend`} labelledBy={`${id}-rep`} value={f.repeat.end} options={END_OPTIONS} onChange={(v) => setRepeat({ end: v })} />
          )}
        </div>
        {f.repeat.freq === "custom" && <p className="tk-help">규칙 <code>{f.repeat.raw}</code> 은 그대로 유지돼요. 바꾸려면 위에서 다른 반복을 고르세요.</p>}
        {f.repeat.end === "until" && f.repeat.freq !== "none" && f.repeat.freq !== "custom" && (
          <input className="tk-input" type="date" aria-label="반복 종료일" min={f.startDate} value={f.repeat.until} onChange={(e) => setRepeat({ until: e.target.value })} />
        )}
        {f.repeat.end === "count" && f.repeat.freq !== "none" && f.repeat.freq !== "custom" && (
          <input className="tk-input" type="number" inputMode="numeric" aria-label="반복 횟수" min={1} max={999} value={f.repeat.count} onChange={(e) => setRepeat({ count: Number(e.target.value) })} />
        )}
        {recurring && <p className="tk-help">반복 일정은 전체가 함께 바뀌어요.</p>}
      </div>

      <div className="tk-field">
        <label htmlFor={`${id}-loc`}>장소</label>
        <input id={`${id}-loc`} className="tk-input" value={f.location} maxLength={200} onChange={(e) => set({ location: e.target.value })} />
      </div>
      <div className="tk-field">
        <label htmlFor={`${id}-desc`}>메모</label>
        <textarea id={`${id}-desc`} className="tk-textarea" rows={4} value={f.description} maxLength={10000} onChange={(e) => set({ description: e.target.value })} />
      </div>

      {err && <p className="tk-error" role="alert">{err}</p>}
      <div className="tk-button-group planner-form__actions">
        {eventId && !confirmDelete && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>지우기</Button>
        )}
        {eventId && confirmDelete && (
          <>
            <span className="planner-form__confirm" role="alert">{recurring ? "반복 일정 전체가 지워져요." : "이 일정을 지울까요?"}</span>
            <Button variant="danger" busy={del.isPending} onClick={() => del.mutate()}>네, 지울게요</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>취소</Button>
          </>
        )}
        {!confirmDelete && (
          <>
            <span className="planner-form__spacer" />
            <Button variant="ghost" onClick={onClose}>닫기</Button>
            <Button variant="primary" type="submit" busy={save.isPending}>저장</Button>
          </>
        )}
      </div>
    </form>
  );
}
