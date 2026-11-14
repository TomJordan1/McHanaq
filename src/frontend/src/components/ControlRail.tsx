import { useState } from "react";
import { Drawer } from "./Drawer";
import type { DockItem } from "./DockBar";
import type { DayPoint, Hotspot, Metadata, MonthCell, Sensor } from "../api/types";
import { SENSORS, SENSOR_META } from "../api/types";
import { FIXTURE_FIRST_YEAR, FIXTURE_LAST_MONTH, FIXTURE_LAST_YEAR } from "../lib/fixtures";
import { calendarCsv, dailyCsv, download, hotspotsCsv, ringGeoJson } from "../lib/csv";
import { exportCsvUrl, getBackendState, monthRange } from "../api/client";
import { insidePeru, ringAreaKm2, type LatLon } from "../lib/geo";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const LEFT_ITEMS: DockItem[] = [
  { id: "periodo", label: "Período", icon: "calendar" },
  { id: "sensores", label: "Sensores", icon: "satellite" },
  { id: "area", label: "Área de interés", icon: "polygon" },
  { id: "capas", label: "Capas del mapa", icon: "layers" },
  { id: "descargas", label: "Descargas", icon: "download" },
];

interface Props {
  section: string;
  onClose: () => void;
  year: number;
  month: number;
  onPeriod: (y: number, m: number) => void;
  day: number;
  onDay: (d: number) => void;
  dateIso: string;
  granularity: "day" | "month";
  onGranularity: (g: "day" | "month") => void;
  metadata: Metadata | null;
  daily: DayPoint[];
  territoryId: string;
  sensors: Sensor[];
  onSensors: (s: Sensor[]) => void;
  calendarSensor: Sensor;
  includeLow: boolean;
  onIncludeLow: (v: boolean) => void;
  showHotspots: boolean;
  onShowHotspots: (v: boolean) => void;
  showCalendar: boolean;
  onShowCalendar: (v: boolean) => void;
  baseLayer: "dark" | "relief" | "satellite";
  onBaseLayer: (v: "dark" | "relief" | "satellite") => void;
  ring: LatLon[] | null;
  onRing: (r: LatLon[] | null) => void;
  hotspots: Hotspot[];
  calendar: MonthCell[];
  origin: string;
  countsBySensor: Record<string, number>;
}

export function ControlRail(p: Props) {
  const [lat, setLat] = useState("-8.90");
  const [lon, setLon] = useState("-73.92");
  const [radius, setRadius] = useState("60");
  const [coordError, setCoordError] = useState<string | null>(null);

  const lastDay = Number(monthRange(p.year, p.month).to.slice(8));
  const years: number[] = [];
  for (let y = FIXTURE_LAST_YEAR; y >= FIXTURE_FIRST_YEAR; y--) years.push(y);
  const monthDisabled = (m: number) => p.year === FIXTURE_LAST_YEAR && m > FIXTURE_LAST_MONTH;

  function applyCoords() {
    const la = Number(lat);
    const lo = Number(lon);
    const r = Number(radius);
    if (!isFinite(la) || !isFinite(lo) || !isFinite(r) || r <= 0) {
      setCoordError("Revisa los valores: deben ser números y el radio mayor que cero.");
      return;
    }
    if (!insidePeru([la, lo])) {
      setCoordError("Ese punto cae fuera del Perú. La herramienta solo cubre territorio peruano.");
      return;
    }
    setCoordError(null);
    const dLat = r / 110.574;
    const dLon = r / (111.32 * Math.cos((la * Math.PI) / 180));
    p.onRing([
      [la + dLat, lo - dLon],
      [la + dLat, lo + dLon],
      [la - dLat, lo + dLon],
      [la - dLat, lo - dLon],
    ]);
  }

  function toggleSensor(s: Sensor) {
    const has = p.sensors.includes(s);
    if (has && p.sensors.length === 1) return; // siempre queda uno activo
    p.onSensors(has ? p.sensors.filter((x) => x !== s) : [...p.sensors, s]);
  }

  const stamp = `${p.year}${String(p.month).padStart(2, "0")}`;

  switch (p.section) {
    case "periodo":
      return (
        <Drawer title="Período" note={`${MONTHS[p.month - 1]} ${p.year}`} onClose={p.onClose}>
          <div className="field">
            <label className="field__label" htmlFor="sel-year">Año</label>
            <select
              id="sel-year"
              value={p.year}
              onChange={(e) => {
                const y = Number(e.target.value);
                const m = y === FIXTURE_LAST_YEAR && p.month > FIXTURE_LAST_MONTH ? FIXTURE_LAST_MONTH : p.month;
                p.onPeriod(y, m);
              }}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sel-month">Mes</label>
            <select id="sel-month" value={p.month} onChange={(e) => p.onPeriod(p.year, Number(e.target.value))}>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1} disabled={monthDisabled(i + 1)}>
                  {name}{monthDisabled(i + 1) ? " — sin datos" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sel-day">
              Día <span className="field__value">{p.dateIso}</span>
            </label>
            <input
              id="sel-day"
              type="range"
              min={1}
              max={lastDay}
              step={1}
              value={Math.min(p.day, lastDay)}
              onChange={(e) => {
                p.onDay(Number(e.target.value));
                p.onGranularity("day");
              }}
            />
            <div className="legend__scale">
              <span>01</span>
              <span>{String(lastDay).padStart(2, "0")}</span>
            </div>
          </div>

          <div className="field">
            <span className="field__label">Qué pinta el mapa</span>
            <div className="btn-row">
              <button
                className={`btn${p.granularity === "day" ? " btn--on" : ""}`}
                onClick={() => p.onGranularity("day")}
              >
                Ese día
              </button>
              <button
                className={`btn${p.granularity === "month" ? " btn--on" : ""}`}
                onClick={() => p.onGranularity("month")}
              >
                Mes completo
              </button>
            </div>
          </div>

          <button
            className="toggle"
            aria-pressed={p.showCalendar}
            onClick={() => p.onShowCalendar(!p.showCalendar)}
          >
            <i className="toggle__box" style={{ background: p.showCalendar ? "var(--acid)" : "transparent" }} />
            <span>Mostrar el calendario</span>
          </button>

          <p className="mono-sm">
            La API sirve en resolución diaria; el mes solo aporta contexto y anomalía. Las fechas
            disponibles las publica el backend en <code>metadata.json</code>
            {p.metadata ? (
              <>
                {" "}
                (línea base mínima: {p.metadata.min_baseline_years} años).
              </>
            ) : (
              "."
            )}
          </p>
        </Drawer>
      );

    case "sensores":
      return (
        <Drawer title="Sensores" note={`${p.sensors.length}/3`} onClose={p.onClose}>
          {SENSORS.map((s) => {
            const on = p.sensors.includes(s);
            const meta = SENSOR_META[s];
            return (
              <button
                key={s}
                className="toggle"
                aria-pressed={on}
                onClick={() => toggleSensor(s)}
                title={`${meta.product} · desde ${meta.since}`}
              >
                <i className="toggle__box" style={{ background: on ? meta.color : "transparent" }} />
                <span>{meta.label}</span>
                <span className="toggle__meta">
                  {on ? (p.countsBySensor[s] ?? 0).toLocaleString("es-PE") : "—"}
                </span>
              </button>
            );
          })}
          <hr className="hr" />
          <button className="toggle" aria-pressed={p.includeLow} onClick={() => p.onIncludeLow(!p.includeLow)}>
            <i className="toggle__box" style={{ background: p.includeLow ? "var(--acid)" : "transparent" }} />
            <span>Incluir confianza baja</span>
          </button>
          <p className="mono-sm">
            El indicador principal usa clases 8–9. La clase 7 se guarda aparte, para análisis de
            sensibilidad.
          </p>
        </Drawer>
      );

    case "area":
      return (
        <Drawer title="Área de interés" onClose={p.onClose}>
          <p className="mono-sm" style={{ marginTop: 0 }}>
            Dibuja un polígono en el mapa con las herramientas de arriba, o define un cuadro por
            coordenadas.
          </p>
          <div className="field">
            <label className="field__label">Latitud <span className="field__value">°S/N</span></label>
            <input type="text" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label">Longitud <span className="field__value">°E/W</span></label>
            <input type="text" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label">Radio <span className="field__value">{radius} km</span></label>
            <input type="text" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} />
          </div>
          <div className="btn-row">
            <button className="btn btn--primary" onClick={applyCoords}>Aplicar</button>
            <button className="btn" disabled={!p.ring} onClick={() => p.onRing(null)}>Quitar</button>
          </div>
          {coordError && <div className="note note--warn" style={{ marginTop: 10 }}>{coordError}</div>}
          {p.ring && (
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Vértices</dt>
              <dd>{p.ring.length}</dd>
              <dt>Superficie</dt>
              <dd>{Math.round(ringAreaKm2(p.ring)).toLocaleString("es-PE")} km²</dd>
            </dl>
          )}
        </Drawer>
      );

    case "capas":
      return (
        <Drawer title="Capas del mapa" onClose={p.onClose}>
          <div className="field">
            <label className="field__label" htmlFor="sel-base">Mapa base</label>
            <select
              id="sel-base"
              value={p.baseLayer}
              onChange={(e) => p.onBaseLayer(e.target.value as Props["baseLayer"])}
            >
              <option value="dark">Oscuro</option>
              <option value="relief">Relieve</option>
              <option value="satellite">Satelital</option>
            </select>
          </div>
          <button className="toggle" aria-pressed={p.showHotspots} onClick={() => p.onShowHotspots(!p.showHotspots)}>
            <i className="toggle__box" style={{ background: p.showHotspots ? "var(--acid)" : "transparent" }} />
            <span>Focos térmicos</span>
          </button>
          <button className="toggle" aria-pressed={p.showCalendar} onClick={() => p.onShowCalendar(!p.showCalendar)}>
            <i className="toggle__box" style={{ background: p.showCalendar ? "var(--acid)" : "transparent" }} />
            <span>Calendario</span>
          </button>
        </Drawer>
      );

    case "descargas":
      return (
        <Drawer title="Descargas" onClose={p.onClose}>
          <div className="btn-row" style={{ flexDirection: "column" }}>
            <button
              className="btn btn--block"
              disabled={p.hotspots.length === 0}
              onClick={() => download(`mchanaq_focos_${stamp}.csv`, hotspotsCsv(p.hotspots, p.origin))}
            >
              Focos CSV ({p.hotspots.length.toLocaleString("es-PE")})
            </button>
            <button
              className="btn btn--block"
              disabled={p.daily.length === 0}
              onClick={() =>
                download(
                  `mchanaq_diario_${p.dateIso.slice(0, 7)}_${p.calendarSensor}.csv`,
                  dailyCsv(p.daily, p.calendarSensor, p.territoryId, "province", p.origin)
                )
              }
            >
              Serie diaria CSV ({p.daily.length} días)
            </button>
            <button
              className="btn btn--block"
              disabled={p.calendar.length === 0}
              onClick={() =>
                download(`mchanaq_calendario_${p.calendarSensor}.csv`, calendarCsv(p.calendar, p.calendarSensor, p.origin))
              }
            >
              Calendario CSV
            </button>
            <button
              className="btn btn--block"
              disabled={!p.ring}
              onClick={() =>
                p.ring &&
                download(`mchanaq_area_${stamp}.geojson`, ringGeoJson(p.ring, ringAreaKm2(p.ring)), "application/geo+json")
              }
            >
              Área GeoJSON
            </button>
          </div>
          {getBackendState() === "online" && (
            <a
              className="btn btn--block"
              style={{ marginTop: 6, display: "block", textAlign: "center", textDecoration: "none" }}
              href={exportCsvUrl(
                "province",
                p.territoryId,
                monthRange(p.year, p.month).from,
                monthRange(p.year, p.month).to,
                p.calendarSensor
              )}
            >
              Exportar desde el backend
            </a>
          )}
          <p className="mono-sm" style={{ marginTop: 12 }}>
            La serie diaria lleva las columnas de <code>environmental_daily.csv</code>:
            <code>t_amb_c</code>, <code>t_suelo_c</code>, <code>wind_dir_deg</code> y{" "}
            <code>elevation_m</code>. Cada archivo incluye <code>data_origin</code>, que indica si
            la fila viene del backend o del juego de muestra.
          </p>
        </Drawer>
      );

    default:
      return null;
  }
}
