/**
 * fetch-cinecosmos-prices.ts
 * Scrapes ticket prices from Cine Cosmos UBA (cinecosmos.uba.ar).
 *
 * Prices are embedded in the static homepage HTML as plain text:
 *   "Entrada general: $2800"
 *   "Estudiantes de universidades nacionales, jubilados/as y pensionados/as: $1800"
 *   "Comunidad UBA: $1400"
 *   "Personas con certificado de discapacidad: $800"
 *
 * Note: prices are the same every day (no day-type variation).
 *
 * Run with:  npx tsx scripts/fetch-cinecosmos-prices.ts
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

const TZ = "America/Argentina/Buenos_Aires";
function localToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Price parsing ─────────────────────────────────────────────────────
interface ParsedPrice {
  audienceType: string;
  amountCents:  number;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
}

function parsePrices(html: string): ParsedPrice[] {
  // Strip scripts and styles first
  const clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  const text = stripHtml(clean);

  const results: ParsedPrice[] = [];

  // Pattern: "LABEL: $PRICE" where PRICE is a number like 2800, 1.800, etc.
  const priceRe = /([^$\n]{5,80})\$\s*([\d.,]+)/g;
  let m: RegExpExecArray | null;

  while ((m = priceRe.exec(text)) !== null) {
    const label = m[1].toLowerCase().trim();
    const priceStr = m[2].replace(/\./g, "").replace(",", ".");
    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0 || price > 100000) continue;
    const cents = Math.round(price * 100);

    // Map label to audience type
    let audienceType: string | null = null;

    if (label.includes("general")) {
      audienceType = "general";
    } else if (
      label.includes("jubilado") || label.includes("pensionado") || label.includes("mayor")
    ) {
      // "jubilados/as y pensionados/as" — also maps estudiante separately below
      audienceType = "jubilado";
    } else if (label.includes("estudiante") || label.includes("universit")) {
      audienceType = "estudiante";
    } else if (label.includes("discapacidad") || label.includes("certificado")) {
      audienceType = "discapacidad";
    } else if (label.includes("uba") || label.includes("comunidad")) {
      audienceType = "uba";
    } else if (label.includes("menor") || label.includes("niño")) {
      audienceType = "menor";
    }

    if (!audienceType) continue;

    // Avoid duplicates
    if (results.some(r => r.audienceType === audienceType)) continue;
    results.push({ audienceType, amountCents: cents });
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const today   = localToday();
  const scrapedAt = new Date().toISOString();

  console.log(`\n${c.bold}Cine Cosmos Prices — Scraper${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Fecha: ${c.cyan}${today}${c.reset}\n`);

  // ── Get cinema from DB ─────────────────────────────────────────────
  const dbCinemas = await db.select().from(cinemas);
  const cinema = dbCinemas.find(ci => ci.name.toLowerCase().includes("cosmos"));
  if (!cinema) {
    console.log(`${warn} Cine Cosmos no encontrado en DB. Ejecutá fetch-cinecosmos primero.`);
    await closeDb();
    return;
  }
  console.log(`${ok} Cinema: ${cinema.name} (id=${cinema.id})\n`);

  // ── Fetch homepage ────────────────────────────────────────────────
  console.log(`${info} Descargando homepage...`);
  const url = "https://www.cinecosmos.uba.ar/";
  const html = await fetch(url, { headers: { "User-Agent": UA } }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });

  const parsed = parsePrices(html);

  if (parsed.length === 0) {
    console.log(`${warn} No se encontraron precios en la página.`);
    await closeDb();
    return;
  }

  console.log(`${ok} ${parsed.length} tipos de precio encontrados:`);
  for (const p of parsed) {
    console.log(`  ${ok} ${p.audienceType}: $${(p.amountCents / 100).toLocaleString("es-AR")}`);
  }

  // ── Delete stale cinema-specific prices ───────────────────────────
  await db.delete(prices).where(
    and(eq(prices.chain, "independiente"), eq(prices.cinemaId, cinema.id))
  );

  // ── Upsert — same price all day types ────────────────────────────
  const DAY_TYPES = ["weekday", "wednesday", "weekend"] as const;
  const toInsert: object[] = [];

  for (const { audienceType, amountCents } of parsed) {
    // Map "jubilado" also captures pensionados; "estudiante" is separate tier
    // "uba" and "discapacidad" are special tiers that aren't in the main schema
    // but we still store them (the UI will only show standard ones)
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
        source:       url,
        scrapedAt,
      });
    }
  }

  await db.insert(prices).values(toInsert as any).onConflictDoNothing();

  const summary = parsed
    .map(p => `${p.audienceType}=$${(p.amountCents / 100).toLocaleString("es-AR")}`)
    .join("  ");
  console.log(`\n${ok} ${c.green}${c.bold}${toInsert.length} precios guardados${c.reset}`);
  console.log(`${c.gray}${summary}${c.reset}\n`);

  await closeDb();
}

main().catch(e => {
  console.error(`\n${fail} Error:`, e.message);
  process.exit(1);
});
