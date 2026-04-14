/**
 * fetch-cinemark.ts
 * Scrapes showtimes from all Cinemark/Hoyts theaters via the BFF API.
 *
 * API: https://bff.cinemark.com.ar/api
 * Required header: country: AR
 * Key endpoint: GET /cinema/showtimes?theater={id}
 *   → returns all upcoming showtimes for that theater in one call
 *
 * Uso:
 *   npx tsx scripts/fetch-cinemark.ts
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

// ── API ───────────────────────────────────────────────────────────────
const BASE = "https://bff.cinemark.com.ar/api";
const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  "Accept":     "application/json",
  "country":    "AR",
};

// ── Mapeos ────────────────────────────────────────────────────────────
// Format names from the BFF → canonical
const FORMAT_MAP: Record<string, string> = {
  "2D":           "2D",
  "3D":           "3D",
  "IMAX":         "IMAX",
  "IMAX 2D":      "IMAX",
  "IMAX 3D":      "IMAX",
  "D-BOX":        "2D",     // D-BOX is a seat type, not a projection format
  "DBOX 2D":      "2D",
  "DBOX 3D":      "3D",
  "4D E-MOTION":  "4DX",
  "XD DIGITAL":   "XD",
  "PREMIUM CLASS":"2D",
  "COMFORT":      "2D",
};

// Theaters that don't have an IMAX screen — downgrade IMAX sessions to 2D.
// The BFF sometimes returns IMAX format data for these theaters in error.
const NO_IMAX_THEATERS = new Set([
  104, // Hoyts Unicenter (Martínez) — no IMAX screen
]);

// Language shortNames from BFF → our language codes
function parseLanguage(shortName: string): string {
  switch (shortName?.toUpperCase()) {
    case "CAST": return "cas";
    case "SUB":  return "sub";
    default:     return "sub";
  }
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

// ── Helpers ───────────────────────────────────────────────────────────
function normalize(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function capitalize(s: string): string {
  return s.toLowerCase().replace(/(?:^|\s|:|-)\S/g, ch => ch.toUpperCase());
}

// The BFF tags sessionDateTime with "Z" (UTC) but the HH:MM actually
// represents local ART time already — parsing it as UTC and converting to
// ART erroneously subtracts another 3 hours (observed: app shows 19:00 for
// a session the cinema runs at 22:00). Extract HH:MM from the ISO string
// directly, with no Date parsing or TZ math.
function utcToLocalTime(isoStr: string): string {
  const m = isoStr.match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "00:00";
}

// ── Theater zone/city mapping ─────────────────────────────────────────
// BFF gives us city + address but zone needs manual mapping
const THEATER_ZONE: Record<number, { zone: string; city: string }> = {
  103:  { zone: "CABA",      city: "Buenos Aires" },  // Abasto
  734:  { zone: "CABA",      city: "Buenos Aires" },  // Caballito
  111:  { zone: "CABA",      city: "Buenos Aires" },  // DOT
  733:  { zone: "CABA",      city: "Buenos Aires" },  // Palermo
  730:  { zone: "CABA",      city: "Buenos Aires" },  // Puerto Madero
  2015: { zone: "GBA Sur",   city: "Avellaneda"  },  // Alto Avellaneda
  749:  { zone: "GBA Oeste", city: "Morón"        },  // Malvinas Argentina
  110:  { zone: "GBA Oeste", city: "Moreno"       },  // Moreno
  101:  { zone: "GBA Oeste", city: "Morón"        },  // Moron
  102:  { zone: "GBA Sur",   city: "Quilmes"      },  // Quilmes
  748:  { zone: "GBA Oeste", city: "San Justo"    },  // San Justo
  739:  { zone: "GBA Norte", city: "Béccar"       },  // Soleil
  109:  { zone: "GBA Sur",   city: "Temperley"    },  // Temperley
  756:  { zone: "GBA Norte", city: "Tortuguitas"  },  // Tortugas
  104:  { zone: "GBA Norte", city: "Martínez"     },  // Unicenter
  732:  { zone: "Mendoza",   city: "Mendoza"      },  // Mendoza
  2014: { zone: "Neuquén",   city: "Neuquén"      },  // Neuquen
  105:  { zone: "Córdoba",   city: "Córdoba"      },  // Nuevo Centro
  106:  { zone: "Córdoba",   city: "Córdoba"      },  // Patio Olmos
  113:  { zone: "Rosario",   city: "Rosario"      },  // Rosario
  107:  { zone: "Salta",     city: "Salta"        },  // Salta Alto NOA
  2013: { zone: "Salta",     city: "Salta"        },  // Salta Hiper Libertad
  745:  { zone: "Santa Fe",  city: "Santa Fe"     },  // Santa Fe
};

// Theater name normalization
// HOYTS_IDS: theaters whose DB entry uses the "Hoyts" brand prefix
const HOYTS_IDS = new Set([101, 102, 103, 104, 109, 110, 111, 745]);
// THEATER_NAME_OVERRIDE: theaters where BFF name ≠ DB canonical name
const THEATER_NAME_OVERRIDE: Record<number, string> = {
  111:  "Hoyts Dot Baires",    // BFF: "DOT",             DB: "Hoyts Dot Baires"
  2015: "Cinemark Avellaneda", // BFF: "Alto Avellaneda",  DB: "Cinemark Avellaneda"
};
function theaterDisplayName(t: { id: number; name: string }): string {
  if (THEATER_NAME_OVERRIDE[t.id]) return THEATER_NAME_OVERRIDE[t.id];
  const brand = HOYTS_IDS.has(t.id) ? "Hoyts" : "Cinemark";
  return `${brand} ${t.name}`;
}

// ── BFF types ─────────────────────────────────────────────────────────
interface BffTheater {
  id: number;
  name: string;
  address: string;
  city: string;
  latitude: string;
  longitude: string;
}

interface BffShowtime {
  movieId: string;
  movieName: string;
  language: { shortName: string };
  formats: { name: string }[];
  sessionId: string;
  sessionFormat: string;
  sessionDateTime: string;  // UTC ISO
  sessionDisplayDate: string;  // YYYY-MM-DD local
  theaterId: string;
}

const DRY_RUN = process.argv.includes("--dry-run");

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const from = localToday();
  const to   = addDays(from, 14);

  console.log(`\n${c.bold}Cinemark/Hoyts — Importador directo a DB${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Rango: ${c.cyan}${from}${c.reset} → ${c.cyan}${to}${c.reset}\n`);

  // ── Fetch theater list ────────────────────────────────────────────
  console.log(`${info} Obteniendo lista de cines...`);
  const theatersResp = await fetch(`${BASE}/cinema/theaters`, { headers: HEADERS }).then(r => r.json());
  const theaters: BffTheater[] = theatersResp.data;
  console.log(`${ok} ${theaters.length} cines encontrados\n`);

  const scrapedAt = new Date().toISOString();

  const dbCinemas = await db.select().from(cinemas);
  const dbMovies  = await db.select().from(movies);
  const cinemaByName = new Map(dbCinemas.map(cinema => [normalize(cinema.name), cinema]));
  const movieByTitle = new Map(dbMovies.map(movie => [normalize(movie.title), movie]));

  const toInsert: Array<{
    movieId: number; cinemaId: number; date: string; time: string;
    format: string; language: string; bookingUrl: string | null; scrapedAt: string;
  }> = [];

  const cinemarkIds: number[] = [];

  for (const t of theaters) {
    const displayName = theaterDisplayName(t);
    const zoneInfo = THEATER_ZONE[t.id] ?? { zone: "Interior", city: t.city };

    // Ensure cinema exists
    let cinema = cinemaByName.get(normalize(displayName));
    if (!cinema) {
      if (DRY_RUN) {
        console.log(`  ${warn} [DRY] Cine nuevo (no insertado): ${c.yellow}${displayName}${c.reset} [${zoneInfo.zone}]`);
        continue;
      }
      const [inserted] = await db.insert(cinemas).values({
        name: displayName, chain: "cinemark", zone: zoneInfo.zone,
        city: zoneInfo.city, address: t.address,
        lat: parseFloat(t.latitude) || null,
        lng: parseFloat(t.longitude) || null,
        url: "https://www.cinemark.com.ar",
      }).returning();
      cinema = inserted;
      cinemaByName.set(normalize(cinema.name), cinema);
    }
    cinemarkIds.push(cinema.id);

    // Fetch showtimes for this theater
    let stData: BffShowtime[];
    try {
      const resp = await fetch(`${BASE}/cinema/showtimes?theater=${t.id}`, { headers: HEADERS }).then(r => r.json());
      stData = resp.data ?? [];
    } catch (e: any) {
      console.error(`  ${err} ${displayName}: ${e.message}`);
      continue;
    }

    // Filter to our date range
    const inRange = stData.filter(s => {
      const d = s.sessionDisplayDate;
      return d >= from && d < to;
    });
    if (inRange.length === 0) {
      console.log(`  ${ok} ${displayName}: ${c.gray}sin funciones${c.reset}`);
      continue;
    }

    let count = 0;
    for (const s of inRange) {
      const title     = capitalize(s.movieName);
      const titleNorm = normalize(title);

      // Ensure movie exists
      let movie = movieByTitle.get(titleNorm);
      if (!movie) {
        if (!DRY_RUN) {
          const [inserted] = await db.insert(movies).values({
            title, durationMinutes: null, genres: "", debutWeek: getCurrentDebutWeek(),
          }).returning();
          movie = inserted;
          movieByTitle.set(normalize(movie.title), movie);
        } else {
          movieByTitle.set(titleNorm, { id: -1, title } as any);
          movie = movieByTitle.get(titleNorm)!;
        }
      }

      let format     = FORMAT_MAP[s.sessionFormat] ?? FORMAT_MAP[s.formats?.[0]?.name] ?? "2D";
      if (format === "IMAX" && NO_IMAX_THEATERS.has(t.id)) format = "2D";
      const language = parseLanguage(s.language?.shortName);
      const time     = utcToLocalTime(s.sessionDateTime);
      const bookingUrl = "https://www.cinemark.com.ar";

      toInsert.push({
        movieId: movie.id, cinemaId: cinema.id,
        date: s.sessionDisplayDate, time, format, language,
        bookingUrl, scrapedAt,
      });
      count++;
    }

    console.log(`  ${ok} ${displayName}: ${c.green}${count}${c.reset} funciones`);
  }

  if (toInsert.length === 0) {
    console.log(`\n${warn} No se encontraron horarios para importar.`);
    await closeDb();
    return;
  }

  if (DRY_RUN) {
    const byCinema = new Map<number, typeof toInsert>();
    for (const r of toInsert) {
      if (!byCinema.has(r.cinemaId)) byCinema.set(r.cinemaId, []);
      byCinema.get(r.cinemaId)!.push(r);
    }
    console.log(`\n${c.bold}[DRY RUN] Muestra de horarios por cine:${c.reset}`);
    for (const [cid, rows] of byCinema) {
      const name = [...cinemaByName.values()].find(c => c.id === cid)?.name ?? `id=${cid}`;
      console.log(`\n  ${c.cyan}${name}${c.reset} (${rows.length} funciones)`);
      rows.slice(0, 3).forEach(r => {
        const title = [...movieByTitle.values()].find(m => m.id === r.movieId)?.title ?? `id=${r.movieId}`;
        console.log(`    ${r.date} ${r.time}  ${r.format}/${r.language}  ${title}`);
      });
    }
    const dates = [...new Set(toInsert.map(r => r.date))].sort();
    const newMovies = [...movieByTitle.values()].filter(m => m.id === -1).length;
    console.log(`\n${c.green}${c.bold}[DRY RUN] ${toInsert.length} horarios listos para importar${c.reset}`);
    console.log(`${c.gray}Fechas: ${dates[0]} → ${dates[dates.length - 1]} | Películas nuevas: ${newMovies}${c.reset}\n`);
    await closeDb();
    return;
  }

  // Wipe existing Cinemark showtimes from today onwards before inserting the
  // fresh batch. onConflictDoNothing only dedupes identical rows — it never
  // removes rows whose source session has been cancelled or rescheduled, so
  // without this DELETE, stale phantom showtimes would accumulate forever.
  // We restrict to `date >= from` so historical rows (useful for analytics)
  // are preserved.
  if (cinemarkIds.length > 0) {
    console.log(`\n${info} Limpiando horarios obsoletos de ${cinemarkIds.length} cines Cinemark (desde ${from})…`);
    await db.delete(showtimes).where(
      and(
        inArray(showtimes.cinemaId, cinemarkIds),
        gte(showtimes.date, from),
      )
    );
  }

  // Insert in batches (upsert — skip duplicates)
  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await db.insert(showtimes).values(toInsert.slice(i, i + BATCH)).onConflictDoNothing();
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
