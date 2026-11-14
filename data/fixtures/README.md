# Fixtures de McHanaq — DATOS FICTICIOS

> ⚠️ **Todo lo que hay en esta carpeta es inventado.** Sirve para desarrollar y probar el backend y el frontend antes de tener datos reales de GEE. **No usar como evidencia ni en la presentación.** Cada archivo lleva `"data_origin": "fixture"`.

## Qué contiene

| Archivo | Contenido |
|---|---|
| `metadata.json` | Sensores, fechas publicadas (01–30/09/2026), unidades, fuentes, parámetros de fixture. |
| `territories.geojson` | 2 territorios con geometría rectangular ficticia: provincia `1501` y cuenca `FX13755` (Pfafstetter nivel 5). |
| `activity_daily.json` | 180 filas = 2 territorios × 3 sensores × 30 días, con variables ambientales diarias. |
| `activity_summary.json` | 6 filas = 2 territorios × 3 sensores para `2026-09`. Calculado a partir de las filas diarias (cuadra). |
| `sensor_comparison.json` | 2 filas (una por territorio). |
| `conditions_assessment.json` | 2 filas (una por territorio). |
| `generate_fixtures.py` | Script que genera todo lo anterior (semilla fija → siempre el mismo resultado). |

Los nombres de archivo son **los mismos** que Tom genera en `data/processed/`, así el backend funciona igual con ambos.

## Casos borde incluidos a propósito (para QA)

| Caso | Dónde | Qué debe mostrar la interfaz |
|---|---|---|
| Día sin observación (nubes) | Todos, `2026-09-10`: `valid_land_pixels = 0`, `t_suelo_c = null` | «Sin observación», **no** «0 focos» |
| Días con cero detecciones | Muchos días con cobertura > 0 y `fire_pixels_nominal_high = 0` | `0` |
| Sensor sin datos todo el mes | Cuenca `FX13755`, `MODIS_AQUA`: métricas `null`, cobertura 0 | «Sin datos» |
| Historial insuficiente | Cuenca, `MODIS_TERRA` y `MODIS_AQUA` | «Historial insuficiente» |
| Viento no disponible | Cuenca: `wind_dir_deg` y `wind_speed_10m_ms` = `null` | «Sin datos» |
| Evaluación ambiental parcial | Cuenca: `classification = "partial"` | «Evaluación parcial» + variables faltantes |
| Sensores en desacuerdo | Provincia: `status = "discordant"` (VIIRS elevado, MODIS no) | Mostrar cada sensor por separado |
| Un solo sensor utilizable | Cuenca: `status = "single_sensor"` | Explicar que no se puede contrastar |
| Brote de actividad | Provincia, 09–16/09 | Se ve en el calendario |

## Cómo usarlos

Backend apuntando a los fixtures (desde la raíz del repo):

```bash
# Git Bash / Linux / macOS
MCHANAQ_DATA_DIR=data/fixtures MCHANAQ_NO_CACHE=1 uvicorn backend.app.main:app --port 8000
```

```powershell
# Windows PowerShell
$env:MCHANAQ_DATA_DIR="data/fixtures"; $env:MCHANAQ_NO_CACHE="1"; uvicorn backend.app.main:app --port 8000
```

Regenerarlos (por ejemplo, tras cambiar el contrato):

```bash
python data/fixtures/generate_fixtures.py
```

Si cambia el contrato, `contracts/` y este script se actualizan **en el mismo PR**.
