# Backend — McHanaq

Marcador de posición. Lo implementa el equipo de backend en la rama `feature/api-backend`.

El contrato que debe cumplir está en `docs/hamess/arquitectura-frontend-backend.md`.
El frontend ya consume esa forma exacta: cuando estos endpoints respondan, la interfaz
cambia sola de "datos de muestra" a "backend conectado", sin tocar código de React.

## Lo mínimo para desbloquear al frontend

```
GET /api/v1/health          -> {"status":"ok"}
GET /api/v1/metadata        -> periodos disponibles por sensor, unidades, fuentes
GET /api/v1/territories     -> GeoJSON de provincias / unidades hidrograficas
GET /api/v1/hotspots        -> {"items":[Hotspot]}   ?sensor=&period=YYYY-MM
GET /api/v1/calendar        -> {"items":[MonthCell]} ?sensor=
GET /api/v1/environment     -> EnvConditions          ?lat=&lon=&period=YYYY-MM
```

Las formas de `Hotspot`, `MonthCell` y `EnvConditions` están en
`src/frontend/src/api/types.ts`. Ese archivo y el contrato se cambian juntos, en el mismo PR.

## Reglas

- Solo lectura. El backend lee los JSON ya generados en `data/processed/` y los filtra.
- No recalcula tasas, anomalías ni reglas: eso lo produce el módulo analítico.
- `null` significa dato no disponible. `0` significa que el indicador se calculó y vale cero.
  El frontend nunca convierte uno en el otro.
- Errores uniformes: `{"code": "...", "detail": "..."}` con 400, 404, 422 o 500.

## Arranque sugerido

```bash
cd src/backend
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn
uvicorn app.main:app --reload --port 8000

# Con fixtures en vez de datos reales:
MCHANAQ_DATA_DIR=../../data/fixtures uvicorn app.main:app --port 8000
```
