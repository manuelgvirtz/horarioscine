/**
 * fetch-cacodelphia-prices.ts
 * Scrapes ticket prices from CineArte Cacodelphia via the GAF API.
 *
 * The GAF API exposes a /tickets/{cinemaId}/{fref} endpoint that returns
 * all ticket types with their prices for a given showtime (fref = showtime ref).
 *
 * Strategy:
 *   1. Fetch today's showtimes from the DB for Cacodelphia (cinemaId from DB).
 *   2. Get one fref per format from the GAF /movie/{cinemaId}/{pref} endpoint.
 *   3. Call /tickets/{cinemaId}/{fref} → parse ticket types and prices.
 *   4. Map: GENERAL → general, JUBILADO → jubilado, MENOR/MENORES → menor.
 *   5. Delete stale cinema-specific prices and upsert fresh data.
 *
 * Run with:  npx tsx scripts/fetch-cacodelphia-prices.ts
 */

import { db, closeDb } from "./db";
import { cinemas, prices } from "../src/db/schema";
import { eq, and } from "drizzle-orm";

// ── Colours ───────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
  cyan: "\x1b[36m", gray: "\x1b[90m",
};
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const fail = `${c.red}✗${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

// ── Config ────────────────────────────────────────────────────────────
const GAF_CINEMA_ID = 86;
const BASE = "https://apiv2.gaf.adro.studio";
const HEADERS = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };

const TZ = "America/Argentina/Buenos_Aires";
function localToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
function getDayType(dateStr: string): "weekday" | "wednesday" | "weekend" {
  const dow = new Date(dateStr + "T12:00:00").getDay();
  if (dow === 3) return "wednesday";
  if (dow === 0 || dow === 6) return "weekend";
  return "weekday";
}

async function gafGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${BASE}${path}`);
  const json = await res.json() as { status: string; data?: T } | T;
  return (json as any).data ?? json as T;
}

// ── Ticket types from /tickets/{cinemaId}/{fref} ──────────────────────
interface GafTicket {
  detalle: string;    // "GENERAL", "JUBILADO", "MENORES DE 16", etc.
  precio:  string;    // "9000.00" (pesos, 2 decimal places)
}

interface GafTicketsResponse {
  tickets: GafTicket[];
}

function mapAudienceType(detalle: string): string | null {
  const name = detalle.toLowerCase().trim();
  if (name.includes("general")) return "general";
  if (name.includes("jubilado") || name.includes("mayor") || name.includes("3ra edad")) return "jubilado";
  if (name.includes("menor") || name.includes("niño") || name.includes("infan")) return "menor";
  if (/2\s*[xX×]\s*1/.test(name)) return "2x1";
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const today   = localToday();
  const dayType = getDayType(today);
  const scrapedAt = new Date().toISOString();

  console.log(`\n${c.bold}CineArte Cacodelphia Prices — Scraper${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Fecha: ${c.cyan}${today}${c.reset} (${dayType})\n`);

  // ── Get the cinema record from DB ─────────────────────────────────
  const dbCinemas = await db.select().from(cinemas);
  const cinema = dbCinemas.find(c => c.chain === "independiente" && c.name.toLowerCase().includes("cacodelphia"));
  if (!cinema) {
    console.log(`${warn} CineArte Cacodelphia no encontrado en DB. Ejecutá fetch-cacodelphia primero.`);
    await closeDb();
    return;
  }
  console.log(`${ok} Cinema: ${cinema.name} (id=${cinema.id})\n`);

  // ── Fetch current movies from GAF ─────────────────────────────────
  console.log(`${info} Obteniendo cartelera GAF...`);

  interface GafMovie { pref: string; nombre: string; }
  const nowPlaying = await gafGet<GafMovie[]>(`/nowPlaying/${GAF_CINEMA_ID}`);
  console.log(`${ok} ${nowPlaying.length} películas en cartelera\n`);

  if (nowPlaying.length === 0) {
    console.log(`${warn} Sin películas hoy en cartelera.`);
    await closeDb();
    return;
  }

  // ── Collect one fref per format from the first movie's showtimes ──
  // We just need one valid fref to get the pricing tiers (prices are
  // cinema-wide per tier, not per-movie).
  interface GafShowtime {
    fref: string; formato: string; expired: boolean; vender: string; mostrar: string;
  }
  interface GafMovieDetail { showtimes: GafShowtime[]; }

  const tiers = new Map<string, number>(); // audienceType → amountCents

  // Iterate movies until we have a complete set (general at minimum)
  for (const movie of nowPlaying) {
    if (tiers.has("general")) break;

    let detail: GafMovieDetail;
    try {
      detail = await gafGet<GafMovieDetail>(`/movie/${GAF_CINEMA_ID}/${movie.pref}`);
    } catch {
      continue;
    }

    const validShowtimes = detail.showtimes.filter(
      s => !s.expired && s.vender === "1" && s.mostrar === "1"
    );
    if (validShowtimes.length === 0) continue;

    const fref = validShowtimes[0].fref;

    // Fetch ticket types for this showtime
    let ticketsData: GafTicketsResponse;
    try {
      ticketsData = await gafGet<GafTicketsResponse>(`/tickets/${GAF_CINEMA_ID}/${fref}`);
    } catch (e) {
      console.log(`  ${warn} ${movie.nombre}: error fetching tickets — ${(e as Error).message}`);
      continue;
    }

    const tickets = ticketsData.tickets ?? [];
    console.log(`${info} ${movie.nombre}: ${tickets.length} tipos de ticket`);

    for (const ticket of tickets) {
      const audienceType = mapAudienceType(ticket.detalle);
      if (!audienceType || tiers.has(audienceType)) continue;

      const price = parseFloat(ticket.precio);
      if (isNaN(price) || price <= 0) continue;

      const cents = Math.round(price * 100);
      tiers.set(audienceType, cents);
      console.log(`  ${ok} ${ticket.detalle} → ${audienceType}: $${(cents / 100).toLocaleString("es-AR")}`);
    }
  }

  if (tiers.size === 0) {
    console.log(`\n${warn} No se pudieron obtener precios.`);
    await closeDb();
    return;
  }

  // ── Delete stale cinema-specific prices ───────────────────────────
  await db.delete(prices).where(
    and(eq(prices.chain, "independiente"), eq(prices.cinemaId, cinema.id))
  );

  // ── Build and upsert price rows ───────────────────────────────────
  const toInsert: object[] = [];
  const DAY_TYPES = ["weekday", "wednesday", "weekend"] as const;

  for (const [audienceType, amountCents] of tiers) {
    for (const dt of DAY_TYPES) {
      toInsert.push({
        chain:        "independiente",
        cinemaId:     cinema.id,
        format:       "2D",
        dayType:      dt,
        audienceType,
        amountCents,
        currency:     "ARS",
        validFrom:    today,
        validUntil:   null,
        source:       `https://apiv2.gaf.adro.studio/tickets/${GAF_CINEMA_ID}/*`,
        scrapedAt,
      });
    }
  }

  if (toInsert.length > 0) {
    await db.insert(prices).values(toInsert as any).onConflictDoNothing();
  }

  const summary = [...tiers.entries()]
    .map(([t, c]) => `${t}=$${(c / 100).toLocaleString("es-AR")}`)
    .join("  ");

  console.log(`\n${ok} ${c.green}${c.bold}${toInsert.length} precios guardados${c.reset}`);
  console.log(`${c.gray}${summary}${c.reset}\n`);

  await closeDb();
}

main().catch(e => {
  console.error(`\n${fail} Error:`, e.message);
  process.exit(1);
});
