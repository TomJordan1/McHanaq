# McHanaq — Pipeline GEE (Rama `feature/gee-data-pipeline`)

Scripts base de Google Earth Engine para exportar las tablas diarias longitudinales sobre todo el territorio peruano (o el área piloto) hacia `data/intermediate/` (Google Drive → local):

1. **`hotspots_pipeline.js`** → exporta `daily_activity.csv` (`MODIS_TERRA` `MOD14A1`, `MODIS_AQUA` `MYD14A1`, `VIIRS_SNPP` `VNP14A1`).
   * Extrae `FireMask` bits `0–3` (`bitwiseAnd(15)`): clase `7` (baja confianza) y clases `8–9` (nominal/alta).
   * Extrae `QA` bits `0–1` (`bitwiseAnd(3) == 2` para tierra firme).
   * Calcula `observation_coverage = valid_land_pixels / expected_land_pixels_per_day` (control `< 30%` nubes = `>= 0.70`).
2. **`environmental_daily.js`** → exporta `environmental_daily.csv`:
   * **`t_amb_c`:** `temperature_2m - 273.15` (`ECMWF/ERA5_LAND/HOURLY`, promedio diario).
   * **`relative_humidity_2m_pct`:** ecuación de Magnus-Tetens usando `temperature_2m` y `dewpoint_temperature_2m`.
   * **`t_suelo_c` + `lst_valid_pixel_pct`:** `MODIS/061/MOD11A1` (`LST_Day_1km`, `QC_Day` bits `0–1 == 0`) y `NASA/VIIRS/002/VNP21A1D` (`LST_1KM`, `QC`), aplicando `valor * 0.02 - 273.15`. Se invalida (`null`) si `lst_valid_pixel_pct < 70` (`>= 30%` nubes).
   * **`wind_dir_deg` + `wind_speed_10m_ms`:** promedio diario vectorial de `u_component_of_wind_10m` y `v_component_of_wind_10m` antes de calcular `atan2(-u, -v) * 180 / π + 360 % 360`.
   * **`elevation_m` + `dem_source`:** `NASA/NASADEM_HGT/001` (`elevation`) para 2000–2011 y `COPERNICUS/DEM/GLO30` (`DEM`) para 2012–2025.

**Regla operativa:** ejecutar por bloques de **1–2 años** (`START_DATE` / `END_DATE`) para evitar límites de memoria/tiempo en GEE.
