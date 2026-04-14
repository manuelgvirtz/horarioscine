/**
 * fetch-york.ts
 * Scrapes showtimes from Cine York and Centro Cultural Munro
 * (both on lumiton.ar/agenda-presencial/) and imports them to the database.
 *
 * Data source: single HTML page, events are server-rendered <article> elements
 * with data-date and data-locations attributes. Each article = one screening.
 * Location IDs: "cine-york" | "centro-cultural-munro"
 *
 * Uso:
 *   npx tsx scripts/fetch-york.ts
 */

import { db, closeDb, getCurrentDebutWeek } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

// ── Colores ───────────────────────────────────────────────────────────
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m" };
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const err  = `${c.red}✗${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

// ── Cinema info ───────────────────────────────────────────────────────
const VENUES = [
  {
    locationId: "cine-york",
    cinema: {
      name:    "Cine York",
      chain:   "independiente",
      zone:    "GBA Norte",
      city:    "Villa del Parque",
      address: "Lincoln 1126, Villa del Parque, Buenos Aires",
      lat:     -34.6059,
      lng:     -58.5131,
      url:     "https://lumiton.ar/espacio/cine-york/",
    },
  },
  {
    locationId: "centro-cultural-munro",
    cinema: {
      name:    "Centro Cultural Munro",
      chain:   "independiente",
      zone:    "GBA Norte",
      city:    "Munro",
      address: "Munro, Vicente López, Buenos Aires",
      lat:     -34.5274,
      lng:     -58.5256,
      url:     "https://lumiton.ar/espacio/centro-cultural-munro/",
    },
  },
] as const;

const SOURCE_URL = "https://lumiton.ar/agenda-presencial/";

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
function decodeHtml(s: string): string {
  return s.replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&hellip;/g, "…");
}

// ── Scraper ───────────────────────────────────────────────────────────
interface Screening {
  locationId: string;
  date:       string;
  time:       string;
  title:      string;
  url:        string | null;
}

async function fetchScreenings(): Promise<Screening[]> {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const knownIds = new Set(VENUES.map(v => v.locationId));
  const screenings: Screening[] = [];

  // data-locations spans multiple lines — use [\s\S] and DOTALL-style matching
  const articleRe = /<article\s[\s\S]*?data-date="([^"]+)"[\s\S]*?data-locations='(\[[\s\S]*?])'[\s\S]*?>([\s\S]*?)<\/article>/g;
  let m: RegExpExecArray | null;

  while ((m = articleRe.exec(html)) !== null) {
    const date      = m[1];
    const locations = JSON.parse(m[2]) as string[];
    const block     = m[3];

    for (const locationId of locations) {
      if (!knownIds.has(locationId)) continue;

      // Time: element with class containing "tracking-tighter text-6xl" → "18:00hs"
      const timeMatch = block.match(/tracking-tighter text-6xl[^>]*>(\d{1,2}:\d{2})hs/);
      if (!timeMatch) continue;
      const time = timeMatch[1].padStart(5, "0");

      // Title: <h3> text
      const titleMatch = block.match(/<h3[^>]*>([^<]+)<\/h3>/);
      if (!titleMatch) continue;
      const title = capitalize(decodeHtml(titleMatch[1].trim()));

      // Booking URL
      const linkMatch = block.match(/href="(https:\/\/lumiton\.ar\/evento\/[^"]+)"/);
      const url = linkMatch ? linkMatch[1] : null;

      screenings.push({ locationId, date, time, title, url });
    }
  }

  return screenings;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const from = localToday();
  const to   = addDays(from, 14);

  console.log(`\n${c.bold}Lumiton (Cine York + C.C. Munro) — Importador directo a DB${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Rango: ${c.cyan}${from}${c.reset} → ${c.cyan}${to}${c.reset}\n`);

  const scrapedAt = new Date().toISOString();

  const dbCinemas = await db.select().from(cinemas);
  const dbMovies  = await db.select().from(movies);
  const cinemaByName = new Map(dbCinemas.map(cin => [normalize(cin.name), cin]));
  const movieByTitle = new Map(dbMovies.map(mov => [normalize(mov.title), mov]));

  // ── Ensure both cinemas exist ────────────────────────────────────────
  const cinemaMap = new Map<string, typeof dbCinemas[number]>();
  for (const venue of VENUES) {
    let cinema = cinemaByName.get(normalize(venue.cinema.name));
    if (!cinema) {
      console.log(`  ${warn} Cine nuevo, creando: ${c.yellow}${venue.cinema.name}${c.reset}`);
      const [inserted] = await db.insert(cinemas).values(venue.cinema).returning();
      cinema = inserted;
      cinemaByName.set(normalize(cinema.name), cinema);
    }
    cinemaMap.set(venue.locationId, cinema);
  }

  // ── Fetch screenings (single HTTP request for all venues) ───────────
  console.log(`${info} Descargando agenda de Lumiton...`);
  const all = await fetchScreenings();
  const inRange = all.filter(s => s.date >= from && s.date < to);

  const byVenue = Object.fromEntries(VENUES.map(v => [v.locationId, 0]));
  for (const s of inRange) byVenue[s.locationId] = (byVenue[s.locationId] ?? 0) + 1;
  const summary = VENUES.map(v => `${v.cinema.name.split(" ").pop()}: ${byVenue[v.locationId]}`).join(", ");
  console.log(`${ok} ${all.length} funciones totales, ${inRange.length} en rango (${summary})\n`);

  if (inRange.length === 0) {
    console.log(`${warn} No hay funciones en el rango ${from}–${to}.`);
    await closeDb();
    return;
  }

  // ── Match/create movies ──────────────────────────────────────────────
  const toInsert: Array<{
    movieId: number; cinemaId: number; date: string; time: string;
    format: string; language: string; bookingUrl: string | null; scrapedAt: string;
  }> = [];

  for (const s of inRange) {
    const cinema = cinemaMap.get(s.locationId)!;
    const titleNorm = normalize(s.title);
    let movie = movieByTitle.get(titleNorm);

    if (!movie) {
      for (const [k, v] of movieByTitle) {
        if (k === titleNorm || (k.startsWith(titleNorm) && !/[a-z0-9]/.test(k[titleNorm.length]))) {
          movie = v; break;
        }
      }
    }
    if (!movie) {
      console.log(`  ${warn} Película nueva, creando: ${c.yellow}${s.title}${c.reset}`);
      const [inserted] = await db.insert(movies).values({ title: s.title, genres: "", debutWeek: getCurrentDebutWeek() }).returning();
      movie = inserted;
      movieByTitle.set(normalize(movie.title), movie);
    }

    toInsert.push({
      movieId:    movie.id,
      cinemaId:   cinema.id,
      date:       s.date,
      time:       s.time,
      format:     "2D",
      language:   "sub",
      bookingUrl: s.url,
      scrapedAt,
    });
  }

  // ── Insert in batches (upsert — skip duplicates) ────────────────────
  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await db.insert(showtimes).values(toInsert.slice(i, i + BATCH)).onConflictDoNothing();
  }

  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(showtimes);
  console.log(`${ok} ${c.green}${c.bold}${toInsert.length} horarios importados${c.reset}`);
  console.log(`${c.gray}Total en DB: ${total} horarios${c.reset}\n`);

  await closeDb();
}

main().catch(e => {
  console.error(`\n${err} Error:`, e.message);
  process.exit(1);
});
