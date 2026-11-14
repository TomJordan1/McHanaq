"""McHanaq API — Backend de solo lectura (Fase 1, resolución diaria por defecto)."""

import csv
import io
import json
import os
from datetime import date as dt_date
from pathlib import Path

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

ROOT = Path(__file__).resolve().parents[3]
DATA = Path(os.getenv("MCHANAQ_DATA_DIR", ROOT / "data" / "processed"))
if not DATA.is_absolute():
    DATA = ROOT / DATA
NO_CACHE = os.getenv("MCHANAQ_NO_CACHE", "0") == "1"
CORS_ORIGINS = [o.strip() for o in os.getenv("MCHANAQ_CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

TYPES = {"province", "hydro_unit"}
SENSORS = {"MODIS_TERRA", "MODIS_AQUA", "VIIRS_SNPP"}
ACTIVITY_METRICS = {
    "activity_rate",
    "fire_pixels_nominal_high",
    "fire_pixels_low",
    "observation_coverage",
    "fire_pixel_days_8_9",
    "active_days",
    "max_consecutive_active_days",
}
ENV_METRICS = {
    "t_amb_c",
    "relative_humidity_2m_pct",
    "t_suelo_c",
    "lst_valid_pixel_pct",
    "wind_dir_deg",
    "wind_speed_10m_ms",
    "elevation_m",
    "conditions_classification",
}


def load_json(name: str):
    """Carga un JSON/GeoJSON desde DATA si existe."""
    path = DATA / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


META = load_json("metadata.json") or {}
TERR = load_json("territories.geojson") or {"type": "FeatureCollection", "features": []}
DAILY = (load_json("activity_daily.json") or {}).get("items", [])
SUMMARY = (load_json("activity_summary.json") or {}).get("items", [])
COMPARE = (load_json("sensor_comparison.json") or {}).get("items", [])
ASSESS = (load_json("conditions_assessment.json") or {}).get("items", [])
HOTSPOTS = load_json("hotspots.geojson")


class ApiError(Exception):
    """Error de dominio con formato uniforme para el cliente."""

    def __init__(self, status: int, code: str, detail: str):
        self.status = status
        self.code = code
        self.detail = detail


app = FastAPI(title="McHanaq API", version="1.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_cache_header(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET" and response.status_code == 200 and not request.url.path.endswith("/health"):
        response.headers["Cache-Control"] = "no-store" if NO_CACHE else "public, max-age=300"
    return response


@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status, content={"code": exc.code, "detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, __: RequestValidationError):
    return JSONResponse(status_code=400, content={"code": "INVALID_PARAMETER", "detail": "Parámetros inválidos"})


@app.exception_handler(Exception)
async def unhandled_error_handler(_: Request, __: Exception):
    return JSONResponse(status_code=500, content={"code": "INTERNAL_ERROR", "detail": "Error interno del servidor"})


def check_type(t: str) -> None:
    if t not in TYPES:
        raise ApiError(400, "INVALID_PARAMETER", f"type debe ser uno de {sorted(TYPES)}")


def check_sensor(s: str) -> None:
    if s not in SENSORS:
        raise ApiError(400, "INVALID_PARAMETER", f"sensor debe ser uno de {sorted(SENSORS)}")


def check_date_syntax(d: str) -> None:
    try:
        dt_date.fromisoformat(d)
    except ValueError:
        raise ApiError(400, "INVALID_PARAMETER", f"Formato de fecha inválido: {d} (usar YYYY-MM-DD)")


def _date_in_ranges(d: str, ranges: object) -> bool:
    if isinstance(ranges, dict):
        ranges = [ranges]
    if not isinstance(ranges, list):
        return False
    for r in ranges:
        if not isinstance(r, dict):
            continue
        start = r.get("start") or r.get("from")
        end = r.get("end") or r.get("to")
        if start and end and start <= d <= end:
            return True
    return False


def check_date(d: str, sensor: str | None = None, full: bool = False, comparison: bool = False, env_only: bool = False) -> str:
    check_date_syntax(d)
    period = d[:7]
    ok = True
    if sensor:
        rng = META.get("available_date_ranges_by_sensor", {}).get(sensor)
        if rng:
            ok &= _date_in_ranges(d, rng)
        else:
            ok &= period in META.get("available_periods_by_sensor", {}).get(sensor, [])
    if full or env_only:
        env_dates = META.get("common_environmental_dates")
        ok &= _date_in_ranges(d, env_dates) if env_dates else (period in META.get("common_environmental_periods", []))
    if comparison:
        cmp_dates = META.get("common_analysis_dates")
        ok &= _date_in_ranges(d, cmp_dates) if cmp_dates else (period in META.get("common_analysis_periods", []))
    if not ok:
        raise ApiError(422, "PERIOD_NOT_AVAILABLE", f"La fecha {d} no está publicada para esta consulta")
    return period


def find_territory(t_type: str, t_id: str) -> dict:
    for feat in TERR.get("features", []):
        props = feat.get("properties", {})
        if props.get("territory_type") == t_type and str(props.get("territory_id")) == t_id:
            return props
    raise ApiError(404, "NOT_FOUND", f"Territorio {t_type}/{t_id} no encontrado")


def pick(items: list[dict], **keys) -> dict | None:
    return next((i for i in items if all(str(i.get(k)) == str(v) for k, v in keys.items())), None)


@app.get("/api/v1/health")
def health():
    return {
        "status": "ok",
        "data_loaded": bool(META and TERR.get("features")),
        "data_dir": str(DATA),
    }


@app.get("/api/v1/metadata")
def metadata():
    return {"schema_version": "1.0", **META}


@app.get("/api/v1/territories")
def territories(type: str = Query(...)):
    check_type(type)
    feats = [f for f in TERR.get("features", []) if f.get("properties", {}).get("territory_type") == type]
    return {"schema_version": "1.0", "type": "FeatureCollection", "features": feats}


@app.get("/api/v1/territory-metrics")
def territory_metrics(
    type: str = Query(...),
    metric: str = Query(...),
    date: str | None = Query(default=None),
    period: str | None = Query(default=None),
    sensor: str | None = Query(default=None),
):
    check_type(type)
    if metric not in ACTIVITY_METRICS and metric not in ENV_METRICS:
        raise ApiError(400, "INVALID_PARAMETER", f"metric '{metric}' no permitida")
    if metric in ACTIVITY_METRICS and not sensor:
        raise ApiError(400, "INVALID_PARAMETER", f"sensor es obligatorio para la métrica {metric}")
    if sensor:
        check_sensor(sensor)

    target_date = date or (f"{period}-01" if period else None)
    if not target_date:
        raise ApiError(400, "INVALID_PARAMETER", "Debe indicar date (YYYY-MM-DD) o period (YYYY-MM)")

    resolved_period = check_date(
        target_date,
        sensor=sensor,
        env_only=(metric in ENV_METRICS and not sensor),
    )

    items = []
    if metric == "conditions_classification":
        for row in ASSESS:
            if row.get("territory_type") == type and row.get("period_id") == resolved_period:
                items.append({
                    "territory_type": type,
                    "territory_id": row.get("territory_id"),
                    "value": row.get("classification"),
                })
    elif date:
        seen_ids: set[str] = set()
        for row in DAILY:
            tid = str(row.get("territory_id"))
            if row.get("territory_type") == type and row.get("date") == date and (not sensor or row.get("sensor") == sensor):
                if not sensor and tid in seen_ids:
                    continue
                seen_ids.add(tid)
                val = row.get(metric)
                items.append({"territory_type": type, "territory_id": row.get("territory_id"), "value": val})
    else:
        seen_ids = set()
        for row in SUMMARY:
            tid = str(row.get("territory_id"))
            if row.get("territory_type") == type and row.get("period_id") == resolved_period and (not sensor or row.get("sensor") == sensor):
                if not sensor and tid in seen_ids:
                    continue
                seen_ids.add(tid)
                items.append({"territory_type": type, "territory_id": row.get("territory_id"), "value": row.get(metric)})

    return {
        "schema_version": "1.0",
        "date": date,
        "period": resolved_period,
        "metric": metric,
        "unit": META.get("units", {}).get(metric),
        "items": items,
    }


@app.get("/api/v1/territories/{type}/{id}/summary")
def territory_summary(
    type: str,
    id: str,
    sensor: str = Query(...),
    date: str | None = Query(default=None),
    period: str | None = Query(default=None),
):
    check_type(type)
    check_sensor(sensor)
    target_date = date or (f"{period}-01" if period else None)
    if not target_date:
        raise ApiError(400, "INVALID_PARAMETER", "Debe indicar date (YYYY-MM-DD) o period (YYYY-MM)")
    resolved_period = check_date(target_date, sensor=sensor, full=True)
    terr = find_territory(type, id)

    daily_row = pick(DAILY, territory_type=type, territory_id=id, sensor=sensor, date=date) if date else None
    summary_row = pick(SUMMARY, territory_type=type, territory_id=id, sensor=sensor, period_id=resolved_period) or {}
    assess_row = pick(ASSESS, territory_type=type, territory_id=id, period_id=resolved_period) or {}

    return {
        "schema_version": "1.0",
        "territory": {"type": type, "id": id, "name": terr.get("name") or terr.get("territory_name")},
        "date": date,
        "period": {"id": resolved_period},
        "sensor": sensor,
        "daily": daily_row,
        "daily_context": daily_row,
        "activity": {
            "fire_pixel_days_8_9": summary_row.get("fire_pixel_days_8_9"),
            "active_days": summary_row.get("active_days"),
            "max_consecutive_active_days": summary_row.get("max_consecutive_active_days"),
            "activity_rate": summary_row.get("activity_rate"),
            "observation_coverage": summary_row.get("observation_coverage"),
            "historical_anomaly": summary_row.get("historical_anomaly", {"value": None, "status": "insufficient_baseline", "baseline_years": 0}),
        },
        "environmental_conditions": {
            "classification": assess_row.get("classification", "not_evaluable"),
            "decision_path": assess_row.get("decision_path", []),
            "factors": assess_row.get("evidence", []),
            "evidence": assess_row.get("evidence", []),
            "modifiers": assess_row.get("modifiers", []),
            "missing_variables": assess_row.get("missing_variables", []),
        },
    }


@app.get("/api/v1/territories/{type}/{id}/activity")
def territory_activity(
    type: str,
    id: str,
    sensor: str = Query(...),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    period: str | None = Query(default=None),
):
    check_type(type)
    check_sensor(sensor)
    if from_date and to_date:
        check_date(from_date, sensor=sensor)
        check_date(to_date, sensor=sensor)
    elif period:
        check_date(f"{period}-01", sensor=sensor)
    else:
        raise ApiError(400, "INVALID_PARAMETER", "Debe indicar from y to (YYYY-MM-DD) o period (YYYY-MM)")

    find_territory(type, id)
    rows = [
        r for r in DAILY
        if r.get("territory_type") == type
        and str(r.get("territory_id")) == id
        and r.get("sensor") == sensor
        and ((from_date <= r.get("date", "") <= to_date) if (from_date and to_date) else r.get("date", "").startswith(period))
    ]
    return {"schema_version": "1.0", "territory_type": type, "territory_id": id, "sensor": sensor, "items": rows}


@app.get("/api/v1/territories/{type}/{id}/sensor-comparison")
def sensor_comparison(
    type: str,
    id: str,
    date: str | None = Query(default=None),
    period: str | None = Query(default=None),
):
    check_type(type)
    target_date = date or (f"{period}-01" if period else None)
    if not target_date:
        raise ApiError(400, "INVALID_PARAMETER", "Debe indicar date (YYYY-MM-DD) o period (YYYY-MM)")
    resolved_period = check_date(target_date, comparison=True)
    find_territory(type, id)

    row = pick(COMPARE, territory_type=type, territory_id=id, period_id=resolved_period)
    if not row:
        return {"schema_version": "1.0", "territory_type": type, "territory_id": id, "period_id": resolved_period, "status": "insufficient", "sensors": {}}
    return {"schema_version": "1.0", "date": date, **row}


@app.get("/api/v1/territories/{type}/{id}/export.csv")
def export_csv(
    type: str,
    id: str,
    sensor: str = Query(...),
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
):
    check_type(type)
    check_sensor(sensor)
    check_date(from_date, sensor=sensor)
    check_date(to_date, sensor=sensor)
    find_territory(type, id)

    rows = [
        r for r in DAILY
        if r.get("territory_type") == type
        and str(r.get("territory_id")) == id
        and r.get("sensor") == sensor
        and from_date <= r.get("date", "") <= to_date
    ]
    buf = io.StringIO()
    cols = [
        "date", "territory_type", "territory_id", "sensor",
        "fire_pixels_low", "fire_pixels_nominal_high", "valid_land_pixels",
        "expected_land_pixels_per_day", "observation_coverage",
        "t_amb_c", "relative_humidity_2m_pct", "t_suelo_c", "lst_valid_pixel_pct",
        "wind_dir_deg", "wind_speed_10m_ms", "elevation_m", "dem_source",
    ]
    writer = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    buf.seek(0)
    filename = f"mchanaq_{type}_{id}_{sensor}_{from_date}_{to_date}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/v1/territories/{type}/{id}/hotspots")
def territory_hotspots(type: str, id: str, date: str = Query(...), sensor: str = Query(...)):
    check_type(type)
    check_sensor(sensor)
    check_date(date, sensor=sensor)
    find_territory(type, id)
    if not HOTSPOTS:
        raise ApiError(404, "NOT_FOUND", "hotspots.geojson no está disponible")
    feats = [
        f for f in HOTSPOTS.get("features", [])
        if f.get("properties", {}).get("territory_type") == type
        and str(f.get("properties", {}).get("territory_id")) == id
        and f.get("properties", {}).get("date") == date
        and f.get("properties", {}).get("sensor") == sensor
    ]
    return {"schema_version": "1.0", "type": "FeatureCollection", "features": feats}
