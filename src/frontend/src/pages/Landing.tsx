import { useEffect, useRef, useState } from "react";
import { Globe } from "../components/Globe";
import { TEAM, initials, type Member } from "../data/team";

interface Props {
  onOpenMap: () => void;
}

const BLOCKS = [
  { id: "inicio", label: "Inicio" },
  { id: "proyecto", label: "El proyecto" },
  { id: "equipo", label: "El equipo" },
];

export function Landing({ onOpenMap }: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  /**
   * Un solo observador hace dos cosas: marcar el bloque activo en la
   * navegación lateral y disparar la entrada escalonada de su contenido.
   * Los elementos que entran llevan `data-reveal`; al verse reciben `is-in`,
   * y el CSS se encarga de la transición.
   */
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = BLOCKS.findIndex((b) => b.id === e.target.id);
          if (e.isIntersecting) {
            if (i >= 0) setActive(i);
            e.target.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("is-in"));
          }
        }
      },
      { root, threshold: 0.35 }
    );

    BLOCKS.forEach((b) => {
      const el = document.getElementById(b.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const goTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="landing" ref={scrollerRef}>
      <div className="landing__bg">
        <Globe anchorX={0.27} />
      </div>

      <nav className="dots" aria-label="Secciones">
        {BLOCKS.map((b, i) => (
          <button
            key={b.id}
            className="dots__item"
            aria-current={active === i}
            onClick={() => goTo(b.id)}
          >
            <span className="dots__label">{b.label}</span>
            <span className="dots__mark" />
          </button>
        ))}
      </nav>

      {/* ============================================================ 1 === */}
      <section className="block" id="inicio">
        <div className="wrap wrap--right">
          <div className="col">
            <p className="eyebrow" data-reveal style={{ "--d": "0ms" } as React.CSSProperties}>
              NASA Space Apps Challenge 2026 · Los McLovin
            </p>
            <h1 className="hero__title" data-reveal style={{ "--d": "70ms" } as React.CSSProperties}>
              El fuego deja huella.
              <span className="hero__accent">Nosotros la ordenamos.</span>
            </h1>
            <p className="hero__lead" data-reveal style={{ "--d": "150ms" } as React.CSSProperties}>
              Dos décadas de focos térmicos repartidos entre satélites que no se pueden comparar
              directamente. McHanaq los reúne en un calendario territorial del Perú y estima cómo
              podría avanzar el fuego sobre el terreno.
            </p>
            <div className="hero__cta" data-reveal style={{ "--d": "230ms" } as React.CSSProperties}>
              <button className="btn btn--primary btn--lg" onClick={onOpenMap}>
                Abrir el mapa →
              </button>
              <button className="btn btn--lg" onClick={() => goTo("proyecto")}>
                El proyecto
              </button>
            </div>
            <dl className="facts" data-reveal style={{ "--d": "310ms" } as React.CSSProperties}>
              <div>
                <dt>Serie</dt>
                <dd>2000 — hoy</dd>
              </div>
              <div>
                <dt>Sensores</dt>
                <dd>MODIS ×2 · VIIRS</dd>
              </div>
              <div>
                <dt>Escala</dt>
                <dd>Provincias y cuencas</dd>
              </div>
            </dl>
          </div>
        </div>
        <button className="scroll-cue" onClick={() => goTo("proyecto")} aria-label="Bajar">
          <span />
        </button>
      </section>

      {/* ============================================================ 2 === */}
      <section className="block" id="proyecto">
        <div className="wrap wrap--right">
          <div className="col">
            <p className="eyebrow" data-reveal style={{ "--d": "0ms" } as React.CSSProperties}>
              01 · El proyecto
            </p>
            <h2 className="block__title" data-reveal style={{ "--d": "70ms" } as React.CSSProperties}>
              De puntos sueltos a una historia del territorio.
            </h2>
            <p className="block__lead" data-reveal style={{ "--d": "140ms" } as React.CSSProperties}>
              Ver dónde hay focos hoy es el primer paso, no el último. McHanaq responde si lo
              observado es inusual para esta época, cuánto alcanzó a ver el satélite y si las
              fuentes coinciden; y, sobre esa base, describe qué tan favorable es el terreno a que
              un fuego se extienda.
            </p>

            <div className="goal" data-reveal style={{ "--d": "210ms" } as React.CSSProperties}>
              <span className="goal__tag">Objetivo</span>
              <p>
                Convertir observaciones históricas de MODIS y VIIRS en un calendario territorial
                comparable, con anomalías, cobertura y trazabilidad por sensor, para apoyar la
                planificación del monitoreo de incendios en el Perú.
              </p>
            </div>

            <div className="scope" data-reveal style={{ "--d": "280ms" } as React.CSSProperties}>
              <div className="scope__col scope__col--yes">
                <h3>Sí hace</h3>
                <ul>
                  <li>Calendario histórico por provincia y cuenca</li>
                  <li>Comparación entre sensores con su cobertura</li>
                  <li>Anomalías contra el mismo mes de otros años</li>
                  <li>Recorrido simulado desde una ignición hipotética</li>
                </ul>
              </div>
              <div className="scope__col scope__col--no">
                <h3>No hace</h3>
                <ul>
                  <li>Predecir dónde o cuándo se iniciará un incendio</li>
                  <li>Estimar probabilidad de ignición</li>
                  <li>Confundir un foco térmico con un incendio confirmado</li>
                  <li>Servir como sistema de alerta operativa</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ 3 === */}
      <section className="block block--team" id="equipo">
        <div className="wrap">
          <div className="team__head">
            <p className="eyebrow" data-reveal style={{ "--d": "0ms" } as React.CSSProperties}>
              02 · El equipo
            </p>
            <h2 className="block__title" data-reveal style={{ "--d": "60ms" } as React.CSSProperties}>
              Los McLovin
            </h2>
            <p
              className="block__lead block__lead--narrow"
              data-reveal
              style={{ "--d": "120ms" } as React.CSSProperties}
            >
              Cinco frentes de trabajo y una sola ruta de datos. Cada integrante es dueño de su
              carpeta y de su rama.
            </p>
          </div>

          <div className="team">
            {TEAM.map((m, i) => (
              <div
                key={m.slug}
                data-reveal
                style={{ "--d": `${180 + i * 85}ms` } as React.CSSProperties}
              >
                <MemberCard member={m} />
              </div>
            ))}
          </div>

          <footer className="landing__foot" data-reveal style={{ "--d": "640ms" } as React.CSSProperties}>
            <button className="btn btn--primary" onClick={onOpenMap}>
              Abrir el mapa →
            </button>
            <span className="muted">
              Datos: NASA LP DAAC · Copernicus ERA5-Land · SRTM · MapBiomas Perú
            </span>
          </footer>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Tarjeta de integrante.
 *
 * La foto se busca en `public/equipo/<slug>.jpg` y, si no está, en `.png`.
 * Si tampoco está, se dibuja un monograma: cada uno solo tiene que dejar su
 * archivo en la carpeta, sin tocar código.
 */
function MemberCard({ member }: { member: Member }) {
  const [attempt, setAttempt] = useState(0);
  const sources = [`./equipo/${member.slug}.jpg`, `./equipo/${member.slug}.png`];
  const src = sources[attempt];

  return (
    <article className="member">
      <div className="member__photo">
        {src ? (
          <img
            src={src}
            alt={`Fotografía de ${member.name}`}
            loading="lazy"
            onError={() => setAttempt((a) => a + 1)}
          />
        ) : (
          <span className="member__mono" aria-hidden="true">
            {initials(member.name)}
          </span>
        )}
        <span className="member__ring" aria-hidden="true" />
      </div>
      <h3 className="member__name">{member.name}</h3>
      <p className="member__role">{member.role}</p>
      <p className="member__blurb">{member.blurb}</p>
      <ul className="member__tags">
        {member.tags.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </article>
  );
}
