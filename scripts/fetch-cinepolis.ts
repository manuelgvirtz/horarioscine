/**
 * fetch-cinepolis.ts
 * Scrapes showtimes from Cinépolis Argentina (cinepolis.com.ar)
 * via the internal JSON API and imports them directly to the database.
 *
 * API discovery (no auth required, just X-Requested-With header):
 *   GET /api/movies                          → all active movies
 *   GET /api/movies/{id}/aggregations        → available dates, versions, formats
 *   GET /api/movies/{id}/showtimes?date=DATE → showtimes grouped by complex
 *
 * Uso:
 *   npx tsx scripts/fetch-cinepolis.ts
 */

import { db, closeDb, getCurrentDebutWeek } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";

// ── Colores ───────────────────────────────────────────────────────────
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m" };
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const err  = `${c.red}✗${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

// ── API base ──────────────────────────────────────────────────────────
// cinepolis.com.ar uses Cloudflare Bot Management which blocks Node.js's
// TLS fingerprint. curl bypasses it. We use execSync(curl) for all requests.
const BASE_URL = "https://www.cinepolis.com.ar/api";
const SITE_URL = "https://www.cinepolis.com.ar/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

import { execSync } from "child_process";
import os from "os";
import path from "path";

const COOKIE_JAR = path.join(os.tmpdir(), "cinepolis_cookies.txt");

// Session state
let csrfToken = "";

function curlGet(url: string, extraHeaders: string[] = []): string {
  const headers = [
    `-A "${UA}"`,
    `-H "Accept: application/json"`,
    `-H "X-Requested-With: XMLHttpRequest"`,
    `-H "Referer: ${SITE_URL}"`,
    ...extraHeaders,
    `-b "${COOKIE_JAR}"`,
    `-c "${COOKIE_JAR}"`,
    `--silent --max-time 30`,
  ];
  const cmd = `curl ${headers.join(" ")} "${url}"`;
  return execSync(cmd, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

function initSession(): void {
  // Fetch homepage to get session cookies + CSRF token
  const html = curlGet(SITE_URL, [`-H "Accept: text/html"`]);
  const m = html.match(/<meta name="csrf-token" content="([^"]+)"/);
  if (!m) throw new Error("CSRF token not found on homepage");
  csrfToken = m[1];
}

function apiFetch<T>(path: string): T {
  const body = curlGet(`${BASE_URL}/${path}`, [
    `-H "X-CSRF-TOKEN: ${csrfToken}"`,
  ]);
  if (!body.trim()) throw new Error(`Empty response for /api/${path}`);
  return JSON.parse(body) as T;
}

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
    .replace(/:([^\s])/g, ": $1").replace(/-([^\s])/g, "- $1")
    .split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function cleanTitle(s: string): string {
  return capitalize(s.replace(/\s+/g, " ").trim());
}

// ── Language/format mapping ───────────────────────────────────────────
function mapVersion(v: string): string {
  const map: Record<string, string> = { CAST: "cas", SUBT: "sub", OV: "sub", ESP: "cas" };
  return map[v.toUpperCase()] ?? "sub";
}
function mapFormat(f: string): string {
  const upper = f.toUpperCase();
  if (upper.includes("4D")) return "4D";
  if (upper.includes("IMAX")) return "IMAX";
  if (upper.includes("3D")) return "3D";
  if (upper.includes("ATMOS") || upper.includes("SCREEN X")) return "2D";
  return "2D";
}

// ── Known complex → DB cinema mapping ─────────────────────────────────
// API complex IDs → cinema metadata (name must match DB exactly after normalize)
const COMPLEX_META: Record<number, {
  name: string; chain: string; zone: string; city: string;
  address: string; lat: number; lng: number; url: string;
}> = {
  1:  { name: "Cinépolis Recoleta",           chain: "cinepolis", zone: "CABA",      city: "Buenos Aires",       address: "Vicente López 2050, Recoleta",             lat: -34.5891, lng: -58.3932, url: "https://www.cinepolis.com.ar/cines/cinepolis-recoleta" },
  2:  { name: "Cinépolis Neuquén",             chain: "cinepolis", zone: "Neuquén",   city: "Neuquén",            address: "Av. Antártida Argentina 1111",             lat: -38.9500, lng: -68.0600, url: "https://www.cinepolis.com.ar/cines/cinepolis-neuquen" },
  3:  { name: "Cinépolis Mendoza",             chain: "cinepolis", zone: "Mendoza",   city: "Guaymallén",         address: "Lateral de Acceso Este 3280, Mendoza Plaza Shopping", lat: -32.8950, lng: -68.7850, url: "https://www.cinepolis.com.ar/cines/cinepolis-mendoza" },
  4:  { name: "Cinépolis Rosario",             chain: "cinepolis", zone: "Rosario",   city: "Rosario",            address: "Perón 5856, Rosario",                      lat: -32.9200, lng: -60.6800, url: "https://www.cinepolis.com.ar/cines/cinepolis-rosario" },
  5:  { name: "Cinépolis Avellaneda",          chain: "cinepolis", zone: "GBA Sur",   city: "Avellaneda",         address: "Av. Mitre 2702, Avellaneda",               lat: -34.6612, lng: -58.3657, url: "https://www.cinepolis.com.ar/cines/cinepolis-avellaneda" },
  6:  { name: "Cinépolis Pilar",               chain: "cinepolis", zone: "GBA Norte", city: "Pilar",              address: "Panamericana Km. 50, Pilar",               lat: -34.4425, lng: -58.9155, url: "https://www.cinepolis.com.ar/cines/cinepolis-pilar" },
  8:  { name: "Cinépolis Arena Maipú",         chain: "cinepolis", zone: "Mendoza",   city: "Maipú",              address: "Av. Acceso Este Lateral Sur 3280, Maipú",  lat: -32.9800, lng: -68.7800, url: "https://www.cinepolis.com.ar/cines/cinepolis-maipu" },
  9:  { name: "Cinépolis Merlo",               chain: "cinepolis", zone: "GBA Oeste", city: "Merlo",              address: "Av. Juan Domingo Perón 24098",             lat: -34.6642, lng: -58.7279, url: "https://www.cinepolis.com.ar/cines/cinepolis-merlo" },
  10: { name: "Cinépolis Luján",               chain: "cinepolis", zone: "GBA Oeste", city: "Luján",              address: "Av. Constitución 1000, Luján",             lat: -34.5660, lng: -59.1100, url: "https://www.cinepolis.com.ar/cines/cinepolis-lujan" },
  11: { name: "Cinépolis Houssay",             chain: "cinepolis", zone: "CABA",      city: "Buenos Aires",       address: "Av. Corrientes 917, Buenos Aires",         lat: -34.5988, lng: -58.3819, url: "https://www.cinepolis.com.ar/cines/cinepolis-houssay" },
};

// ── API types ─────────────────────────────────────────────────────────
interface ApiMovie {
  id: number;
  title_translated: string;
  slug: string;
  poster_url: string;
  release_date: string;
  tmdb_id?: string;
}
interface ApiShowtime {
  complex_id: number;
  external_id: string;
  starts_at: string; // "YYYY-MM-DD HH:mm:ss"
}
interface ApiShowtimeOption {
  version: string;  // CAST, SUBT
  format: string;   // 2D, 3D
  attributes: string[];
  showtimes: ApiShowtime[];
}
interface ApiShowtimeType {
  type: string;
  options: ApiShowtimeOption[];
}
interface ApiShowtimeComplex {
  complex_id: number;
  complex_name: string;
  types: ApiShowtimeType[];
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Scraping record ───────────────────────────────────────────────────
interface ShowtimeRecord {
  apiMovieId: number;
  apiComplexId: number;
  date: string;
  time: string;
  format: string;
  language: string;
  bookingUrl: string | null;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const from = localToday();
  const to   = addDays(from, 14);

  console.log(`\n${c.bold}Cinépolis — Importador directo a DB${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Rango: ${c.cyan}${from}${c.reset} → ${c.cyan}${to}${c.reset}\n`);

  // ── Init session (CSRF + cookies) ───────────────────────────────────
  console.log(`${info} Iniciando sesión web...`);
  initSession();
  console.log(`${ok} CSRF token obtenido\n`);

  const scrapedAt = new Date().toISOString();

  const dbCinemas = await db.select().from(cinemas);
  const dbMovies  = await db.select().from(movies);
  const cinemaByName = new Map(dbCinemas.map(cinema => [normalize(cinema.name), cinema]));
  const movieByTitle = new Map(dbMovies.map(movie => [normalize(movie.title), movie]));

  // ── Ensure all Cinépolis cinemas exist ────────────────────────────
  const complexIdToDbId = new Map<number, number>();
  for (const [apiId, meta] of Object.entries(COMPLEX_META)) {
    const key = normalize(meta.name);
    let cinema = cinemaByName.get(key);
    if (!cinema) {
      console.log(`  ${warn} Cine nuevo, creando: ${c.yellow}${meta.name}${c.reset}`);
      const [inserted] = await db.insert(cinemas).values(meta).returning();
      cinema = inserted;
      cinemaByName.set(key, cinema);
    }
    complexIdToDbId.set(Number(apiId), cinema.id);
  }
  console.log(`${ok} ${complexIdToDbId.size} complejos mapeados\n`);

  // ── Fetch all movies ───────────────────────────────────────────────
  console.log(`${info} Descargando cartelera...`);
  const moviesResp = apiFetch<{ data: ApiMovie[]; aggregations: unknown }>("movies");
  const apiMovies = moviesResp.data;
  console.log(`${ok} ${apiMovies.length} películas en cartelera\n`);

  // ── Collect all showtimes ──────────────────────────────────────────
  const allRecords: ShowtimeRecord[] = [];

  for (const movie of apiMovies) {
    // Get available dates for this movie
    let dates: string[] = [];
    try {
      const agg = apiFetch<{ dates: string[] }>(`movies/${movie.id}/aggregations`);
      dates = (agg.dates ?? []).filter(d => d >= from && d <= to);
    } catch {
      console.log(`  ${warn} No se pudo obtener fechas para: ${movie.title_translated}`);
      continue;
    }

    if (dates.length === 0) continue;

    process.stdout.write(`  ${info} ${movie.title_translated} (${dates.length} días)...`);

    let fetched = 0;
    for (const date of dates) {
      try {
        const stResp = apiFetch<{ data: ApiShowtimeComplex[] }>(`movies/${movie.id}/showtimes?date=${date}`);
        for (const complex of stResp.data) {
          const dbCinemaId = complexIdToDbId.get(complex.complex_id);
          if (!dbCinemaId) continue; // unknown complex, skip

          for (const type of complex.types) {
            for (const option of type.options) {
              const lang   = mapVersion(option.version);
              const format = mapFormat(option.format);

              for (const st of option.showtimes) {
                const time = st.starts_at.slice(11, 16); // "HH:mm"
                const bookingUrl = "https://www.cinepolis.com.ar";

                allRecords.push({
                  apiMovieId:  movie.id,
                  apiComplexId: complex.complex_id,
                  date,
                  time,
                  format,
                  language: lang,
                  bookingUrl,
                });
                fetched++;
              }
            }
          }
        }
      } catch (e) {
        console.log(`\n  ${warn} Error en ${movie.title_translated} / ${date}: ${(e as Error).message}`);
      }
    }

    console.log(` ${c.green}${fetched}${c.reset}`);
  }

  console.log(`\n${ok} ${allRecords.length} funciones encontradas en rango`);

  if (allRecords.length === 0) {
    console.log(`${warn} No hay funciones en el rango ${from}–${to}.`);
    await closeDb();
    return;
  }

  // ── Match/create movies ────────────────────────────────────────────
  // Build a map from apiMovieId → DB movie
  const apiMovieMap = new Map<number, ApiMovie>(apiMovies.map(m => [m.id, m]));

  const toInsert: Array<{
    movieId: number; cinemaId: number; date: string; time: string;
    format: string; language: string; bookingUrl: string | null; scrapedAt: string;
  }> = [];

  for (const rec of allRecords) {
    const apiMovie = apiMovieMap.get(rec.apiMovieId)!;
    const titleES  = cleanTitle(apiMovie.title_translated);
    const titleNorm = normalize(titleES);

    let movie = movieByTitle.get(titleNorm);
    if (!movie) {
      // Prefix fallback
      for (const [k, v] of movieByTitle) {
        if (k === titleNorm || (k.startsWith(titleNorm) && !/[a-z0-9]/.test(k[titleNorm.length] ?? ""))) {
          movie = v; break;
        }
      }
    }
    if (!movie) {
      console.log(`  ${warn} Película nueva, creando: ${c.yellow}${titleES}${c.reset}`);
      const [inserted] = await db.insert(movies).values({ title: titleES, genres: "", debutWeek: getCurrentDebutWeek() }).returning();
      movie = inserted;
      movieByTitle.set(normalize(movie.title), movie);
    }

    const cinemaId = complexIdToDbId.get(rec.apiComplexId)!;
    toInsert.push({
      movieId:    movie.id,
      cinemaId,
      date:       rec.date,
      time:       rec.time,
      format:     rec.format,
      language:   rec.language,
      bookingUrl: rec.bookingUrl,
      scrapedAt,
    });
  }

  // ── Deduplicate ────────────────────────────────────────────────────
  const seen = new Set<string>();
  const deduped = toInsert.filter(r => {
    const key = `${r.movieId}|${r.cinemaId}|${r.date}|${r.time}|${r.format}|${r.language}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const dupes = toInsert.length - deduped.length;
  if (dupes > 0) console.log(`${info} ${dupes} duplicados eliminados`);

  // ── Purge stale Cinépolis showtimes for date >= today ────────────
  // onConflictDoNothing dedupes identical rows but never removes rows whose
  // source session has since been cancelled or rescheduled. Without this
  // DELETE, phantom showtimes accumulate forever.
  console.log(`\n${info} Limpiando horarios obsoletos de Cinépolis (desde ${from})…`);
  await db.delete(showtimes).where(
    and(
      gte(showtimes.date, from),
      sql`${showtimes.cinemaId} IN (SELECT id FROM cinemas WHERE chain = 'cinepolis')`,
    )
  );

  // ── Insert in batches (upsert — skip duplicates) ──────────────────
  const BATCH = 200;
  for (let i = 0; i < deduped.length; i += BATCH) {
    await db.insert(showtimes).values(deduped.slice(i, i + BATCH)).onConflictDoNothing();
  }

  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(showtimes);
  console.log(`${ok} ${c.green}${c.bold}${deduped.length} horarios importados${c.reset}`);
  console.log(`${c.gray}Total en DB: ${total} horarios${c.reset}\n`);

  await closeDb();
}

main().catch(e => {
  console.error(`\n${err} Error:`, e.message);
  process.exit(1);
});
