/**
 * generate-schedule.ts
 * Generates data/horarios.csv for all 58 cinemas across the next N days.
 *
 * Usage:  npm run generate:schedule
 *         npm run generate:schedule -- --days 14
 */

import { writeFileSync } from "fs";
import path from "path";

// ─── Config ────────────────────────────────────────────────────────────────
const daysArgIdx = process.argv.indexOf("--days");
const DAYS_AHEAD = daysArgIdx !== -1 ? parseInt(process.argv[daysArgIdx + 1] ?? "8") : 8;
const OUT = path.join(process.cwd(), "data", "horarios.csv");

// ─── Date helpers ──────────────────────────────────────────────────────────
function dateStr(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}
function dow(ds: string): number { // 0=Sun … 6=Sat
  return new Date(ds + "T12:00:00").getDay();
}
function isWeekend(ds: string): boolean { return [5, 6, 0].includes(dow(ds)); }

// ─── Types ─────────────────────────────────────────────────────────────────
type Fmt  = "2D" | "3D" | "IMAX" | "4DX" | "XD" | "DBOX";
type Lang = "cas" | "sub" | "vos";

interface Slot { time: string; fmt: Fmt; lang: Lang }
interface MovieProg {
  title: string;
  weekday: Slot[];
  weekend: Slot[];
}
interface Cinema {
  name: string;
  url: string;
  movies: MovieProg[];
}

// ─── Helper to build slots quickly ────────────────────────────────────────
const s = (time: string, fmt: Fmt, lang: Lang): Slot => ({ time, fmt, lang });

// ─── MOVIE TEMPLATES ───────────────────────────────────────────────────────
// Each MovieProg is a reusable template; cinemas pick from these.

const PFM = (premiumFmt: Fmt = "2D"): MovieProg => ({
  title: "Proyecto Fin del Mundo",
  weekday: [
    s("13:30", "2D",       "cas"),
    s("17:00", premiumFmt, "sub"),
    s("20:30", "2D",       "sub"),
  ],
  weekend: [
    s("13:00", "2D",       "cas"),
    s("16:30", premiumFmt, "sub"),
    s("20:00", "2D",       "sub"),
    s("22:30", "2D",       "sub"),
  ],
});

const HOPPERS = (has3d = false): MovieProg => ({
  title: "Hoppers: Operación Castor",
  weekday: [
    s("11:30", "2D", "cas"),
    s("15:00", has3d ? "3D" : "2D", "cas"),
  ],
  weekend: [
    s("11:00", "2D", "cas"),
    s("13:30", "2D", "cas"),
    s("16:00", has3d ? "3D" : "2D", "cas"),
  ],
});

const SCREAM7: MovieProg = {
  title: "Scream 7",
  weekday: [s("21:30", "2D", "sub")],
  weekend: [s("21:00", "2D", "sub"), s("23:00", "2D", "sub")],
};

const BODA2 = (fmt: Fmt = "2D"): MovieProg => ({
  title: "Boda Sangrienta 2",
  weekday: [s("18:30", fmt, "sub")],
  weekend: [s("17:30", fmt, "sub"), s("20:30", "2D", "sub")],
});

const ZOOTOPIA: MovieProg = {
  title: "Zootopia 2",
  weekday: [s("11:00", "2D", "cas")],
  weekend: [s("10:30", "2D", "cas"), s("13:00", "2D", "cas")],
};

const FRANKENSTEIN: MovieProg = {
  title: "Frankenstein",
  weekday: [s("20:30", "2D", "sub")],
  weekend: [s("18:30", "2D", "sub"), s("21:00", "2D", "sub")],
};

const CUMBRES: MovieProg = {
  title: "Cumbres Borrascosas",
  weekday: [s("15:45", "2D", "sub")],
  weekend: [s("15:00", "2D", "sub"), s("18:00", "2D", "sub")],
};

const NUREMBERG: MovieProg = {
  title: "Nuremberg",
  weekday: [s("19:15", "2D", "sub")],
  weekend: [s("17:00", "2D", "sub"), s("20:00", "2D", "sub")],
};

const NOVIA = (fmt: Fmt = "2D"): MovieProg => ({
  title: "La Novia!",
  weekday: [s("19:00", fmt, "sub")],
  weekend: [s("18:30", fmt, "sub"), s("21:15", "2D", "sub")],
});

const TURBULENCIA: MovieProg = {
  title: "Turbulencia: Pánico en el aire",
  weekday: [s("18:00", "2D", "cas")],
  weekend: [s("16:30", "2D", "cas"), s("19:30", "2D", "cas")],
};

const IRON_LUNG: MovieProg = {
  title: "Iron Lung",
  weekday: [s("19:30", "2D", "sub")],
  weekend: [s("18:00", "2D", "sub"), s("21:00", "2D", "sub")],
};

const NO_TE_OLVIDARE: MovieProg = {
  title: "No te olvidaré",
  weekday: [s("16:30", "2D", "cas")],
  weekend: [s("15:30", "2D", "cas"), s("18:30", "2D", "cas")],
};

const TE_VAN: MovieProg = {
  title: "Te van a matar",
  weekday: [s("19:45", "2D", "cas")],
  weekend: [s("18:30", "2D", "cas"), s("21:00", "2D", "cas")],
};

// Argentine / Arthouse
const PARQUE_LEZAMA: MovieProg = {
  title: "Parque Lezama",
  weekday: [s("16:30", "2D", "cas"), s("19:00", "2D", "cas")],
  weekend: [s("15:00", "2D", "cas"), s("17:30", "2D", "cas"), s("20:00", "2D", "cas")],
};

const SOY_TU_MENSAJE: MovieProg = {
  title: "Soy tu mensaje",
  weekday: [s("18:30", "2D", "cas")],
  weekend: [s("17:00", "2D", "cas"), s("20:00", "2D", "cas")],
};

const CARTAS_300: MovieProg = {
  title: "300 cartas",
  weekday: [s("20:00", "2D", "cas")],
  weekend: [s("16:30", "2D", "cas"), s("19:30", "2D", "cas")],
};

const NOSFERATU: MovieProg = {
  title: "Nosferatu",
  weekday: [s("22:00", "2D", "sub")],
  weekend: [s("21:00", "2D", "sub"), s("23:30", "2D", "sub")],
};

// ─── CINEMA DEFINITIONS ────────────────────────────────────────────────────
const CMK  = "https://www.cinemark.com.ar";
const CPOL = "https://www.cinepolis.com.ar";
const SHW  = "https://www.todoshowcase.com";
const ATL  = "https://www.atlascines.com";
const CMC  = "https://www.cinemacenter.com.ar";

// Standard Cinemark/Hoyts block (no IMAX, no special formats)
const cmkStandard = (name: string, extra: MovieProg[] = []): Cinema => ({
  name, url: CMK,
  movies: [PFM(), HOPPERS(true), SCREAM7, BODA2(), ZOOTOPIA, ...extra],
});
const cmkImax = (name: string, extra: MovieProg[] = []): Cinema => ({
  name, url: CMK,
  movies: [PFM("IMAX"), HOPPERS(true), SCREAM7, BODA2(), ZOOTOPIA, ...extra],
});
const cmk4dx = (name: string, extra: MovieProg[] = []): Cinema => ({
  name, url: CMK,
  movies: [PFM("IMAX"), HOPPERS(true), SCREAM7, BODA2("4DX"), ZOOTOPIA, ...extra],
});

const cpolStandard = (name: string, extra: MovieProg[] = []): Cinema => ({
  name, url: CPOL,
  movies: [PFM(), HOPPERS(), SCREAM7, BODA2(), CUMBRES, ...extra],
});
const cpolXd = (name: string, extra: MovieProg[] = []): Cinema => ({
  name, url: CPOL,
  movies: [PFM("XD"), HOPPERS(), SCREAM7, BODA2(), CUMBRES, ...extra],
});

const shwStandard = (name: string, extra: MovieProg[] = []): Cinema => ({
  name, url: SHW,
  movies: [PFM(), HOPPERS(true), SCREAM7, BODA2(), NUREMBERG, ...extra],
});
const shwImax = (name: string, extra: MovieProg[] = []): Cinema => ({
  name, url: SHW,
  movies: [PFM("IMAX"), HOPPERS(true), SCREAM7, BODA2(), NUREMBERG, ...extra],
});

const atlStandard = (name: string, extra: MovieProg[] = []): Cinema => ({
  name, url: ATL,
  movies: [PFM(), HOPPERS(), BODA2(), CUMBRES, NO_TE_OLVIDARE, ...extra],
});

const cmcStandard = (name: string, extra: MovieProg[] = []): Cinema => ({
  name, url: CMC,
  movies: [PFM(), HOPPERS(), SCREAM7, BODA2(), TURBULENCIA, TE_VAN, ...extra],
});

// ─── ALL 58 CINEMAS ────────────────────────────────────────────────────────
const ALL_CINEMAS: Cinema[] = [
  // ── CINEMARK / HOYTS ────────────────────────────────────────────────────
  cmkImax("Cinemark Palermo",       [FRANKENSTEIN, CUMBRES]),
  cmkImax("Hoyts Abasto",           [FRANKENSTEIN, NUREMBERG]),
  cmkImax("Cinemark Puerto Madero", [FRANKENSTEIN, CUMBRES]),
  cmkStandard("Hoyts Dot Baires",   [NOVIA()]),
  cmkStandard("Cinemark Caballito", [NOVIA(), TURBULENCIA]),
  cmk4dx("Hoyts Unicenter",         [FRANKENSTEIN, CUMBRES]),
  cmkStandard("Hoyts Morón",        [NOVIA(), TE_VAN]),
  cmkStandard("Hoyts Temperley",    [TURBULENCIA, TE_VAN]),
  cmkStandard("Cinemark Avellaneda",[FRANKENSTEIN, NOVIA()]),
  cmkStandard("Hoyts Moreno",       [TE_VAN]),
  cmkStandard("Cinemark San Justo", [NOVIA(), TURBULENCIA]),
  cmkStandard("Hoyts Quilmes",      [FRANKENSTEIN, TE_VAN]),
  cmkImax("Cinemark Soleil",        [CUMBRES, NUREMBERG]),
  cmkStandard("Hoyts San Miguel",   [NOVIA()]),
  cmkImax("Cinemark Córdoba",       [FRANKENSTEIN, NUREMBERG, NOVIA()]),
  cmkImax("Cinemark Mendoza",       [FRANKENSTEIN, NOVIA()]),
  cmkStandard("Cinemark Salta",     [TURBULENCIA, NOVIA()]),
  cmkImax("Cinemark Rosario",       [FRANKENSTEIN, NUREMBERG]),
  cmkStandard("Hoyts Santa Fe",     [TURBULENCIA, NOVIA()]),
  cmkStandard("Cinemark Neuquén",   [TURBULENCIA, FRANKENSTEIN]),

  // ── CINÉPOLIS ────────────────────────────────────────────────────────────
  cpolXd("Cinépolis Recoleta",      [NUREMBERG, NO_TE_OLVIDARE]),
  cpolStandard("Cinépolis Avellaneda", [FRANKENSTEIN]),
  cpolStandard("Cinépolis Pilar",   [NOVIA(), TURBULENCIA]),
  cpolXd("Cinépolis Rosario",       [NUREMBERG, FRANKENSTEIN]),
  cpolStandard("Cinépolis Neuquén", [TURBULENCIA]),
  cpolStandard("Cinépolis Mendoza", [FRANKENSTEIN, NOVIA()]),
  cpolStandard("Cinépolis Merlo",   [TE_VAN]),
  cpolStandard("Cinépolis San Antonio de Padua", [NOVIA(), TURBULENCIA]),

  // ── SHOWCASE ─────────────────────────────────────────────────────────────
  shwImax("Showcase Belgrano",      [CUMBRES, IRON_LUNG]),
  shwStandard("Showcase Norte (Norcenter)", [CUMBRES]),
  shwStandard("Showcase Haedo",     [TURBULENCIA, TE_VAN]),
  shwStandard("Showcase Quilmes",   [FRANKENSTEIN, NOVIA()]),
  shwImax("Showcase Rosario",       [FRANKENSTEIN]),
  shwStandard("Showcase Córdoba",   [FRANKENSTEIN, TURBULENCIA]),

  // ── ATLAS ────────────────────────────────────────────────────────────────
  atlStandard("Atlas Flores",       [NUREMBERG]),
  atlStandard("Atlas Caballito",    [NUREMBERG, IRON_LUNG]),
  atlStandard("Atlas Alcorta",      [NUREMBERG, FRANKENSTEIN]),
  atlStandard("Atlas Nordelta",     [TURBULENCIA]),
  atlStandard("Atlas Alto Avellaneda", [FRANKENSTEIN, TE_VAN]),

  // ── CINEMACENTER ─────────────────────────────────────────────────────────
  cmcStandard("Cinemacenter Bahía Blanca",  [FRANKENSTEIN]),
  cmcStandard("Cinemacenter Mar del Plata", [FRANKENSTEIN, NUREMBERG]),
  cmcStandard("Cinemacenter Tandil",        [NOVIA()]),
  cmcStandard("Cinemacenter Tucumán",       [NOVIA(), FRANKENSTEIN]),
  cmcStandard("Cinemacenter Mendoza",       [FRANKENSTEIN, NUREMBERG]),
  cmcStandard("Cinemacenter Corrientes",    [NOVIA()]),
  cmcStandard("Cinemacenter La Rioja",      [NOVIA()]),
  cmcStandard("Cinemacenter San Juan",      [NOVIA()]),

  // ── INDEPENDIENTES ───────────────────────────────────────────────────────
  // MALBA Cine, Cine York, Centro Cultural Munro, CineArte Cacodelphia
  // are managed by their own scrapers — do NOT include here.
  {
    name: "Cine Lorca", url: "https://cinelorca.wixsite.com/cine-lorca",
    movies: [CUMBRES, FRANKENSTEIN, PARQUE_LEZAMA],
  },
  {
    name: "Cine Gaumont", url: "https://www.cinegaumont.ar",
    movies: [PARQUE_LEZAMA, SOY_TU_MENSAJE, CARTAS_300, NOSFERATU],
  },
  {
    name: "Cinema Devoto", url: "https://cinemadevoto.com.ar",
    movies: [PFM(), HOPPERS(), SCREAM7, BODA2(), ZOOTOPIA, PARQUE_LEZAMA, CUMBRES],
  },
  {
    name: "Victorshow Cinemas", url: "http://www.victorshowcinemas.com.ar",
    movies: [PFM(), HOPPERS(), SCREAM7, BODA2(), TURBULENCIA, NUREMBERG],
  },
  {
    name: "Cinerama", url: "https://www.cinerama.com.ar",
    movies: [PFM(), HOPPERS(true), SCREAM7, BODA2(), ZOOTOPIA, NUREMBERG],
  },
  {
    name: "Gran Rex", url: "https://www.cinesgranrex.com.ar",
    movies: [PFM(), HOPPERS(true), SCREAM7, BODA2("4DX"), ZOOTOPIA, NUREMBERG, FRANKENSTEIN],
  },
  {
    name: "Cines Dinosaurio Mall", url: "https://www.dinosauriomall.com.ar",
    movies: [PFM(), HOPPERS(true), BODA2(), NUREMBERG, TE_VAN, ZOOTOPIA, IRON_LUNG],
  },
  {
    name: "Nuevo Monumental", url: "http://www.nuevomonumental.com",
    movies: [PFM(), HOPPERS(), SCREAM7, BODA2(), NUREMBERG, TE_VAN, PARQUE_LEZAMA],
  },
  {
    name: "Cines del Centro", url: "https://www.cinesdelcentro.com.ar",
    movies: [PFM(), HOPPERS(), SCREAM7, BODA2(), NO_TE_OLVIDARE, PARQUE_LEZAMA],
  },
  {
    name: "El Cairo Cine Público", url: "http://www.elcairocinepublico.gob.ar",
    movies: [PARQUE_LEZAMA, SOY_TU_MENSAJE, CARTAS_300, NOSFERATU],
  },
];

// Cinemas that only screen Thu-Sun (arthouse pattern)
const ARTHOUSE_THU_SUN = new Set(["El Cairo Cine Público"]);
// Cinemas that screen Wed-Sun + Mon
const INDIE_PATTERN = new Set(["Cine Lorca", "Cine Gaumont"]);

function shouldScreen(cinemaName: string, ds: string): boolean {
  const d = dow(ds);
  if (ARTHOUSE_THU_SUN.has(cinemaName)) return [4, 5, 6, 0].includes(d); // Thu-Sun
  if (INDIE_PATTERN.has(cinemaName)) return [3, 4, 5, 6, 0, 2].includes(d); // Wed-Sun + Mon
  return true;
}

// ─── CSV GENERATION ────────────────────────────────────────────────────────
function generate(): { csv: string; rowCount: number } {
  const lines: string[] = [
    "# cartelera.ar — Planilla de horarios",
    "# Separador: punto y coma (;)",
    "# Columnas: cine;pelicula;fecha;hora;formato;idioma;url_compra",
    "#",
    "# Formatos válidos : 2D | 3D | IMAX | 4DX | XD | DBOX",
    "# Idiomas válidos  : cas | sub | vos",
    "# Fecha            : YYYY-MM-DD  (ej: 2026-03-30)",
    "# Hora             : HH:MM       (ej: 14:30)",
    "#",
    "# Los horarios de las fechas incluidas en este archivo se reemplazan",
    "# completamente al importar. Las otras fechas no se tocan.",
    "# ─────────────────────────────────────────────────────────────────────",
    "",
    "cine;pelicula;fecha;hora;formato;idioma;url_compra",
  ];

  const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => dateStr(i));
  const dateIsWeekend = new Map(dates.map(ds => [ds, isWeekend(ds)]));
  let rowCount = 0;

  for (const cinema of ALL_CINEMAS) {
    lines.push("");
    lines.push(`# ── ${cinema.name.toUpperCase()} ${"─".repeat(Math.max(0, 50 - cinema.name.length))}`);

    for (const ds of dates) {
      if (!shouldScreen(cinema.name, ds)) continue;
      const slots_list = dateIsWeekend.get(ds) ? "weekend" : "weekday";

      for (const movie of cinema.movies) {
        for (const slot of movie[slots_list]) {
          lines.push(
            `${cinema.name};${movie.title};${ds};${slot.time};${slot.fmt};${slot.lang};${cinema.url}`
          );
          rowCount++;
        }
      }
    }
  }

  lines.push("");
  return { csv: lines.join("\n"), rowCount };
}

const { csv, rowCount } = generate();
writeFileSync(OUT, csv, "utf-8");
console.log(`✓ Generado ${OUT}`);
console.log(`  ${ALL_CINEMAS.length} cines × ~${DAYS_AHEAD} días = ${rowCount} horarios`);
