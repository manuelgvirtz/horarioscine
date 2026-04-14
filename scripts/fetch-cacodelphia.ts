/**
 * fetch-cacodelphia.ts
 * Scrapes showtimes from CineArte Cacodelphia via the GAF API.
 *
 * API base: https://apiv2.gaf.adro.studio
 *   GET /nowPlaying/{cinemaId}          → list of movies currently showing
 *   GET /movie/{cinemaId}/{pref}        → movie detail + full showtimes array
 *
 * Dates in `fechaHora.date` are already in America/Argentina/Buenos_Aires local time.
 *
 * Uso:
 *   npx tsx scripts/fetch-cacodelphia.ts
 */

import { db, closeDb, getCurrentDebutWeek } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";

// ── Colores ───────────────────────────────────────────────────────────
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m" };
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const err  = `${c.red}✗${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

// ── Cinema info ───────────────────────────────────────────────────────
const CINEMA = {
  name:    "CineArte Cacodelphia",
  chain:   "independiente",
  zone:    "CABA",
  city:    "Buenos Aires",
  address: "Roque Sáenz Peña 1150, Buenos Aires",
  lat:     -34.6048,
  lng:     -58.3817,
  url:     "https://cineartecacodelphia.com.ar/",
};

const GAF_CINEMA_ID = 86;
const BASE = "https://apiv2.gaf.adro.studio";
const HEADERS = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };

// ── Timezone ──────────────────────────────────────────────────────────
const TZ = "America/Argentina/Buenos_Aires";

function localToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

// ── Text helpers ──────────────────────────────────────────────────────
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function capitalize(s: string): string {
  return s.toLowerCase()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function parseLanguage(lang: string): string {
  switch (lang?.toLowerCase()) {
    case "cast": return "cas";
    case "subt": return "sub";
    case "dob":  return "dob";
    default:     return "sub";
  }
}

// ── GAF API types ─────────────────────────────────────────────────────
interface GafMovie {
  codigoPelicula: string;
  pref: string;
  nombre: string;
  Condicion: string;
  formato: string;
  lenguaje: string;
}

interface GafShowtime {
  id: string;
  fref: string;
  lenguaje: string;
  formato: string;
  fechaHora: { date: string };  // "YYYY-MM-DD HH:MM:SS.000000" in BsAs local time
  vender: string;
  mostrar: string;
  expired: boolean;
}

interface GafMovieDetail {
  movie: {
    nombre: string;
    Condicion: string;
    Duracion: string;
  };
  showtimes: GafShowtime[];
}

async function gafGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${BASE}${path}`);
  const json = await res.json() as { status: string; data: T };
  return json.data;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const from = localToday();
  const to   = addDays(from, 14);

  console.log(`\n${c.bold}CineArte Cacodelphia — Importador directo a DB${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Rango: ${c.cyan}${from}${c.reset} → ${c.cyan}${to}${c.reset}\n`);

  const scrapedAt = new Date().toISOString();

  const dbCinemas = await db.select().from(cinemas);
  const dbMovies  = await db.select().from(movies);
  const cinemaByName = new Map(dbCinemas.map(cin => [normalize(cin.name), cin]));
  const movieByTitle = new Map(dbMovies.map(mov => [normalize(mov.title), mov]));

  // ── Ensure cinema exists ──────────────────────────────────────────
  let cinema = cinemaByName.get(normalize(CINEMA.name));
  if (!cinema) {
    console.log(`  ${warn} Cine nuevo, creando: ${c.yellow}${CINEMA.name}${c.reset}`);
    const [inserted] = await db.insert(cinemas).values(CINEMA).returning();
    cinema = inserted;
    cinemaByName.set(normalize(cinema.name), cinema);
  }

  // ── Fetch movie list ──────────────────────────────────────────────
  console.log(`${info} Obteniendo cartelera...`);
  const nowPlaying = await gafGet<GafMovie[]>(`/nowPlaying/${GAF_CINEMA_ID}`);
  console.log(`${ok} ${nowPlaying.length} películas en cartelera\n`);

  const toInsert: Array<{
    movieId: number; cinemaId: number; date: string; time: string;
    format: string; language: string; bookingUrl: string | null; scrapedAt: string;
  }> = [];

  // ── For each movie, fetch its showtimes ───────────────────────────
  for (const gafMovie of nowPlaying) {
    const titleRaw = capitalize(gafMovie.nombre);
    const titleNorm = normalize(titleRaw);

    let detail: GafMovieDetail;
    try {
      detail = await gafGet<GafMovieDetail>(`/movie/${GAF_CINEMA_ID}/${gafMovie.pref}`);
    } catch (e: any) {
      console.error(`  ${err} ${titleRaw}: ${e.message}`);
      continue;
    }

    // Filter to our date range and only active showtimes
    const inRange = detail.showtimes.filter(s => {
      if (s.mostrar !== "1" || s.expired) return false;
      const date = s.fechaHora.date.slice(0, 10); // "YYYY-MM-DD"
      return date >= from && date < to;
    });

    if (inRange.length === 0) {
      console.log(`  ${c.gray}○${c.reset} ${titleRaw}: sin funciones en rango`);
      continue;
    }

    // Ensure movie exists in DB
    let movie = movieByTitle.get(titleNorm);
    if (!movie) {
      // Prefix fallback: "La Grazia" → "La Grazia: La Belleza De La Duda"
      for (const [k, v] of movieByTitle) {
        if (k.startsWith(titleNorm) && !/[a-z0-9]/.test(k[titleNorm.length] ?? "")) {
          movie = v; break;
        }
      }
    }
    if (!movie) {
      console.log(`  ${warn} Película nueva, creando: ${c.yellow}${titleRaw}${c.reset}`);
      const [inserted] = await db.insert(movies).values({ title: titleRaw, genres: "", debutWeek: getCurrentDebutWeek() }).returning();
      movie = inserted;
      movieByTitle.set(normalize(movie.title), movie);
    }

    for (const s of inRange) {
      const date = s.fechaHora.date.slice(0, 10);
      const time = s.fechaHora.date.slice(11, 16); // "HH:MM"
      const format   = (s.formato || gafMovie.formato || "2D").toUpperCase();
      const language = parseLanguage(s.lenguaje || gafMovie.lenguaje);
      const bookingUrl = `https://cineartecacodelphia.com.ar/pelicula/${GAF_CINEMA_ID}/${gafMovie.pref}`;

      toInsert.push({
        movieId:    movie.id,
        cinemaId:   cinema.id,
        date, time, format, language,
        bookingUrl, scrapedAt,
      });
    }

    console.log(`  ${ok} ${titleRaw}: ${c.green}${inRange.length}${c.reset} funciones`);
  }

  if (toInsert.length === 0) {
    console.log(`\n${warn} No se encontraron horarios para importar.`);
    await closeDb();
    return;
  }

  // ── Insert in batches (upsert — skip duplicates) ─────────────────
  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await db.insert(showtimes).values(toInsert.slice(i, i + BATCH)).onConflictDoNothing();
  }

  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(showtimes);
  console.log(`\n${ok} ${c.green}${c.bold}${toInsert.length} horarios importados${c.reset}`);
  console.log(`${c.gray}Total en DB: ${total} horarios${c.reset}\n`);

  await closeDb();
}

main().catch(e => {
  console.error(`\n${err} Error:`, e.message);
  process.exit(1);
});
