#!/usr/bin/env bash
set -euo pipefail

# McHanaq — Startup script para Azure App Service Free F1 (Linux Python 3.11)
# Lee artefactos estáticos en modo solo lectura desde MCHANAQ_DATA_DIR (por defecto data/processed).
# Nunca invoca Google Earth Engine ni descarga archivos por petición HTTP.

export MCHANAQ_DATA_DIR="${MCHANAQ_DATA_DIR:-data/processed}"
export PORT="${PORT:-8000}"
export PYTHONPATH="${PYTHONPATH:-}:."

# Sincronización opcional única al arranque si se configuró Azure Blob Storage y faltan archivos locales
if [[ -n "${AZURE_BLOB_SAS_BASE_URL:-}" || ( -n "${AZURE_STORAGE_ACCOUNT:-}" && -n "${AZURE_STORAGE_CONTAINER:-}" ) ]]; then
  if [[ ! -s "${MCHANAQ_DATA_DIR}/metadata.json" || ! -s "${MCHANAQ_DATA_DIR}/activity_daily.json" ]]; then
    echo "[mchanaq-startup] Sincronizando snapshot inicial desde Azure Blob hacia ${MCHANAQ_DATA_DIR}..."
    python -m src.analytics.azure_sync download --target "${MCHANAQ_DATA_DIR}" --if-missing
  fi
fi

# Sincronización opcional única al arranque si se configuró Cloudflare R2 y faltan archivos locales
if [[ -n "${R2_PUBLIC_BASE_URL:-}" ]]; then
  if [[ ! -s "${MCHANAQ_DATA_DIR}/metadata.json" || ! -s "${MCHANAQ_DATA_DIR}/activity_daily.json" ]]; then
    echo "[mchanaq-startup] Sincronizando snapshot inicial desde Cloudflare R2 hacia ${MCHANAQ_DATA_DIR}..."
    python -m src.analytics.r2_sync download --target "${MCHANAQ_DATA_DIR}" --if-missing
  fi
fi

exec uvicorn src.backend.app.main:app --host 0.0.0.0 --port "${PORT}"
