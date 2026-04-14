/**
 * fetch-malba.ts
 * Scrapes showtimes from MALBA Cine (malba.org.ar/eventos/de/cine/)
 * and imports them directly to the database.
 *
 * Data source: WordPress + The Events Calendar plugin.
 * - Listing page: /eventos/de/cine/ + homepage → extract /evento/ slugs
 * - Event pages have two schedule patterns:
 *   A) Explicit <p> tags: "SÁBADO 4 20:00 Blue Heron, de Sophy Romvary"
 *   B) Recurring: "sucederá desde el ... Ocurrirá nuevamente el 04.04.2026 10:00 pm"
 *
 * Uso:
 *   npx tsx scripts/fetch-malba.ts
 */

import { db, closeDb, getCurrentDebutWeek } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";

// ── Colores ───────────────────────────────────────────────────────────
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m" };
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

// ── Cinema info ───────────────────────────────────────────────────────
const CINEMA = {
  name:    "Malba Cine",
  chain:   "independiente",
  zone:    "CABA",
  city:    "Buenos Aires",
  address: "Av. Figueroa Alcorta 3415, Palermo, Buenos Aires",
  lat:     -34.5765,
  lng:     -58.4110,
  url:     "https://malba.org.ar/cine/",
};

const LISTING_URLS = [
  "https://malba.org.ar/eventos/de/cine/",
  "https://malba.org.ar/",
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
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
function dateFromParts(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function advanceDay(dateStr: string): string {
  return addDays(dateStr, 1);
}
function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T12:00:00").getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
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
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#[^;]+;/g, " ").replace(/\s+/g, " ").trim();
}
function removeScriptsStyles(html: string): string {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
             .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
}

// ── Spanish month names ───────────────────────────────────────────────
const MONTH_MAP: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

// ── Spanish day-of-week → JS getDay() ─────────────────────────────────
// normalize() strips accents, so "sábado" → "sabado", "miércoles" → "miercoles"
const DOW_MAP: Record<string, number> = {
  lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0,
};

// ── 12h → 24h time ────────────────────────────────────────────────────
function to24h(h: string, m: string, ampm: string): string {
  let hour = parseInt(h);
  if (ampm.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${m}`;
}

// ── Screening type ─────────────────────────────────────────────────────
interface Screening {
  date:  string;
  time:  string;
  title: string;
}

// ── Fetch helpers ─────────────────────────────────────────────────────
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ── Extract /evento/ slugs from a page ────────────────────────────────
function extractEventSlugs(html: string): string[] {
  const slugs = new Set<string>();
  const re = /href="https?:\/\/malba\.org\.ar\/evento\/([^/"]+)\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    slugs.add(m[1]);
  }
  return [...slugs];
}

// ── Parse explicit schedule paragraphs ────────────────────────────────
// Paragraph format: "DAYNAME DAYNUM[/MONTH] [de MONTHNAME] TIME TITLE [TIME TITLE ...]"
// Example: "SÁBADO 4 20:00 Blue Heron, de Sophy Romvary"
// Example: "JUEVES 2 19:00 El candidato, de Fernando Ayala 21:00 La fiaca, de Fernando Ayala"
// Example: "SÁBADO 2/5 24:00 Eraserhead"
// Example: "VIERNES 1 de mayo 22:00 Primero yo, de Fernando Ayala"
const DAY_NAMES = "(LUNES|MARTES|MI[EÉ]RCOLES|JUEVES|VIERNES|S[AÁ]BADO|DOMINGO)";

function parseScheduleParagraph(raw: string, endDate: Date): Screening[] {
  // Normalize corrupted SÁBADO encoding
  const text = raw
    .replace(/S[\udc81\u0081\u0301]BADO/g, "SÁBADO")
    .replace(/MI[\udc89\u0089\u0301]RCOLES/g, "MIÉRCOLES")
    .replace(/\s+/g, " ").trim();

  const dayRe = new RegExp(
    `^${DAY_NAMES}\\s+(\\d{1,2})(?:\\/(\\d{1,2}))?\\s*(?:de\\s+(\\w+))?\\s+(.+)$`,
    "i"
  );
  const m = text.match(dayRe);
  if (!m) return [];

  const dayNum = parseInt(m[2]);
  const slashMonth = m[3] ? parseInt(m[3]) : null;
  const namedMonth = m[4] ? MONTH_MAP[m[4].toLowerCase()] ?? null : null;

  let month: number;
  let year: number;
  let inferredMonth = false;

  if (slashMonth) {
    // "SÁBADO 2/5" → May 2
    month = slashMonth;
    year = endDate.getFullYear();
  } else if (namedMonth) {
    // "VIERNES 1 de mayo"
    month = namedMonth;
    year = endDate.getFullYear();
    // Handle year wrap
    if (month < endDate.getMonth() + 1 - 6) year++;
  } else {
    // Infer month from endDate — validate with DOW below
    inferredMonth = true;
    month = endDate.getMonth() + 1;
    year  = endDate.getFullYear();
  }

  // When month was inferred (no explicit slash or name), validate day-of-week.
  // Start from today's month (not endDate's month) and advance until the day number
  // falls on the right weekday. This correctly handles events with no explicit year-month
  // context (the fallback endDate can be months ahead, leading to wrong offsets).
  if (inferredMonth) {
    const expectedDow = DOW_MAP[normalize(m[1])];
    if (expectedDow !== undefined) {
      const todayD = new Date(localToday() + "T12:00:00");
      month = todayD.getMonth() + 1;
      year  = todayD.getFullYear();
      let tries = 0;
      while (tries < 12) {
        const candidate = dateFromParts(dayNum, month, year);
        // Ensure the day actually exists in that month (e.g. no Feb 31)
        if (
          new Date(candidate + "T12:00:00").getDate() === dayNum &&
          dayOfWeek(candidate) === expectedDow
        ) break;
        month++;
        if (month > 12) { month = 1; year++; }
        tries++;
      }
      if (tries === 12) return []; // couldn't reconcile — skip
    }
  }

  const baseDateStr = dateFromParts(dayNum, month, year);
  const remainder   = m[5];

  // Extract time+title pairs: "HH:MM Title , de Director TIME2 ..."
  const timeRe = /(\d{1,2}:\d{2})\s+([\s\S]+?)(?=\d{1,2}:\d{2}|$)/g;
  let tm: RegExpExecArray | null;
  const screenings: Screening[] = [];

  while ((tm = timeRe.exec(remainder)) !== null) {
    let time  = tm[1].padStart(5, "0");
    let title = tm[2].trim();

    // Strip ", de Director" suffix (keep title before first ", de [Uppercase]")
    title = title.replace(/,\s+de\s+[A-ZÁÉÍÓÚÑÜ][\s\S]*$/, "").trim();
    // Remove trailing comma
    title = title.replace(/,\s*$/, "").trim();
    if (!title) continue;

    title = capitalize(title);

    // 24:00 → 00:00 of the NEXT day
    let date = baseDateStr;
    if (time === "24:00") {
      time = "00:00";
      date = advanceDay(baseDateStr);
    }

    screenings.push({ date, time, title });
  }

  return screenings;
}

// ── Parse event page ──────────────────────────────────────────────────
async function parseEventPage(slug: string): Promise<Screening[]> {
  const url = `https://malba.org.ar/evento/${slug}/`;
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    return [];
  }

  const clean = removeScriptsStyles(html);
  const bodyText = stripHtml(clean);

  // Only process events categorized as Cine or related.
  // Check both taxonomy links in raw HTML and text-based "Categorías:" label.
  // Detect cinema category from taxonomy links in raw HTML or the "Categorías:" text label.
  // bodyText has no newlines (collapsed to spaces), so we stop capture before "Etiquetas:" to
  // avoid collecting the entire page footer (which always contains "MALBA Cine").
  const cineCatLink = /\/(?:categoria|category)\/[^"']*(?:cine|pelicula|ciclo)[^"']*/i.test(html);
  const catTextMatch = bodyText.match(/Categor[íi]as?:\s*(.+?)(?=\s*Etiquetas:|\s{5}|$)/i);
  const catText = catTextMatch ? catTextMatch[1].toLowerCase() : "";
  const hasCineText = catText.includes("cine") || catText.includes("pel") || catText.includes("ciclo");
  const isCineEvent = cineCatLink || hasCineText;

  // If we can positively identify a non-cinema category, skip the event
  if (!isCineEvent && (catTextMatch || cineCatLink)) return [];

  // ── Try pattern A: explicit schedule in <p> tags ──────────────────
  const scheduleParas: string[] = [];
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(clean)) !== null) {
    const text = stripHtml(pm[1]).replace(/\s+/g, " ").trim();
    // Must match DAYNAME + DAYNUM + time pattern
    if (/^(LUNES|MARTES|MI[ÉE]RCOLES|JUEVES|VIERNES|S[AÁ]BADO|DOMINGO|S[\udc81\u0081]BADO)\s+\d/i.test(text)) {
      scheduleParas.push(text);
    }
  }

  if (scheduleParas.length > 0) {
    // Get end date from last DD.MM.YYYY in page
    const allDates = [...bodyText.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)];
    const endDateStr = allDates.length > 0
      ? (() => {
          const last = allDates[allDates.length - 1];
          return `${last[3]}-${last[2]}-${last[1]}`;
        })()
      : addDays(localToday(), 60);
    const endDate = new Date(endDateStr + "T12:00:00");

    const screenings: Screening[] = [];
    for (const para of scheduleParas) {
      screenings.push(...parseScheduleParagraph(para, endDate));
    }
    return screenings;
  }

  // ── Pattern B: recurring event ────────────────────────────────────
  // "sucederá desde el 6 marzo 2026 hasta el 1 mayo 2026. Ocurrirá nuevamente el 03.04.2026 8:00 pm"
  // Also: "Este evento sucederá el 10.04.2026 6:00 pm"
  const recurMatch = bodyText.match(
    /suced[aer]+[^.]*?(?:hasta el (\d+ \w+ \d{4})[^.]*?)?[.]\s*Ocurrir[aá] nuevamente el (\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i
  ) ?? bodyText.match(
    /suced[aer]+[^.]*?el (\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i
  );

  // Parse "Ocurrirá nuevamente el DD.MM.YYYY H:MM pm"
  const nextOccMatch = bodyText.match(
    /Ocurrir[aá] nuevamente el (\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i
  );

  if (!nextOccMatch) {
    // Last resort: just find any DD.MM.YYYY H:MM pm in the body
    // Require confirmed cine category to avoid importing talks/workshops/exhibitions
    if (!isCineEvent) return [];

    const singleDate = bodyText.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (!singleDate) return [];

    const dateStr = `${singleDate[3]}-${singleDate[2]}-${singleDate[1]}`;
    const time    = to24h(singleDate[4], singleDate[5], singleDate[6]);
    const title   = capitalize(extractTitle(html));
    return title ? [{ date: dateStr, time, title }] : [];
  }

  // Pattern B recurring: also require cine category
  if (!isCineEvent) return [];

  // Next occurrence date + time
  const nextDay   = parseInt(nextOccMatch[1]);
  const nextMonth = parseInt(nextOccMatch[2]);
  const nextYear  = parseInt(nextOccMatch[3]);
  const nextTime  = to24h(nextOccMatch[4], nextOccMatch[5], nextOccMatch[6]);
  const nextDate  = dateFromParts(nextDay, nextMonth, nextYear);

  // Determine end date
  let endDateStr: string | null = null;
  const endMatch = bodyText.match(/hasta el (\d+) (\w+) (\d{4})/i);
  if (endMatch) {
    const eDay   = parseInt(endMatch[1]);
    const eMonth = MONTH_MAP[endMatch[2].toLowerCase()];
    const eYear  = parseInt(endMatch[3]);
    if (eMonth) endDateStr = dateFromParts(eDay, eMonth, eYear);
  }
  if (!endDateStr) {
    // Fallback: 60 days from today
    endDateStr = addDays(localToday(), 60);
  }

  // Day of week of first occurrence (use nextDate as anchor)
  const anchorDow = dayOfWeek(nextDate);

  // Generate weekly occurrences from nextDate to endDate, within window
  const title   = capitalize(extractTitle(html));
  if (!title) return [];

  const today   = localToday();
  const windowEnd = addDays(today, 14);
  const screenings: Screening[] = [];

  let cur = nextDate;
  while (cur <= windowEnd && cur <= endDateStr) {
    if (cur >= today) {
      let time = nextTime;
      let date = cur;
      // Handle 24:00
      if (time === "24:00") { time = "00:00"; date = advanceDay(cur); }
      screenings.push({ date, time, title });
    }
    cur = addDays(cur, 7);
  }

  return screenings;
}

// ── Extract H1 title from event page ─────────────────────────────────
function extractTitle(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1) return "";
  return stripHtml(h1[1]).trim();
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const from = localToday();
  const to   = addDays(from, 14);

  console.log(`\n${c.bold}MALBA Cine — Importador directo a DB${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Rango: ${c.cyan}${from}${c.reset} → ${c.cyan}${to}${c.reset}\n`);

  const scrapedAt = new Date().toISOString();

  const dbCinemas = await db.select().from(cinemas);
  const dbMovies  = await db.select().from(movies);
  const cinemaByName = new Map(dbCinemas.map(cinema => [normalize(cinema.name), cinema]));
  const movieByTitle = new Map(dbMovies.map(movie => [normalize(movie.title), movie]));

  // ── Ensure cinema exists ────────────────────────────────────────────
  let cinema = cinemaByName.get(normalize(CINEMA.name));
  if (!cinema) {
    console.log(`  ${warn} Cine nuevo, creando: ${c.yellow}${CINEMA.name}${c.reset}`);
    const [inserted] = await db.insert(cinemas).values(CINEMA).returning();
    cinema = inserted;
    cinemaByName.set(normalize(cinema.name), cinema);
  }

  // ── Collect event slugs ─────────────────────────────────────────────
  const slugSet = new Set<string>();
  for (const listUrl of LISTING_URLS) {
    try {
      const html = await fetchHtml(listUrl);
      for (const s of extractEventSlugs(html)) slugSet.add(s);
      console.log(`${ok} ${slugSet.size} slugs tras ${listUrl}`);
    } catch (e) {
      console.log(`${warn} No se pudo cargar ${listUrl}`);
    }
  }
  console.log(`${info} Total slugs únicos: ${c.cyan}${slugSet.size}${c.reset}\n`);

  // ── Fetch and parse each event ───────────────────────────────────────
  const allScreenings: Screening[] = [];
  for (const slug of slugSet) {
    try {
      const screenings = await parseEventPage(slug);
      if (screenings.length > 0) {
        console.log(`  ${ok} ${slug}: ${screenings.length} funciones`);
        allScreenings.push(...screenings);
      }
    } catch (e) {
      console.log(`  ${warn} Error en ${slug}: ${(e as Error).message}`);
    }
    await sleep(300);
  }

  // ── Filter to date range ────────────────────────────────────────────
  const inRange = allScreenings.filter(s => s.date >= from && s.date <= to);
  console.log(`\n${ok} ${allScreenings.length} funciones totales, ${inRange.length} en rango`);

  if (inRange.length === 0) {
    console.log(`${warn} No hay funciones en el rango ${from}–${to}.`);
    await closeDb();
    return;
  }

  // ── Match/create movies ─────────────────────────────────────────────
  const toInsert: Array<{
    movieId: number; cinemaId: number; date: string; time: string;
    format: string; language: string; bookingUrl: null; scrapedAt: string;
  }> = [];

  for (const s of inRange) {
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

    // MALBA Cine: art house, mostly in original language with subtitles
    toInsert.push({
      movieId:    movie.id,
      cinemaId:   cinema.id,
      date:       s.date,
      time:       s.time,
      format:     "2D",
      language:   "sub",
      bookingUrl: null,
      scrapedAt,
    });
  }

  // ── Deduplicate by (movieId, cinemaId, date, time) ──────────────────
  const seen = new Set<string>();
  const deduped = toInsert.filter(r => {
    const key = `${r.movieId}|${r.cinemaId}|${r.date}|${r.time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const dupes = toInsert.length - deduped.length;
  if (dupes > 0) console.log(`${info} ${dupes} duplicados eliminados`);

  // ── Insert in batches (upsert — skip duplicates) ───────────────────
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
  console.error(`\n${c.red}✗${c.reset} Error:`, e.message);
  process.exit(1);
});
