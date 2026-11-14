# McHanaq — Diccionario de datos

**Versión:** 1.2 · `schema_version: "1.0"` · Mantiene: Jean Pierrer
**Fuente de verdad:** `docs/McHanaq_documento_tecnico_operativo_v1.7.md` §7–8.4 y `docs/arquitectura_frontend_backend_McHanaq.md` §2.

Reglas que aplican a todos los archivos:
- **Claves territoriales obligatorias:** `territory_type` (`province` | `hydro_unit`) + `territory_id` (texto, estable).
- **Fechas:** `date` = `YYYY-MM-DD`; `period_id` = `YYYY-MM`.
- **Desconocido o no estimable = `null`, nunca `0`.**
- **Cada sensor va por separado.** No existen columnas con sumas entre sensores.

---

## 1. Flujo de archivos (quién escribe, quién lee)

| Archivo | Carpeta | Escribe | Lee |
|---|---|---|---|
| `daily_activity.csv` | `data/intermediate/` | Angelo (GEE) | Tom |
| `environmental_daily.csv` | `data/intermediate/` | Angelo | Tom |
| `environmental_context.csv` | `data/intermediate/` | Angelo | Tom |
| `gee_manifest.json` | `data/intermediate/` | Angelo | Tom |
| `territories.geojson` | `data/processed/` | Angelo (con capas revisadas por Jean) | Backend |
| `activity_daily.json` | `data/processed/` | Tom | Backend |
| `activity_summary.json` | `data/processed/` | Tom | Backend |
| `sensor_comparison.json` | `data/processed/` | Tom | Backend |
| `conditions_assessment.json` | `data/processed/` | Tom | Backend |
| `metadata.json` | `data/processed/` | Tom (con `gee_manifest.json`) | Backend y frontend |
| Copias de muestra de todo lo anterior | `data/fixtures/` | Jean | Todos |

El frontend **solo** lee la API, nunca estos archivos.

---

## 2. `territories.geojson`

`FeatureCollection`; una `Feature` por territorio. `properties`:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `territory_type` | texto | sí | `province` o `hydro_unit`. |
| `territory_id` | texto | sí | Provincia: código UBIGEO de 4 dígitos (INEI). Cuenca: código Pfafstetter (ANA). |
| `territory_name` | texto | sí | Nombre oficial. |
| `pfafstetter_level` | entero / `null` | cuencas | Nivel Pfafstetter (uniforme en todo el conjunto). `null` en provincias. |
| `source` | texto | recomendado | Capa de origen y versión. |

Geometría: `Polygon` o `MultiPolygon` en WGS84 (EPSG:4326).

---

## 3. Tablas intermedias (GEE → Tom)

### 3.1 `daily_activity.csv` — una fila por `date` × territorio × `sensor`

| Campo | Tipo | Unidad | Descripción |
|---|---|---|---|
| `date` | fecha | — | Día de observación. |
| `territory_type`, `territory_id` | texto | — | Claves territoriales. |
| `sensor` | texto | — | `MODIS_TERRA` (MOD14A1), `MODIS_AQUA` (MYD14A1), `VIIRS_SNPP` (VNP14A1). |
| `fire_pixels_low` | entero | píxeles | Detecciones de baja confianza (`FireMask` = 7). Solo sensibilidad. |
| `fire_pixels_nominal_high` | entero | píxeles | Detecciones nominales/altas (`FireMask` 8–9). Base del indicador principal. |
| `valid_land_pixels` | entero | píxeles | Píxeles terrestres con observación válida (QA tierra y `FireMask` 5, 7, 8 o 9). |
| `expected_land_pixels_per_day` | entero | píxeles | Píxeles terrestres esperados en el polígono (fijo por sensor; no depende de las nubes del día). |
| `observation_coverage` | decimal 0–1 | fracción | `valid_land_pixels / expected_land_pixels_per_day`. |
| `source_product` | texto | — | Colección GEE usada. |
| `processing_version` | texto | — | Versión del pipeline. |

Si falta una imagen ese día: fila con `valid_land_pixels = 0` (no se borra la fila).

### 3.2 `environmental_daily.csv` — una fila por `date` × territorio

| Campo | Tipo | Unidad | Fuente |
|---|---|---|---|
| `t_amb_c` | decimal | °C | Temperatura del aire a 2 m — ERA5-Land Hourly (agregado diario). |
| `t_suelo_c` | decimal / `null` | °C | Temperatura superficial (LST) — MOD11A1/MYD11A1, VNP21A1D/N; `K − 273.15`; `null` si hay nubes. |
| `wind_dir_deg` | decimal 0–360 | grados | Desde dónde sopla (0 = N, 90 = E). Se calcula de `u`,`v` promediados: `(atan2(−u, −v)·180/π + 360) % 360`. Nunca promediar ángulos. |
| `wind_speed_10m_ms` | decimal | m/s | `√(u² + v²)` a 10 m — ERA5-Land. |
| `elevation_m` | decimal | m s.n.m. | Elevación media/mediana del territorio. |
| `dem_source` | texto | — | `NASADEM_HGT_001`/`USGS_SRTMGL1_003` (tramo MODIS 2000–2011) o `COPERNICUS_DEM_GLO30` (tramo VIIRS 2012–presente). |

### 3.3 `environmental_context.csv` — una fila por `period_id` × territorio

| Campo | Unidad | Descripción |
|---|---|---|
| `landcover_year` | año | Año de MapBiomas Perú usado. |
| `vegetation_area_pct` (y grupos: bosque, matorral, pastizal, agricultura, urbano, suelo desnudo, agua) | % | Proporción de cobertura. |
| `ndvi_median`, `ndvi_anomaly` | adimensional | MOD13A3 (escala 0.0001, `DetailedQA`). |
| `precip_30d_mm` | mm | Precipitación antecedente 30 días (ERA5-Land `total_precipitation_hourly` → mm). |
| `soil_moisture_surface` | m³/m³ | Humedad superficial del suelo (ERA5-Land). |
| `temperature_2m_c` | °C | Temperatura del aire (= `t_amb_c` mensual). |
| `relative_humidity_2m_pct` | % | Calculada de temperatura y punto de rocío (Magnus-Tetens). |
| `slope_class_area_pct` | % | Proporción del área en cada rango de pendiente. |
| `water_area_pct` | % | Agua y humedales (solo descriptivo). |
| `source_resolution`, `source_product`, `source_period_start`, `source_period_end`, `processing_version` | — | Trazabilidad. |

---

## 4. Archivos API-ready (Tom → backend)

Todos con la raíz `{"schema_version": "1.0", "items": [...]}`.

### 4.1 `activity_daily.json` — una fila por `date` × territorio × `sensor`

Los campos de `daily_activity.csv` (§3.1) **más** las variables diarias de `environmental_daily.csv` (§3.2) del mismo día y territorio. Se usa para el calendario/serie y para `export.csv`.

Campo adicional precalculado por Tom (pendiente de confirmar):

| Campo | Tipo | Definición |
|---|---|---|
| `activity_rate` | decimal / `null` | Tasa del día: `fire_pixels_nominal_high / valid_land_pixels`. `null` si `valid_land_pixels = 0`. Alimenta la coropleta diaria. |

### 4.2 `activity_summary.json` — una fila por `period_id` × territorio × `sensor`

| Campo | Tipo | Definición |
|---|---|---|
| `fire_pixel_days_8_9` | entero / `null` | Suma del mes de `fire_pixels_nominal_high`. **Métrica principal.** No son incendios ni hectáreas. |
| `fire_pixel_days_7_9` | entero / `null` | Igual pero incluyendo baja confianza. Solo sensibilidad. |
| `valid_land_pixel_days` | entero | Suma del mes de `valid_land_pixels`. |
| `expected_land_pixel_days` | entero | `expected_land_pixels_per_day × días del mes`. |
| `activity_rate` | decimal / `null` | `fire_pixel_days_8_9 / valid_land_pixel_days`. **No es probabilidad ni % de área quemada.** `null` si no hubo observación. |
| `observation_coverage` | decimal 0–1 | `valid_land_pixel_days / expected_land_pixel_days`. |
| `active_days` | entero / `null` | Días con ≥ 1 detección nominal/alta. |
| `max_consecutive_active_days` | entero / `null` | Racha más larga de días activos seguidos (un día sin observación corta la racha). |
| `historical_anomaly.value` | decimal / `null` | `robust_z = (tasa − mediana) / (1.4826 × MAD)` contra el mismo mes de años anteriores, mismo sensor. |
| `historical_anomaly.status` | texto | `estimated`, `insufficient_baseline` (menos de `min_baseline_years`), `not_estimable` (MAD ≈ 0). |
| `historical_anomaly.baseline_years` | entero | Años comparables usados. |

### 4.3 `sensor_comparison.json` — una fila por `period_id` × territorio

| Campo | Descripción |
|---|---|
| `status` | `concordant_elevated`, `concordant_not_elevated`, `discordant`, `single_sensor`, `insufficient`. Compara **etiquetas** de señal, no conteos. |
| `sensors.<SENSOR>.available` | `true` si el sensor tiene cobertura y datos suficientes. |
| `sensors.<SENSOR>.activity_rate`, `.historical_anomaly`, `.observation_coverage` | Valores de ese sensor (de `activity_summary.json`). |
| `sensors.<SENSOR>.signal_status` | `elevated` / `not_elevated` según el umbral del propio sensor; `null` si no es utilizable. |
| `interpretation` | Texto breve para la interfaz. |
| `method_version` | Versión del método. |

### 4.4 `conditions_assessment.json` — una fila por `period_id` × territorio (no depende del sensor)

| Campo | Descripción |
|---|---|
| `classification` | `high`, `moderate`, `low`, `partial`, `not_evaluable`. Es cualitativa: **no es probabilidad ni índice de riesgo validado.** |
| `decision_path` | Nodos recorridos del árbol, p. ej. `["N0:pass","N1:yes","N2:yes","N3a:no"]`. |
| `rules_triggered` | Reglas activadas (`vegetation_present`, `dryness_high`, `wind_high`, `warm_dry`, `steep_slope`). |
| `modifiers` | Informativos, no cambian la categoría: `steep_slope_share_high`, `thermal_history_elevated`, `water_share_high`. |
| `evidence[]` | `variable`, `value`, `unit`, `rule_status`, `source_product`, `source_period`, `source_resolution`. |
| `missing_variables` | Variables que faltaron (explican `partial` / `not_evaluable`). |
| `data_quality_status` | `usable`, `partial`, `insufficient`. |
| `source_products`, `processing_version` | Trazabilidad. |

### 4.5 `metadata.json`

| Campo | Descripción |
|---|---|
| `sensors[]` | `id`, `product`, hora de paso, desde cuándo hay datos, resolución. |
| `available_periods_by_sensor` / `available_date_ranges_by_sensor` | Meses / rangos de días publicados por sensor. |
| `common_environmental_periods` / `common_environmental_dates` | Donde están los bloques ambientales obligatorios. |
| `common_analysis_periods` / `common_analysis_dates` | Intersección de los tres sensores + ambiente (para comparación justa). |
| `metrics`, `units` | Métricas permitidas y sus unidades. |
| `dem_by_epoch`, `environmental_sources` | Trazabilidad de fuentes. |
| `parameters` | Umbrales versionados (cobertura mínima, `robust_z` de señal elevada, `min_baseline_years`, `umbral_veg`, `umbral_pend`). |
| `limitations` | Textos de limitaciones que la interfaz/presentación debe mostrar. |

---

## 5. Cómo distinguir «sin datos», «no evaluable» y «cero»

| Situación | Cómo se ve en los datos | Qué muestra la interfaz |
|---|---|---|
| Se observó y no hubo fuego | `fire_pixels_nominal_high = 0`, `valid_land_pixels > 0` | `0` detecciones |
| No se pudo observar (nubes, sin imagen) | `valid_land_pixels = 0`, `observation_coverage = 0` | Sin observación |
| Valor desconocido / no calculable | `null` | Sin datos / No estimable |
| Historial corto | `historical_anomaly.status = "insufficient_baseline"` | Historial insuficiente |
| Faltan bloques ambientales | `classification = "partial"` o `"not_evaluable"` | Evaluación parcial / No evaluable |
