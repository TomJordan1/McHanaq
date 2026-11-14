import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControlRail, LEFT_ITEMS } from "../components/ControlRail";
import { MapStage, type DrawMode } from "../components/MapStage";
import { CalendarStrip } from "../components/CalendarStrip";
import { AnalysisRail, ANALYSIS_ITEMS } from "../components/AnalysisRail";
import { SpreadRail, SPREAD_ITEMS, type SpreadParams } from "../components/SpreadRail";
import { DockBar } from "../components/DockBar";
import type { ToolTab } from "../components/SiteNav";
import {
  deriveComparison,
  deriveSusceptibility,
  fetchActivity,
  fetchCalendar,
  fetchEnvConditions,
  fetchHotspots,
  fetchMetadata,
  isAbort,
  monthRange,
  pad2,
  probeBackend,
  type BackendState,
} from "../api/client";
import type { DayPoint, EnvConditions, Hotspot, Metadata, MonthCell, Sensor } from "../api/types";
import { SENSORS } from "../api/types";
import { FIXTURE_LAST_MONTH, FIXTURE_LAST_YEAR } from "../lib/fixtures";
import { PERU_CENTER, ringCentroid, type LatLon } from "../lib/geo";
import { simulateSpread, type SpreadResult } from "../lib/spread";

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

interface Props {
  tab: ToolTab;
  onBackend: (s: BackendState) => void;
}

export function MapTool({ tab, onBackend }: Props) {
  /* ------------------------------------------------------------- estado -- */
  const [year, setYear] = useState(FIXTURE_LAST_YEAR);
  const [month, setMonth] = useState(FIXTURE_LAST_MONTH);
  /** Día seleccionado, `YYYY-MM-DD`. La API es diaria por defecto (v1.2 §4). */
  const [day, setDay] = useState(15);
  /** Qué pinta el mapa: el día elegido o el mes completo. */
  const [granularity, setGranularity] = useState<"day" | "month">("day");
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [sensors, setSensors] = useState<Sensor[]>([...SENSORS]);
  const [calendarSensor, setCalendarSensor] = useState<Sensor>("VIIRS_SNPP");
  const [includeLow, setIncludeLow] = useState(false);
  const [showHotspots, setShowHotspots] = useState(true);
  const [showCalendar, setShowCalendar] = useState(true);
  const [baseLayer, setBaseLayer] = useState<"dark" | "relief" | "satellite">("dark");

  const [ring, setRing] = useState<LatLon[] | null>(null);
  const [ignition, setIgnition] = useState<LatLon | null>(null);
  const [mode, setMode] = useState<DrawMode>("pan");

  /** Un cajón abierto a la vez por lado. Con los dos cerrados manda el mapa. */
  const [leftOpen, setLeftOpen] = useState<string | null>(null);
  const [rightOpen, setRightOpen] = useState<string | null>(null);

  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [daily, setDaily] = useState<DayPoint[]>([]);
  const [calendars, setCalendars] = useState<Partial<Record<Sensor, MonthCell[]>>>({});
  const [env, setEnv] = useState<EnvConditions | null>(null);
  const [origin, setOrigin] = useState<"api" | "fixture">("fixture");

  const [spreadParams, setSpreadParams] = useState<SpreadParams>({
    windSpeedMs: 4.5,
    windDirDeg: 135,
    fuelMoisturePct: 9,
    vegetationPct: 72,
    slopeMeanDeg: 8,
    horizonHours: 12,
  });
  const [spread, setSpread] = useState<SpreadResult | null>(null);
  const [spreadRunning, setSpreadRunning] = useState(false);
  const [spreadTime, setSpreadTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [envApplied, setEnvApplied] = useState(false);

  // Al cambiar de pestaña, el cajón derecho ya no corresponde.
  useEffect(() => setRightOpen(null), [tab]);

  /* ----------------------------------------------------- sondeo backend -- */
  useEffect(() => {
    let alive = true;
    probeBackend().then((s) => alive && onBackend(s));
    const id = setInterval(() => probeBackend().then((s) => alive && onBackend(s)), 120_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [onBackend]);

  /* -------------------------------------------------------- metadatos ---- */
  useEffect(() => {
    const ctrl = new AbortController();
    fetchMetadata(ctrl.signal)
      .then((r) => setMetadata(r.data))
      .catch((e) => {
        if (!isAbort(e)) setMetadata(null);
      });
    return () => ctrl.abort();
  }, []);

  /* --------------------------------------------------------- hotspots ---- */
  const period = `${year}-${pad2(month)}`;
  const monthSpan = useMemo(() => monthRange(year, month), [year, month]);
  const dateIso = useMemo(() => {
    const maxDay = Number(monthSpan.to.slice(8));
    return `${period}-${pad2(Math.min(day, maxDay))}`;
  }, [period, day, monthSpan.to]);

  const span = granularity === "day" ? { from: dateIso, to: dateIso } : monthSpan;

  useEffect(() => {
    const ctrl = new AbortController();
    fetchHotspots(
      { sensors, from: span.from, to: span.to, ring, includeLowConfidence: includeLow },
      ctrl.signal
    )
      .then((r) => {
        setHotspots(r.data);
        setOrigin(r.origin);
      })
      .catch((e) => {
        // Una petición cancelada no es un error (v1.2 §5, regla 2).
        if (!isAbort(e)) setHotspots([]);
      });
    return () => ctrl.abort();
  }, [sensors, span.from, span.to, ring, includeLow]);

  /* -------------------------------------------------------- calendarios -- */
  useEffect(() => {
    let alive = true;
    Promise.all(SENSORS.map((s) => fetchCalendar({ sensor: s, ring }))).then((results) => {
      if (!alive) return;
      const next: Partial<Record<Sensor, MonthCell[]>> = {};
      SENSORS.forEach((s, i) => {
        next[s] = results[i].data;
      });
      setCalendars(next);
    });
    return () => {
      alive = false;
    };
  }, [ring]);

  /* ---------------------------------------------------------- ambiente --- */
  const center = useMemo<LatLon>(() => (ring ? ringCentroid(ring) : PERU_CENTER), [ring]);

  useEffect(() => {
    let alive = true;
    fetchEnvConditions(center, year, month).then((r) => {
      if (!alive) return;
      setEnv(r.data);
      setEnvApplied(false);
    });
    return () => {
      alive = false;
    };
  }, [center, year, month]);

  /* --------------------------------------------------------- derivados --- */
  const calendar = calendars[calendarSensor] ?? [];
  const cell = useMemo(
    () => calendar.find((c) => c.year === year && c.month === month),
    [calendar, year, month]
  );

  const comparison = useMemo(() => {
    const per: Partial<Record<Sensor, MonthCell | undefined>> = {};
    for (const s of SENSORS) {
      per[s] = (calendars[s] ?? []).find((c) => c.year === year && c.month === month);
    }
    return deriveComparison(per, `${year}-${String(month).padStart(2, "0")}`);
  }, [calendars, year, month]);

  const thermalElevated = useMemo(
    () => Object.values(comparison.sensors).some((d) => d?.signal_status === "elevated"),
    [comparison]
  );

  const susceptibility = useMemo(
    () => deriveSusceptibility(env, thermalElevated),
    [env, thermalElevated]
  );



  const countsBySensor = useMemo(() => {
    const out: Record<string, number> = {};
    for (const h of hotspots) out[h.sensor] = (out[h.sensor] ?? 0) + 1;
    return out;
  }, [hotspots]);

  const areaLabel = ring ? "Área dibujada" : "Perú";
  const periodLabel = `${MONTHS_ES[month - 1]} ${year}`;

  /* ------------------------------------------- serie diaria del mes ------ */
  // Siempre el mes completo: alimenta el gráfico diario y el selector de día.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const month$ = await fetchHotspots(
        {
          sensors: [calendarSensor],
          from: monthSpan.from,
          to: monthSpan.to,
          ring,
          includeLowConfidence: true,
        },
        ctrl.signal
      );
      const r = await fetchActivity(
        {
          type: "province",
          id: ring ? "aoi" : "peru",
          from: monthSpan.from,
          to: monthSpan.to,
          sensor: calendarSensor,
          localHotspots: month$.data,
          center,
          coverageHint: cell?.observation_coverage ?? 0.7,
        },
        ctrl.signal
      );
      setDaily(r.data);
    })().catch((e) => {
      if (!isAbort(e)) setDaily([]);
    });
    return () => ctrl.abort();
  }, [calendarSensor, monthSpan.from, monthSpan.to, ring, center, cell?.observation_coverage]);

  /** Fila diaria del día seleccionado: contexto ambiental de la ficha. */
  const dayRow = useMemo(() => daily.find((d) => d.date === dateIso) ?? null, [daily, dateIso]);

  /* -------------------------------------------------------- simulacion --- */
  const runSpread = useCallback(() => {
    if (!ring || !ignition) return;
    setSpreadRunning(true);
    setPlaying(false);
    requestAnimationFrame(() => {
      try {
        const r = simulateSpread({ ring, ignition, ...spreadParams });
        setSpread(r);
        setSpreadTime(spreadParams.horizonHours);
        setPlaying(true);
        setRightOpen("resultado");
      } finally {
        setSpreadRunning(false);
      }
    });
  }, [ring, ignition, spreadParams]);

  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !spread) return;
    let last = performance.now();
    if (spreadTime >= spreadParams.horizonHours) setSpreadTime(0);
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setSpreadTime((t) => {
        const next = t + dt * (1 / 0.42);
        if (next >= spreadParams.horizonHours) {
          setPlaying(false);
          return spreadParams.horizonHours;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, spread, spreadParams.horizonHours]);

  /**
   * Toma el viento, la vegetación y la pendiente del día seleccionado.
   * Son las mismas variables de Fase 1 que la arquitectura v1.2 §12.1 manda
   * reutilizar en la proyección de Fase 2.
   */
  const applyEnvToSpread = useCallback(() => {
    if (!env) return;
    setSpreadParams((p) => ({
      ...p,
      windSpeedMs: dayRow?.wind_speed_10m_ms ?? env.wind_speed_10m_ms ?? p.windSpeedMs,
      windDirDeg: dayRow?.wind_dir_deg ?? env.wind_dir_deg ?? p.windDirDeg,
      vegetationPct: env.vegetation_area_pct ?? p.vegetationPct,
      slopeMeanDeg: env.slope_mean_deg ?? p.slopeMeanDeg,
      fuelMoisturePct: Math.max(
        3,
        Math.min(28, Math.round((dayRow?.relative_humidity_2m_pct ?? env.relative_humidity_2m_pct ?? 50) * 0.28))
      ),
    }));
    setEnvApplied(true);
  }, [env, dayRow]);

  const visibleSpread = tab === "simulacion" ? spread : null;
  const rightItems = tab === "calendario" ? ANALYSIS_ITEMS : SPREAD_ITEMS;

  const leftItems = LEFT_ITEMS.map((it) =>
    it.id === "sensores" ? { ...it, badge: String(sensors.length) } : it
  );

  return (
    <>
      <div
        className="tool"
        data-left={leftOpen ? "open" : "closed"}
        data-right={rightOpen ? "open" : "closed"}
      >
        <DockBar items={leftItems} open={leftOpen} onOpen={setLeftOpen} side="left" />

        <div className="dock dock--left">
          {leftOpen && (
            <ControlRail
              section={leftOpen}
              onClose={() => setLeftOpen(null)}
              year={year}
              month={month}
              onPeriod={(y, m) => {
                setYear(y);
                setMonth(m);
              }}
              day={day}
              onDay={setDay}
              dateIso={dateIso}
              granularity={granularity}
              onGranularity={setGranularity}
              metadata={metadata}
              daily={daily}
              territoryId={ring ? "aoi" : "peru"}
              sensors={sensors}
              onSensors={setSensors}
              calendarSensor={calendarSensor}
              includeLow={includeLow}
              onIncludeLow={setIncludeLow}
              showHotspots={showHotspots}
              onShowHotspots={setShowHotspots}
              showCalendar={showCalendar}
              onShowCalendar={setShowCalendar}
              baseLayer={baseLayer}
              onBaseLayer={setBaseLayer}
              ring={ring}
              onRing={setRing}
              hotspots={hotspots}
              calendar={calendar}
              origin={origin}
              countsBySensor={countsBySensor}
            />
          )}
        </div>

        <main className="center">
          <MapStage
            mode={mode}
            onModeChange={setMode}
            ring={ring}
            onRingChange={setRing}
            ignition={ignition}
            onIgnitionChange={setIgnition}
            hotspots={hotspots}
            showHotspots={showHotspots}
            spread={visibleSpread}
            spreadTime={spreadTime}
            spreadHorizon={spreadParams.horizonHours}
            baseLayer={baseLayer}
            windDirDeg={dayRow?.wind_dir_deg ?? null}
            windSpeedMs={dayRow?.wind_speed_10m_ms ?? null}
            showWind={tab === "simulacion"}
            relayoutKey={`${leftOpen ?? ""}|${rightOpen ?? ""}|${showCalendar}`}
          />

          {showCalendar && (
            <CalendarStrip
              calendar={calendar}
              sensor={calendarSensor}
              onSensor={setCalendarSensor}
              year={year}
              month={month}
              onPick={(y, m) => {
                setYear(y);
                setMonth(m);
              }}
              daily={daily}
              areaLabel={areaLabel}
              onHide={() => setShowCalendar(false)}
              selectedDate={dateIso}
              onPickDay={(d) => {
                setDay(d);
                setGranularity("day");
              }}
            />
          )}
        </main>

        <div className="dock dock--right">
          {rightOpen && tab === "calendario" && (
            <AnalysisRail
              section={rightOpen}
              onClose={() => setRightOpen(null)}
              cell={cell}
              comparison={comparison}
              susceptibility={susceptibility}
              env={env}
              dayRow={dayRow}
              dateIso={dateIso}
              areaLabel={areaLabel}
              periodLabel={periodLabel}
            />
          )}
          {rightOpen && tab === "simulacion" && (
            <SpreadRail
              section={rightOpen}
              onClose={() => setRightOpen(null)}
              params={spreadParams}
              onParams={(p) => {
                setSpreadParams(p);
                setEnvApplied(false);
              }}
              ring={ring}
              ignition={ignition}
              onPickIgnition={() => setMode("ignition")}
              result={spread}
              running={spreadRunning}
              time={spreadTime}
              onTime={(t) => {
                setPlaying(false);
                setSpreadTime(t);
              }}
              onRun={runSpread}
              onPlayPause={() => setPlaying((v) => !v)}
              playing={playing}
              envApplied={envApplied}
              onApplyEnv={applyEnvToSpread}
            />
          )}
        </div>

        <DockBar items={rightItems} open={rightOpen} onOpen={setRightOpen} side="right" />
      </div>

      <footer className="status">
        <span className="status__prompt">root@mchanaq ~ %</span>
        <span>
          <b>{granularity === "day" ? "día" : "mes"}</b>{" "}
          {granularity === "day" ? dateIso : periodLabel}
        </span>
        <span><b>área</b> {areaLabel}</span>
        <span><b>focos</b> {hotspots.length.toLocaleString("es-PE")}</span>
        <span><b>sensores</b> {sensors.length}/3</span>
        <span className="status__spacer" />
        {origin === "fixture" && (
          <span className="chip chip--warn">Datos de muestra · no son observaciones reales</span>
        )}
        <span className="status__src">MODIS MOD14A1 · MYD14A1 · VIIRS VNP14A1</span>
      </footer>
    </>
  );
}
