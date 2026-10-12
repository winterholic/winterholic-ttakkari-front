import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEvent, deleteEvent, getEvent, patchEvent } from "../../api/client";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/toastStore";
import { errorText } from "../viewer/api";
import { ErrorState } from "../viewer/screenStates";
import { usePush } from "../push/usePush";
import { ALL_DAY_REMINDERS, blankForm, formFromEvent, formToPayload, reminderFor, TIMED_REMINDERS, validateForm } from "./eventForm";
import type { EventForm } from "./eventForm";
import type { Reminder } from "../../api/client";

/** create: 날짜(와 시각)를 눌러 만든다. edit: 일정(시리즈) id 로 연다. */
export type EditorTarget = { mode: "create"; date: string; time?: string } | { mode: "edit"; eventId: string };

export function EventDialog({ target, onClose }: { target: EditorTarget | null; onClose: () => void }) {
  const edit = target?.mode === "edit" ? target.eventId : null;
  const series = useQuery({ queryKey: ["calendar", "event", edit], queryFn: () => getEvent(edit!), enabled: !!edit, gcTime: 0 });
  const title = edit ? "일정 수정" : "새 일정";
  return (
    <Dialog open={target !== null} onClose={onClose} size="lg" title={title} modal id="event-dialog">
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
  const push = usePush();
  const reminderOptions: { value: Reminder | "off"; label: string }[] = [{ value: "off", label: "알림 없음" }, ...(f.allDay ? ALL_DAY_REMINDERS : TIMED_REMINDERS)];
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["calendar"] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => (eventId ? patchEvent(eventId, formToPayload(f)) : createEvent(formToPayload(f))),
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
        <input type="checkbox" role="switch" checked={f.allDay} onChange={(e) => set({ allDay: e.target.checked, reminder: reminderFor(e.target.checked, f.reminder) })} />
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
        <span id={`${id}-rem`}>알림</span>
        {recurring ? (
          <p className="tk-help">반복 일정에는 알림을 걸 수 없어요. 반복 기능은 다시 설계하는 중이라, 지금은 고치면 반복 전체가 함께 바뀌어요.</p>
        ) : (
          <>
            <Select
              id={`${id}-remsel`}
              labelledBy={`${id}-rem`}
              value={f.reminder ?? "off"}
              options={reminderOptions}
              onChange={(v) => set({ reminder: v === "off" ? null : (v as Reminder) })}
            />
            {f.reminder && push.state !== "on" && <p className="tk-help">이 기기는 푸시 알림이 꺼져 있어요. 설정의 알림에서 켜야 받을 수 있어요.</p>}
          </>
        )}
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
