/**
 * fetch-sanmartin.ts
 * Scrapes showtimes from Sala Leopoldo Lugones — Cine del Teatro San Martín
 * (complejoteatral.gob.ar/cine)
 *
 * Strategy:
 *   1. Fetch /cine page → list of cinema events (id_genero=23, HTML-encoded in a hidden div)
 *   2. For each event, fetch its detail page
 *   3. Parse day-of-month headers ("Viernes 10") + time lines ("A las 15 y 21 horas")
 *   4. Resolve day numbers to actual dates using the event's date range
 *   5. Intersect with our 14-day window and insert showtimes
 *
 * Detail page schedule format (example):
 *   <p><strong>Viernes 10</strong></p>
 *   <p>A las 15 y 21 horas</p>
 *   <p><strong>Sábado 11</strong></p>
 *   <p>A las 18 horas</p>
 *
 * Genre filter: events in /cine page embed genre JSON as HTML entities:
 *   {&quot;id_genero&quot;:23,&quot;nombre&quot;:&quot;cine&quot;,...}
 *
 * Language: Sala Lugones programs films in original language with subtitles.
 *   All showtimes default to language="sub".
 *
 * Uso:
 *   npx tsx scripts/fetch-sanmartin.ts
 */

import { db, closeDb } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";
import { and, sql, gte } from "drizzle-orm";

// ── Colores ───────────────────────────────────────────────────────────
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m" };
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const err  = `${c.red}✗${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

// ── Cinema info ───────────────────────────────────────────────────────
const CINEMA = {
  name:    "Sala Leopoldo Lugones",
  chain:   "independiente",
  zone:    "CABA",
  city:    "Buenos Aires",
  address: "Av. Corrientes 1530, Buenos Aires",
  lat:     -34.6049,
  lng:     -58.3833,
  url:     "https://complejoteatral.gob.ar/cine",
  type:    "independiente" as const,
};

const BASE  = "https://complejoteatral.gob.ar";
const UA    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
function makeDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Spanish month names ───────────────────────────────────────────────
const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

// ── Text helpers ──────────────────────────────────────────────────────
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ").trim();
}
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// ── HTTP helper ───────────────────────────────────────────────────────
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-AR,es;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text();
}

// ── Parse date range ──────────────────────────────────────────────────
/**
 * Parse a date range string like:
 *   "Del 4 al 12 de abril"  → { start: "2026-04-04", end: "2026-04-12" }
 *   "Del 17 de marzo al 4 de abril" → { start: "2026-03-17", end: "2026-04-04" }
 */
function parseDateRange(text: string, year: number): { start: string; end: string } | null {
  const clean = text.toLowerCase().trim();

  // Find all month names in the text
  const monthMatches: { idx: number; month: number }[] = [];
  for (const [name, num] of Object.entries(MONTHS)) {
    const idx = clean.indexOf(name);
    if (idx >= 0) monthMatches.push({ idx, month: num });
  }
  monthMatches.sort((a, b) => a.idx - b.idx);

  // Find all day numbers
  const dayNums = [...clean.matchAll(/\b(\d{1,2})\b/g)].map(m => Number(m[1]));

  if (monthMatches.length === 0 || dayNums.length === 0) return null;

  if (monthMatches.length === 1) {
    // Single month: "Del 4 al 12 de abril"
    const month = monthMatches[0].month;
    const days = dayNums.filter(d => d >= 1 && d <= 31);
    if (days.length >= 2) {
      return {
        start: makeDate(year, month, days[0]),
        end:   makeDate(year, month, days[days.length - 1]),
      };
    }
    if (days.length === 1) {
      return { start: makeDate(year, month, days[0]), end: makeDate(year, month, days[0]) };
    }
  }

  if (monthMatches.length >= 2) {
    // Two months: "Del 17 de marzo al 4 de abril"
    const m1 = monthMatches[0]; const m2 = monthMatches[1];
    // Days before first month name and between month names
    const allDays = [...clean.matchAll(/\b(\d{1,2})\b/g)];
    const firstMonthPos = m1.idx;
    const secondMonthPos = m2.idx;
    const startDay = allDays.find(m => Number(m.index) < firstMonthPos + m1.month.toString().length);
    const endDay   = allDays.find(m => Number(m.index) > firstMonthPos && Number(m.index) < secondMonthPos);
    if (startDay && endDay) {
      return {
        start: makeDate(year, m1.month, Number(startDay[1])),
        end:   makeDate(year, m2.month, Number(endDay[1])),
      };
    }
  }

  return null;
}

// ── Parse schedule from detail page ──────────────────────────────────
/**
 * Returns a list of { dayOfMonth, times[] } from the detail page body.
 * Looks for patterns like:
 *   "Viernes 10"   → dayOfMonth = 10
 *   "A las 15 y 21 horas" → times = ["15:00", "21:00"]
 *   "A las 18 horas"      → times = ["18:00"]
 */
interface DaySchedule {
  dayOfMonth: number;
  times:      string[];
}

function parseSchedule(html: string): DaySchedule[] {
  // Strip scripts/styles but keep the rest of the HTML structure
  const clean = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  const result: DaySchedule[] = [];

  // Day header pattern: Spanish day name + day number
  const DAY_PATTERN = /(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)\s+(\d{1,2})/gi;
  // Time pattern: "A las 15 y 21 horas" or "A las 18 horas"
  const TIME_PATTERN = /a\s+las\s+([\d\s,y]+?)\s+horas/gi;

  // Find day headers with positions
  const dayHeaders: { pos: number; day: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = DAY_PATTERN.exec(clean)) !== null) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) dayHeaders.push({ pos: m.index, day });
  }

  if (dayHeaders.length === 0) return result;

  // For each day, collect times in the text until the next day header
  for (let i = 0; i < dayHeaders.length; i++) {
    const { pos, day } = dayHeaders[i];
    const nextPos = dayHeaders[i + 1]?.pos ?? clean.length;
    const segment = clean.slice(pos, nextPos);

    const times: string[] = [];
    while ((m = TIME_PATTERN.exec(segment)) !== null) {
      // Parse "15 y 21" or "18" or "15, 18 y 21"
      const raw = m[1]; // e.g. "15 y 21" or "18"
      const hours = raw.split(/[\s,y]+/).map(s => s.trim()).filter(Boolean).map(Number);
      for (const h of hours) {
        if (h >= 0 && h <= 23) {
          times.push(`${String(h).padStart(2, "0")}:00`);
        }
      }
    }
    TIME_PATTERN.lastIndex = 0; // reset regex

    if (times.length > 0) {
      result.push({ dayOfMonth: day, times: [...new Set(times)] });
    }
  }

  return result;
}

// ── Parsed cinema event ───────────────────────────────────────────────
interface CinemaEvent {
  id:         string;
  title:      string;
  detailUrl:  string;
  dateRange:  string;
  bookingUrl: string | null;
}

// ── Parse events from /cine listing page ──────────────────────────────
function parseCineEvents(html: string): CinemaEvent[] {
  const events: CinemaEvent[] = [];

  // Events use class "list-item-NNNN" CSS class
  const blockRe = /class="list-item[^"]*\blist-item-(\d+)\b[^"]*"[^>]*>([\s\S]*?)(?=class="list-item[^"]*\blist-item-\d+|$)/g;
  let m: RegExpExecArray | null;

  while ((m = blockRe.exec(html)) !== null) {
    const id    = m[1];
    const block = m[2];

    // Genre check: hidden div contains HTML-encoded JSON with id_genero:23
    // Encoded as: {&quot;id_genero&quot;:23,...}
    const decoded = decodeHtmlEntities(block);
    const isCinema = decoded.includes('"id_genero":23') || decoded.includes('"nombre":"cine"');
    if (!isCinema) continue;

    // Title: <h2> element
    const titleM = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (!titleM) continue;
    const title = stripHtml(titleM[1]).replace(/\s+/g, " ").trim();
    if (!title) continue;

    // Date range: class="date medium"
    const dateM = block.match(/class="date[^"]*medium[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const dateRange = dateM ? stripHtml(dateM[1]) : "";

    // Detail URL: button with "+ info" text or href to /ver/
    const urlM = block.match(/href="(https:\/\/complejoteatral\.gob\.ar\/ver\/[^"]+)"[^>]*(?:class="button[^"]*"[^>]*>|>)[^<]*(?:\+\s*info|más información)/i)
              || block.match(/href="(https:\/\/complejoteatral\.gob\.ar\/ver\/[^"]+)"/i);
    if (!urlM) continue;
    const detailUrl = urlM[1];

    // Booking URL: entradasba link
    const buyM = block.match(/href="(https:\/\/entradasba\.buenosaires\.gob\.ar[^"]+)"/i);
    const bookingUrl = buyM ? buyM[1] : null;

    events.push({ id, title, detailUrl, dateRange, bookingUrl });
  }

  return events;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const from = localToday();
  const to   = addDays(from, 14);
  const year = new Date(from + "T12:00:00").getFullYear();

  console.log(`\n${c.bold}Sala Leopoldo Lugones — Importador directo a DB${c.reset}`);
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

  // ── Fetch /cine listing ───────────────────────────────────────────
  console.log(`${info} Descargando /cine...`);
  const listingHtml = await fetchHtml(`${BASE}/cine`);
  const events = parseCineEvents(listingHtml);
  console.log(`${ok} ${events.length} eventos de cine encontrados\n`);

  const toInsert: Array<{
    movieId: number; cinemaId: number; date: string; time: string;
    format: string; language: string; bookingUrl: string | null; scrapedAt: string;
  }> = [];

  // ── Process each event ────────────────────────────────────────────
  for (const ev of events) {
    // Parse date range to know which month(s) day numbers refer to
    const range = parseDateRange(ev.dateRange, year);

    // Skip events whose range ends before our window starts
    if (range && range.end < from) {
      console.log(`  ${c.gray}○${c.reset} ${ev.title}: terminó el ${range.end}`);
      continue;
    }

    // Fetch detail page
    let detailHtml: string;
    try {
      await sleep(600);
      detailHtml = await fetchHtml(ev.detailUrl);
    } catch (e: any) {
      console.error(`  ${err} ${ev.title}: ${e.message}`);
      continue;
    }

    const schedule = parseSchedule(detailHtml);
    if (schedule.length === 0) {
      console.log(`  ${warn} ${ev.title}: sin horarios parseados`);
      continue;
    }

    // Resolve movie in DB
    const titleNorm = normalize(ev.title);
    let movie = movieByTitle.get(titleNorm);
    if (!movie) {
      for (const [k, v] of movieByTitle) {
        if (k.startsWith(titleNorm) && !k[titleNorm.length]?.match(/[a-z0-9]/)) {
          movie = v; break;
        }
      }
    }
    if (!movie) {
      console.log(`  ${warn} Película nueva, creando: ${c.yellow}${ev.title}${c.reset}`);
      const [inserted] = await db.insert(movies).values({ title: ev.title, genres: "" }).returning();
      movie = inserted;
      movieByTitle.set(normalize(movie.title), movie);
    }

    // Expand day-of-month entries to actual dates
    let count = 0;
    for (const { dayOfMonth, times } of schedule) {
      // Find which date(s) in our window match this day number
      // We check dates in the event range + our window
      const windowStart = from;
      const windowEnd   = to;

      // Try dates from up to 2 months bracketing the event
      const candidateDates: string[] = [];
      const startMonth = range ? new Date(range.start + "T12:00:00").getMonth() + 1 : new Date(from + "T12:00:00").getMonth() + 1;
      const endMonth   = range ? new Date(range.end   + "T12:00:00").getMonth() + 1 : startMonth;

      for (let mo = startMonth; mo <= Math.min(endMonth + 1, 12); mo++) {
        try {
          const candidate = makeDate(year, mo, dayOfMonth);
          const withinRange  = !range || (candidate >= range.start && candidate <= range.end);
          const withinWindow = candidate >= windowStart && candidate < windowEnd;
          if (withinRange && withinWindow) candidateDates.push(candidate);
        } catch {
          // invalid date (e.g., Feb 30) — skip
        }
      }

      for (const date of candidateDates) {
        for (const time of times) {
          toInsert.push({
            movieId:    movie.id,
            cinemaId:   cinema.id,
            date,
            time,
            format:     "2D",
            language:   "sub",
            bookingUrl: ev.bookingUrl,
            scrapedAt,
          });
          count++;
        }
      }
    }

    const rangeStr = range ? `${range.start} → ${range.end}` : ev.dateRange;
    if (count > 0) console.log(`  ${ok} ${ev.title} (${rangeStr}): ${c.green}${count}${c.reset} funciones`);
    else           console.log(`  ${c.gray}○${c.reset} ${ev.title}: sin funciones en la ventana`);
  }

  if (toInsert.length === 0) {
    console.log(`\n${warn} No se encontraron horarios para importar.`);
    await closeDb();
    return;
  }

  // Deduplicate within the batch (ON CONFLICT DO NOTHING only handles existing rows)
  const seen = new Set<string>();
  const unique = toInsert.filter(r => {
    const key = `${r.movieId}:${r.cinemaId}:${r.date}:${r.time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Purge stale San Martín showtimes for date >= today ──────────
  // onConflictDoNothing dedupes identical rows but never removes rows whose
  // source session has since been cancelled or rescheduled. Without this
  // DELETE, phantom showtimes accumulate forever.
  console.log(`\n${info} Limpiando horarios obsoletos de San Martín (desde ${from})…`);
  await db.delete(showtimes).where(
    and(
      gte(showtimes.date, from),
      sql`${showtimes.cinemaId} IN (SELECT id FROM cinemas WHERE name ILIKE '%san mart%')`,
    )
  );

  // ── Insert in batches (upsert — skip duplicates) ─────────────────
  const BATCH = 200;
  for (let i = 0; i < unique.length; i += BATCH) {
    await db.insert(showtimes).values(unique.slice(i, i + BATCH)).onConflictDoNothing();
  }

  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(showtimes);
  console.log(`\n${ok} ${c.green}${c.bold}${unique.length} horarios importados${c.reset}`);
  console.log(`${c.gray}Total en DB: ${total} horarios${c.reset}\n`);

  await closeDb();
}

main().catch(e => {
  console.error(`\n${err} Error:`, e.message);
  process.exit(1);
});
