# harness — ancla para agentes de IA

Esta carpeta es el punto de entrada para cualquier agente de IA que trabaje en McHanaq,
y la referencia que manda sobre el proyecto. Si el código, un comentario o una
diapositiva contradicen lo que dice aquí, vale lo que está aquí.

**Lee esto primero. En este orden.**

## 1. Qué hay y quién manda

| Archivo | Qué contiene | Autoridad |
|---|---|---|
| `documento-tecnico-operativo.md` | Alcance, fuentes, metodología, contratos de datos, árbol de susceptibilidad, rúbrica y entrega. **v1.7**. | Fuente de verdad |
| `arquitectura-frontend-backend.md` | Contrato `/api/v1`, procesamiento longitudinal, reparto de archivos, dueños por carpeta, Fase 2. **v1.2**. | Fuente de verdad |
| `reto.txt` | Enunciado oficial del reto de la NASA. | Fuente de verdad |

Estos tres archivos se sincronizan con `docs/` de la rama `main` del remoto. **No los
edites desde una rama de trabajo**: se cambian en `main`, con acuerdo del equipo, y
después se replican aquí.

## 2. Estructura de carpetas

Nuestra estructura tiene prioridad sobre la del remoto: el **código** vive bajo `src/`,
con frontend y backend claramente separados, y la **documentación** bajo `docs/`.

```text
McHanaq/
├── docs/
│   ├── harness/            # ESTO: ancla de IA + fuente de verdad
│   └── …                   # documentación propia adicional
├── src/
│   ├── frontend/           # Sebastian — React + Vite + TypeScript + Leaflet
│   ├── backend/            # Jhan (Fase B) / Tom (Fase A) — FastAPI de solo lectura
│   ├── analytics/          # Tom — métricas, anomalías, árbol de reglas
│   └── gee/                # Angelo — pipelines de Google Earth Engine
├── contracts/              # contrato de API y esquemas JSON
├── data/
│   ├── reference/          # capas territoriales oficiales
│   ├── fixtures/           # datos de muestra para desarrollo
│   ├── intermediate/       # exportaciones GEE crudas (ignorado en Git)
│   └── processed/          # JSON/GeoJSON listos para la API
├── tests/
└── presentation/
```

**Equivalencia con el remoto.** La rama `main` tiene `frontend/`, `backend/`,
`analytics/` y `gee/` en la raíz. Aquí están bajo `src/`. Todo lo demás coincide.
Al leer rutas en los documentos, traduce así:

| En los documentos | Aquí |
|---|---|
| `frontend/…` | `src/frontend/…` |
| `backend/app/main.py` | `src/backend/app/main.py` |
| `analytics/…` | `src/analytics/…` |
| `gee/…` | `src/gee/…` |
| `data/…`, `contracts/…`, `tests/…`, `docs/…` | igual |

Consecuencia práctica para el backend: el ejemplo del documento usa
`ROOT = Path(__file__).resolve().parents[2]`. Con `src/backend/app/main.py` hay un nivel
más, así que ahí va `parents[3]`.

## 3. Reglas que no se negocian

1. **La API es diaria por defecto.** `date=YYYY-MM-DD` y rangos `from`/`to`.
   `period=YYYY-MM` es opcional y solo aporta contexto y anomalía mensual.
2. **Nunca se suman conteos entre sensores.** Cada uno conserva su propio denominador
   (`valid_land_pixel_days`) y se clasifica contra su propio umbral estacional antes de
   compararlos.
3. **`null` nunca es `0`.** Dato ausente se muestra como «Sin datos», «No estimable» o
   «No evaluable». Si hay más del 30 % de nubes (`lst_valid_pixel_pct < 70`), `t_suelo_c`
   llega como `null`.
4. **Línea base mínima: 5 años** (`min_baseline_years`). Por debajo, la anomalía robusta
   no es estimable.
5. **El frontend no calcula.** No deriva concordancia multisensor ni categorías de
   susceptibilidad: muestra lo que devuelve la API. Lo que hay en
   `src/frontend/src/api/client.ts` bajo «derivaciones locales» existe solo para
   desarrollar sin backend y está marcado como tal.
6. **Paletas aptas para daltonismo**: Viridis, Cividis o ColorBrewer. Usamos **Cividis**
   en el calendario y la coropleta. La rampa cálida queda reservada al frente simulado,
   donde el color codifica tiempo, no magnitud.
7. **Un solo escritor por archivo.** Nadie edita un archivo que otro genera.
8. **Los fixtures no son resultados.** Nunca se presentan como observaciones en la demo
   ni en el pitch.

## 4. Variables diarias del contrato

Están en `src/frontend/src/api/types.ts` (`DailyEnv`) y en
`data/intermediate/environmental_daily.csv`:

| Campo | Unidad | Origen y regla |
|---|---|---|
| `t_amb_c` | °C | ERA5-Land `temperature_2m` − 273.15 |
| `relative_humidity_2m_pct` | % | Magnus-Tetens desde temperatura y punto de rocío |
| `t_suelo_c` | °C | LST MODIS/VIIRS, `valor × 0.02 − 273.15`; `null` con >30 % de nubes |
| `lst_valid_pixel_pct` | % | debe ser ≥ 70 para usar `t_suelo_c` |
| `wind_dir_deg` | grados | `(atan2(−u, −v) · 180/π + 360) % 360`; nunca promediar ángulos |
| `wind_speed_10m_ms` | m/s | `sqrt(u² + v²)` |
| `elevation_m` | m s. n. m. | DEM según época: NASADEM/SRTM (MODIS 2000–2011), Copernicus GLO-30 (VIIRS 2012+) |
| `dem_source` | — | identificador del DEM aplicado |

## 5. Fase 2 — propagación

Es **opcional y desacoplada**. No toca ningún endpoint de Fase 1. Vive en
`src/frontend/src/lib/spread.ts`, se llama `heuristic_wind_slope_spread_v1`, produce
isócronas a +6, +12 y +24 h y siempre muestra su aviso. Cuando el backend publique
`/spread-forecast` o `/spread-simulate`, se sustituye la implementación local sin
cambiar la interfaz.

## 6. Qué queda fuera del alcance

Predicción de ocurrencia o ignición, probabilidad de incendio, estimación de superficie
futura quemada, modelos entrenados con aprendizaje automático y cualquier uso operativo
de alerta, despacho o evacuación.

## 7. Estado del frontend

Alineado con el contrato v1.2. Mientras `/api/v1` no responda, la interfaz usa su juego
de datos de muestra —con la **misma forma** del contrato— y lo indica en el encabezado,
en la barra de estado y en la columna `data_origin` de cada CSV. En cuanto el backend
responda, cambia solo.
