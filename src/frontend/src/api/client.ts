/**
 * Único punto de acceso a datos del frontend.
 *
 * FUENTE DE VERDAD: `docs/harness/arquitectura-frontend-backend.md` (v1.2),
 * secciones 4 a 6. Ningún componente llama a `fetch` por su cuenta ni lee
 * archivos: todo pasa por aquí.
 *
 * La API es **diaria por defecto** (`date`, `from`/`to`); `period` solo aporta
 * el contexto mensual. Mientras el backend no responda, cada método cae en el
 * generador de muestra y marca el origen como "fixture", que la interfaz
 * muestra de forma visible.
 */

import type {
  DataOrigin,
  DayPoint,
  EnvConditions,
  Hotspot,
  Metadata,
  MetricId,
  MonthCell,
  Sensor,
  SensorComparison,
  SusceptibilityAssessment,
  TerritoryType,
} from "./types";
import { ENV_METRICS, MIN_BASELINE_YEARS, SENSOR_META } from "./types";
import {
  buildCalendar,
  buildDailySeries,
  buildEnvConditions,
  buildMetadata,
  filterByArea,
  monthlyHotspots,
} from "../lib/fixtures";
import { ringAreaKm2, ringCentroid, type LatLon } from "../lib/geo";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api/v1";
const TIMEOUT_MS = 3500;

export class ApiError extends Error {
  constructor(public status: number, public code: string, detail: string) {
    super(detail);
    this.name = "ApiError";
  }
}

/** La cancelación de una petición no es un error: se ignora (v1.2 §5, regla 2). */
export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export interface Envelope<T> {
  data: T;
  origin: DataOrigin;
}

type Params = Record<string, string | undefined>;

async function getJson<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
  ).toString();

  // Tiempo máximo propio, combinado con la cancelación que venga del llamador.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`, { signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.code ?? "UNKNOWN", body.detail ?? res.statusText);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/* -------------------------------------------------------------------------- */
/* Estado de la conexión                                                       */
/* -------------------------------------------------------------------------- */

export type BackendState = "checking" | "online" | "offline";

let backendState: BackendState = "checking";
let metadataCache: Metadata | null = null;

export function getBackendState(): BackendState {
  return backendState;
}

/** Sondea `/health`. El contrato devuelve `{status, data_loaded}`. */
export async function probeBackend(): Promise<BackendState> {
  try {
    const r = await getJson<{ status: string; data_loaded?: boolean }>("/health");
    backendState = r.status === "ok" ? "online" : "offline";
  } catch {
    backendState = "offline";
  }
  return backendState;
}

/* -------------------------------------------------------------------------- */
/* Metadatos                                                                   */
/* -------------------------------------------------------------------------- */

export async function fetchMetadata(signal?: AbortSignal): Promise<Envelope<Metadata>> {
  if (backendState === "online") {
    try {
      const m = await getJson<Metadata>("/metadata", {}, signal);
      metadataCache = m;
      return { data: m, origin: "api" };
    } catch (e) {
      if (isAbort(e)) throw e;
      backendState = "offline";
    }
  }
  const m = buildMetadata();
  metadataCache = m;
  return { data: m, origin: "fixture" };
}

/** Comprueba una fecha contra `available_date_ranges_by_sensor` (v1.2 §4.4). */
export function isDateAvailable(date: string, sensor: Sensor, meta: Metadata | null): boolean {
  const r = (meta ?? metadataCache)?.available_date_ranges_by_sensor?.[sensor];
  if (!r) return false;
  return date >= r.start && date <= r.end;
}

/* -------------------------------------------------------------------------- */
/* Consultas                                                                   */
/* -------------------------------------------------------------------------- */

export interface HotspotQuery {
  sensors: Sensor[];
  /** Rango diario a pedir, ambos inclusive. */
  from: string;
  to: string;
  ring: LatLon[] | null;
  includeLowConfidence: boolean;
}

export async function fetchHotspots(
  q: HotspotQuery,
  signal?: AbortSignal
): Promise<Envelope<Hotspot[]>> {
  if (backendState === "online") {
    try {
      const all: Hotspot[] = [];
      for (const sensor of q.sensors) {
        const r = await getJson<{ items: Hotspot[] }>(
          "/hotspots",
          { sensor, from: q.from, to: q.to },
          signal
        );
        all.push(...r.items);
      }
      const filtered = q.includeLowConfidence ? all : all.filter((h) => h.confidence !== "low");
      return { data: filterByArea(filtered, q.ring), origin: "api" };
    } catch (e) {
      if (isAbort(e)) throw e;
      backendState = "offline";
    }
  }

  const all: Hotspot[] = [];
  // El generador trabaja por mes: se recorren los meses que toca el rango.
  for (const [y, m] of monthsBetween(q.from, q.to)) {
    for (const sensor of q.sensors) all.push(...monthlyHotspots(sensor, y, m));
  }
  const inRange = all.filter((h) => h.date >= q.from && h.date <= q.to);
  const filtered = q.includeLowConfidence ? inRange : inRange.filter((h) => h.confidence !== "low");
  return { data: filterByArea(filtered, q.ring), origin: "fixture" };
}

export async function fetchCalendar(
  q: { sensor: Sensor; ring: LatLon[] | null },
  signal?: AbortSignal
): Promise<Envelope<MonthCell[]>> {
  if (backendState === "online") {
    try {
      const r = await getJson<{ items: MonthCell[] }>("/calendar", { sensor: q.sensor }, signal);
      return { data: r.items, origin: "api" };
    } catch (e) {
      if (isAbort(e)) throw e;
      backendState = "offline";
    }
  }
  const areaKm2 = q.ring ? ringAreaKm2(q.ring) : 1_285_000;
  const localWeight = q.ring ? localActivityWeight(ringCentroid(q.ring)) : 1;
  return { data: buildCalendar(q.sensor, q.ring, areaKm2, localWeight), origin: "fixture" };
}

/**
 * Serie diaria del rango pedido: actividad más contexto ambiental diario.
 * Corresponde a `GET /territories/{type}/{id}/activity?from=&to=&sensor=`.
 */
export async function fetchActivity(
  q: {
    type: TerritoryType;
    id: string;
    from: string;
    to: string;
    sensor: Sensor;
    /** Para la versión de muestra: focos ya filtrados por área. */
    localHotspots: Hotspot[];
    center: LatLon;
    coverageHint: number;
  },
  signal?: AbortSignal
): Promise<Envelope<DayPoint[]>> {
  if (backendState === "online") {
    try {
      const r = await getJson<{ items: DayPoint[] }>(
        `/territories/${q.type}/${encodeURIComponent(q.id)}/activity`,
        { from: q.from, to: q.to, sensor: q.sensor },
        signal
      );
      return { data: r.items, origin: "api" };
    } catch (e) {
      if (isAbort(e)) throw e;
      backendState = "offline";
    }
  }
  return {
    data: buildDailySeries(q.localHotspots, q.from, q.to, q.center, q.coverageHint, q.sensor),
    origin: "fixture",
  };
}

export async function fetchEnvConditions(
  center: LatLon,
  year: number,
  month: number,
  signal?: AbortSignal
): Promise<Envelope<EnvConditions>> {
  if (backendState === "online") {
    try {
      const r = await getJson<EnvConditions>(
        "/environment",
        {
          lat: String(center[0]),
          lon: String(center[1]),
          period: `${year}-${String(month).padStart(2, "0")}`,
        },
        signal
      );
      return { data: r, origin: "api" };
    } catch (e) {
      if (isAbort(e)) throw e;
      backendState = "offline";
    }
  }
  return { data: buildEnvConditions(center, year, month), origin: "fixture" };
}

/** URL de descarga del CSV diario del territorio (v1.2 §4.2). */
export function exportCsvUrl(
  type: TerritoryType,
  id: string,
  from: string,
  to: string,
  sensor: Sensor
): string {
  const qs = new URLSearchParams({ from, to, sensor });
  return `${BASE}/territories/${type}/${encodeURIComponent(id)}/export.csv?${qs}`;
}

/** Indica si una métrica necesita `sensor` (las ambientales no). */
export function metricNeedsSensor(metric: MetricId): boolean {
  return !ENV_METRICS.includes(metric) && metric !== "conditions_classification";
}

/* -------------------------------------------------------------------------- */
/* Derivaciones locales permitidas                                             */
/* -------------------------------------------------------------------------- */

/**
 * Comparación multisensor.
 *
 * ATENCIÓN: en producción la precomputa Tom y llega por `/sensor-comparison`.
 * Esta versión local existe solo para construir y probar la vista sin backend,
 * y clasifica la señal de cada sensor por separado antes de compararlas. Nunca
 * suma conteos entre sensores.
 */
export function deriveComparison(
  perSensor: Partial<Record<Sensor, MonthCell | undefined>>,
  periodId: string,
  date?: string
): SensorComparison {
  const COVERAGE_MIN = 0.35;
  const ELEVATED_Z = 1.0;

  const sensors: SensorComparison["sensors"] = {};
  let elevated = 0;
  let notElevated = 0;
  let usable = 0;

  for (const [key, cell] of Object.entries(perSensor) as [Sensor, MonthCell | undefined][]) {
    if (!cell) {
      sensors[key] = {
        available: false,
        activity_rate: null,
        historical_anomaly: null,
        observation_coverage: 0,
        signal_status: "unknown",
      };
      continue;
    }
    const comparable =
      cell.observation_coverage >= COVERAGE_MIN &&
      cell.historical_anomaly !== null &&
      cell.baseline_years >= MIN_BASELINE_YEARS;
    let signal: "elevated" | "not_elevated" | "unknown" = "unknown";
    if (comparable) {
      usable++;
      signal = (cell.historical_anomaly as number) >= ELEVATED_Z ? "elevated" : "not_elevated";
      if (signal === "elevated") elevated++;
      else notElevated++;
    }
    sensors[key] = {
      available: true,
      activity_rate: cell.activity_rate,
      historical_anomaly: cell.historical_anomaly,
      observation_coverage: cell.observation_coverage,
      signal_status: signal,
    };
  }

  let status: SensorComparison["status"];
  let interpretation: string;
  if (usable === 0) {
    status = "insufficient";
    interpretation =
      "Ninguna fuente alcanza la cobertura mínima o los 5 años de línea base necesarios para comparar.";
  } else if (usable === 1) {
    status = "single_sensor";
    interpretation =
      "Solo una fuente es utilizable en este período. No se puede evaluar concordancia entre sensores.";
  } else if (elevated >= 2 && notElevated === 0) {
    status = "concordant_elevated";
    interpretation =
      "Dos o más sensores con cobertura suficiente señalan actividad por encima de su patrón estacional.";
  } else if (notElevated >= 2 && elevated === 0) {
    status = "concordant_not_elevated";
    interpretation =
      "Los sensores comparables coinciden en que la actividad no supera su umbral estacional.";
  } else {
    status = "discordant";
    interpretation =
      "Los sensores no coinciden. Revisar cobertura, hora de sobrevuelo y diferencias instrumentales antes de interpretar.";
  }

  return { date, period_id: periodId, status, sensors, interpretation };
}

/**
 * Árbol de decisión de susceptibilidad contextual (técnico v1.7, Etapa 7).
 *
 * ATENCIÓN: en producción lo precomputa Tom y llega por `/summary`. Esta copia
 * local es solo para desarrollo, y mantiene los mismos nodos, categorías y ruta
 * de decisión del contrato. El nodo N3a usa `t_amb_c` y
 * `relative_humidity_2m_pct`, como fija la arquitectura v1.2 §2.1.
 */
export function deriveSusceptibility(
  env: EnvConditions | null,
  thermalElevated: boolean
): SusceptibilityAssessment {
  const path: string[] = [];
  const rules: string[] = [];
  const modifiers: string[] = [];
  const missing: string[] = [];

  const need = (v: number | null | undefined) => v === null || v === undefined;

  if (!env || need(env.vegetation_area_pct)) {
    return {
      classification: "not_evaluable",
      decision_path: ["N0:fail"],
      rules_triggered: [],
      modifiers: [],
      evidence: [],
      missing_variables: ["vegetation_area_pct"],
    };
  }

  // Compuerta de calidad N0: cobertura vegetal + un indicador de sequedad + uno meteorológico.
  const hasDryness = !need(env.precip_30d_mm) || !need(env.soil_moisture_surface);
  const hasWeather = !need(env.wind_speed_10m_ms) || !need(env.t_amb_c);
  if (!hasDryness) missing.push("precip_30d_mm", "soil_moisture_surface");
  if (!hasWeather) missing.push("wind_speed_10m_ms", "t_amb_c");

  // Umbrales: parámetros del módulo analítico, no constantes universales.
  const UMBRAL_VEG = 35;
  const UMBRAL_PEND = 12;
  const P25_PRECIP = 60;
  const P25_SOIL = 0.22;
  const P75_WIND = 4.5;
  const P75_TEMP = 26;
  const P25_RH = 45;

  const evidence: SusceptibilityAssessment["evidence"] = [
    {
      variable: "vegetation_area_pct",
      value: env.vegetation_area_pct,
      unit: "%",
      rule_status: (env.vegetation_area_pct ?? 0) >= UMBRAL_VEG ? "sobre_umbral" : "bajo_umbral",
      source_product: "MAPBIOMAS_PERU_C4",
    },
    {
      variable: "precip_30d_mm",
      value: env.precip_30d_mm,
      unit: "mm",
      rule_status: (env.precip_30d_mm ?? Infinity) < P25_PRECIP ? "bajo_p25_estacional" : "normal",
      source_product: "ERA5_LAND_HOURLY",
    },
    {
      variable: "soil_moisture_surface",
      value: env.soil_moisture_surface,
      unit: "m3/m3",
      rule_status:
        (env.soil_moisture_surface ?? Infinity) < P25_SOIL ? "bajo_p25_estacional" : "normal",
      source_product: "ERA5_LAND_HOURLY",
    },
    {
      variable: "wind_speed_10m_ms",
      value: env.wind_speed_10m_ms,
      unit: "m/s",
      rule_status: (env.wind_speed_10m_ms ?? 0) > P75_WIND ? "sobre_p75_estacional" : "normal",
      source_product: "ERA5_LAND_HOURLY",
    },
    {
      variable: "t_amb_c",
      value: env.t_amb_c,
      unit: "°C",
      rule_status: (env.t_amb_c ?? 0) > P75_TEMP ? "sobre_p75_estacional" : "normal",
      source_product: "ERA5_LAND_HOURLY",
    },
    {
      variable: "relative_humidity_2m_pct",
      value: env.relative_humidity_2m_pct,
      unit: "%",
      rule_status:
        (env.relative_humidity_2m_pct ?? 100) < P25_RH ? "bajo_p25_estacional" : "normal",
      source_product: "ERA5_LAND_HOURLY (Magnus-Tetens)",
    },
    {
      variable: "t_suelo_c",
      value: env.t_suelo_c,
      unit: "°C",
      rule_status: env.t_suelo_c === null ? "no_estimable_por_nubes" : "informativo",
      source_product: "MOD11A1 / MYD11A1 / VNP21A1D",
    },
    {
      variable: "slope_mean_deg",
      value: env.slope_mean_deg,
      unit: "grados",
      rule_status: (env.slope_mean_deg ?? 0) >= UMBRAL_PEND ? "pendiente_elevada" : "normal",
      source_product: env.dem_source ?? "SRTM",
    },
  ];

  if (!hasDryness || !hasWeather) {
    return {
      classification: "partial",
      decision_path: ["N0:fail"],
      rules_triggered: [],
      modifiers: [],
      evidence,
      missing_variables: missing,
    };
  }

  path.push("N0:pass");

  // N1 — vegetación combustible
  if ((env.vegetation_area_pct ?? 0) < UMBRAL_VEG) {
    path.push("N1:no");
    return {
      classification: "low",
      decision_path: path,
      rules_triggered: rules,
      modifiers,
      evidence,
      missing_variables: missing,
    };
  }
  path.push("N1:yes");
  rules.push("vegetation_present");

  const dry =
    (env.precip_30d_mm ?? Infinity) < P25_PRECIP ||
    (env.soil_moisture_surface ?? Infinity) < P25_SOIL;
  const windy = (env.wind_speed_10m_ms ?? 0) > P75_WIND;
  const hotDry =
    (env.t_amb_c ?? 0) > P75_TEMP && (env.relative_humidity_2m_pct ?? 100) < P25_RH;
  const steep = (env.slope_mean_deg ?? 0) >= UMBRAL_PEND;

  if (steep) modifiers.push("steep_slope_share_high");
  if (thermalElevated) modifiers.push("thermal_history_elevated");
  if ((env.water_area_pct ?? 0) >= 5) modifiers.push("water_share_high");
  if (env.t_suelo_c !== null && (env.t_suelo_c ?? 0) > 35) modifiers.push("lst_high");

  let classification: SusceptibilityAssessment["classification"];
  if (dry) {
    path.push("N2:yes");
    rules.push("dryness_high");
    if (windy || hotDry) {
      path.push("N3a:yes");
      if (windy) rules.push("wind_high");
      if (hotDry) rules.push("hot_dry_air");
      classification = "high";
    } else {
      path.push("N3a:no");
      classification = "moderate";
    }
  } else {
    path.push("N2:no");
    if (windy && steep) {
      path.push("N3b:yes");
      rules.push("wind_high", "steep_slope");
      classification = "moderate";
    } else {
      path.push("N3b:no");
      classification = "low";
    }
  }

  return {
    classification,
    decision_path: path,
    rules_triggered: rules,
    modifiers,
    evidence,
    missing_variables: missing,
  };
}

/* -------------------------------------------------------------------------- */
/* Utilidades de fecha                                                         */
/* -------------------------------------------------------------------------- */

/** Pares [año, mes] que toca el rango, ambos inclusive. */
export function monthsBetween(from: string, to: string): [number, number][] {
  const out: [number, number][] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const yEnd = Number(to.slice(0, 4));
  const mEnd = Number(to.slice(5, 7));
  while (y < yEnd || (y === yEnd && m <= mEnd)) {
    out.push([y, m]);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`,
  };
}

/** Peso de actividad según la ubicación. Solo para el juego de muestra. */
function localActivityWeight(center: LatLon): number {
  const [lat, lon] = center;
  const amazon = lon > -77.5 && lat > -13.5 && lat < -3;
  const coast = lon < -78.5;
  if (coast) return 0.12;
  if (amazon) return 1.6;
  return 0.7;
}

export const SENSOR_LABELS = SENSOR_META;
