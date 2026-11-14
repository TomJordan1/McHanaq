# McHanaq

**NASA Space Apps Challenge 2026 — reto *Harmonization of MODIS and VIIRS Hot Spots***
Equipo: Los McLovin · Perú

Calendario longitudinal de actividad térmica (MODIS Terra/Aqua y VIIRS S-NPP) con contexto ambiental, susceptibilidad contextual, comparación multisensor y simulación exploratoria de recorrido de fuego (Fase 2 opcional).

---

## Documentación principal (fuente de verdad)

* [Documento técnico y operativo v1.7](docs/McHanaq_documento_tecnico_operativo_v1.7.md)
* [Arquitectura frontend ↔ backend y procesamiento longitudinal (v1.2)](docs/arquitectura_frontend_backend_McHanaq.md)
* [Descripción del reto](docs/reto.txt)
* [Ancla para agentes (`docs/harness/`)](docs/harness/README.md)

## Estructura del repositorio

```text
McHanaq/
├── src/
│   ├── frontend/        # Sebastian — React + Vite + TypeScript + Leaflet
│   ├── backend/         # Tom (Fase A) / Jhan (Fase B) — FastAPI de solo lectura
│   ├── analytics/       # Tom — métricas, anomalías y árbol de reglas en Python
│   └── gee/             # Angelo — pipelines de Google Earth Engine
├── contracts/           # Contrato de API, diccionario de datos y esquemas (Jean / Jhan)
├── data/
│   ├── reference/       # Capas territoriales oficiales de referencia (Jean)
│   ├── fixtures/        # Datos sintéticos para desarrollo/pruebas (Jean)
│   ├── intermediate/    # Exportaciones GEE crudas (ignorado en Git)
│   └── processed/       # JSON/GeoJSON listos para la API
├── tests/               # Pruebas unitarias, de humo y de aceptación
├── docs/                # Documentación técnica, metodológica y harness
└── presentation/        # Deck y guion de exposición (Jean Pierrer)
```

## Ramas del equipo

| Rama | Responsable | Carpeta principal |
|---|---|---|
| `feature/gee-data-pipeline` | Angelo | `src/gee/` |
| `feature/analytics-engine` | Tom | `src/analytics/` |
| `feature/api-backend` | Jhan (Fase A: Tom) | `src/backend/` |
| `feature/frontend-dashboard` | Sebastian | `src/frontend/` |
| `feature/product-qa-demo` | Jean Pierrer | `data/reference/`, `contracts/`, `data/fixtures/`, `docs/`, `tests/acceptance/`, `presentation/` |

## Inicio rápido

```bash
git clone https://github.com/TomJordan1/McHanaq.git
cd McHanaq
git checkout <tu-rama>
```

### Arrancar el backend (en modo fixtures)

* **Linux/macOS:**
  ```bash
  MCHANAQ_DATA_DIR=data/fixtures MCHANAQ_NO_CACHE=1 uvicorn src.backend.app.main:app --reload --port 8000
  ```
* **Windows PowerShell:**
  ```powershell
  $env:MCHANAQ_DATA_DIR="data/fixtures"; $env:MCHANAQ_NO_CACHE="1"; uvicorn src.backend.app.main:app --reload --port 8000
  ```

### Arrancar el frontend

```bash
cd src/frontend
npm install
npm run dev          # http://localhost:5173 (proxy /api -> localhost:8000)
```

Mientras el backend no responda, el frontend cae en sus fixtures locales y lo indica de forma visible en la interfaz.

## Qué hace la aplicación

* **Inicio (`#/`):** portada por bloques sobre globo 3D (problema, solución, flujo de datos, equipo y alcance).
* **Mapa (`#/mapa`):**
  * **Calendario:** mapa del Perú con focos por sensor, selección de área, calendario longitudinal, serie diaria, indicadores, comparación multisensor y árbol de susceptibilidad.
  * **Simulación (Fase 2 opcional):** recorrido exploratorio desde una ignición hipotética con viento, humedad, vegetación, pendiente y horizonte configurables.
* **Fotos del equipo:** dejar foto en `src/frontend/public/equipo/` (`angelo.jpg`, `tom.jpg`, `jhan.jpg`, `sebastian.jpg`, `jean-pierrer.jpg`).

## Límites que la interfaz declara siempre

* Un foco térmico es una anomalía detectada, no un incendio confirmado ni un perímetro.
* Nube y falta de dato no son ausencia de fuego: se muestran como cobertura, nunca como `0`.
* Los conteos no se suman entre sensores. Cada uno se compara contra su propio umbral estacional.
* La susceptibilidad es un índice cualitativo basado en reglas, sin validar contra incendios reales.
* La simulación de recorrido no predice dónde ni cuándo habrá un incendio ni sirve para decisiones operativas.

## Créditos de datos

* Focos activos: MODIS `MOD14A1.061` y `MYD14A1.061`, VIIRS `VNP14A1.002` (NASA LP DAAC).
* Contexto ambiental: ERA5-Land (Copernicus/ECMWF), NASADEM / Copernicus DEM GLO-30, MapBiomas Perú.
* Mapas base: OpenStreetMap, OpenTopoMap (CC-BY-SA), Esri World Imagery.
