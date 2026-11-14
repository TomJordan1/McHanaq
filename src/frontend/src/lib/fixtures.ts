/**
 * DATOS DE MUESTRA — NO SON OBSERVACIONES REALES
 * ==============================================
 * Generador determinista que alimenta la interfaz mientras el backend
 * (Angelo/Tom) no publica `data/processed/`. Reproduce la *forma* de la señal
 * y, sobre todo, **la forma del contrato**: los mismos campos, unidades y
 * reglas que fija `docs/harness/arquitectura-frontend-backend.md` (v1.2).
 *
 * Toda la UI que consuma esto muestra el distintivo "DATOS DE MUESTRA".
 * Nunca se presentan estas cifras como resultados en la demo ni en el pitch.
 */

import type {
  Confidence,
  DailyEnv,
  DayPoint,
  EnvConditions,
  Hotspot,
  Metadata,
  MonthCell,
  Sensor,
} from "../api/types";
import { LST_VALID_MIN_PCT, MIN_BASELINE_YEARS, SENSOR_META } from "../api/types";
import { PERU_BOUNDS, pointInRing, type LatLon } from "./geo";

/* -------------------------------------------------------------------------- */
/* Aleatoriedad reproducible                                                   */
/* -------------------------------------------------------------------------- */

/** PRNG mulberry32: misma semilla, misma salida, en cualquier navegador. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/* -------------------------------------------------------------------------- */
/* Fórmulas del documento                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Humedad relativa por Magnus-Tetens, tal como la fija la arquitectura v1.2
 * §2.2: `RH = 100 · exp(17.625·Td / (243.04+Td)) / exp(17.625·T / (243.04+T))`,
 * acotada a [0, 100]. T y Td en °C.
 */
export function magnusTetensRH(tempC: number, dewPointC: number): number {
  const num = Math.exp((17.625 * dewPointC) / (243.04 + dewPointC));
  const den = Math.exp((17.625 * tempC) / (243.04 + tempC));
  return Math.max(0, Math.min(100, 100 * (num / den)));
}

/**
 * Dirección diaria del viento desde las componentes medias del día.
 * Convención meteorológica: *desde dónde* sopla, 0° = N, 90° = E.
 * Nunca se promedian ángulos: se promedian `u` y `v` y luego se calcula.
 */
export function windFromComponents(u: number, v: number): { dir: number; speed: number } {
  return {
    dir: ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360,
    speed: Math.sqrt(u * u + v * v),
  };
}

/**
 * Modelo DEM según la época del sensor (arquitectura v1.2 §2.2):
 * SRTM/NASADEM para el tramo MODIS (2000–2011) y Copernicus GLO-30 para el
 * tramo VIIRS (2012–presente).
 */
export function demSourceForYear(year: number): string {
  return year <= 2011 ? "NASADEM_HGT_001" : "COPERNICUS_GLO30";
}

/* -------------------------------------------------------------------------- */
/* Campo espacial                                                              */
/* -------------------------------------------------------------------------- */

/** [lat, lon, peso, dispersión en grados] */
const DENSITY_NODES: [number, number, number, number][] = [
  [-8.4, -74.6, 1.0, 1.5],
  [-11.9, -70.6, 0.95, 1.4],
  [-6.5, -76.4, 0.85, 1.2],
  [-4.6, -73.6, 0.7, 1.8],
  [-12.6, -73.9, 0.6, 1.0],
  [-13.5, -71.9, 0.55, 0.8],
  [-9.5, -77.3, 0.4, 0.7],
  [-15.5, -70.4, 0.4, 0.9],
  [-5.9, -78.6, 0.5, 0.9],
  [-16.3, -71.6, 0.3, 0.7],
  [-7.2, -78.5, 0.35, 0.6],
  [-10.9, -75.2, 0.5, 0.9],
];

function spatialWeight(lat: number, lon: number): number {
  let w = 0;
  for (const [nlat, nlon, weight, spread] of DENSITY_NODES) {
    const d2 = ((lat - nlat) / spread) ** 2 + ((lon - nlon) / spread) ** 2;
    w += weight * Math.exp(-d2);
  }
  const coastal = Math.max(0, 1 - Math.exp(-(((lon + 79.5) / 1.2) ** 2)) * 0.9);
  return Math.min(1, w * coastal);
}

/** Peso por mes (índice 0 = enero). Pico en la estación seca, agosto-octubre. */
const SEASON = [0.1, 0.09, 0.08, 0.1, 0.22, 0.45, 0.72, 1.0, 1.0, 0.78, 0.42, 0.2];

function yearFactor(year: number): number {
  const r = rng(hashStr(`yr-${year}`));
  const trend = 1 + (year - 2001) * 0.012;
  const noise = 0.65 + r() * 0.75;
  const drought = year === 2005 || year === 2010 || year === 2016 || year === 2024 ? 1.45 : 1;
  return trend * noise * drought;
}

/** Sensibilidad relativa de cada sensor. No son factores de calibración. */
const SENSOR_GAIN: Record<Sensor, number> = {
  MODIS_TERRA: 1.0,
  MODIS_AQUA: 0.88,
  VIIRS_SNPP: 1.26,
};

export const FIXTURE_FIRST_YEAR = 2001;
export const FIXTURE_LAST_YEAR = 2026;
/** Último mes completo disponible en el juego de muestra. */
export const FIXTURE_LAST_MONTH = 10;
export const FIXTURE_LAST_DAY = `${FIXTURE_LAST_YEAR}-${pad2(FIXTURE_LAST_MONTH)}-31`;

export function sensorAvailable(sensor: Sensor, year: number, month: number): boolean {
  const meta = SENSOR_META[sensor];
  if (year < meta.since) return false;
  if (year === FIXTURE_LAST_YEAR && month > FIXTURE_LAST_MONTH) return false;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Metadatos del contrato                                                      */
/* -------------------------------------------------------------------------- */

export function buildMetadata(): Metadata {
  const ranges: Metadata["available_date_ranges_by_sensor"] = {};
  const periods: Metadata["available_periods_by_sensor"] = {};
  const envPeriods: string[] = [];

  for (const s of Object.keys(SENSOR_META) as Sensor[]) {
    const since = SENSOR_META[s].since;
    ranges[s] = {
      start: `${since}-${since === 2000 ? "02" : since === 2002 ? "07" : "01"}-01`,
      end: `${FIXTURE_LAST_YEAR}-${pad2(FIXTURE_LAST_MONTH)}-${pad2(daysInMonth(FIXTURE_LAST_YEAR, FIXTURE_LAST_MONTH))}`,
    };
    const list: string[] = [];
    for (let y = since; y <= FIXTURE_LAST_YEAR; y++) {
      for (let m = 1; m <= 12; m++) {
        if (!sensorAvailable(s, y, m)) continue;
        list.push(`${y}-${pad2(m)}`);
      }
    }
    periods[s] = list;
  }

  // El contexto ambiental acompaña a toda la serie del juego de muestra.
  for (let y = FIXTURE_FIRST_YEAR; y <= FIXTURE_LAST_YEAR; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === FIXTURE_LAST_YEAR && m > FIXTURE_LAST_MONTH) continue;
      envPeriods.push(`${y}-${pad2(m)}`);
    }
  }

  const viirs = new Set(periods.VIIRS_SNPP ?? []);
  const terra = new Set(periods.MODIS_TERRA ?? []);
  const aqua = new Set(periods.MODIS_AQUA ?? []);
  const common = envPeriods.filter((p) => viirs.has(p) && terra.has(p) && aqua.has(p));

  return {
    schema_version: "1.0",
    available_date_ranges_by_sensor: ranges,
    available_periods_by_sensor: periods,
    common_environmental_periods: envPeriods,
    common_analysis_periods: common,
    min_baseline_years: MIN_BASELINE_YEARS,
    sources: [
      { id: "MOD14A1", label: "MODIS Terra focos activos", resolution: "1 km" },
      { id: "MYD14A1", label: "MODIS Aqua focos activos", resolution: "1 km" },
      { id: "VNP14A1", label: "VIIRS S-NPP focos activos", resolution: "1 km" },
      { id: "MOD11A1", label: "MODIS LST diaria", resolution: "1 km" },
      { id: "VNP21A1D", label: "VIIRS LST diaria", resolution: "1 km" },
      { id: "ERA5_LAND_HOURLY", label: "ERA5-Land", resolution: "~11.1 km" },
      { id: "NASADEM_HGT_001", label: "NASADEM (tramo MODIS 2000–2011)", resolution: "30 m" },
      { id: "COPERNICUS_GLO30", label: "Copernicus DEM GLO-30 (tramo VIIRS)", resolution: "30 m" },
      { id: "MAPBIOMAS_PERU_C4", label: "MapBiomas Perú Colección 4", resolution: "30 m" },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Hotspots                                                                    */
/* -------------------------------------------------------------------------- */

const CONF_BANDS: { c: Confidence; p: number }[] = [
  { c: "low", p: 0.22 },
  { c: "nominal", p: 0.52 },
  { c: "high", p: 0.26 },
];

function pickConfidence(u: number): Confidence {
  let acc = 0;
  for (const b of CONF_BANDS) {
    acc += b.p;
    if (u <= acc) return b.c;
  }
  return "nominal";
}

const hotspotCache = new Map<string, Hotspot[]>();

export function monthlyHotspots(sensor: Sensor, year: number, month: number): Hotspot[] {
  const key = `${sensor}|${year}|${month}`;
  const cached = hotspotCache.get(key);
  if (cached) return cached;
  if (!sensorAvailable(sensor, year, month)) {
    hotspotCache.set(key, []);
    return [];
  }

  const r = rng(hashStr(key));
  const base = 1500 * SEASON[month - 1] * yearFactor(year) * SENSOR_GAIN[sensor];
  const target = Math.round(base * (0.85 + r() * 0.3));
  const nDays = daysInMonth(year, month);

  const out: Hotspot[] = [];
  let guard = 0;
  while (out.length < target && guard < target * 24) {
    guard++;
    const lat = PERU_BOUNDS.south + r() * (PERU_BOUNDS.north - PERU_BOUNDS.south);
    const lon = PERU_BOUNDS.west + r() * (PERU_BOUNDS.east - PERU_BOUNDS.west);
    if (r() > spatialWeight(lat, lon)) continue;

    const day = 1 + Math.floor(r() * nDays);
    const conf = pickConfidence(r());
    const frp = Math.round((2 + Math.pow(r(), 3) * 260) * 10) / 10;
    // Hora de sobrevuelo según el sensor (v1.2 §1, punto 2).
    const hh = sensor === "MODIS_TERRA" ? 14 + Math.floor(r() * 2) : 17 + Math.floor(r() * 3);
    const mm = Math.floor(r() * 60);

    out.push({
      id: `${sensor}-${year}${pad2(month)}-${out.length}`,
      lat: Math.round(lat * 1e4) / 1e4,
      lon: Math.round(lon * 1e4) / 1e4,
      date: `${year}-${pad2(month)}-${pad2(day)}`,
      sensor,
      frp,
      confidence: conf,
      acq_time: `${pad2(hh)}${pad2(mm)}`,
    });
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  hotspotCache.set(key, out);
  return out;
}

export function filterByArea(points: Hotspot[], ring: LatLon[] | null): Hotspot[] {
  if (!ring || ring.length < 3) return points;
  return points.filter((h) => pointInRing([h.lat, h.lon], ring));
}

/* -------------------------------------------------------------------------- */
/* Variables ambientales diarias                                               */
/* -------------------------------------------------------------------------- */

/**
 * Un día de contexto ambiental para un territorio.
 * Sigue las reglas del documento: Magnus-Tetens para la humedad relativa,
 * viento por componentes y `t_suelo_c` en `null` cuando hay más de 30 % de
 * nubes, en vez de rellenar con un valor inventado.
 */
export function buildDailyEnv(center: LatLon, date: string, sensor: Sensor): DailyEnv {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const r = rng(hashStr(`env|${center[0].toFixed(2)}|${center[1].toFixed(2)}|${date}`));
  const dry = SEASON[month - 1];
  const amazon = center[1] > -77 && center[0] > -13;
  const altitudeProxy = Math.max(0, Math.min(1, (-center[1] - 70) / 9));

  // Temperatura ambiente y punto de rocío; la humedad relativa se deriva.
  const tAmb = (amazon ? 27 : 17) - altitudeProxy * 7 + dry * 3 + (r() - 0.5) * 4;
  const spread = 2 + dry * 9 + r() * 3; // más seco = mayor separación con el rocío
  const tDew = tAmb - spread;
  const rh = magnusTetensRH(tAmb, tDew);

  // Viento: se generan componentes y de ahí salen dirección y velocidad.
  const uw = (r() - 0.5) * (3 + dry * 7);
  const vw = (r() - 0.5) * (3 + dry * 7);
  const { dir, speed } = windFromComponents(uw, vw);

  // Nubosidad: alta en temporada húmeda. Decide si la LST es utilizable.
  const cloudy = Math.max(0, Math.min(100, (1 - dry) * 72 + (r() - 0.5) * 30));
  const lstValid = Math.round((100 - cloudy) * 10) / 10;
  const usable = lstValid >= LST_VALID_MIN_PCT;
  // La superficie se calienta más que el aire, sobre todo en días despejados.
  const tSuelo = usable ? Math.round((tAmb + 4 + dry * 9 + (r() - 0.5) * 5) * 10) / 10 : null;

  const elevation = Math.round((amazon ? 180 : 500 + altitudeProxy * 3600) + (r() - 0.5) * 300);

  return {
    t_amb_c: Math.round(tAmb * 10) / 10,
    relative_humidity_2m_pct: Math.round(rh * 10) / 10,
    t_suelo_c: tSuelo,
    lst_valid_pixel_pct: lstValid,
    wind_dir_deg: Math.round(dir * 10) / 10,
    wind_speed_10m_ms: Math.round(speed * 10) / 10,
    elevation_m: Math.max(0, elevation),
    dem_source: demSourceForYear(sensor === "VIIRS_SNPP" ? Math.max(year, 2012) : year),
  };
}

/**
 * Serie diaria del rango pedido: actividad del sensor más contexto ambiental.
 * Es la forma que devuelve `GET /territories/{type}/{id}/activity?from=&to=`.
 */
export function buildDailySeries(
  points: Hotspot[],
  from: string,
  to: string,
  center: LatLon,
  coverageHint: number,
  sensor: Sensor
): DayPoint[] {
  const counts = new Map<string, { high: number; low: number }>();
  for (const h of points) {
    const e = counts.get(h.date) ?? { high: 0, low: 0 };
    if (h.confidence === "low") e.low++;
    else e.high++;
    counts.set(h.date, e);
  }

  const out: DayPoint[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const date = d.toISOString().slice(0, 10);
    const r = rng(hashStr(`cov|${date}|${sensor}`));
    const c = counts.get(date) ?? { high: 0, low: 0 };
    const coverage = Math.max(0, Math.min(1, coverageHint + (r() - 0.5) * 0.3));
    const expected = 400;
    out.push({
      date,
      detections: c.high,
      fire_pixels_low: c.low,
      valid_land_pixels: Math.round(expected * coverage),
      expected_land_pixels_per_day: expected,
      observation_coverage: Math.round(coverage * 1000) / 1000,
      ...buildDailyEnv(center, date, sensor),
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Calendario mensual                                                          */
/* -------------------------------------------------------------------------- */

function areaShare(ring: LatLon[] | null, areaKm2: number): number {
  if (!ring) return 1;
  const PERU_KM2 = 1_285_000;
  return Math.max(0.0012, Math.min(1, areaKm2 / PERU_KM2));
}

export function buildCalendar(
  sensor: Sensor,
  ring: LatLon[] | null,
  areaKm2: number,
  localWeight: number
): MonthCell[] {
  const share = areaShare(ring, areaKm2);
  const cells: MonthCell[] = [];
  const rates: Record<number, number[]> = {};

  for (let year = FIXTURE_FIRST_YEAR; year <= FIXTURE_LAST_YEAR; year++) {
    for (let month = 1; month <= 12; month++) {
      if (!sensorAvailable(sensor, year, month)) continue;
      const r = rng(hashStr(`cal|${sensor}|${year}|${month}|${share.toFixed(5)}`));

      const expected =
        1500 * SEASON[month - 1] * yearFactor(year) * SENSOR_GAIN[sensor] * share * localWeight;
      const detections = Math.max(0, Math.round(expected * (0.7 + r() * 0.6)));

      const cloudiness = 1 - SEASON[month - 1] * 0.55;
      const coverage = Math.max(0.25, Math.min(0.97, 0.9 - cloudiness * 0.38 + (r() - 0.5) * 0.12));

      const validPixelDays = Math.max(
        1,
        Math.round(1_285_000 * share * coverage * daysInMonth(year, month) * 0.0009)
      );
      const activity_rate = coverage < 0.15 ? null : detections / validPixelDays;

      const nDays = daysInMonth(year, month);
      const active_days = Math.min(nDays, Math.round(Math.min(nDays, Math.sqrt(detections) * 1.5)));
      const max_consecutive_active_days = Math.max(
        active_days > 0 ? 1 : 0,
        Math.round(active_days * (0.3 + r() * 0.35))
      );

      if (activity_rate !== null) (rates[month] ||= []).push(activity_rate);

      cells.push({
        year,
        month,
        detections,
        activity_rate,
        observation_coverage: coverage,
        active_days,
        max_consecutive_active_days,
        historical_anomaly: null,
        baseline_years: 0,
      });
    }
  }

  // Anomalía robusta contra el mismo mes calendario, exigiendo el mínimo de
  // años de línea base que fija el contrato (`min_baseline_years`).
  for (const cell of cells) {
    const history = (rates[cell.month] || []).filter((_, i) => i < cell.year - FIXTURE_FIRST_YEAR);
    cell.baseline_years = history.length;
    if (cell.activity_rate === null || history.length < MIN_BASELINE_YEARS) continue;
    const med = median(history);
    const mad = median(history.map((v) => Math.abs(v - med)));
    if (mad < 1e-9) continue; // MAD ~ 0: la z robusta no es estimable
    cell.historical_anomaly = (cell.activity_rate - med) / (1.4826 * mad);
  }

  return cells;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* -------------------------------------------------------------------------- */
/* Contexto mensual                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Contexto ambiental mensual: agrega la serie diaria por media aritmética y
 * por media ponderada por cobertura válida, como pide la arquitectura v1.2
 * §2.1. Para la dirección del viento se promedian las componentes, nunca los
 * ángulos.
 */
export function buildEnvConditions(center: LatLon, year: number, month: number): EnvConditions {
  const nDays = daysInMonth(year, month);
  const days: DailyEnv[] = [];
  const weights: number[] = [];
  for (let d = 1; d <= nDays; d++) {
    const date = `${year}-${pad2(month)}-${pad2(d)}`;
    const env = buildDailyEnv(center, date, "VIIRS_SNPP");
    days.push(env);
    weights.push((env.lst_valid_pixel_pct ?? 0) / 100);
  }

  const mean = (pick: (e: DailyEnv) => number | null) => {
    const xs = days.map(pick).filter((v): v is number => v !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const weightedMean = (pick: (e: DailyEnv) => number | null) => {
    let num = 0;
    let den = 0;
    days.forEach((e, i) => {
      const v = pick(e);
      if (v === null) return;
      num += v * weights[i];
      den += weights[i];
    });
    return den > 0 ? num / den : null;
  };

  // Viento mensual: promedio vectorial, no de ángulos.
  let su = 0;
  let sv = 0;
  let sw = 0;
  days.forEach((e, i) => {
    if (e.wind_dir_deg === null || e.wind_speed_10m_ms === null) return;
    const rad = (e.wind_dir_deg * Math.PI) / 180;
    su += -Math.sin(rad) * e.wind_speed_10m_ms * weights[i];
    sv += -Math.cos(rad) * e.wind_speed_10m_ms * weights[i];
    sw += weights[i];
  });
  const wind = sw > 0 ? windFromComponents(su / sw, sv / sw) : null;

  const r = rng(hashStr(`ctx|${center[0].toFixed(2)}|${center[1].toFixed(2)}|${year}|${month}`));
  const dry = SEASON[month - 1];
  const amazon = center[1] > -77 && center[0] > -13;
  const round = (v: number | null, d = 1) =>
    v === null ? null : Math.round(v * 10 ** d) / 10 ** d;

  return {
    t_amb_c: round(mean((e) => e.t_amb_c)),
    relative_humidity_2m_pct: round(mean((e) => e.relative_humidity_2m_pct)),
    t_suelo_c: round(mean((e) => e.t_suelo_c)),
    lst_valid_pixel_pct: round(mean((e) => e.lst_valid_pixel_pct)),
    wind_dir_deg: wind ? round(wind.dir) : null,
    wind_speed_10m_ms: round(mean((e) => e.wind_speed_10m_ms)),
    elevation_m: round(mean((e) => e.elevation_m), 0),
    dem_source: days[0]?.dem_source ?? null,
    precip_30d_mm: Math.round((amazon ? 230 : 110) * (1 - dry * 0.88) * (0.6 + r() * 0.8)),
    soil_moisture_surface: Math.round((0.36 - dry * 0.2 + (r() - 0.5) * 0.07) * 1000) / 1000,
    ndvi_median: Math.round(((amazon ? 0.79 : 0.46) - dry * 0.14 + (r() - 0.5) * 0.08) * 100) / 100,
    vegetation_area_pct: Math.round((amazon ? 86 : 52) + (r() - 0.5) * 18),
    water_area_pct: Math.round((amazon ? 4.5 : 1.2) * (0.5 + r()) * 10) / 10,
    slope_mean_deg: Math.round(((amazon ? 4 : 17) + (r() - 0.5) * 9) * 10) / 10,
    weighted: {
      t_amb_c: round(weightedMean((e) => e.t_amb_c)),
      t_suelo_c: round(weightedMean((e) => e.t_suelo_c)),
      relative_humidity_2m_pct: round(weightedMean((e) => e.relative_humidity_2m_pct)),
      wind_speed_10m_ms: round(weightedMean((e) => e.wind_speed_10m_ms)),
    },
  };
}
