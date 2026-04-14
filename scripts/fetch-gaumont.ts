/**
 * fetch-gaumont.ts
 * Scrapes showtimes from Cine Gaumont (cinegaumont.ar) via the VAC API.
 *
 * API base: https://www.cinegaumont.com.ar
 *   GET /films                   → list of all active films with IDs
 *   GET /films/{id}/tree         → showtime tree: { id, name, days: { "YYYY-MM-DD": [{ name, formats: [{ formatDescription, performances: [{ showTime }] }] }] } }
 *
 * formatDescription examples: "2D-Castellano", "2D-Subtitulada", "Digital-Castellano"
 *
 * Uso:
 *   npx tsx scripts/fetch-gaumont.ts
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
  name:    "Cine Gaumont",
  chain:   "independiente",
  zone:    "CABA",
  city:    "Buenos Aires",
  address: "Av. Rivadavia 1635, Buenos Aires",
  lat:     -34.6097,
  lng:     -58.3896,
  url:     "https://www.cinegaumont.ar/",
};

const BASE = "https://www.cinegaumont.com.ar";
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

// ── Helpers ───────────────────────────────────────────────────────────
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Parse "2D-Castellano" → { format: "2D", language: "cas" }
 * Handles: 2D, 3D, IMAX, Digital, etc.
 *         Castellano/Cast → cas | Subtitulada/Subt → sub | Doblada → dob
 */
function parseFormatDescription(desc: string): { format: string; language: string } {
  const [fmtRaw = "", langRaw = ""] = desc.split("-");

  const fmt = fmtRaw.trim().toUpperCase().replace("DIGITAL", "2D") || "2D";

  const l = langRaw.trim().toLowerCase();
  let language = "sub";
  if (l.includes("cast") || l.includes("español") || l.includes("castellano")) language = "cas";
  else if (l.includes("dob")) language = "dob";
  else if (l.includes("subt") || l.includes("subtit")) language = "sub";

  return { format: fmt, language };
}

// ── API types ─────────────────────────────────────────────────────────
interface GaumontFilm {
  id: number;
  name: string;
  dB_Active: boolean;
}

interface GaumontPerformance {
  performanceId: number;
  showTime: string; // "HH:MM"
}

interface GaumontFormatSlot {
  formatDescription: string;
  showId: string;
  performances: GaumontPerformance[];
}

interface GaumontCinemaSlot {
  id: number;
  name: string;
  formats: GaumontFormatSlot[];
}

interface GaumontTree {
  id: number;
  name: string;
  days: Record<string, GaumontCinemaSlot[]>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${BASE}${path}`);
  return res.json() as Promise<T>;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const from = localToday();
  const to   = addDays(from, 14);

  console.log(`\n${c.bold}Cine Gaumont — Importador directo a DB${c.reset}`);
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
  }

  // ── Fetch film list ───────────────────────────────────────────────
  console.log(`${info} Obteniendo cartelera...`);
  const films = await get<GaumontFilm[]>("/films");
  const active = films.filter(f => f.dB_Active);
  console.log(`${ok} ${active.length} películas activas\n`);

  const toInsert: Array<{
    movieId: number; cinemaId: number; date: string; time: string;
    format: string; language: string; bookingUrl: string | null; scrapedAt: string;
  }> = [];

  // ── For each film, fetch its showtime tree ────────────────────────
  for (const film of active) {
    let tree: GaumontTree;
    try {
      tree = await get<GaumontTree>(`/films/${film.id}/tree`);
    } catch (e: any) {
      console.error(`  ${err} ${film.name}: ${e.message}`);
      continue;
    }

    // Filter dates to our range
    const datesInRange = Object.entries(tree.days).filter(([date]) => date >= from && date < to);
    if (datesInRange.length === 0) {
      console.log(`  ${c.gray}○${c.reset} ${film.name}: sin funciones en rango`);
      continue;
    }

    // Ensure movie exists in DB
    const titleNorm = normalize(film.name);
    let movie = movieByTitle.get(titleNorm);
    if (!movie) {
      // prefix match ("La Grazia" ↔ "La Grazia: La Belleza De La Duda")
      for (const [k, v] of movieByTitle) {
        if (k.startsWith(titleNorm) && (k[titleNorm.length] === undefined || !/[a-z0-9]/i.test(k[titleNorm.length]))) {
          movie = v; break;
        }
      }
    }
    if (!movie) {
      console.log(`  ${warn} Película nueva, creando: ${c.yellow}${film.name}${c.reset}`);
      const [inserted] = await db.insert(movies).values({ title: film.name, genres: "", debutWeek: getCurrentDebutWeek() }).returning();
      movie = inserted;
      movieByTitle.set(normalize(movie.title), movie);
    }

    let count = 0;
    for (const [date, cinemaSlots] of datesInRange) {
      for (const slot of cinemaSlots) {
        // Only ingest Gaumont's own cinema (id 503), skip any guest venues
        if (normalize(slot.name) !== normalize(CINEMA.name)) continue;

        for (const fmt of slot.formats) {
          const { format, language } = parseFormatDescription(fmt.formatDescription);
          for (const perf of fmt.performances) {
            toInsert.push({
              movieId:    movie.id,
              cinemaId:   cinema.id,
              date,
              time:       perf.showTime,
              format,
              language,
              bookingUrl: `https://www.cinegaumont.ar/pelicula.aspx?filmid=${film.id}&performanceid=${perf.performanceId}`,
              scrapedAt,
            });
            count++;
          }
        }
      }
    }

    if (count > 0) console.log(`  ${ok} ${film.name}: ${c.green}${count}${c.reset} funciones`);
    else           console.log(`  ${c.gray}○${c.reset} ${film.name}: sin funciones para Gaumont en rango`);
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
