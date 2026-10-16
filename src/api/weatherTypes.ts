export interface WeatherHour {
  time: string;
  temperature_c: number | null;
  apparent_temperature_c: number | null;
  precipitation_probability_percent: number | null;
  precipitation_mm: number | null;
  weather_code: number | null;
  wind_speed_kmh: number | null;
  visibility_m: number | null;
}

export interface WeatherDay {
  date: string;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  precipitation_probability_max_percent: number | null;
  precipitation_sum_mm: number | null;
  weather_code: number | null;
}

export interface WeatherLocation {
  provider: string;
  timezone: string;
  fetched_at: string;
  forecast_time: string | null;
  location: { name: string; latitude: number | null; longitude: number | null };
  units: { temperature: string; precipitation: string; wind_speed: string; visibility: string };
  current: {
    time: string | null;
    temperature_c: number | null;
    apparent_temperature_c: number | null;
    humidity_percent: number | null;
    wind_speed_kmh: number | null;
    weather_code: number | null;
  };
  hourly: WeatherHour[];
  daily: WeatherDay[];
  missing_fields: string[];
}

export interface WeatherBriefingContent {
  summary: string[];
  umbrella: string;
  outfit: string;
  commute: string;
  daypart: string;
  week: string;
}

export interface WeatherBriefing {
  id: string;
  day: string;
  status: "collecting" | "starting" | "generating" | "ready" | "degraded" | "failed";
  request_source: "scheduled" | "manual";
  raw_forecasts: Record<string, unknown> | null;
  forecast: { suwon?: WeatherLocation; seoul?: WeatherLocation } | null;
  source_errors: Record<string, string> | null;
  briefing: WeatherBriefingContent | null;
  analysis_status: string | null;
  analysis_engine: string | null;
  analysis_model: string | null;
  failure: string | null;
  scheduled_at: string | null;
  generated_at: string | null;
  push_sent_at: string | null;
  push_error: string | null;
  created_at: string;
  updated_at: string;
}
