import { Drawer } from "./Drawer";
import type { DockItem } from "./DockBar";
import type {
  ComparisonStatus,
  DayPoint,
  EnvConditions,
  MonthCell,
  SensorComparison,
  SusceptibilityAssessment,
  SusceptibilityClass,
} from "../api/types";
import { MIN_BASELINE_YEARS, SENSORS, SENSOR_META } from "../api/types";

export const ANALYSIS_ITEMS: DockItem[] = [
  { id: "indicadores", label: "Indicadores del período", icon: "gauge" },
  { id: "multisensor", label: "Comparación multisensor", icon: "compare" },
  { id: "arbol", label: "Árbol de susceptibilidad", icon: "tree" },
];

const STATUS_LABEL: Record<ComparisonStatus, { text: string; chip: string }> = {
  concordant_elevated: { text: "Coincidente · elevada", chip: "chip chip--ember" },
  concordant_not_elevated: { text: "Coincidente · no elevada", chip: "chip chip--term" },
  discordant: { text: "Discrepante", chip: "chip chip--warn" },
  single_sensor: { text: "Fuente única", chip: "chip" },
  insufficient: { text: "Información insuficiente", chip: "chip" },
};

const SUSC_LABEL: Record<SusceptibilityClass, { text: string; chip: string }> = {
  high: { text: "Susceptibilidad alta", chip: "chip chip--ember" },
  moderate: { text: "Susceptibilidad moderada", chip: "chip chip--warn" },
  low: { text: "Susceptibilidad baja", chip: "chip chip--term" },
  partial: { text: "Evaluación parcial", chip: "chip" },
  not_evaluable: { text: "No evaluable", chip: "chip" },
};

const NODE_TEXT: Record<string, string> = {
  "N0:pass": "Compuerta de calidad superada",
  "N0:fail": "Sin datos suficientes para clasificar",
  "N1:yes": "Vegetación combustible sobre el umbral",
  "N1:no": "Poca vegetación combustible",
  "N2:yes": "Señal de sequedad presente",
  "N2:no": "Sin señal de sequedad",
  "N3a:yes": "Condición atmosférica propicia",
  "N3a:no": "Sin condición atmosférica propicia",
  "N3b:yes": "Viento alto con pendiente elevada",
  "N3b:no": "Ni viento alto ni pendiente elevada",
};

interface Props {
  section: string;
  onClose: () => void;
  cell: MonthCell | undefined;
  comparison: SensorComparison;
  susceptibility: SusceptibilityAssessment;
  env: EnvConditions | null;
  /** Fila del día seleccionado. La ficha es diaria (contrato v1.2 §4.2). */
  dayRow: DayPoint | null;
  dateIso: string;
  areaLabel: string;
  periodLabel: string;
}

export function AnalysisRail(p: Props) {
  switch (p.section) {
    case "indicadores":
      return (
        <Drawer title="Indicadores" note={p.periodLabel} onClose={p.onClose}>
          <div className="metric-grid">
            <div className="metric">
              <div className="metric__label">Tasa de actividad</div>
              <div className="metric__value">
                {p.cell?.activity_rate != null ? (
                  <>
                    {(p.cell.activity_rate * 1000).toFixed(2)}
                    <span className="metric__unit">‰ píxel-día</span>
                  </>
                ) : (
                  <span style={{ fontSize: 15, color: "var(--fg-faint)" }}>No estimable</span>
                )}
              </div>
            </div>
            <div className="metric">
              <div className="metric__label">Cobertura</div>
              <div className="metric__value">
                {p.cell ? (<>{Math.round(p.cell.observation_coverage * 100)}<span className="metric__unit">%</span></>) : "—"}
              </div>
            </div>
            <div className="metric">
              <div className="metric__label">Días activos</div>
              <div className="metric__value">{p.cell?.active_days ?? "—"}</div>
            </div>
            <div className="metric">
              <div className="metric__label">Racha máxima</div>
              <div className="metric__value">
                {p.cell ? (<>{p.cell.max_consecutive_active_days}<span className="metric__unit">días</span></>) : "—"}
              </div>
            </div>
          </div>
          <div className="legend__title" style={{ marginTop: 15 }}>
            Contexto del día · {p.dateIso}
          </div>
          <dl className="kv">
            <dt>Temp. ambiente</dt>
            <dd data-null={p.dayRow?.t_amb_c == null}>
              {p.dayRow?.t_amb_c != null ? `${p.dayRow.t_amb_c} °C` : "Sin datos"}
            </dd>
            <dt>Temp. del suelo</dt>
            <dd data-null={p.dayRow?.t_suelo_c == null}>
              {p.dayRow?.t_suelo_c != null
                ? `${p.dayRow.t_suelo_c} °C`
                : p.dayRow
                ? "Nublado (>30 %)"
                : "Sin datos"}
            </dd>
            <dt>Píxeles LST válidos</dt>
            <dd data-null={p.dayRow?.lst_valid_pixel_pct == null}>
              {p.dayRow?.lst_valid_pixel_pct != null
                ? `${p.dayRow.lst_valid_pixel_pct} %`
                : "Sin datos"}
            </dd>
            <dt>Humedad relativa</dt>
            <dd data-null={p.dayRow?.relative_humidity_2m_pct == null}>
              {p.dayRow?.relative_humidity_2m_pct != null
                ? `${p.dayRow.relative_humidity_2m_pct} %`
                : "Sin datos"}
            </dd>
            <dt>Viento</dt>
            <dd data-null={p.dayRow?.wind_dir_deg == null}>
              {p.dayRow?.wind_dir_deg != null
                ? `${p.dayRow.wind_speed_10m_ms} m/s · ${Math.round(p.dayRow.wind_dir_deg)}°`
                : "Sin datos"}
            </dd>
            <dt>Altura</dt>
            <dd data-null={p.dayRow?.elevation_m == null}>
              {p.dayRow?.elevation_m != null ? `${p.dayRow.elevation_m} m` : "Sin datos"}
            </dd>
            <dt>Modelo DEM</dt>
            <dd data-null={!p.dayRow?.dem_source}>{p.dayRow?.dem_source ?? "Sin datos"}</dd>
          </dl>

          <div className="legend__title" style={{ marginTop: 15 }}>
            Anomalía mensual
          </div>
          <dl className="kv">
            <dt>Anomalía robusta</dt>
            <dd data-null={p.cell?.historical_anomaly == null}>
              {p.cell?.historical_anomaly != null ? `z = ${p.cell.historical_anomaly.toFixed(2)}` : "No estimable"}
            </dd>
            <dt>Años de línea base</dt>
            <dd data-null={!p.cell?.baseline_years}>
              {p.cell?.baseline_years
                ? `${p.cell.baseline_years} (mín. ${MIN_BASELINE_YEARS})`
                : "Historial insuficiente"}
            </dd>
          </dl>
          <p className="mono-sm" style={{ marginTop: 12 }}>
            La tasa normaliza las detecciones por observación válida. No es probabilidad de incendio
            ni superficie quemada.
          </p>
        </Drawer>
      );

    case "multisensor": {
      const st = STATUS_LABEL[p.comparison.status];
      return (
        <Drawer title="Comparación multisensor" note={p.periodLabel} onClose={p.onClose}>
          <span className={st.chip}>{st.text}</span>
          <table className="cmp" style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Sensor</th><th>Tasa ‰</th><th>z</th><th>Cob.</th></tr>
            </thead>
            <tbody>
              {SENSORS.map((s) => {
                const d = p.comparison.sensors[s];
                const elevated = d?.signal_status === "elevated";
                return (
                  <tr key={s}>
                    <td><i className="cmp__dot" style={{ background: SENSOR_META[s].color }} />{SENSOR_META[s].short}</td>
                    <td style={{ color: elevated ? "var(--ember)" : undefined }}>
                      {d?.activity_rate != null ? (d.activity_rate * 1000).toFixed(2) : "—"}
                    </td>
                    <td style={{ color: elevated ? "var(--ember)" : undefined }}>
                      {d?.historical_anomaly != null ? d.historical_anomaly.toFixed(1) : "—"}
                    </td>
                    <td>{d?.available ? `${Math.round(d.observation_coverage * 100)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="note" style={{ marginTop: 12 }}>{p.comparison.interpretation}</div>
          <p className="mono-sm" style={{ marginTop: 10 }}>
            Cada sensor se clasifica contra su propio umbral estacional antes de compararlos. Nunca
            se suman conteos entre sensores.
          </p>
        </Drawer>
      );
    }

    case "arbol": {
      const su = SUSC_LABEL[p.susceptibility.classification];
      return (
        <Drawer title="Árbol de susceptibilidad" note={p.areaLabel} onClose={p.onClose}>
          <span className={su.chip}>{su.text}</span>

          <ol className="tree" style={{ marginTop: 13 }}>
            {p.susceptibility.decision_path.map((node) => (
              <li key={node} className="tree__node">
                <code>{node}</code>
                <span>{NODE_TEXT[node] ?? node}</span>
              </li>
            ))}
          </ol>

          {p.susceptibility.modifiers.length > 0 && (
            <>
              <div className="legend__title" style={{ marginTop: 13 }}>Modificadores informativos</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {p.susceptibility.modifiers.map((m) => <span className="chip" key={m}>{m}</span>)}
              </div>
            </>
          )}

          {p.env && (
            <>
              <div className="legend__title" style={{ marginTop: 14 }}>Evidencia del período</div>
              <dl className="kv">
                <dt>Vegetación combustible</dt><dd>{p.env.vegetation_area_pct} %</dd>
                <dt>Precipitación 30 d</dt><dd>{p.env.precip_30d_mm} mm</dd>
                <dt>Humedad del suelo</dt><dd>{p.env.soil_moisture_surface?.toFixed(3) ?? "—"} m³/m³</dd>
                <dt>Viento a 10 m</dt><dd>{p.env.wind_speed_10m_ms} m/s</dd>
                <dt>Temp. ambiente</dt><dd>{p.env.t_amb_c ?? "—"} °C</dd>
                <dt>Temp. del suelo</dt>
                <dd data-null={p.env.t_suelo_c == null}>
                  {p.env.t_suelo_c != null ? `${p.env.t_suelo_c} °C` : "No estimable"}
                </dd>
                <dt>Humedad relativa</dt><dd>{p.env.relative_humidity_2m_pct} %</dd>
                <dt>Pendiente media</dt><dd>{p.env.slope_mean_deg}°</dd>
                <dt>Agua y humedales</dt><dd>{p.env.water_area_pct} %</dd>
              </dl>
            </>
          )}

          <div className="note note--warn" style={{ marginTop: 13 }}>
            <b>Índice cualitativo.</b> Describe qué tan favorables son las condiciones observadas a
            que un fuego se extienda. No estima probabilidad de ignición ni está validado contra
            incendios reales.
          </div>
        </Drawer>
      );
    }

    default:
      return null;
  }
}
