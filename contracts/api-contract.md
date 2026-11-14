# McHanaq — Contrato de API `/api/v1` (versión legible)

**Versión del contrato:** 1.2 · `schema_version: "1.0"`
**Mantiene:** Jean Pierrer (redacción) · **Valida:** Jhan/Tom (backend), Sebastian (frontend), Tom y Angelo (significado de los datos)
**Basado en:** `docs/McHanaq_documento_tecnico_operativo_v1.7.md` (§8.4–8.6) y `docs/arquitectura_frontend_backend_McHanaq.md` (§4–5)

> Este documento explica el contrato en lenguaje claro. Si hay contradicción con los documentos de `docs/`, se avisa al equipo y se corrige en un PR; nadie cambia nombres, tipos o unidades por su cuenta (ver §8).

---

## 1. Reglas generales

| Tema | Regla |
|---|---|
| Base | `/api/v1`. Solo `GET` (la API es de solo lectura). |
| Formato | JSON / GeoJSON en UTF-8; CSV (`text/csv`) solo en la exportación. Campos en `snake_case`. |
| Versión | Toda respuesta JSON de datos incluye `"schema_version": "1.0"`. |
| Fechas | Diario por defecto: `date=YYYY-MM-DD`, rangos `from` / `to` (`YYYY-MM-DD`). `period=YYYY-MM` es opcional (contexto mensual). |
| Territorio | Siempre se envía **tipo + id**: `type` = `province` o `hydro_unit`, junto con `id` (`territory_id`). Provincias y cuencas **no se mezclan** en un mismo ranking. |
| Sensor | `MODIS_TERRA`, `MODIS_AQUA`, `VIIRS_SNPP`. Una consulta de actividad = un sensor. **Nunca se suman conteos entre sensores.** |
| Valores desconocidos | `null`, **nunca `0`**. El frontend muestra «Sin datos», «No estimable» o «No evaluable». `0` significa «se observó y no hubo detecciones». |
| Colecciones | Los JSON tabulares usan `{"schema_version": "1.0", "items": [...]}`. |
| Caché | `Cache-Control: public, max-age=300` (con fixtures: `MCHANAQ_NO_CACHE=1` → `no-store`). |
| Cálculo | La API **no calcula** tasas, anomalías ni categorías: lee lo que Tom dejó en `data/processed/`. El frontend tampoco calcula nada. |

## 2. Endpoints

| # | Ruta | Prioridad | Parámetros | Devuelve |
|---|---|---|---|---|
| 1 | `GET /health` | 1 | — | `{"status": "ok", "data_loaded": true}` |
| 2 | `GET /metadata` | 1 | — | Sensores, fechas/períodos disponibles, unidades, fuentes, DEM por época, parámetros y limitaciones. |
| 3 | `GET /territories` | 1 | `type` | GeoJSON `FeatureCollection` del tipo pedido. |
| 4 | `GET /territory-metrics` | 1 | `type`, `date` (o `period`), `metric`, `sensor`* | Un valor por territorio para pintar la coropleta. |
| 5 | `GET /territories/{type}/{id}/summary` | 1 | `date` (o `period`), `sensor` | Ficha del territorio (actividad + condiciones + calidad + procedencia). |
| 6 | `GET /territories/{type}/{id}/activity` | 2 | `from`, `to` (o `period`), `sensor` | Serie diaria del rango con variables ambientales diarias. |
| 7 | `GET /territories/{type}/{id}/sensor-comparison` | 2 | `date` (o `period`) | Indicadores separados por sensor + `status` + `interpretation`. |
| 8 | `GET /territories/{type}/{id}/export.csv` | 2 | `from`, `to`, `sensor` | CSV con la serie diaria del territorio. |
| 9 | `GET /territories/{type}/{id}/hotspots` | 3 | `date`, `sensor` | Puntos de detección. Solo si existe `hotspots.geojson`. |

\* `sensor` es **obligatorio** para métricas de actividad y **opcional** para `conditions_classification` y métricas ambientales.

### Métricas permitidas en `metric`

| Grupo | Valores | ¿Requiere `sensor`? |
|---|---|---|
| Actividad | `activity_rate`, `fire_pixel_days_8_9`, `active_days`, `max_consecutive_active_days`, `observation_coverage` | Sí |
| Ambiental (diaria) | `t_amb_c`, `t_suelo_c`, `wind_dir_deg`, `wind_speed_10m_ms`, `elevation_m` | No |
| Clasificación | `conditions_classification` | No |

## 3. Respuestas de ejemplo

> Los números son de los fixtures (ficticios). Solo muestran la **forma**.

### 3.1 `GET /territory-metrics?type=province&date=2026-09-15&sensor=MODIS_TERRA&metric=activity_rate`

```json
{
  "schema_version": "1.0",
  "date": "2026-09-15",
  "metric": "activity_rate",
  "unit": "adimensional",
  "sensor": "MODIS_TERRA",
  "items": [
    { "territory_type": "province", "territory_id": "1501", "value": 0.0 }
  ]
}
```

### 3.2 `GET /territories/province/1501/summary?date=2026-09-15&sensor=MODIS_TERRA`

```json
{
  "schema_version": "1.0",
  "territory": { "type": "province", "id": "1501", "name": "Provincia de muestra (FIXTURE)" },
  "date": "2026-09-15",
  "period": { "id": "2026-09" },
  "sensor": "MODIS_TERRA",
  "daily": {
    "fire_pixels_nominal_high": 0, "fire_pixels_low": 1,
    "valid_land_pixels": 359, "observation_coverage": 0.8975, "activity_rate": 0.0,
    "t_amb_c": 19.5, "t_suelo_c": 31.3, "wind_dir_deg": 108.1,
    "wind_speed_10m_ms": 3.95, "elevation_m": 850.0, "dem_source": "COPERNICUS_DEM_GLO30"
  },
  "activity": {
    "fire_pixel_days_8_9": 13, "active_days": 11, "max_consecutive_active_days": 4,
    "activity_rate": 0.001403, "observation_coverage": 0.7721,
    "historical_anomaly": { "value": 1.4, "status": "estimated", "baseline_years": 10 }
  },
  "environmental_conditions": {
    "classification": "moderate",
    "decision_path": ["N0:pass", "N1:yes", "N2:yes", "N3a:no"],
    "factors": [ { "variable": "precip_30d_mm", "value": 18.4, "unit": "mm", "rule_status": "below_seasonal_p25" } ],
    "modifiers": ["thermal_history_elevated"],
    "missing_variables": []
  },
  "data_quality": { "status": "usable", "notes": [] },
  "provenance": { "source_products": ["MOD14A1", "ERA5_LAND_HOURLY"], "generated_at": "2026-11-14T00:00:00Z", "processing_version": "fixture-0.1.0" }
}
```

Cómo arma el backend la ficha:
- `daily` ← fila de `activity_daily.json` con (`type`, `id`, `sensor`, `date`).
- `activity` ← fila de `activity_summary.json` con (`type`, `id`, `sensor`, mes de `date`).
- `environmental_conditions` ← fila de `conditions_assessment.json` con (`type`, `id`, mes de `date`). **No depende del sensor.**

> **Pendiente de confirmar con Jhan/Tom:** el bloque `daily` y el campo `date` en la raíz se añaden a la forma de la §8.5 de v1.7 porque la ficha ahora es diaria (arquitectura v1.2). Si se prefiere otro nombre, se cambia aquí **y** en los fixtures en el mismo PR.

### 3.3 `GET /territories/province/1501/activity?from=2026-09-01&to=2026-09-30&sensor=MODIS_TERRA`

```json
{
  "schema_version": "1.0",
  "territory": { "type": "province", "id": "1501" },
  "sensor": "MODIS_TERRA",
  "from": "2026-09-01", "to": "2026-09-30",
  "items": [
    { "date": "2026-09-10", "fire_pixels_nominal_high": 0, "fire_pixels_low": 0,
      "valid_land_pixels": 0, "expected_land_pixels_per_day": 400, "observation_coverage": 0.0,
      "activity_rate": null,
      "t_amb_c": 19.2, "t_suelo_c": null, "wind_dir_deg": 114.9, "wind_speed_10m_ms": 2.1,
      "elevation_m": 850.0, "dem_source": "COPERNICUS_DEM_GLO30" }
  ]
}
```

`value: 0.0` en la coropleta del 15/09 significa «observado, sin detecciones nominales/altas»; un día sin observación devolvería `null`.

Ojo con el 10/09: `valid_land_pixels = 0` y `observation_coverage = 0.0` → **día sin observación**, no «cero fuego». La interfaz debe mostrarlo como «Sin observación».

### 3.4 `GET /territories/province/1501/sensor-comparison?date=2026-09-15`

Devuelve la fila de `sensor_comparison.json` del mes: `status`, bloque `sensors` con cada sensor por separado e `interpretation`. Ver `data/fixtures/sensor_comparison.json`.

### 3.5 `GET /territories/province/1501/export.csv?from=2026-09-01&to=2026-09-30&sensor=MODIS_TERRA`

Cabecera del CSV (mismo orden que los campos diarios):

```text
date,territory_type,territory_id,sensor,fire_pixels_low,fire_pixels_nominal_high,valid_land_pixels,expected_land_pixels_per_day,observation_coverage,activity_rate,t_amb_c,t_suelo_c,wind_dir_deg,wind_speed_10m_ms,elevation_m,dem_source,source_product,processing_version
```

Los `null` se exportan como celda vacía (no como `0`).

## 4. Errores

Formato único, sin trazas técnicas:

```json
{ "code": "INVALID_PARAMETER", "detail": "type debe ser uno de ['hydro_unit', 'province']" }
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `INVALID_PARAMETER` | Falta un parámetro o tiene un valor no permitido (`type`, `sensor`, `metric`, formato de fecha). |
| 404 | `NOT_FOUND` | El territorio no existe. |
| 422 | `PERIOD_NOT_AVAILABLE` | La fecha/período es válido pero no está publicado para esa consulta. |
| 500 | `INTERNAL_ERROR` | Error interno. |

**Orden de validación:** 400 (`type`/`sensor`/`metric`) → 422 (fecha/período) → 404 (`id`).

## 5. ¿Qué fechas acepta cada endpoint?

El backend lo decide **solo** mirando `metadata.json`:

| Consulta | La fecha debe estar en… |
|---|---|
| `summary` (ficha) | `available_date_ranges_by_sensor[sensor]` **y** `common_environmental_dates` |
| `activity`, `territory-metrics` con sensor, `export.csv` | `available_date_ranges_by_sensor[sensor]` |
| `territory-metrics` ambiental sin sensor | `common_environmental_dates` |
| `sensor-comparison` | `common_analysis_dates` |

Equivalentes mensuales: `available_periods_by_sensor`, `common_environmental_periods`, `common_analysis_periods`. Si no está → `422`. Nunca se rellena con ceros.

## 6. Valores enumerados

| Campo | Valores |
|---|---|
| `territory_type` | `province`, `hydro_unit` |
| `sensor` | `MODIS_TERRA`, `MODIS_AQUA`, `VIIRS_SNPP` |
| `classification` | `high`, `moderate`, `low`, `partial`, `not_evaluable` |
| `sensor_comparison.status` | `concordant_elevated`, `concordant_not_elevated`, `discordant`, `single_sensor`, `insufficient` |
| `signal_status` | `elevated`, `not_elevated`, `null` (no utilizable) |
| `historical_anomaly.status` | `estimated`, `insufficient_baseline`, `not_estimable` |
| `data_quality_status` | `usable`, `partial`, `insufficient` |

Etiquetas visibles en español (las pone el frontend):

| Código | Etiqueta |
|---|---|
| `high` / `moderate` / `low` | Susceptibilidad alta / moderada / baja |
| `partial` | Evaluación parcial |
| `not_evaluable` | No evaluable |
| `insufficient_baseline` | Historial insuficiente |
| `null` en un valor | Sin datos |
| cobertura `0` | Sin observación |

## 7. Pruebas de humo

```bash
curl -s localhost:8000/api/v1/health                                                        # 200, data_loaded: true
curl -s "localhost:8000/api/v1/territories?type=province"                                   # 200, FeatureCollection
curl -s "localhost:8000/api/v1/territories?type=otro"                                       # 400 INVALID_PARAMETER
curl -s "localhost:8000/api/v1/territory-metrics?type=province&date=1999-01-01&sensor=MODIS_TERRA&metric=activity_rate"  # 422
curl -s "localhost:8000/api/v1/territories/province/NO_EXISTE/summary?date=2026-09-15&sensor=MODIS_TERRA"                # 404
```

Con fixtures: `MCHANAQ_DATA_DIR=data/fixtures MCHANAQ_NO_CACHE=1 uvicorn backend.app.main:app --port 8000`

## 8. Cómo se cambia este contrato

1. Quien necesite el cambio lo propone en el chat del equipo.
2. Jean abre **un PR** que cambia a la vez `contracts/` y `data/fixtures/` (y vuelve a ejecutar `generate_fixtures.py`).
3. Revisan los responsables afectados: antes (quien produce el dato) y después (quien lo consume).
4. Solo se fusiona a `main` con su aprobación. Cambios que rompen → subir `schema_version`.

## 9. Pendientes de decisión

- [ ] Área piloto y nivel Pfafstetter definitivos (Angelo + equipo). Los IDs de los fixtures (`1501`, `FX13755`) son de muestra.
- [ ] Nombre final del bloque diario en la ficha (`daily`) — confirmar con Jhan/Tom.
- [ ] **`activity_rate` diario en `activity_daily.json`** (`fire_pixels_nominal_high / valid_land_pixels`, `null` si no hubo observación). La coropleta diaria lo necesita y la API no puede calcularlo; los fixtures ya lo incluyen — Tom confirma que lo genera.
- [ ] Umbrales reales: cobertura mínima, `robust_z` para «elevated», `umbral_veg`, `umbral_pend`, años mínimos de línea base (Tom/Angelo).
