import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { generateWeatherBriefing, getWeatherBriefing, listWeatherBriefings } from "../api/client";
import type { WeatherBriefing, WeatherHour, WeatherLocation } from "../api/weatherTypes";
import { daypartRows, isInProgress, isNotFound, parseDayParam, sevenDayRows, shiftDay, statusLabel, weatherLabel } from "../features/weather/weatherData";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { PageHeader } from "../shell/PageHeader";
import { Button, IconButton } from "../ui/Button";
import { EngineBadge } from "../ui/EngineBadge";
import { Icon } from "../ui/Icon";
import { toast } from "../ui/toastStore";
import "./weather.css";

const KST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
// 올해가 아닌 날짜는 연도를 붙여 지난해 브리핑과 헷갈리지 않게 한다.
const dayLabel = (day: string) => new Intl.DateTimeFormat("ko-KR", {
  ...(day.slice(0, 4) === KST_DATE.format(new Date()).slice(0, 4) ? {} : { year: "numeric" as const }),
  month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Seoul",
}).format(new Date(`${day}T12:00:00+09:00`));
const timeLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(`${value}:00+09:00`))
  : "자료 없음";
const number = (value: number | null, unit: string) => value === null ? "자료 없음" : `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;

function TemperatureChart({ rows, when }: { rows: WeatherHour[]; when: string }) {
  const valid = rows.flatMap((row, index) => row.temperature_c === null ? [] : [{ row, index }]);
  if (!valid.length) return <p className="weather-muted">시간별 기온 자료가 없습니다.</p>;
  const values = valid.map(({ row }) => row.temperature_c!);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const x = (index: number) => 24 + index * (652 / Math.max(rows.length - 1, 1));
  const y = (value: number) => 118 - ((value - min) / Math.max(max - min, 1)) * 86;
  const path = rows.reduce((value, row, index) => {
    if (row.temperature_c === null) return value;
    const previous = index > 0 ? rows[index - 1].temperature_c : null;
    return `${value}${previous === null ? "M" : "L"}${x(index)},${y(row.temperature_c)} `;
  }, "").trim();
  return (
    <div className="weather-chart-wrap">
      <svg className="weather-temp-chart" viewBox="0 0 700 150" role="img" aria-label={`수원 ${when} 시간별 기온 그래프`}>
        {[0, 1, 2].map(i => <line key={i} x1="24" x2="676" y1={32 + i * 43} y2={32 + i * 43} className="weather-chart-grid" />)}
        <path d={path} className="weather-chart-line" />
        {valid.map(({ row, index }) => <circle key={row.time} cx={x(index)} cy={y(row.temperature_c!)} r="3.5" className="weather-chart-point">
          <title>{timeLabel(row.time)} · {number(row.temperature_c, "°")}</title>
        </circle>)}
        {[0, 6, 12, 18, 23].map(hour => {
          const i = rows.findIndex(r => Number(r.time.slice(11, 13)) === hour);
          return i < 0 ? null : <text key={hour} x={x(i)} y="144" textAnchor="middle" className="weather-chart-label">{String(hour).padStart(2, "0")}시</text>;
        })}
      </svg>
      <div className="weather-chart-extremes"><span>최저 {number(Math.min(...values), "°")}</span><span>최고 {number(Math.max(...values), "°")}</span></div>
    </div>
  );
}

function DaypartChart({ rows, day }: { rows: WeatherHour[]; day: string }) {
  const periods = daypartRows(rows, day);
  if (!periods.length) return <p className="weather-muted">오전·오후·저녁 예보 자료가 없습니다.</p>;
  return <div className="weather-dayparts">
    {periods.map(period => <div key={period.label} className="weather-daypart">
      <span>{period.label}</span><strong>{number(period.temperature, "°")}</strong>
      <div className="weather-prob-track" aria-label={`강수확률 ${number(period.probability, "%")}`}>
        <span style={{ width: `${Math.max(0, Math.min(period.probability ?? 0, 100))}%` }} />
      </div><small>{number(period.probability, "%")}</small>
    </div>)}
  </div>;
}

function WeekStrip({ rows }: { rows: WeatherLocation["daily"] }) {
  const days = sevenDayRows(rows);
  const values = days.flatMap(day => [day.low, day.high].filter((v): v is number => v !== null));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  return <div className="weather-week" role="list" aria-label="수원 7일 최저·최고 기온">
    {days.map(day => {
      const label = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "Asia/Seoul" }).format(new Date(`${day.date}T12:00:00+09:00`));
      const start = day.low === null ? 0 : ((day.low - min) / Math.max(max - min, 1)) * 100;
      const end = day.high === null ? 0 : ((day.high - min) / Math.max(max - min, 1)) * 100;
      return <div key={day.date} role="listitem" className="weather-week__day" data-weekend={day.weekend}>
        <span className="weather-week__date">{label}</span>
        <span className="weather-week__low">{number(day.low, "°")}</span>
        <div className="weather-week__track" aria-hidden="true">
          {day.low !== null && day.high !== null && <span style={{ left: `${start}%`, width: `${Math.max(end - start, 4)}%` }} />}
        </div>
        <span className="weather-week__high">{number(day.high, "°")}</span>
        <span className="weather-week__rain" aria-label={day.rain ? "비 가능성 높음" : "비 가능성 낮거나 자료 없음"}>{day.rain ? "비" : "—"}</span>
      </div>;
    })}
  </div>;
}

function Commute({ suwon, seoul, day }: { suwon?: WeatherLocation; seoul?: WeatherLocation; day: string }) {
  const windowText = (hours: WeatherHour[]) => {
    const rows = hours.filter(row => row.time.startsWith(day) && ["08", "09", "18", "19"].includes(row.time.slice(11, 13)));
    const probability = rows.flatMap(row => row.precipitation_probability_percent === null ? [] : [row.precipitation_probability_percent]);
    return { high: probability.length ? Math.max(...probability) : null, temp: rows.flatMap(row => row.temperature_c === null ? [] : [row.temperature_c]) };
  };
  const s = suwon ? windowText(suwon.hourly) : null, c = seoul ? windowText(seoul.hourly) : null;
  return <div className="weather-commute">
    {[["수원", s], ["서울", c]].map(([name, values]) => {
      const entry = values as ReturnType<typeof windowText>;
      if (entry === null) return <article className="weather-commute__place" key={name as string}><h3>{name as string}</h3><strong>예보 자료 없음</strong><small>해당 지역 수집 실패</small></article>;
      return <article className="weather-commute__place" key={name as string}>
        <h3>{name as string}</h3>
        <strong>{entry.temp.length ? `${Math.min(...entry.temp)}~${Math.max(...entry.temp)}°` : "기온 자료 없음"}</strong>
        <span>08~09시 · 18~19시 가정</span>
        <small>강수확률 최고 {number(entry.high, "%")}</small>
      </article>;
    })}
  </div>;
}

function BriefingView({ item, isToday }: { item: WeatherBriefing; isToday: boolean }) {
  const forecast = item.forecast;
  if (!forecast) return null;
  const suwon = forecast.suwon, seoul = forecast.seoul;
  const current = suwon?.current;
  const unknownCount = Object.values(forecast).reduce((sum, place) => sum + place.missing_fields.length, 0);
  const hourlyToday = suwon?.hourly.filter(row => row.time.startsWith(item.day)) ?? [];
  const when = isToday ? "오늘" : "이날";
  return <>
    {item.briefing && <section className="weather-summary" aria-labelledby="weather-summary-title">
      <div className="weather-summary__heading"><Icon name="sun" /><span>{when}의 한눈에 보기</span></div>
      <h2 id="weather-summary-title" className="sr-only">{when}의 한눈에 보기</h2>
      <ul>{item.briefing.summary.map((line, i) => <li key={i}>{line}</li>)}</ul>
      <div className="weather-advice-grid">
        <article className="weather-advice weather-advice--rain"><span>우산</span><p>{item.briefing.umbrella}</p></article>
        <article className="weather-advice"><span>옷차림</span><p>{item.briefing.outfit}</p></article>
      </div>
    </section>}

    {suwon && <section className="tk-section" aria-labelledby="weather-now-title">
      <div className="tk-section__head"><h2 id="weather-now-title" className="tk-section__title">{isToday ? "수원 현재 날씨" : "수원 브리핑 당시 날씨"}</h2><span className="weather-condition">{weatherLabel(current!.weather_code)}</span></div>
      <div className="weather-current">
        <div className="weather-current__main"><strong>{number(current!.temperature_c, "°")}</strong><span>체감 {number(current!.apparent_temperature_c, "°")}</span></div>
        <dl>
          <div><dt>습도</dt><dd>{number(current!.humidity_percent, "%")}</dd></div>
          <div><dt>바람</dt><dd>{number(current!.wind_speed_kmh, " km/h")}</dd></div>
          <div><dt>예보시각</dt><dd>{timeLabel(current!.time)}</dd></div>
        </dl>
      </div>
    </section>}
    {!suwon && <p className="tk-status tk-status--warning" role="status">수원 예보를 수집하지 못했습니다. 서울 예보가 있다면 그 자료만 표시합니다.</p>}

    {suwon && <section className="tk-section" aria-labelledby="weather-hourly-title">
      <div className="tk-section__head"><h2 id="weather-hourly-title" className="tk-section__title">{when} 시간별 변화</h2><span className="weather-subtitle">수원 · 기온 / 시간별 강수확률</span></div>
      <TemperatureChart rows={hourlyToday} when={when} />
      <DaypartChart rows={suwon.hourly} day={item.day} />
      <div className="weather-hour-grid" aria-label="시간별 강수량과 확률">
        {hourlyToday.filter(row => Number(row.time.slice(11, 13)) % 3 === 0).map(row => <div key={row.time}>
          <time>{row.time.slice(11, 16)}</time><strong>{number(row.precipitation_probability_percent, "%")}</strong>
          <span>{number(row.precipitation_mm, " mm")}</span>
        </div>)}
      </div>
    </section>}

    {(suwon || seoul) && <section className="tk-section" aria-labelledby="weather-commute-title">
      <div className="tk-section__head"><h2 id="weather-commute-title" className="tk-section__title">출퇴근 지역 비교</h2><span className="weather-subtitle">시간 미설정 · 08~09시, 18~19시로 가정</span></div>
      <Commute suwon={suwon} seoul={seoul} day={item.day} />
      <p className="weather-insight">{item.briefing?.commute ?? "출근·퇴근은 08~09시와 18~19시를 가정합니다."}</p>
    </section>}

    {suwon && <section className="tk-section" aria-labelledby="weather-week-title">
      <div className="tk-section__head"><h2 id="weather-week-title" className="tk-section__title">수원 7일 전망</h2><span className="weather-subtitle">비 표시는 강수확률 40% 이상</span></div>
      <WeekStrip rows={suwon.daily} />
      <p className="weather-insight">{item.briefing?.week}</p>
      <p className="weather-insight">{item.briefing?.daypart}</p>
    </section>}

    <footer className="weather-source">
      {item.request_source === "scheduled" && item.scheduled_at && <span>예약 06:30 · 실제 수집 시작 {new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(item.created_at))}</span>}
      <span>기상 정보 기준 {new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date((suwon ?? seoul)!.fetched_at))} KST 수집</span>
      <span>갱신 {new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date((suwon ?? seoul)!.fetched_at))} · 예보 기준 {timeLabel((suwon ?? seoul)!.forecast_time)}</span>
      {item.source_errors && Object.keys(item.source_errors).length > 0 && <span className="weather-source__missing">지역 예보 일부 수집 실패: {Object.keys(item.source_errors).map(key => key === "suwon" ? "수원" : "서울").join("·")}</span>}
      {unknownCount > 0 && <span className="weather-source__missing">일부 항목 {unknownCount}개 자료 없음</span>}
      <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data by Open-Meteo.com · CC BY 4.0</a>
      {item.analysis_status !== "succeeded" && <span className="weather-source__degraded">분석 {item.analysis_status ?? "대기"} · 표시 내용은 확인 가능한 예보 데이터 기반</span>}
      {item.analysis_engine && <span className="weather-source__engine">분석 엔진 <EngineBadge engine={item.analysis_engine} />{item.analysis_model && <small>{item.analysis_model}</small>}</span>}
      {item.push_error && <span className="weather-source__missing">알림 전송 실패 · 다시 시도할 수 있습니다.</span>}
    </footer>
  </>;
}

export function WeatherPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const today = KST_DATE.format(new Date());
  // 주소의 date가 화면 상태의 유일한 출처다. 알림 링크(/weather?date=)와 새로고침이 같은 화면을 복원한다.
  const rawDate = params.get("date");
  const requestedDay = parseDayParam(rawDate);
  const badDate = rawDate !== null && requestedDay === null;
  const activeDay = requestedDay ?? today;
  const isToday = activeDay === today;
  const selectDay = (day: string) => setParams({ date: day }, { replace: true });

  const history = useQuery({ queryKey: ["weather", "history"], queryFn: () => listWeatherBriefings(30) });
  const detail = useQuery({ queryKey: ["weather", "day", activeDay], queryFn: () => getWeatherBriefing(activeDay), refetchInterval: query => isInProgress(query.state.data?.status) ? 5000 : false });
  const generate = useMutation({
    mutationFn: generateWeatherBriefing,
    onSuccess: item => { selectDay(item.day); void qc.invalidateQueries({ queryKey: ["weather"] }); },
    onError: () => toast({ message: "날씨 브리핑을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.", tone: "danger" }),
  });
  // 서버의 생성 API는 항상 "오늘" 행을 만든다. 지난 날짜 화면에서는 이 경로가 열리지 않게 막는다.
  const requestToday = () => { if (isToday) generate.mutate(); };
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: ["weather"] }); });
  const active = detail.data;
  const missing = detail.isError && isNotFound(detail.error);
  const latestOther = history.data?.find(item => item.day !== activeDay);
  const busy = generate.isPending || isInProgress(active?.status);
  return <div className="tk-screen weather-page">
    <PageHeader title="날씨 브리핑" />
    <div className="tk-screen__body"><div className="tk-container tk-container--md weather-page__container">
      <header className="weather-heading">
        <div><p className="weather-eyebrow">매일 오전 6:30 · Asia/Seoul</p><h1>{dayLabel(activeDay)}</h1>
          <p>{isToday ? "수원을 중심으로 서울 출퇴근과 한 주 예보를 살펴봅니다." : "지난 날짜에 만들어진 브리핑을 보고 있어요."}</p></div>
        {isToday
          ? <Button variant="primary" busy={busy} onClick={requestToday}><Icon name="retry" />{busy ? "브리핑 준비 중" : active ? "오늘 브리핑 다시 확인" : "오늘 브리핑 만들기"}</Button>
          : <Button variant="primary" onClick={() => selectDay(today)}>오늘 브리핑으로</Button>}
      </header>

      <div className="weather-daynav" role="group" aria-label="브리핑 날짜 이동">
        <IconButton aria-label="이전 날짜" onClick={() => selectDay(shiftDay(activeDay, -1))}><Icon name="chevron-left" /></IconButton>
        <input className="tk-input" aria-label="브리핑 날짜" type="date" value={activeDay} max={today} onChange={e => { const next = parseDayParam(e.target.value); if (next) selectDay(next); }} />
        <IconButton aria-label="다음 날짜" disabled={activeDay >= today} onClick={() => selectDay(shiftDay(activeDay, 1))}><Icon name="chevron-right" /></IconButton>
        <Button disabled={isToday} onClick={() => selectDay(today)}>오늘</Button>
      </div>
      {badDate && <p className="tk-status tk-status--warning" role="status">주소의 날짜({rawDate})를 읽을 수 없어 오늘 브리핑을 보여드려요.</p>}

      {history.isError && <div className="weather-state" role="alert"><strong>지난 브리핑 목록을 불러오지 못했어요.</strong><Button variant="ghost" onClick={() => void history.refetch()}>다시 시도</Button></div>}
      {history.data && history.data.length > 0 && <nav className="weather-history" aria-label="지난 날씨 브리핑">
        <span>브리핑 이력</span>{history.data.map(item => <button key={item.id} type="button" aria-current={item.day === activeDay ? "date" : undefined}
          onClick={() => selectDay(item.day)}>
          {dayLabel(item.day)} <small>{statusLabel(item.status)}</small>
        </button>)}
      </nav>}

      {detail.isPending && <p className="tk-status" role="status" aria-busy="true"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />브리핑을 불러오는 중</p>}
      {missing && <div className="weather-state weather-state--empty" role="status">
        <Icon name="sun" /><strong>{isToday ? "아직 오늘 날씨 브리핑이 없어요." : "이 날짜에는 만들어진 브리핑이 없어요."}</strong>
        {isToday
          ? <><p>오늘 예보를 수집해 브리핑을 만들어 보세요.</p><Button variant="primary" busy={generate.isPending} onClick={requestToday}>지금 만들기</Button></>
          : <p>브리핑은 매일 아침 자동으로 만들어지며, 지난 날짜는 새로 만들 수 없어요.</p>}
        {latestOther && <Button variant="ghost" onClick={() => selectDay(latestOther.day)}>가장 최근 브리핑 보기 · {dayLabel(latestOther.day)}</Button>}
      </div>}
      {detail.isError && !missing && <div className="weather-state" role="alert"><strong>선택한 날짜의 브리핑을 불러오지 못했어요.</strong><Button variant="ghost" onClick={() => void detail.refetch()}>다시 시도</Button></div>}
      {active && <>
        {active.status === "failed" && <div className="weather-state weather-state--error" role="alert"><strong>날씨 데이터를 가져오지 못했어요.</strong><p>{active.failure ?? (isToday ? "잠시 후 다시 시도해 주세요." : "이 날짜의 브리핑은 실패로 끝났어요.")}</p>
          {isToday && <Button variant="ghost" busy={generate.isPending} onClick={requestToday}>다시 시도</Button>}</div>}
        {active.status === "degraded" && <p className="tk-status tk-status--warning" role="status">간이 브리핑 · AI 분석을 마치지 못해 예보 데이터만으로 정리했어요.</p>}
        {isInProgress(active.status) && <p className="tk-status tk-status--agent" role="status" aria-busy="true"><span className="tk-spinner tk-spinner--sm" aria-hidden="true" />{active.status === "generating" ? "예보를 분석해 브리핑을 정리하고 있어요." : "두 지역의 예보를 모으고 있어요."}</p>}
        {active.forecast && <BriefingView item={active} isToday={isToday} />}
      </>}
    </div></div>
  </div>;
}
