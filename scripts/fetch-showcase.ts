/**
 * fetch-showcase.ts
 * Scrapes Showcase showtimes via the Voy al Cine (VAC) API.
 *
 * API base: https://api.voyalcine.net
 *   GET /films                  → list of active films with IDs
 *   GET /films/{id}/tree        → showtime tree: { days: { "YYYY-MM-DD": [{ id, name, formats: [{ formatDescription, performances: [{ showTime }] }] }] } }
 *
 * VAC cinema IDs (Showcase only — "Play Cinema San Juan" is excluded):
 *   11 → Showcase Haedo
 *   12 → Showcase Córdoba  (API name: "Showcase Cordoba (Villa Cabrera)")
 *   13 → Showcase Norte (Norcenter)
 *   14 → Showcase Belgrano
 *   15 → Showcase Quilmes
 *   16 → Showcase Rosario
 *   17 → Showcase Villa Allende  (API name: "Showcase VIlla Allende")
 *   18 → Showcase IMAX           (API name: "IMAX Theatre (Norcenter)")
 *
 * Uso:
 *   npx tsx scripts/fetch-showcase.ts
 */

import { db, closeDb, getCurrentDebutWeek } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";
import { eq, and, inArray, sql, gte } from "drizzle-orm";

// ── Colores ───────────────────────────────────────────────────────────
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m" };
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const err  = `${c.red}✗${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

// ── VAC API ───────────────────────────────────────────────────────────
const BASE = "https://api.voyalcine.net";
const HEADERS = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };

// ── Cinema definitions ────────────────────────────────────────────────
// vacId: the numeric cinema ID returned by the VAC /tree endpoint
const SHOWCASE_CINEMAS = [
  { vacId: 13, name: "Showcase Norte (Norcenter)", chain: "showcase", zone: "GBA Norte", city: "Vicente López", address: "Colectora Panamericana 3750, Norcenter",      lat: -34.5200, lng: -58.5100, url: "https://www.todoshowcase.com/cines/norte" },
  { vacId: 14, name: "Showcase Belgrano",       chain: "showcase", zone: "CABA",      city: "Buenos Aires",  address: "Av. Cabildo 2860, Belgrano",                  lat: -34.5605, lng: -58.4570, url: "https://www.voyalcine.net/" },
  { vacId: 11, name: "Showcase Haedo",          chain: "showcase", zone: "GBA Oeste", city: "Haedo",         address: "Av. J.M. de Rosas 2350, Shopping del Oeste",  lat: -34.6409, lng: -58.5888, url: "https://www.voyalcine.net/" },
  { vacId: 15, name: "Showcase Quilmes",        chain: "showcase", zone: "GBA Sur",   city: "Quilmes",       address: "Av. Hipólito Yrigoyen 4399, Quilmes",         lat: -34.7229, lng: -58.2628, url: "https://www.voyalcine.net/" },
  { vacId: 12, name: "Showcase Córdoba",        chain: "showcase", zone: "Córdoba",   city: "Córdoba",       address: "Av. Colón 4091, Villa Cabrera, Córdoba",      lat: -31.3990, lng: -64.1899, url: "https://www.voyalcine.net/" },
  { vacId: 16, name: "Showcase Rosario",        chain: "showcase", zone: "Rosario",   city: "Rosario",       address: "Av. Eva Perón 5757, Rosario",                 lat: -32.9553, lng: -60.6890, url: "https://www.voyalcine.net/" },
  { vacId: 17, name: "Showcase Villa Allende",  chain: "showcase", zone: "Córdoba",   city: "Villa Allende", address: "Shopping Las Vistas, Villa Allende",          lat: -31.2976, lng: -64.2979, url: "https://www.voyalcine.net/" },
  { vacId: 18, name: "IMAX Showcase Norte",      chain: "showcase", zone: "GBA Norte", city: "San Martín",    address: "Av. Ricardo Balbín 2550, Shopping Norcenter", lat: -34.5717, lng: -58.5404, url: "https://www.voyalcine.net/" },
] as const;

const SHOWCASE_VAC_IDS = new Set(SHOWCASE_CINEMAS.map(c => c.vacId));

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
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Parse "2D-Subtitulado" → { format: "2D", language: "sub" }
 * Handles: 2D, 3D, IMAX, 4DX | Subtitulado/Subt → sub | Doblada/Cast → cas
 */
function parseFormatDescription(desc: string): { format: string; language: string } {
  const [fmtRaw = "", langRaw = ""] = desc.split("-");
  const fmt = fmtRaw.trim().toUpperCase().replace("DIGITAL", "2D") || "2D";

  const l = langRaw.trim().toLowerCase();
  let language = "sub";
  if (l.includes("dob") || l.includes("cast") || l.includes("espa")) language = "cas";
  else if (l.includes("subt") || l.includes("subtit") || l.includes("vos")) language = "sub";

  return { format: fmt, language };
}

// ── VAC API types ─────────────────────────────────────────────────────
interface VacFilm {
  id: number;
  name: string;
  dB_Active: boolean;
}

interface VacTree {
  id: number;
  name: string;
  days: Record<string, Array<{
    id: number;
    name: string;
    formats: Array<{
      formatDescription: string;
      showId: string;
      performances: Array<{
        performanceId: number;
        showTime: string;
      }>;
    }>;
  }>>;
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

  console.log(`\n${c.bold}Showcase Cinemas — Importador directo a DB${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Rango:  ${c.cyan}${from}${c.reset} → ${c.cyan}${to}${c.reset}`);
  console.log(`${info} Fuente: ${c.cyan}api.voyalcine.net${c.reset}\n`);

  const scrapedAt = new Date().toISOString();

  const dbCinemas = await db.select().from(cinemas);
  const dbMovies  = await db.select().from(movies);
  const cinemaByName = new Map(dbCinemas.map(cin => [normalize(cin.name), cin]));
  const movieByTitle = new Map(dbMovies.map(mov => [normalize(mov.title), mov]));

  // ── Ensure all Showcase cinemas exist in DB ───────────────────────
  // vacId → DB cinema record
  const cinemaByVacId = new Map<number, typeof dbCinemas[number]>();
  for (const sala of SHOWCASE_CINEMAS) {
    let cinema = cinemaByName.get(normalize(sala.name));
    if (!cinema) {
      console.log(`  ${warn} Cine nuevo, creando: ${c.yellow}${sala.name}${c.reset}`);
      const { vacId: _, ...values } = sala as any;
      const [inserted] = await db.insert(cinemas).values(values).returning();
      cinema = inserted;
      cinemaByName.set(normalize(cinema.name), cinema);
    }
    cinemaByVacId.set(sala.vacId, cinema);
  }
  const showcaseCinemaIds = [...cinemaByVacId.values()].map(c => c.id);

  // ── Fetch film list ───────────────────────────────────────────────
  console.log(`${info} Obteniendo cartelera...`);
  const films = await get<VacFilm[]>("/films");
  const active = films.filter(f => f.dB_Active);
  console.log(`${ok} ${active.length} películas activas\n`);

  const toInsert: Array<{
    movieId: number; cinemaId: number; date: string; time: string;
    format: string; language: string; bookingUrl: string | null; scrapedAt: string;
  }> = [];

  // ── Fetch each film's showtime tree ───────────────────────────────
  for (const film of active) {
    let tree: VacTree;
    try {
      tree = await get<VacTree>(`/films/${film.id}/tree`);
    } catch (e: any) {
      console.error(`  ${err} ${film.name}: ${e.message}`);
      continue;
    }

    const datesInRange = Object.entries(tree.days).filter(([date]) => date >= from && date < to);
    if (datesInRange.length === 0) {
      console.log(`  ${c.gray}○${c.reset} ${film.name}: sin funciones en rango`);
      continue;
    }

    // Resolve movie in DB
    const titleNorm = normalize(film.name);
    let movie = movieByTitle.get(titleNorm);
    if (!movie) {
      for (const [k, v] of movieByTitle) {
        if (k.startsWith(titleNorm) && !/[a-z0-9]/.test(k[titleNorm.length] ?? "")) {
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

    const counts: Record<string, number> = {};
    for (const [date, cinemaSlots] of datesInRange) {
      for (const slot of cinemaSlots) {
        if (!SHOWCASE_VAC_IDS.has(slot.id)) continue;
        const cinema = cinemaByVacId.get(slot.id)!;

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
              bookingUrl: `https://www.voyalcine.net/pelicula.aspx?filmid=${film.id}&performanceid=${perf.performanceId}`,
              scrapedAt,
            });
            counts[cinema.name] = (counts[cinema.name] ?? 0) + 1;
          }
        }
      }
    }

    if (Object.keys(counts).length > 0) {
      const summary = Object.entries(counts).map(([n, c]) => `${n.replace("Showcase ", "")}: ${c}`).join(", ");
      console.log(`  ${ok} ${film.name}: ${c.green}${Object.values(counts).reduce((a,b)=>a+b,0)}${c.reset} funciones (${summary})`);
    } else {
      console.log(`  ${c.gray}○${c.reset} ${film.name}: sin funciones Showcase en rango`);
    }
  }

  if (toInsert.length === 0) {
    console.log(`\n${warn} No se encontraron horarios para importar.`);
    await closeDb();
    return;
  }

  // ── Purge stale Showcase showtimes for date >= today ─────────────
  // onConflictDoNothing dedupes identical rows but never removes rows whose
  // source session has since been cancelled or rescheduled. Without this
  // DELETE, phantom showtimes accumulate forever.
  console.log(`\n${info} Limpiando horarios obsoletos de Showcase (desde ${from})…`);
  await db.delete(showtimes).where(
    and(
      gte(showtimes.date, from),
      sql`${showtimes.cinemaId} IN (SELECT id FROM cinemas WHERE chain = 'showcase')`,
    )
  );

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
