/**
 * fetch-multiplex-prices.ts
 * Scrapes ticket prices from Multiplex cinemas by fetching one booking page
 * per (cinema × format) combination and parsing the server-rendered price rows.
 *
 * Strategy:
 *   1. Query DB for today's multiplex showtimes, collect one booking URL
 *      per (cinemaId × format) bucket.
 *   2. Fetch each booking URL — prices are server-rendered as:
 *        <span class="dsc-nm">TICKET NAME</span>
 *        ... $PRICE.00 ...
 *      inside <tr> blocks.
 *   3. Map ticket names → audienceType, convert $PRICE.00 → integer centavos.
 *   4. Delete stale cinema-specific rows and upsert the fresh data.
 *
 * Run with:  npx tsx scripts/fetch-multiplex-prices.ts
 */

import { execSync } from "child_process";
import { db, closeDb } from "./db";
import { cinemas, showtimes, prices } from "../src/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";

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
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TZ = "America/Argentina/Buenos_Aires";
function localToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
function getDayType(dateStr: string): "weekday" | "wednesday" | "weekend" {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0=Sun … 6=Sat
  if (dow === 3) return "wednesday";
  if (dow === 0 || dow === 6) return "weekend";
  return "weekday";
}

// ── HTTP ──────────────────────────────────────────────────────────────
function curlGet(url: string): string {
  const cmd = `curl -A "${UA}" -H "Accept: text/html,application/xhtml+xml" -L --silent --max-time 30 "${url}"`;
  return execSync(cmd, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── HTML entity decoder ───────────────────────────────────────────────
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/g, "");
}

// ── Ticket-name → audienceType ────────────────────────────────────────
function mapAudienceType(rawName: string): string | null {
  const name = decodeEntities(rawName).toLowerCase().trim();

  // General — branded differently per cinema:
  //   "I Love Multiplex" (Lavalle), "Precio WEB" / "Precio WEB 3D" (Belgrano/Canning),
  //   "2D General" / "3D General" / "General Web COMFORT PLUS" / "General 2D Web" (Belgrano/Pilar/San Juan),
  //   "4D EMotion WEB" / "WEB 4D E-MOTION" / "4D Emotion Web" (4DX single-option pages),
  //   "2D Xtremo" (Pilar XD)
  if (
    name.includes("i love multiplex") ||
    name.includes("general") ||
    name.includes("precio web") ||
    /^4d[\s(]/.test(name) ||        // "4D EMotion WEB", "4D (sin lentes)", "4D Emotion"
    /^web 4d/.test(name) ||          // "WEB 4D E-MOTION"
    name.includes("4d emotion") ||   // "4D Emotion Web"
    name.includes("e-motion") ||     // "E-MOTION" variants
    name.includes("xtremo")          // "2D Xtremo" (Pilar XD)
  ) return "general";

  // Jubilado / elderly (60+ or 65+ depending on cinema)
  if (
    name.includes("mayor") || name.includes("jubilado") ||
    name.includes("3ra edad") || name.includes("tercera edad")
  ) return "jubilado";

  // Menor / child
  if (
    name.includes("menor") || name.includes("niño") || name.includes("nino") ||
    name.includes("3 a 11") || name.includes("3a11") || name.includes("infan")
  ) return "menor";

  // 2×1 promotions (multiple per page — seen set deduplicates)
  if (/2\s*[xX×]\s*1/i.test(name)) return "2x1";

  return null;
}

// ── HTML parser for Multiplex booking page ────────────────────────────
interface TicketTier {
  audienceType: string;
  amountCents: number;
}

function parseBookingPage(html: string): TicketTier[] {
  const result: TicketTier[] = [];
  const seen = new Set<string>();

  // Prices live inside <tr> blocks. Each block that has a ticket name also
  // has a price in the form "$7700.00" (pesos with 2 decimal places).
  const trBlocks = html.split(/(?=<tr[\s>])/);

  for (const block of trBlocks) {
    const nameMatch = block.match(/class="dsc-nm"[^>]*>([\s\S]*?)<\/span>/);
    if (!nameMatch) continue;

    // Price: "$7.700,00" (Argentine locale) OR "$7700.00" (plain)
    // Handle both: strip dots used as thousand separators, replace comma→dot
    const priceMatch = block.match(/\$\s*([\d.,]+)/);
    if (!priceMatch) continue;

    const rawName = nameMatch[1].replace(/<[^>]+>/g, "").trim();
    const audienceType = mapAudienceType(rawName);
    if (!audienceType || seen.has(audienceType)) continue;

    // Normalise price: remove thousand-separators (dots or commas before 3+ digits),
    // then parse as float and convert to centavos
    let priceStr = priceMatch[1].trim();
    // "7.700,00" → "7700.00" | "7700.00" stays as is
    if (/,\d{2}$/.test(priceStr)) {
      // Argentine locale: dot = thousand separator, comma = decimal
      priceStr = priceStr.replace(/\./g, "").replace(",", ".");
    } else {
      // Plain format: comma = thousand separator, dot = decimal
      priceStr = priceStr.replace(/,/g, "");
    }
    const cents = Math.round(parseFloat(priceStr) * 100);
    if (!cents || cents <= 0) continue;

    seen.add(audienceType);

    // 2×1: the page shows what you pay for 2 people, store per-person price
    const amountCents = audienceType === "2x1" ? Math.round(cents / 2) : cents;
    result.push({ audienceType, amountCents });
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const today   = localToday();
  const dayType = getDayType(today);
  const scrapedAt = new Date().toISOString();

  console.log(`\n${c.bold}Multiplex Prices — Scraper${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Fecha: ${c.cyan}${today}${c.reset} (${dayType})\n`);

  // ── Collect one booking URL per (cinemaId × format) from today's showtimes ──
  console.log(`${info} Buscando booking URLs en DB...`);

  const rows = await db
    .select({
      cinemaId:   showtimes.cinemaId,
      cinemaName: cinemas.name,
      format:     showtimes.format,
      bookingUrl: showtimes.bookingUrl,
    })
    .from(showtimes)
    .innerJoin(cinemas, eq(showtimes.cinemaId, cinemas.id))
    .where(
      and(
        eq(cinemas.chain, "multiplex"),
        eq(showtimes.date, today),
        isNotNull(showtimes.bookingUrl)
      )
    );

  // Deduplicate: one URL per (cinemaId × format) bucket
  const buckets = new Map<string, { cinemaId: number; cinemaName: string; format: string; bookingUrl: string }>();
  for (const row of rows) {
    if (!row.bookingUrl) continue;
    const key = `${row.cinemaId}|${row.format}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        cinemaId:   row.cinemaId,
        cinemaName: row.cinemaName,
        format:     row.format,
        bookingUrl: row.bookingUrl,
      });
    }
  }

  const totalBuckets = buckets.size;
  console.log(`${ok} ${totalBuckets} combinaciones cine × formato\n`);

  if (totalBuckets === 0) {
    console.log(`${warn} No hay funciones de Multiplex hoy. ¿Es muy temprano?\n`);
    await closeDb();
    return;
  }

  // ── Delete stale cinema-specific prices before re-scraping ──────────
  const affectedCinemaIds = [...new Set([...buckets.values()].map(b => b.cinemaId))];
  for (const cinemaId of affectedCinemaIds) {
    await db.delete(prices).where(
      and(eq(prices.chain, "multiplex"), eq(prices.cinemaId, cinemaId))
    );
  }

  // ── Fetch and parse each booking page ────────────────────────────────
  const toInsert: object[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const [, { cinemaId, cinemaName, format, bookingUrl }] of buckets) {
    process.stdout.write(`  ${info} ${cinemaName.padEnd(30)} ${format.padEnd(6)}`);

    try {
      const html = curlGet(bookingUrl);
      const tiers = parseBookingPage(html);

      if (tiers.length === 0) {
        console.log(`${warn} sin precios parseables`);
        failCount++;
        continue;
      }

      for (const { audienceType, amountCents } of tiers) {
        toInsert.push({
          chain:        "multiplex",
          cinemaId,
          format,
          dayType,
          audienceType,
          amountCents,
          currency:     "ARS",
          validFrom:    today,
          validUntil:   null,
          source:       bookingUrl,
          scrapedAt,
        });
      }

      const summary = tiers
        .map(t => `${t.audienceType}=$${(t.amountCents / 100).toLocaleString("es-AR")}`)
        .join("  ");
      console.log(`${c.green}${tiers.length} tiers${c.reset}  ${c.gray}${summary}${c.reset}`);
      successCount++;
    } catch (e) {
      console.log(`${fail} error: ${(e as Error).message}`);
      failCount++;
    }

    await sleep(300);
  }

  // ── Upsert all rows ───────────────────────────────────────────────────
  if (toInsert.length > 0) {
    const BATCH = 200;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      await db.insert(prices).values(toInsert.slice(i, i + BATCH) as any).onConflictDoNothing();
    }
  }

  console.log(`\n${ok} ${c.green}${c.bold}${toInsert.length} precios guardados${c.reset}`);
  console.log(`${c.gray}${successCount} sesiones OK, ${failCount} sin datos${c.reset}\n`);

  await closeDb();
}

main().catch(e => {
  console.error(`\n${fail} Error:`, e.message);
  process.exit(1);
});
