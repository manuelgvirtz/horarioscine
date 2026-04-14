/**
 * fetch-multiplex.ts
 * Scrapes showtimes from Multiplex cinemas and imports them directly to DB.
 *
 * All data is embedded server-side in data-funciones attributes on the cartelera
 * page — no JS execution needed, single HTTP request.
 *
 * Uso:
 *   npx tsx scripts/fetch-multiplex.ts
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

// ── Complejos ─────────────────────────────────────────────────────────
// IDs come from the radio-button values on the cartelera page
const COMPLEXES: Record<string, { name: string; zone: string; city: string; address: string; lat: number; lng: number }> = {
  "184": { name: "Multiplex Lavalle",  zone: "CABA",      city: "Buenos Aires", address: "Lavalle 780, CABA",                               lat: -34.6037, lng: -58.3801 },
  "182": { name: "Multiplex Belgrano", zone: "CABA",      city: "Buenos Aires", address: "Vuelta de Obligado 2199, Belgrano",                lat: -34.5609, lng: -58.4523 },
  "180": { name: "Multiplex Canning",  zone: "GBA Sur",   city: "Ezeiza",       address: "Formosa 653, Canning (Shopping Las Toscas)",       lat: -34.8672, lng: -58.5058 },
  "187": { name: "Multiplex Pilar",    zone: "GBA Norte", city: "Pilar",        address: "Las Magnolias 754, Palmas del Pilar",              lat: -34.4536, lng: -58.9124 },
  "190": { name: "Multiplex San Juan", zone: "San Juan",  city: "San Juan",     address: "Av. José Ignacio de la Roza 806, Rivadavia",       lat: -31.5375, lng: -68.5364 },
};

// ── Mapeos ────────────────────────────────────────────────────────────
const FORMAT_MAP: Record<string, string> = {
  "2D":             "2D",
  "3D":             "3D",
  "4D":             "4DX",
  "4D+2D":          "4DX",
  "4D+3D":          "4DX",
  "COMFORT PLUS 2D":"2D",
  "COMFORT PLUS 3D":"3D",
  "2D XTREMO":      "XD",
  "SALA PLATINUM":  "2D",
};

// Language: "Español" → dubbed (cas), anything subtitulada → subbed (sub)
function parseLanguage(idioma: string): string {
  const low = idioma.toLowerCase();
  if (low.includes("subtitulada")) return "sub";
  if (low.includes("espa")) return "cas";
  return "sub";
}

// ── Timezone & dates ──────────────────────────────────────────────────
const TZ = "America/Argentina/Buenos_Aires";

function localToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

// "MM.DD.YYYY" → "YYYY-MM-DD"
function parseDate(s: string): string {
  const [m, d, y] = s.split(".");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// "MM.DD.YYYY" → "YYYYMMDD" (for booking URL)
function dateForUrl(s: string): string {
  const [m, d, y] = s.split(".");
  return `${y}${m.padStart(2, "0")}${d.padStart(2, "0")}`;
}

// ── Helpers ───────────────────────────────────────────────────────────
function normalize(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function capitalize(s: string): string {
  return s
    .replace(/&#0*38;/g, "&").replace(/&amp;/g, "&")
    .toLowerCase()
    .replace(/(?:^|\s|:|-)\S/g, ch => ch.toUpperCase());
}

// ── HTML parser ───────────────────────────────────────────────────────
interface Funcion {
  complejo: string;
  dia: string;
  hora: string;
  formato: string;
  idioma: string;
  pelicula_id: string;
  id: string;
}

interface MovieEntry {
  title: string;
  funciones: Funcion[];
}

function parsePage(html: string): MovieEntry[] {
  const entries: MovieEntry[] = [];
  // Each movie×complex gets its own funcion-item div
  const blocks = html.split(/(?=<div class='funcion-item)/);

  for (const block of blocks) {
    if (!block.startsWith("<div class='funcion-item")) continue;

    const jsonMatch = block.match(/data-funciones='([^']+)'/);
    if (!jsonMatch) continue;

    const titleMatch = block.match(/<h4[^>]*>([^<]+)<\/h4>/);
    if (!titleMatch) continue;

    let funciones: Funcion[];
    try {
      funciones = JSON.parse(jsonMatch[1]);
    } catch {
      continue;
    }

    entries.push({ title: capitalize(titleMatch[1].trim()), funciones });
  }

  return entries;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const from = localToday();
  const to   = addDays(from, 14);

  console.log(`\n${c.bold}Multiplex — Importador directo a DB${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Rango: ${c.cyan}${from}${c.reset} → ${c.cyan}${to}${c.reset}\n`);

  console.log(`${info} Descargando cartelera...`);
  const html = await fetch("https://multiplex.com.ar/cartelera/").then(r => r.text());

  const scrapedAt = new Date().toISOString();

  const dbCinemas = await db.select().from(cinemas);
  const dbMovies  = await db.select().from(movies);
  const cinemaByName = new Map(dbCinemas.map(cinema => [normalize(cinema.name), cinema]));
  const movieByTitle = new Map(dbMovies.map(movie => [normalize(movie.title), movie]));

  // Ensure all Multiplex cinemas exist
  for (const complex of Object.values(COMPLEXES)) {
    if (!cinemaByName.get(normalize(complex.name))) {
      console.log(`  ${warn} Cine nuevo, creando: ${c.yellow}${complex.name}${c.reset}`);
      const [inserted] = await db.insert(cinemas).values({
        name: complex.name, chain: "multiplex", zone: complex.zone,
        city: complex.city, address: complex.address,
        lat: complex.lat, lng: complex.lng, url: "https://www.multiplex.com.ar",
      }).returning();
      cinemaByName.set(normalize(inserted.name), inserted);
    }
  }

  const entries = parsePage(html);
  console.log(`${ok} ${entries.length} bloques película×cine encontrados\n`);

  const toInsert: Array<{
    movieId: number; cinemaId: number; date: string; time: string;
    format: string; language: string; bookingUrl: string | null; scrapedAt: string;
  }> = [];

  const complexCounts: Record<string, number> = {};

  for (const entry of entries) {
    const titleNorm = normalize(entry.title);

    // Filter funciones to our date range first
    const inRange = entry.funciones.filter(f => {
      const d = parseDate(f.dia);
      return d >= from && d < to && COMPLEXES[f.complejo];
    });
    if (inRange.length === 0) continue;

    // Ensure movie exists
    let movie = movieByTitle.get(titleNorm);
    if (!movie) {
      console.log(`  ${warn} Película nueva, creando: ${c.yellow}${entry.title}${c.reset}`);
      const [inserted] = await db.insert(movies).values({
        title: entry.title, durationMinutes: null, genres: "", debutWeek: getCurrentDebutWeek(),
      }).returning();
      movie = inserted;
      movieByTitle.set(normalize(movie.title), movie);
    }

    for (const f of inRange) {
      const complexInfo = COMPLEXES[f.complejo];
      const cinema = cinemaByName.get(normalize(complexInfo.name));
      if (!cinema) continue;

      const date     = parseDate(f.dia);
      const format   = FORMAT_MAP[f.formato] ?? "2D";
      const language = parseLanguage(f.idioma);
      const bookingUrl = `https://ventas.cinemultiplex.com.ar/funcion?df=${f.complejo}-${f.pelicula_id}-${f.id}-${dateForUrl(f.dia)}`;

      toInsert.push({ movieId: movie.id, cinemaId: cinema.id, date, time: f.hora, format, language, bookingUrl, scrapedAt});
      complexCounts[complexInfo.name] = (complexCounts[complexInfo.name] ?? 0) + 1;
    }
  }

  if (toInsert.length === 0) {
    console.log(`\n${warn} No se encontraron horarios para importar.`);
    await closeDb();
    return;
  }

  // ── Purge stale Multiplex showtimes for date >= today ────────────
  // onConflictDoNothing dedupes identical rows but never removes rows whose
  // source session has since been cancelled or rescheduled. Without this
  // DELETE, phantom showtimes accumulate forever.
  console.log(`\n${info} Limpiando horarios obsoletos de Multiplex (desde ${from})…`);
  await db.delete(showtimes).where(
    and(
      gte(showtimes.date, from),
      sql`${showtimes.cinemaId} IN (SELECT id FROM cinemas WHERE chain = 'multiplex')`,
    )
  );

  // Insert in batches (upsert — skip duplicates)
  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await db.insert(showtimes).values(toInsert.slice(i, i + BATCH)).onConflictDoNothing();
  }

  for (const [name, count] of Object.entries(complexCounts).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${ok} ${name}: ${c.green}${count}${c.reset} funciones`);
  }

  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(showtimes);
  console.log(`\n${c.green}${c.bold}✓ ${toInsert.length} horarios importados${c.reset}`);
  console.log(`${c.gray}Total en DB: ${total} horarios${c.reset}\n`);

  await closeDb();
}

main().catch(e => {
  console.error(`\n${err} Error:`, e.message);
  process.exit(1);
});
