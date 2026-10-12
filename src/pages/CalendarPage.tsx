import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import koLocale from "@fullcalendar/core/locales/ko";
import type { DatesSetArg, DayCellContentArg, EventClickArg } from "@fullcalendar/core";
import { listEvents, listHolidays } from "../api/client";
import { EventDialog } from "../features/planner/EventDialog";
import type { EditorTarget } from "../features/planner/EventDialog";
import { seoulNow, seoulToday, toFcEvent, toFcHoliday, visibleRange } from "../features/planner/dates";
import { ErrorState } from "../features/viewer/screenStates";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import "./planner.css";

type ViewId = "dayGridMonth" | "timeGridWeek" | "listMonth";
const VIEWS: { id: ViewId; label: string }[] = [
  { id: "dayGridMonth", label: "월" },
  { id: "timeGridWeek", label: "주" },
  { id: "listMonth", label: "목록" },
];
const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin];

/**
 * 캘린더(ADR 0008). FullCalendar 를 timeZone="UTC" 로 두고 서버가 준 서울 벽시계 문자열을 그대로 먹여, 기기 시간대와 상관없이
 * 서울 시각이 보이게 한다. 한국 공휴일은 서버(holidays 패키지)가 주고, 날짜 숫자와 이름을 빨갛게 그린다.
 */
export function CalendarPage() {
  const cal = useRef<FullCalendar>(null);
  const [view, setView] = useState<ViewId>("dayGridMonth");
  const [title, setTitle] = useState("");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const events = useQuery({
    queryKey: ["calendar", "events", range?.from, range?.to],
    queryFn: () => listEvents(range!.from, range!.to),
    enabled: !!range,
    placeholderData: (prev) => prev,
  });
  const holidays = useQuery({
    queryKey: ["calendar", "holidays", range?.from, range?.to],
    queryFn: () => listHolidays(range!.from, range!.to),
    enabled: !!range,
    staleTime: 24 * 3_600_000,
    placeholderData: (prev) => prev,
  });

  const holidayDates = useMemo(() => new Set(holidays.data?.holidays.map((h) => h.date)), [holidays.data]);
  const fcEvents = useMemo(
    () => [...(holidays.data?.holidays.map(toFcHoliday) ?? []), ...(events.data?.events.map(toFcEvent) ?? [])],
    [events.data, holidays.data],
  );

  const api = () => cal.current?.getApi();
  const onDates = (a: DatesSetArg) => {
    setTitle(a.view.title);
    setView(a.view.type as ViewId);
    setRange(visibleRange(a.start, a.end));
  };
  const dateClass = (date: Date) => {
    const iso = date.toISOString().slice(0, 10);
    return [holidayDates.has(iso) || date.getUTCDay() === 0 ? "tk-cal-day--red" : "", date.getUTCDay() === 6 ? "tk-cal-day--sat" : ""].filter(Boolean);
  };
  const onEventClick = (a: EventClickArg) => {
    a.jsEvent.preventDefault();
    const id = a.event.extendedProps.eventId as string | undefined;
    if (id) setEditor({ mode: "edit", eventId: id });
  };
  const hasError = events.isError || holidays.isError;

  return (
    <div className="tk-screen planner-cal">
      <PageHeader
        title="캘린더"
        actions={
          <button className="tk-button tk-button--sm tk-button--primary" type="button" onClick={() => setEditor({ mode: "create", date: seoulToday() })}>
            <Icon name="plus" />
            일정
          </button>
        }
      />
      <div className="planner-cal__bar">
        <div className="planner-cal__nav">
          <button className="tk-icon-button" type="button" aria-label="이전" onClick={() => api()?.prev()}>
            <Icon name="chevron-left" />
          </button>
          <button className="tk-button tk-button--sm" type="button" onClick={() => api()?.today()}>
            오늘
          </button>
          <button className="tk-icon-button" type="button" aria-label="다음" onClick={() => api()?.next()}>
            <Icon name="chevron-right" />
          </button>
          <h2 className="planner-cal__title" aria-live="polite">
            {title}
          </h2>
        </div>
        <div className="tk-segmented" role="radiogroup" aria-label="보기">
          {VIEWS.map((v) => (
            <label key={v.id}>
              <input type="radio" name="cal-view" checked={view === v.id} onChange={() => api()?.changeView(v.id)} />
              {v.label}
            </label>
          ))}
        </div>
      </div>
      {hasError && (
        <ErrorState
          error={events.error ?? holidays.error}
          what="일정"
          onRetry={() => {
            void events.refetch();
            void holidays.refetch();
          }}
        />
      )}
      <div className="tk-screen__body planner-cal__body">
        <FullCalendar
          ref={cal}
          plugins={PLUGINS}
          locale={koLocale}
          timeZone="UTC"
          now={seoulNow}
          initialView="dayGridMonth"
          headerToolbar={false}
          height="100%"
          firstDay={0}
          fixedWeekCount={false}
          dayMaxEvents={3}
          moreLinkClick="popover"
          nowIndicator
          navLinks={false}
          events={fcEvents}
          eventDisplay="block"
          displayEventEnd={false}
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", hour12: false }}
          slotLabelFormat={{ hour: "numeric", minute: "2-digit", hour12: false }}
          slotMinTime="06:00:00"
          scrollTime="08:00:00"
          views={{ timeGridWeek: { dayHeaderFormat: { weekday: "short", day: "numeric" } } }}
          allDayText="종일"
          noEventsText="이 달에는 일정이 없어요"
          dayHeaderClassNames={(a) => dateClass(a.date)}
          dayCellClassNames={(a) => dateClass(a.date)}
          dayCellContent={(a: DayCellContentArg) => a.dayNumberText.replace("일", "")}
          datesSet={onDates}
          eventClick={onEventClick}
          dateClick={(a) => setEditor({ mode: "create", date: a.dateStr.slice(0, 10), time: a.allDay ? undefined : a.dateStr.slice(11, 16) })}
        />
      </div>
      <EventDialog target={editor} onClose={() => setEditor(null)} />
    </div>
  );
}
