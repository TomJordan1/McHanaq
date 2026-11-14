# AGENTS.md — Instrucciones del repositorio McHanaq

Antes de editar código o responder sobre el proyecto, lee en orden:

1. [docs/harness/README.md](docs/harness/README.md) — reglas operativas, estructura `src/`, contratos y límites.
2. [docs/McHanaq_documento_tecnico_operativo_v1.7.md](docs/McHanaq_documento_tecnico_operativo_v1.7.md) — fuente de verdad metodológica y de alcance.
3. [docs/arquitectura_frontend_backend_McHanaq.md](docs/arquitectura_frontend_backend_McHanaq.md) — fuente de verdad de arquitectura `/api/v1`, procesamiento longitudinal y Fase 2 opcional.
4. [contracts/api-contract.md](contracts/api-contract.md) y [contracts/data-dictionary.md](contracts/data-dictionary.md).

## Reglas rápidas para agentes

* **Estructura oficial unificada:** todo el código fuente vive bajo `src/` (`src/frontend/`, `src/backend/`, `src/analytics/`, `src/gee/`). Las carpetas raíz son `contracts/`, `data/`, `docs/`, `presentation/`, `src/`, `tests/`.
* **Rutas relativas en backend:** `src/backend/app/main.py` usa `ROOT = Path(__file__).resolve().parents[3]`.
* **Ownership actual (Fase A):** Tom es responsable de `src/analytics/` y `src/backend/`; Angelo de `src/gee/` (datos en `data/intermediate/` y `data/processed/territories.geojson`); Sebastian de `src/frontend/`; Jean Pierrer de `contracts/`, `data/fixtures/`, `data/reference/`, `docs/`, `tests/acceptance/` y `presentation/`.
* **Almacenamiento e infraestructura:** Google Drive se usa únicamente como puente `GEE → data/intermediate/` (local). `src/backend/` en Render es de solo lectura sobre `data/processed/` (o `data/fixtures/`), nunca descarga archivos de Google Drive en runtime.
* **Mapas base libres (sin API keys):** usar OpenTopoMap (hidrología/relieve), OpenStreetMap (con filtro CSS para modo oscuro) y Esri World Imagery. No usar teselas de CARTO que exigen API key.
* **Integridad científica:** API diaria por defecto (`date=YYYY-MM-DD`, `from`/`to`); nunca sumar conteos entre sensores (`MODIS_TERRA`, `MODIS_AQUA`, `VIIRS_SNPP`); `null` nunca es `0`; susceptibilidad contextual no es predicción de ignición ni propagación; Fase 2 (`spread_model`) es estrictamente opcional y desacoplada de Fase 1.
