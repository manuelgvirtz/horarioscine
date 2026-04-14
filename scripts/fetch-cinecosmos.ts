/**
 * fetch-cinecosmos.ts
 * Scrapes showtimes from Cine Cosmos UBA (cinecosmos.uba.ar).
 *
 * Data source: static PHP/HTML pages
 *   - Listing: https://www.cinecosmos.uba.ar/
 *     Cards with class "card"; showtimes in <p class="textoPeliFooter">
 *   - Detail:  /?c=main&a=Detalle&idPelicula={id}
 *     Showtimes in <li class="funcionesHora">: "Ju - Vi - Sá - Do - Lu - Ma - Mi | 18:55, 21:05"
 *
 * Schedule pattern:
 *   - Days abbreviations before "|": Ju Vi Sá Do Lu Ma Mi
 *   - Times after "|": comma or hyphen separated, e.g. "18:55, 21:05"
 *   - No online booking (tickets at box office only)
 *
 * Language heuristic:
 *   - Argentine productions (País: Argentina) → "cas"
 *   - All other countries → "sub" (original language, Spanish subtitles)
 *
 * Uso:
 *   npx tsx scripts/fetch-cinecosmos.ts
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
  name:    "Cine Cosmos",
  chain:   "independiente",
  zone:    "CABA",
  city:    "Buenos Aires",
  address: "Av. Corrientes 2046, Buenos Aires",
  phone:   "+54 11 4953-5405",
  lat:     -34.6034,
  lng:     -58.3929,
  url:     "https://www.cinecosmos.uba.ar/",
  type:    "independiente" as const,
};

const BASE_URL   = "https://www.cinecosmos.uba.ar";
const LISTING    = `${BASE_URL}/`;
const UA         = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const sleep      = (ms: number) => new Promise(r => setTimeout(r, ms));

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

// ── Day-of-week mappings ──────────────────────────────────────────────
// getDay() → 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const DAY_ABBR_TO_DOW: Record<string, number> = {
  Do: 0, // Domingo
  Lu: 1, // Lunes
  Ma: 2, // Martes
  Mi: 3, // Miércoles
  Ju: 4, // Jueves
  Vi: 5, // Viernes
  Sá: 6, // Sábado
  Sa: 6, // Alternate without accent
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
    .replace(/&#[^;]+;/g, " ")
    .replace(/\s+/g, " ").trim();
}

function decodeHtml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ")
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

// ── Parse film IDs from listing page ─────────────────────────────────
function parseFilmIds(html: string): number[] {
  const ids = new Set<number>();
  const re = /idPelicula=(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    ids.add(Number(m[1]));
  }
  return [...ids];
}

// ── Parse a film detail page ──────────────────────────────────────────
interface FilmDetail {
  title:    string;
  country:  string;
  showtimeGroups: { days: number[]; times: string[] }[];
}

function parseFilmDetail(html: string): FilmDetail | null {
  // Title
  const titleM = html.match(/<h1[^>]*id="peliculaH1"[^>]*>([\s\S]*?)<\/h1>/i);
  if (!titleM) return null;
  const title = decodeHtml(stripHtml(titleM[1]));

  // Country from peliculaInfoTexto: <b>País:</b> Italia<br>
  let country = "";
  const countryM = html.match(/País\s*:\s*<\/b>\s*([\w\s,áéíóúÁÉÍÓÚüÜñÑ]+?)(?:\s*<br|\s*\n)/i);
  if (countryM) country = countryM[1].trim();

  // Showtime groups: <li class="funcionesHora ..."> ... </li>
  const showtimeGroups: { days: number[]; times: string[] }[] = [];
  const funcRe = /<li[^>]*class="[^"]*funcionesHora[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let funcM: RegExpExecArray | null;

  while ((funcM = funcRe.exec(html)) !== null) {
    const text = stripHtml(funcM[1]);

    // Split on pipe: left = days, right = times
    const pipeIdx = text.indexOf("|");
    const daysPart  = pipeIdx >= 0 ? text.slice(0, pipeIdx) : text;
    const timesPart = pipeIdx >= 0 ? text.slice(pipeIdx + 1) : text;

    // Extract day abbreviations
    const dayAbbrs = daysPart.match(/\b(Ju|Vi|Sá|Sa|Do|Lu|Ma|Mi)\b/g) || [];
    const days = [...new Set(dayAbbrs.map(d => DAY_ABBR_TO_DOW[d]).filter(dow => dow !== undefined))] as number[];

    // Extract times like "18:55" or "18.55"
    const times = (timesPart.match(/\d{1,2}[:.]\d{2}/g) || [])
      .map(t => t.replace(".", ":"));

    if (days.length > 0 && times.length > 0) {
      showtimeGroups.push({ days, times });
    }
  }

  return { title, country, showtimeGroups };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const from = localToday();
  const to   = addDays(from, 14);

  console.log(`\n${c.bold}Cine Cosmos — Importador directo a DB${c.reset}`);
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

  // ── Fetch listing page ────────────────────────────────────────────
  console.log(`${info} Descargando cartelera...`);
  const listingHtml = await fetchHtml(LISTING);
  const filmIds = parseFilmIds(listingHtml);
  console.log(`${ok} ${filmIds.length} películas encontradas\n`);

  const toInsert: Array<{
    movieId: number; cinemaId: number; date: string; time: string;
    format: string; language: string; bookingUrl: string | null; scrapedAt: string;
  }> = [];

  // ── Fetch each film detail page ───────────────────────────────────
  for (const id of filmIds) {
    const url = `${BASE_URL}/?c=main&a=Detalle&idPelicula=${id}`;
    let detail: FilmDetail | null = null;
    try {
      await sleep(400);
      const html = await fetchHtml(url);
      detail = parseFilmDetail(html);
    } catch (e: any) {
      console.error(`  ${err} idPelicula=${id}: ${e.message}`);
      continue;
    }

    if (!detail || detail.showtimeGroups.length === 0) {
      console.log(`  ${warn} idPelicula=${id}: sin funciones parseadas`);
      continue;
    }

    // Language heuristic
    const language = normalize(detail.country).includes("argentina") ? "cas" : "sub";

    // Ensure movie exists
    const titleNorm = normalize(detail.title);
    let movie = movieByTitle.get(titleNorm);
    if (!movie) {
      // Try prefix match
      for (const [k, v] of movieByTitle) {
        if (k.startsWith(titleNorm) && !k[titleNorm.length]?.match(/[a-z0-9]/)) {
          movie = v; break;
        }
      }
    }
    if (!movie) {
      console.log(`  ${warn} Película nueva, creando: ${c.yellow}${detail.title}${c.reset}`);
      const [inserted] = await db.insert(movies).values({ title: detail.title, genres: "" }).returning();
      movie = inserted;
      movieByTitle.set(normalize(movie.title), movie);
    }

    // Expand showtime groups to individual dates
    let count = 0;
    for (const group of detail.showtimeGroups) {
      const daySet = new Set(group.days);
      for (let i = 0; i < 14; i++) {
        const dateStr = addDays(from, i);
        if (dateStr >= to) break;
        const dow = new Date(dateStr + "T12:00:00").getDay();
        if (!daySet.has(dow)) continue;
        for (const time of group.times) {
          toInsert.push({
            movieId:    movie.id,
            cinemaId:   cinema.id,
            date:       dateStr,
            time,
            format:     "2D",
            language,
            bookingUrl: null,
            scrapedAt,
          });
          count++;
        }
      }
    }

    console.log(`  ${ok} ${detail.title} (${detail.country || "?"}) ${c.gray}${language}${c.reset}: ${c.green}${count}${c.reset} funciones`);
  }

  if (toInsert.length === 0) {
    console.log(`\n${warn} No se encontraron horarios para importar.`);
    await closeDb();
    return;
  }

  // ── Purge stale Cine Cosmos showtimes for date >= today ──────────
  // onConflictDoNothing dedupes identical rows but never removes rows whose
  // source session has since been cancelled or rescheduled. Without this
  // DELETE, phantom showtimes accumulate forever.
  console.log(`\n${info} Limpiando horarios obsoletos de Cine Cosmos (desde ${from})…`);
  await db.delete(showtimes).where(
    and(
      gte(showtimes.date, from),
      sql`${showtimes.cinemaId} IN (SELECT id FROM cinemas WHERE name ILIKE '%cosmos%')`,
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
