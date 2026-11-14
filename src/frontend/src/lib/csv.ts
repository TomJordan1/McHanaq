import type { DayPoint, Hotspot, MonthCell } from "../api/types";

function escapeCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(","), ...rows.map((r) => r.map(escapeCell).join(","))].join("\n");
}

export function download(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const PRODUCTS: Record<string, string> = {
  MODIS_TERRA: "MOD14A1.061",
  MODIS_AQUA: "MYD14A1.061",
  VIIRS_SNPP: "VNP14A1.002",
};

/** CSV de focos detectados en la búsqueda actual. */
export function hotspotsCsv(points: Hotspot[], origin: string): string {
  const header = [
    "latitude",
    "longitude",
    "acq_date",
    "acq_time_utc",
    "sensor",
    "source_product",
    "frp_mw",
    "confidence",
    "data_origin",
  ];
  return toCsv(
    header,
    points.map((h) => [
      h.lat,
      h.lon,
      h.date,
      h.acq_time,
      h.sensor,
      PRODUCTS[h.sensor] ?? "",
      h.frp,
      h.confidence,
      origin,
    ])
  );
}

/**
 * CSV de la serie diaria del territorio: actividad más contexto ambiental.
 * Reproduce las columnas de `environmental_daily.csv` y de
 * `GET /territories/{type}/{id}/export.csv` (arquitectura v1.2 §4.2), para que
 * el archivo que baja el usuario sin backend tenga la misma forma.
 */
export function dailyCsv(
  rows: DayPoint[],
  sensor: string,
  territoryId: string,
  territoryType: string,
  origin: string
): string {
  const header = [
    "date",
    "territory_type",
    "territory_id",
    "sensor",
    "source_product",
    "fire_pixels_nominal_high",
    "fire_pixels_low",
    "valid_land_pixels",
    "expected_land_pixels_per_day",
    "observation_coverage",
    "t_amb_c",
    "relative_humidity_2m_pct",
    "t_suelo_c",
    "lst_valid_pixel_pct",
    "wind_dir_deg",
    "wind_speed_10m_ms",
    "elevation_m",
    "dem_source",
    "data_origin",
  ];
  return toCsv(
    header,
    rows.map((d) => [
      d.date,
      territoryType,
      territoryId,
      sensor,
      PRODUCTS[sensor] ?? "",
      d.detections,
      d.fire_pixels_low ?? "",
      d.valid_land_pixels ?? "",
      d.expected_land_pixels_per_day ?? "",
      d.observation_coverage.toFixed(3),
      d.t_amb_c ?? "",
      d.relative_humidity_2m_pct ?? "",
      // Vacío cuando hay más de 30 % de nubes: nunca cero.
      d.t_suelo_c ?? "",
      d.lst_valid_pixel_pct ?? "",
      d.wind_dir_deg ?? "",
      d.wind_speed_10m_ms ?? "",
      d.elevation_m ?? "",
      d.dem_source ?? "",
      origin,
    ])
  );
}

/** CSV del calendario mensual. */
export function calendarCsv(cells: MonthCell[], sensor: string, origin: string): string {
  const header = [
    "period_id",
    "sensor",
    "detections_class_8_9",
    "activity_rate",
    "observation_coverage",
    "active_days",
    "max_consecutive_active_days",
    "historical_anomaly_robust_z",
    "baseline_years",
    "data_origin",
  ];
  return toCsv(
    header,
    cells.map((c) => [
      `${c.year}-${String(c.month).padStart(2, "0")}`,
      sensor,
      c.detections,
      c.activity_rate === null ? "" : c.activity_rate.toExponential(4),
      c.observation_coverage.toFixed(4),
      c.active_days,
      c.max_consecutive_active_days,
      c.historical_anomaly === null ? "" : c.historical_anomaly.toFixed(3),
      c.baseline_years,
      origin,
    ])
  );
}

/** GeoJSON del área de interés dibujada. */
export function ringGeoJson(ring: [number, number][], areaKm2: number): string {
  return JSON.stringify(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            name: "Area de interes McHanaq",
            area_km2: Math.round(areaKm2),
            generated_at: new Date().toISOString(),
          },
          geometry: {
            type: "Polygon",
            // GeoJSON es [lon, lat] y exige el anillo cerrado.
            coordinates: [[...ring.map(([lat, lon]) => [lon, lat]), [ring[0][1], ring[0][0]]]],
          },
        },
      ],
    },
    null,
    2
  );
}
