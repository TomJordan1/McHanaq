/**
 * Marca de McHanaq: globo de meridianos con dos órbitas y un satélite.
 *
 * Dibujo propio en SVG, así que es nítido a cualquier tamaño y en cualquier
 * pantalla. El fondo es transparente: se apoya sobre el negro de la página.
 */

interface Props {
  size?: number;
  /** Añade un disco negro detrás, para apoyarlo sobre fondos claros. */
  plate?: boolean;
}

export function Logo({ size = 34, plate = false }: Props) {
  return (
    <svg
      className="logo"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="McHanaq"
      fill="none"
    >
      {plate && <circle cx="32" cy="32" r="32" fill="#000" />}

      <defs>
        <linearGradient id="mcq-sea" x1="14" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#123955" />
          <stop offset="1" stopColor="#061420" />
        </linearGradient>
        <clipPath id="mcq-clip">
          <circle cx="30" cy="33" r="17" />
        </clipPath>
      </defs>

      {/* Órbita trasera */}
      <ellipse
        cx="30"
        cy="33"
        rx="27"
        ry="11"
        stroke="#3c6f8c"
        strokeWidth="1.3"
        transform="rotate(-28 30 33)"
        opacity="0.55"
      />

      {/* Cuerpo del planeta */}
      <circle cx="30" cy="33" r="17" fill="url(#mcq-sea)" />

      {/* Meridianos y paralelos */}
      <g clipPath="url(#mcq-clip)" stroke="#4fbfd8" strokeWidth="1.15" opacity="0.85">
        <circle cx="30" cy="33" r="17" fill="none" opacity="0.5" />
        <ellipse cx="30" cy="33" rx="6.5" ry="17" fill="none" />
        <ellipse cx="30" cy="33" rx="13" ry="17" fill="none" opacity="0.6" />
        <path d="M13 26.5h34M13 33h34M13 39.5h34" opacity="0.6" />
      </g>

      {/* Masa de tierra sugerida, no un continente concreto */}
      <g clipPath="url(#mcq-clip)" fill="#5fd0e4" opacity="0.72">
        <path d="M18 25c3-2 7-1 9 1s1 5-2 6-6 0-8-2-1-4 1-5Z" />
        <path d="M31 38c4-2 8 0 9 3s-2 6-5 6-6-2-6-5c0-2 1-3 2-4Z" />
        <path d="M38 22c2-1 5 0 5 2s-2 4-4 4-4-2-3-4c0-1 1-2 2-2Z" />
      </g>

      {/* Brasa: el fuego que la plataforma observa */}
      <circle cx="35.5" cy="42" r="3.4" fill="#ff5a2c" />
      <circle cx="35.5" cy="42" r="1.3" fill="#ffd27a" />

      {/* Órbita delantera */}
      <ellipse
        cx="30"
        cy="33"
        rx="27"
        ry="11"
        stroke="#8fd3e6"
        strokeWidth="1.3"
        transform="rotate(-28 30 33)"
        strokeDasharray="0 86 60 0"
        opacity="0.95"
      />

      {/* Satélite sobre la órbita */}
      <g transform="translate(50 17) rotate(-28)">
        <rect x="-3" y="-3" width="6" height="6" fill="#06121c" stroke="#cfe6f7" strokeWidth="1.2" />
        <rect x="-11" y="-2.6" width="6" height="5.2" fill="none" stroke="#cfe6f7" strokeWidth="1.1" />
        <rect x="5" y="-2.6" width="6" height="5.2" fill="none" stroke="#cfe6f7" strokeWidth="1.1" />
        <path d="M0-3v-3.5" stroke="#cfe6f7" strokeWidth="1.1" />
      </g>

      {/* Acento de marca */}
      <circle cx="30" cy="33" r="17" stroke="#d8ff33" strokeWidth="1.1" opacity="0.32" />
    </svg>
  );
}
