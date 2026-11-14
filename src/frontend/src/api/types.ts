/**
 * Contratos de datos del frontend.
 *
 * FUENTE DE VERDAD: `docs/harness/arquitectura-frontend-backend.md` (v1.2) y
 * `docs/harness/documento-tecnico-operativo.md` (v1.7). Si el backend cambia un
 * nombre de campo, se cambia aquí y en `contracts/` en el mismo PR. El frontend
 * nunca renombra campos por su cuenta.
 *
 * La API sirve en **resolución diaria por defecto**: `date=YYYY-MM-DD` y rangos
 * `from`/`to`. `period=YYYY-MM` queda como parámetro opcional, solo para el
 * contexto y la anomalía mensual.
 */

export type Sensor = "MODIS_TERRA" | "MODIS_AQUA" | "VIIRS_SNPP";

export const SENSORS: Sensor[] = ["MODIS_TERRA", "MODIS_AQUA", "VIIRS_SNPP"];

export const SENSOR_META: Record<
  Sensor,
  {
    label: string;
    short: string;
    product: string;
    resolution: string;
    since: number;
    /** Hora aproximada de paso, en hora local. */
    overpass: string;
    color: string;
  }
> = {
  MODIS_TERRA: {
    label: "MODIS Terra",
    short: "TERRA",
    product: "MOD14A1.061",
    resolution: "1 km",
    since: 2000,
    overpass: "~10:30",
    color: "#f8850c",
  },
  MODIS_AQUA: {
    label: "MODIS Aqua",
    short: "AQUA",
    product: "MYD14A1.061",
    resolution: "1 km",
    since: 2002,
    overpass: "~13:30",
    color: "#e65c2f",
  },
  VIIRS_SNPP: {
    label: "VIIRS S-NPP",
    short: "VIIRS",
    product: "VNP14A1.002",
    resolution: "1 km",
    since: 2012,
    overpass: "~13:30",
    color: "#fcb416",
  },
};

export type TerritoryType = "province" | "hydro_unit";

/** Confianza de la detección. La clase 7 se reporta aparte del indicador principal. */
export type Confidence = "low" | "nominal" | "high";

export interface Hotspot {
  id: string;
  lat: number;
  lon: number;
  /** Fecha de la detección, ISO `YYYY-MM-DD`. */
  date: string;
  sensor: Sensor;
  /** Potencia radiativa del fuego, en megavatios. */
  frp: number;
  confidence: Confidence;
  /** Paso por el satélite, `HHMM` UTC. */
  acq_time: string;
}

/* -------------------------------------------------------------------------- */
/* Variables ambientales diarias (arquitectura v1.2, sección 2.2)              */
/* -------------------------------------------------------------------------- */

/**
 * Umbral de nubes del documento: se exige menos de 30 % de nubes, es decir
 * `lst_valid_pixel_pct >= 70`. Por debajo, `t_suelo_c` llega como `null` y el
 * frontend muestra «Sin datos», nunca cero.
 */
export const LST_VALID_MIN_PCT = 70;

/** Cobertura de observación mínima exigida al día, misma regla de nubes. */
export const OBS_COVERAGE_MIN = 0.7;

/** Años mínimos de línea base para estimar la anomalía robusta. */
export const MIN_BASELINE_YEARS = 5;

export interface DailyEnv {
  /** Temperatura ambiente a 2 m, en °C (ERA5-Land `temperature_2m` − 273.15). */
  t_amb_c: number | null;
  /** Humedad relativa a 2 m, en %. Magnus-Tetens desde temperatura y rocío. */
  relative_humidity_2m_pct: number | null;
  /** Temperatura superficial del suelo (LST), en °C. `null` con demasiada nube. */
  t_suelo_c: number | null;
  /** Porcentaje de píxeles LST válidos. Debe ser >= 70 para usar `t_suelo_c`. */
  lst_valid_pixel_pct: number | null;
  /** Dirección del viento, 0–360°, convención meteorológica (desde dónde sopla). */
  wind_dir_deg: number | null;
  /** Velocidad del viento a 10 m, en m/s. */
  wind_speed_10m_ms: number | null;
  /** Altura media del territorio, en m s. n. m. */
  elevation_m: number | null;
  /** Modelo DEM usado, según la época del sensor. */
  dem_source: string | null;
}

/** Un día de un territorio, para un sensor: actividad más contexto diario. */
export interface DayPoint extends DailyEnv {
  date: string;
  /** Detecciones de confianza nominal/alta (clases 8–9). */
  detections: number;
  /** Detecciones de baja confianza (clase 7), para sensibilidad. */
  fire_pixels_low?: number;
  valid_land_pixels?: number;
  expected_land_pixels_per_day?: number;
  observation_coverage: number;
}

/* -------------------------------------------------------------------------- */
/* Resumen mensual y calendario                                               */
/* -------------------------------------------------------------------------- */

/** Celda del calendario: un mes de un año para un territorio y sensor. */
export interface MonthCell {
  year: number;
  /** 1 a 12. */
  month: number;
  detections: number;
  /** Detecciones / observaciones válidas. `null` si no hay observación válida. */
  activity_rate: number | null;
  observation_coverage: number;
  active_days: number;
  max_consecutive_active_days: number;
  /** z robusta frente al mismo mes de años anteriores. `null` si no es estimable. */
  historical_anomaly: number | null;
  /** Años comparables usados como línea base. El mínimo acordado es 5. */
  baseline_years: number;
}

/** Estado de acuerdo entre sensores para un mismo territorio y día o mes. */
export type ComparisonStatus =
  | "concordant_elevated"
  | "concordant_not_elevated"
  | "discordant"
  | "single_sensor"
  | "insufficient";

export interface SensorComparison {
  /** Día comparado, `YYYY-MM-DD`. */
  date?: string;
  /** Mes de contexto, `YYYY-MM`. */
  period_id: string;
  status: ComparisonStatus;
  sensors: Partial<
    Record<
      Sensor,
      {
        available: boolean;
        activity_rate: number | null;
        historical_anomaly: number | null;
        observation_coverage: number;
        signal_status: "elevated" | "not_elevated" | "unknown";
      }
    >
  >;
  interpretation: string;
}

/* -------------------------------------------------------------------------- */
/* Susceptibilidad contextual                                                 */
/* -------------------------------------------------------------------------- */

export type SusceptibilityClass =
  | "high"
  | "moderate"
  | "low"
  | "partial"
  | "not_evaluable";

export interface SusceptibilityAssessment {
  classification: SusceptibilityClass;
  /** Ruta recorrida en el árbol, p. ej. ["N0:pass","N1:yes","N2:yes","N3a:no"]. */
  decision_path: string[];
  rules_triggered: string[];
  modifiers: string[];
  evidence: {
    variable: string;
    value: number | null;
    unit: string;
    rule_status: string;
    source_product: string;
  }[];
  missing_variables: string[];
}

/** Contexto ambiental mensual del territorio (agregado de la serie diaria). */
export interface EnvConditions extends DailyEnv {
  precip_30d_mm: number | null;
  soil_moisture_surface: number | null;
  ndvi_median: number | null;
  vegetation_area_pct: number | null;
  water_area_pct: number | null;
  slope_mean_deg: number | null;
  /**
   * Media ponderada por cobertura válida diaria, como pide la arquitectura
   * v1.2 §2.1. Se muestra junto a la media aritmética cuando difieren.
   */
  weighted?: Partial<Pick<DailyEnv, "t_amb_c" | "t_suelo_c" | "relative_humidity_2m_pct" | "wind_speed_10m_ms">>;
}

/* -------------------------------------------------------------------------- */
/* Metadatos                                                                  */
/* -------------------------------------------------------------------------- */

export interface DateRange {
  start: string;
  end: string;
}

export interface Metadata {
  schema_version?: string;
  /** Rango diario disponible por sensor. Decide qué fechas se pueden pedir. */
  available_date_ranges_by_sensor: Partial<Record<Sensor, DateRange>>;
  /** Meses completos procesados por sensor. */
  available_periods_by_sensor: Partial<Record<Sensor, string[]>>;
  /** Meses con los bloques ambientales obligatorios disponibles. */
  common_environmental_periods: string[];
  /** Intersección entre sensores y contexto, para comparación multisensor. */
  common_analysis_periods: string[];
  /** Mínimo de años de línea base para la anomalía robusta. */
  min_baseline_years: number;
  /** Fuentes declaradas, para mostrar procedencia en la interfaz. */
  sources?: { id: string; label: string; resolution?: string; note?: string }[];
}

/** Métricas que acepta `/territory-metrics`. */
export type MetricId =
  | "activity_rate"
  | "fire_pixel_days_8_9"
  | "active_days"
  | "max_consecutive_active_days"
  | "observation_coverage"
  | "conditions_classification"
  | "t_amb_c"
  | "t_suelo_c"
  | "wind_dir_deg"
  | "elevation_m";

/** Métricas ambientales: no requieren `sensor`. */
export const ENV_METRICS: MetricId[] = ["t_amb_c", "t_suelo_c", "wind_dir_deg", "elevation_m"];

/* -------------------------------------------------------------------------- */
/* Fase 2 — proyección de propagación (opcional)                              */
/* -------------------------------------------------------------------------- */

export interface SpreadForecast {
  schema_version: string;
  phase: "phase_2_optional";
  date: string;
  horizon_h: number;
  dominant_wind: { wind_dir_deg: number; wind_speed_10m_ms: number };
  isochrones: {
    type: "FeatureCollection";
    features: {
      type: "Feature";
      properties: { step_h: number; risk_level: "high" | "moderate" | "low" };
      geometry: { type: "Polygon"; coordinates: number[][][] };
    }[];
  };
  model_metadata: { model_name: string; disclaimer: string };
}

/** Pasos de isócrona que define la arquitectura v1.2 §12.2. */
export const ISOCHRONE_STEPS_H = [6, 12, 24];

/** Origen de los datos que se están mostrando. Se comunica siempre en la UI. */
export type DataOrigin = "api" | "fixture";

export interface AreaOfInterest {
  ring: [number, number][];
  areaKm2: number;
}
