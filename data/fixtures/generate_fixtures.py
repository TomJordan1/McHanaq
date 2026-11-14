"""Genera los fixtures de McHanaq (DATOS FICTICIOS, solo para desarrollo y pruebas).

Uso (desde la raíz del repositorio):
    python data/fixtures/generate_fixtures.py

Escribe en data/fixtures/ los mismos nombres de archivo que Tom genera en
data/processed/, para que el backend funcione igual con
MCHANAQ_DATA_DIR=data/fixtures.

Casos borde incluidos a propósito (para QA):
  * Día nublado: valid_land_pixels = 0 y observation_coverage = 0.0; t_suelo_c = null.
  * Días con cero detecciones (0, no null) con buena cobertura.
  * MODIS_AQUA sin observaciones en la cuenca (todo el mes): valores de actividad = null.
  * Cuenca con historial insuficiente (anomalía no estimable) en MODIS.
  * Cuenca con evaluación ambiental "partial" (falta viento).
  * Comparación multisensor "discordant" (provincia) y "single_sensor" (cuenca).

Nunca presentar estos valores como observaciones reales.
"""
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parent
SEED = 20260914
SCHEMA = "1.0"
ORIGIN = "fixture"
VERSION = "fixture-0.1.0"
GENERATED_AT = "2026-11-14T00:00:00Z"
PERIOD = "2026-09"
DAYS = [date(2026, 9, 1) + timedelta(days=i) for i in range(30)]
SENSORS = ["MODIS_TERRA", "MODIS_AQUA", "VIIRS_SNPP"]
SOURCE_PRODUCT = {"MODIS_TERRA": "MOD14A1", "MODIS_AQUA": "MYD14A1", "VIIRS_SNPP": "VNP14A1"}

# Territorios de muestra. Las geometrías son rectángulos ficticios, NO límites oficiales.
TERRITORIES = [
    {
        "territory_type": "province",
        "territory_id": "1501",
        "territory_name": "Provincia de muestra (FIXTURE)",
        "pfafstetter_level": None,
        "bbox": (-77.2, -12.3, -76.6, -11.7),
        "expected": {"MODIS_TERRA": 400, "MODIS_AQUA": 400, "VIIRS_SNPP": 1800},
        "elevation_m": 850.0,
    },
    {
        "territory_type": "hydro_unit",
        "territory_id": "FX13755",
        "territory_name": "Unidad hidrográfica de muestra (FIXTURE)",
        "pfafstetter_level": 5,
        "bbox": (-76.9, -12.0, -76.3, -11.5),
        "expected": {"MODIS_TERRA": 320, "MODIS_AQUA": 320, "VIIRS_SNPP": 1450},
        "elevation_m": 2310.0,
    },
]
CLOUDY_DAY = date(2026, 9, 10)          # sin observación válida en todos los sensores
AQUA_MISSING_HYDRO = True               # la cuenca no tiene MODIS_AQUA utilizable


def envelope(items, **extra):
    return {"schema_version": SCHEMA, "data_origin": ORIGIN, **extra, "items": items}


def write(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def wind_from_uv(u, v):
    direction = (math.degrees(math.atan2(-u, -v)) + 360) % 360
    return round(direction, 1), round(math.hypot(u, v), 2)


def territories_geojson():
    feats = []
    for t in TERRITORIES:
        x0, y0, x1, y1 = t["bbox"]
        feats.append({
            "type": "Feature",
            "properties": {
                "territory_type": t["territory_type"],
                "territory_id": t["territory_id"],
                "territory_name": t["territory_name"],
                "pfafstetter_level": t["pfafstetter_level"],
                "source": "FIXTURE (geometría ficticia)",
            },
            "geometry": {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]},
        })
    return {"type": "FeatureCollection", "data_origin": ORIGIN, "features": feats}


def daily_rows(rng):
    rows = []
    for t in TERRITORIES:
        for d in DAYS:
            # Variables ambientales diarias: iguales para los tres sensores del mismo día/territorio.
            u, v = rng.uniform(-4, 1), rng.uniform(-3, 2)
            wdir, wspd = wind_from_uv(u, v)
            t_amb = round(rng.uniform(14, 24) - t["elevation_m"] / 400, 1)
            t_suelo = None if d == CLOUDY_DAY else round(t_amb + rng.uniform(3, 12), 1)
            if t["territory_type"] == "hydro_unit":
                wdir, wspd = None, None  # caso borde: viento no disponible en la cuenca
            env = {
                "t_amb_c": t_amb,
                "t_suelo_c": t_suelo,
                "wind_dir_deg": wdir,
                "wind_speed_10m_ms": wspd,
                "elevation_m": t["elevation_m"],
                "dem_source": "COPERNICUS_DEM_GLO30",
            }
            for s in SENSORS:
                exp = t["expected"][s]
                aqua_gap = AQUA_MISSING_HYDRO and s == "MODIS_AQUA" and t["territory_type"] == "hydro_unit"
                if d == CLOUDY_DAY or aqua_gap:
                    valid, low, nh = 0, 0, 0
                else:
                    valid = int(exp * rng.uniform(0.55, 0.95))
                    burst = 9 <= d.day <= 16 and t["territory_type"] == "province"
                    lam = (2.5 if s == "VIIRS_SNPP" else 0.8) if burst else 0.15
                    nh = sum(1 for _ in range(6) if rng.random() < lam / 6)
                    low = sum(1 for _ in range(4) if rng.random() < lam / 5)
                rows.append({
                    "date": d.isoformat(),
                    "territory_type": t["territory_type"],
                    "territory_id": t["territory_id"],
                    "sensor": s,
                    "fire_pixels_low": low,
                    "fire_pixels_nominal_high": nh,
                    "valid_land_pixels": valid,
                    "expected_land_pixels_per_day": exp,
                    "observation_coverage": round(valid / exp, 4),
                    # Tasa diaria precalculada (la API no calcula). null si no hubo observación.
                    "activity_rate": round(nh / valid, 6) if valid else None,
                    **env,
                    "source_product": SOURCE_PRODUCT[s],
                    "processing_version": VERSION,
                })
    return rows


def max_streak(rows):
    best = cur = 0
    for r in rows:
        cur = cur + 1 if (r["valid_land_pixels"] > 0 and r["fire_pixels_nominal_high"] > 0) else 0
        best = max(best, cur)
    return best


ANOMALY = {  # valores ficticios de anomalía robusta por (territory_id, sensor)
    ("1501", "MODIS_TERRA"): {"value": 1.4, "status": "estimated", "baseline_years": 10},
    ("1501", "MODIS_AQUA"): {"value": 0.2, "status": "estimated", "baseline_years": 10},
    ("1501", "VIIRS_SNPP"): {"value": 2.1, "status": "estimated", "baseline_years": 10},
    ("FX13755", "MODIS_TERRA"): {"value": None, "status": "insufficient_baseline", "baseline_years": 3},
    ("FX13755", "MODIS_AQUA"): {"value": None, "status": "insufficient_baseline", "baseline_years": 0},
    ("FX13755", "VIIRS_SNPP"): {"value": 0.6, "status": "estimated", "baseline_years": 8},
}


def summary_rows(daily):
    out = []
    for t in TERRITORIES:
        for s in SENSORS:
            rs = [r for r in daily if r["territory_id"] == t["territory_id"] and r["sensor"] == s]
            valid = sum(r["valid_land_pixels"] for r in rs)
            expected = sum(r["expected_land_pixels_per_day"] for r in rs)
            nh = sum(r["fire_pixels_nominal_high"] for r in rs)
            any_conf = nh + sum(r["fire_pixels_low"] for r in rs)
            has_obs = valid > 0
            out.append({
                "period_id": PERIOD,
                "territory_type": t["territory_type"],
                "territory_id": t["territory_id"],
                "sensor": s,
                "fire_pixel_days_8_9": nh if has_obs else None,
                "fire_pixel_days_7_9": any_conf if has_obs else None,
                "valid_land_pixel_days": valid,
                "expected_land_pixel_days": expected,
                "activity_rate": round(nh / valid, 6) if has_obs else None,
                "observation_coverage": round(valid / expected, 4),
                "active_days": sum(1 for r in rs if r["fire_pixels_nominal_high"] > 0) if has_obs else None,
                "max_consecutive_active_days": max_streak(rs) if has_obs else None,
                "historical_anomaly": ANOMALY[(t["territory_id"], s)],
                "source_product": SOURCE_PRODUCT[s],
                "processing_version": VERSION,
            })
    return out


def comparison_rows(summary):
    def sensor_block(row):
        available = row["activity_rate"] is not None and row["observation_coverage"] >= 0.5
        z = row["historical_anomaly"]["value"]
        signal = None if (not available or z is None) else ("elevated" if z >= 2.0 else "not_elevated")
        return {
            "available": available,
            "activity_rate": row["activity_rate"],
            "historical_anomaly": z,
            "observation_coverage": row["observation_coverage"],
            "signal_status": signal,
        }

    out = []
    for t in TERRITORIES:
        blocks = {r["sensor"]: sensor_block(r) for r in summary if r["territory_id"] == t["territory_id"]}
        signals = [b["signal_status"] for b in blocks.values() if b["signal_status"]]
        if not signals:
            status = "insufficient"
        elif len(signals) == 1:
            status = "single_sensor"
        elif all(s == "elevated" for s in signals):
            status = "concordant_elevated"
        elif all(s == "not_elevated" for s in signals):
            status = "concordant_not_elevated"
        else:
            status = "discordant"
        text = {
            "discordant": "Los sensores no muestran una señal estacional concordante; revisar cobertura, sobrevuelo y diferencias instrumentales.",
            "single_sensor": "Solo un sensor tiene cobertura y línea base suficientes; no es posible contrastar señales.",
            "insufficient": "Ningún sensor tiene cobertura o línea base suficiente.",
            "concordant_elevated": "Dos o más sensores muestran actividad elevada respecto a su propia línea base.",
            "concordant_not_elevated": "Dos o más sensores coinciden en que la actividad no supera su umbral estacional.",
        }[status]
        out.append({
            "period_id": PERIOD,
            "territory_type": t["territory_type"],
            "territory_id": t["territory_id"],
            "status": status,
            "sensors": blocks,
            "interpretation": "[FIXTURE] " + text,
            "method_version": VERSION,
        })
    return out


def conditions_rows():
    return [
        {
            "period_id": PERIOD, "territory_type": "province", "territory_id": "1501",
            "classification": "moderate",
            "decision_path": ["N0:pass", "N1:yes", "N2:yes", "N3a:no"],
            "rules_triggered": ["vegetation_present", "dryness_high"],
            "modifiers": ["thermal_history_elevated"],
            "evidence": [
                {"variable": "vegetation_area_pct", "value": 62.0, "unit": "%", "rule_status": "above_umbral_veg",
                 "source_product": "MAPBIOMAS_PERU_C4", "source_period": "2024", "source_resolution": "30 m"},
                {"variable": "precip_30d_mm", "value": 18.4, "unit": "mm", "rule_status": "below_seasonal_p25",
                 "source_product": "ERA5_LAND_HOURLY", "source_period": PERIOD, "source_resolution": "~11.1 km"},
                {"variable": "wind_speed_10m_ms", "value": 2.9, "unit": "m/s", "rule_status": "not_above_seasonal_p75",
                 "source_product": "ERA5_LAND_HOURLY", "source_period": PERIOD, "source_resolution": "~11.1 km"},
                {"variable": "temperature_2m_c", "value": 19.6, "unit": "°C", "rule_status": "not_above_seasonal_p75",
                 "source_product": "ERA5_LAND_HOURLY", "source_period": PERIOD, "source_resolution": "~11.1 km"},
                {"variable": "slope_class_area_pct", "value": 21.5, "unit": "%", "rule_status": "below_umbral_pend",
                 "source_product": "COPERNICUS_DEM_GLO30", "source_period": "2011-2015", "source_resolution": "30 m"},
            ],
            "missing_variables": [], "data_quality_status": "usable",
            "source_products": ["MAPBIOMAS_PERU_C4", "ERA5_LAND_HOURLY", "COPERNICUS_DEM_GLO30"],
            "processing_version": VERSION,
        },
        {
            "period_id": PERIOD, "territory_type": "hydro_unit", "territory_id": "FX13755",
            "classification": "partial",
            "decision_path": ["N0:partial"],
            "rules_triggered": ["vegetation_present"],
            "modifiers": [],
            "evidence": [
                {"variable": "vegetation_area_pct", "value": 48.0, "unit": "%", "rule_status": "above_umbral_veg",
                 "source_product": "MAPBIOMAS_PERU_C4", "source_period": "2024", "source_resolution": "30 m"},
                {"variable": "soil_moisture_surface", "value": 0.21, "unit": "m³/m³", "rule_status": "not_below_seasonal_p25",
                 "source_product": "ERA5_LAND_HOURLY", "source_period": PERIOD, "source_resolution": "~11.1 km"},
            ],
            "missing_variables": ["wind_speed_10m_ms", "relative_humidity_2m_pct"],
            "data_quality_status": "partial",
            "source_products": ["MAPBIOMAS_PERU_C4", "ERA5_LAND_HOURLY"],
            "processing_version": VERSION,
        },
    ]


def metadata():
    rng = {"from": DAYS[0].isoformat(), "to": DAYS[-1].isoformat()}
    return {
        "schema_version": SCHEMA,
        "data_origin": ORIGIN,
        "notice": "DATOS FICTICIOS (fixture). No usar como evidencia ni en la presentación.",
        "generated_at": GENERATED_AT,
        "processing_version": VERSION,
        "territory_types": ["province", "hydro_unit"],
        "sensors": [
            {"id": "MODIS_TERRA", "product": "MOD14A1", "overpass_local": "~10:30", "available_since": "2000-02", "resolution": "1 km"},
            {"id": "MODIS_AQUA", "product": "MYD14A1", "overpass_local": "~13:30", "available_since": "2002-07", "resolution": "1 km"},
            {"id": "VIIRS_SNPP", "product": "VNP14A1", "overpass_local": "~13:30", "available_since": "2012-01", "resolution": "1 km"},
        ],
        "available_periods_by_sensor": {s: [PERIOD] for s in SENSORS},
        "available_date_ranges_by_sensor": {s: [rng] for s in SENSORS},
        "common_environmental_periods": [PERIOD],
        "common_environmental_dates": [rng],
        "common_analysis_periods": [PERIOD],
        "common_analysis_dates": [rng],
        "metrics": {
            "activity": ["activity_rate", "fire_pixel_days_8_9", "active_days", "max_consecutive_active_days", "observation_coverage"],
            "environmental": ["t_amb_c", "t_suelo_c", "wind_dir_deg", "wind_speed_10m_ms", "elevation_m"],
            "classification": ["conditions_classification"],
        },
        "units": {
            "activity_rate": "píxeles-día detectados / píxeles-día válidos (adimensional)",
            "observation_coverage": "fracción 0–1",
            "fire_pixel_days_8_9": "píxeles-día",
            "t_amb_c": "°C", "t_suelo_c": "°C", "wind_dir_deg": "grados (0–360, desde dónde sopla)",
            "wind_speed_10m_ms": "m/s", "elevation_m": "m s.n.m.",
        },
        "dem_by_epoch": [
            {"epoch": "2000-2011", "applies_to": "MODIS", "dem_source": "NASADEM_HGT_001 / USGS_SRTMGL1_003", "resolution": "30 m"},
            {"epoch": "2012-presente", "applies_to": "VIIRS", "dem_source": "COPERNICUS_DEM_GLO30", "resolution": "30 m"},
        ],
        "environmental_sources": {
            "t_amb_c": "ECMWF/ERA5_LAND/HOURLY (temperature_2m)",
            "t_suelo_c": "MODIS/061/MOD11A1, MYD11A1; NASA/VIIRS/002/VNP21A1D, VNP21A1N",
            "wind": "ECMWF/ERA5_LAND/HOURLY (u/v_component_of_wind_10m)",
        },
        "parameters": {
            "min_observation_coverage_for_comparison": 0.5,
            "elevated_signal_robust_z": 2.0,
            "min_baseline_years": 5,
            "umbral_veg_pct": None,
            "umbral_pend_pct": None,
            "note": "Umbrales de fixture; los reales los definen Tom y Angelo.",
        },
        "limitations": [
            "activity_rate no es probabilidad de incendio ni superficie quemada.",
            "No se suman conteos entre sensores.",
            "La susceptibilidad contextual es cualitativa, no un índice validado de riesgo.",
        ],
    }


def main():
    rng = random.Random(SEED)
    daily = daily_rows(rng)
    summary = summary_rows(daily)
    write("metadata.json", metadata())
    write("territories.geojson", territories_geojson())
    write("activity_daily.json", envelope(daily))
    write("activity_summary.json", envelope(summary))
    write("sensor_comparison.json", envelope(comparison_rows(summary)))
    write("conditions_assessment.json", envelope(conditions_rows()))
    print(f"OK: {len(daily)} filas diarias, {len(summary)} resúmenes -> {OUT}")


if __name__ == "__main__":
    main()
