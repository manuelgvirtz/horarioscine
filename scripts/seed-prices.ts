/**
 * seed-prices.ts
 * Seeds the prices table with manually researched cinema admission prices (ARS).
 *
 * Run with:  npx tsx scripts/seed-prices.ts
 *
 * ─── HOW TO UPDATE ────────────────────────────────────────────────────────────
 * When prices change, add a new entry with the new validFrom date and set
 * validUntil on the old entry. Or simply update the amountCents and bump
 * validFrom to today's date — the resolver always picks the latest valid row.
 *
 * Prices are in ARS centavos: $8.500 = 850000, $10.000 = 1000000, etc.
 *
 * ─── SOURCES (last updated: 2026-04-05) ───────────────────────────────────────
 * Cinemark:   https://www.cinemark.com.ar/comprar/precios
 * Cinépolis:  per-cinema only — fetched by fetch-cinepolis-prices.ts
 * Showcase:   https://www.todoshowcase.com (no price page — from voyalcine.net booking)
 * Atlas:      https://www.atlascines.com
 * Multiplex:  https://www.cinemultiplex.com.ar
 * Gaumont:    https://cinegaumont.ar
 * MALBA:      https://malba.org.ar/cine
 * Others:     box office / manual research
 */

import { db, closeDb } from "./db";
import { prices } from "../src/db/schema";
import { sql, isNull, inArray, and, eq } from "drizzle-orm";

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", gray: "\x1b[90m",
};
const ok   = `${c.green}✓${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

const VALID_FROM = "2026-04-01"; // Prices valid from this date
const scrapedAt  = new Date().toISOString();

type PriceRow = {
  chain: string;
  cinemaId?: number | null;
  format: string;
  dayType: string;
  audienceType: string;
  amountCents: number;
  validFrom: string;
  validUntil?: string | null;
  source?: string | null;
  scrapedAt: string;
};

function entry(
  chain: string,
  format: string,
  dayType: string,
  audienceType: string,
  amountCents: number,
  source?: string
): PriceRow {
  return { chain, cinemaId: null, format, dayType, audienceType, amountCents, validFrom: VALID_FROM, source: source ?? null, scrapedAt };
}

function entryFor(
  chain: string,
  cinemaId: number,
  format: string,
  dayType: string,
  audienceType: string,
  amountCents: number,
  source?: string
): PriceRow {
  return { chain, cinemaId, format, dayType, audienceType, amountCents, validFrom: VALID_FROM, source: source ?? null, scrapedAt };
}

// ─── Price matrix ─────────────────────────────────────────────────────────────
// Each entry: chain, format, dayType, audienceType, amountCents (ARS centavos)

const CINEMARK_SRC = "https://www.cinemark.com.ar/comprar/precios";
const SHOWCASE_SRC = "https://www.voyalcine.net";
const ATLAS_SRC = "https://www.atlascines.com";
const MULTIPLEX_SRC = "https://www.cinemultiplex.com.ar";
const GAUMONT_SRC = "https://cinegaumont.ar";
const MALBA_SRC = "https://malba.org.ar/cine";
const YORK_SRC = "https://cineyork.ar";
const MUNRO_SRC = "https://www.ccmunro.org.ar";
const LORCA_SRC = "https://cinemalorca.com.ar";

const SEED_DATA: PriceRow[] = [
  // ─── Cinemark ──────────────────────────────────────────────────────────────
  // Weekdays (lun/mar/jue/vie)
  entry("cinemark", "2D",   "weekday",   "general",    860000, CINEMARK_SRC),
  entry("cinemark", "2D",   "weekday",   "jubilado",   570000, CINEMARK_SRC),
  entry("cinemark", "2D",   "weekday",   "menor",      570000, CINEMARK_SRC),
  entry("cinemark", "3D",   "weekday",   "general",   1100000, CINEMARK_SRC),
  entry("cinemark", "3D",   "weekday",   "jubilado",   730000, CINEMARK_SRC),
  entry("cinemark", "3D",   "weekday",   "menor",      730000, CINEMARK_SRC),
  entry("cinemark", "IMAX", "weekday",   "general",   1500000, CINEMARK_SRC),
  entry("cinemark", "IMAX", "weekday",   "jubilado",  1000000, CINEMARK_SRC),
  entry("cinemark", "4DX",  "weekday",   "general",   1700000, CINEMARK_SRC),
  entry("cinemark", "XD",   "weekday",   "general",   1050000, CINEMARK_SRC),
  // Wednesday (miércoles de descuento)
  entry("cinemark", "2D",   "wednesday", "general",    640000, CINEMARK_SRC),
  entry("cinemark", "2D",   "wednesday", "jubilado",   430000, CINEMARK_SRC),
  entry("cinemark", "2D",   "wednesday", "menor",      430000, CINEMARK_SRC),
  entry("cinemark", "3D",   "wednesday", "general",    820000, CINEMARK_SRC),
  entry("cinemark", "IMAX", "wednesday", "general",   1200000, CINEMARK_SRC),
  entry("cinemark", "4DX",  "wednesday", "general",   1400000, CINEMARK_SRC),
  entry("cinemark", "XD",   "wednesday", "general",    840000, CINEMARK_SRC),
  // Weekends (sáb/dom)
  entry("cinemark", "2D",   "weekend",   "general",    990000, CINEMARK_SRC),
  entry("cinemark", "2D",   "weekend",   "jubilado",   660000, CINEMARK_SRC),
  entry("cinemark", "2D",   "weekend",   "menor",      660000, CINEMARK_SRC),
  entry("cinemark", "3D",   "weekend",   "general",   1260000, CINEMARK_SRC),
  entry("cinemark", "IMAX", "weekend",   "general",   1700000, CINEMARK_SRC),
  entry("cinemark", "4DX",  "weekend",   "general",   1950000, CINEMARK_SRC),
  entry("cinemark", "XD",   "weekend",   "general",   1200000, CINEMARK_SRC),

  // ─── Showcase ──────────────────────────────────────────────────────────────
  entry("showcase", "2D",   "weekday",   "general",    840000, SHOWCASE_SRC),
  entry("showcase", "2D",   "weekday",   "jubilado",   550000, SHOWCASE_SRC),
  entry("showcase", "2D",   "weekday",   "menor",      550000, SHOWCASE_SRC),
  entry("showcase", "3D",   "weekday",   "general",   1070000, SHOWCASE_SRC),
  entry("showcase", "IMAX", "weekday",   "general",   1430000, SHOWCASE_SRC),
  entry("showcase", "2D",   "wednesday", "general",    620000, SHOWCASE_SRC),
  entry("showcase", "2D",   "wednesday", "jubilado",   410000, SHOWCASE_SRC),
  entry("showcase", "3D",   "wednesday", "general",    800000, SHOWCASE_SRC),
  entry("showcase", "IMAX", "wednesday", "general",   1140000, SHOWCASE_SRC),
  entry("showcase", "2D",   "weekend",   "general",    960000, SHOWCASE_SRC),
  entry("showcase", "2D",   "weekend",   "jubilado",   640000, SHOWCASE_SRC),
  entry("showcase", "3D",   "weekend",   "general",   1230000, SHOWCASE_SRC),
  entry("showcase", "IMAX", "weekend",   "general",   1640000, SHOWCASE_SRC),

  // ─── Atlas ─────────────────────────────────────────────────────────────────
  // Atlas tiene 2D, 3D y 4D (no IMAX). Lunes a miércoles = mitad de precio.
  // "Mayores" (≥60) y "Menores" (<11) tienen precio especial = mismo valor.
  entry("atlas", "2D",   "weekday",   "general",   1300000, ATLAS_SRC),
  entry("atlas", "2D",   "weekday",   "jubilado",  1000000, ATLAS_SRC),
  entry("atlas", "2D",   "weekday",   "menor",     1000000, ATLAS_SRC),
  entry("atlas", "3D",   "weekday",   "general",   1540000, ATLAS_SRC),
  entry("atlas", "3D",   "weekday",   "jubilado",  1240000, ATLAS_SRC),
  entry("atlas", "3D",   "weekday",   "menor",     1240000, ATLAS_SRC),
  entry("atlas", "4DX",  "weekday",   "general",   1700000, ATLAS_SRC),
  entry("atlas", "4DX",  "weekday",   "jubilado",  1350000, ATLAS_SRC),
  entry("atlas", "4DX",  "weekday",   "menor",     1350000, ATLAS_SRC),
  // Lunes a miércoles = mitad de precio (usamos "wednesday" como día de descuento)
  entry("atlas", "2D",   "wednesday", "general",    650000, ATLAS_SRC),
  entry("atlas", "2D",   "wednesday", "jubilado",   500000, ATLAS_SRC),
  entry("atlas", "2D",   "wednesday", "menor",      500000, ATLAS_SRC),
  entry("atlas", "3D",   "wednesday", "general",    770000, ATLAS_SRC),
  entry("atlas", "3D",   "wednesday", "jubilado",   620000, ATLAS_SRC),
  entry("atlas", "3D",   "wednesday", "menor",      620000, ATLAS_SRC),
  entry("atlas", "4DX",  "wednesday", "general",    850000, ATLAS_SRC),
  entry("atlas", "4DX",  "wednesday", "jubilado",   675000, ATLAS_SRC),
  entry("atlas", "4DX",  "wednesday", "menor",      675000, ATLAS_SRC),
  entry("atlas", "2D",   "weekend",   "general",   1300000, ATLAS_SRC),
  entry("atlas", "2D",   "weekend",   "jubilado",  1000000, ATLAS_SRC),
  entry("atlas", "2D",   "weekend",   "menor",     1000000, ATLAS_SRC),
  entry("atlas", "3D",   "weekend",   "general",   1540000, ATLAS_SRC),
  entry("atlas", "3D",   "weekend",   "jubilado",  1240000, ATLAS_SRC),
  entry("atlas", "3D",   "weekend",   "menor",     1240000, ATLAS_SRC),
  entry("atlas", "4DX",  "weekend",   "general",   1700000, ATLAS_SRC),
  entry("atlas", "4DX",  "weekend",   "jubilado",  1350000, ATLAS_SRC),
  entry("atlas", "4DX",  "weekend",   "menor",     1350000, ATLAS_SRC),

  // ─── Multiplex ─────────────────────────────────────────────────────────────
  entry("multiplex", "2D",   "weekday",   "general",    800000, MULTIPLEX_SRC),
  entry("multiplex", "2D",   "weekday",   "jubilado",   530000, MULTIPLEX_SRC),
  entry("multiplex", "2D",   "weekday",   "menor",      530000, MULTIPLEX_SRC),
  entry("multiplex", "3D",   "weekday",   "general",   1020000, MULTIPLEX_SRC),
  entry("multiplex", "2D",   "wednesday", "general",    600000, MULTIPLEX_SRC),
  entry("multiplex", "2D",   "wednesday", "jubilado",   390000, MULTIPLEX_SRC),
  entry("multiplex", "3D",   "wednesday", "general",    760000, MULTIPLEX_SRC),
  entry("multiplex", "2D",   "weekend",   "general",    920000, MULTIPLEX_SRC),
  entry("multiplex", "2D",   "weekend",   "jubilado",   610000, MULTIPLEX_SRC),
  entry("multiplex", "3D",   "weekend",   "general",   1170000, MULTIPLEX_SRC),

  // ─── Independientes ────────────────────────────────────────────────────────
  // Gaumont — precio único subsidiado (INCAA)
  entry("independiente", "2D", "weekday",   "general",  250000, GAUMONT_SRC),
  entry("independiente", "2D", "wednesday", "general",  250000, GAUMONT_SRC),
  entry("independiente", "2D", "weekend",   "general",  250000, GAUMONT_SRC),
  entry("independiente", "2D", "weekday",   "jubilado", 130000, GAUMONT_SRC),
  entry("independiente", "2D", "weekday",   "menor",    130000, GAUMONT_SRC),
  // MALBA Cine (id=48) — General $7.000, Estudiantes y jubilados $3.500
  entryFor("independiente", 48, "2D", "weekday",   "general",    700000, MALBA_SRC),
  entryFor("independiente", 48, "2D", "wednesday", "general",    700000, MALBA_SRC),
  entryFor("independiente", 48, "2D", "weekend",   "general",    700000, MALBA_SRC),
  entryFor("independiente", 48, "2D", "weekday",   "jubilado",   350000, MALBA_SRC),
  entryFor("independiente", 48, "2D", "wednesday", "jubilado",   350000, MALBA_SRC),
  entryFor("independiente", 48, "2D", "weekend",   "jubilado",   350000, MALBA_SRC),
  entryFor("independiente", 48, "2D", "weekday",   "estudiante", 350000, MALBA_SRC),
  entryFor("independiente", 48, "2D", "wednesday", "estudiante", 350000, MALBA_SRC),
  entryFor("independiente", 48, "2D", "weekend",   "estudiante", 350000, MALBA_SRC),

  // Cine York (id=88) — entrada gratuita, sin costo
  entryFor("independiente", 88, "2D", "weekday",   "general", 0, YORK_SRC),
  entryFor("independiente", 88, "2D", "wednesday", "general", 0, YORK_SRC),
  entryFor("independiente", 88, "2D", "weekend",   "general", 0, YORK_SRC),

  // Centro Cultural Munro (id=89) — entrada gratuita, sin costo
  entryFor("independiente", 89, "2D", "weekday",   "general", 0, MUNRO_SRC),
  entryFor("independiente", 89, "2D", "wednesday", "general", 0, MUNRO_SRC),
  entryFor("independiente", 89, "2D", "weekend",   "general", 0, MUNRO_SRC),

  // Cine Lorca (id=49) — Jue–Dom/feriados $9.000 | Lun–Mié $5.500
  entryFor("independiente", 49, "2D", "weekday",   "general", 900000, LORCA_SRC),
  entryFor("independiente", 49, "2D", "wednesday", "general", 550000, LORCA_SRC),
  entryFor("independiente", 49, "2D", "weekend",   "general", 900000, LORCA_SRC),
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}Seed Prices — Cargando precios manuales${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Entradas a insertar: ${c.cyan}${SEED_DATA.length}${c.reset}`);
  console.log(`${info} Válidos desde: ${c.cyan}${VALID_FROM}${c.reset}\n`);

  // PostgreSQL NULL values don't satisfy unique constraints, so onConflictDoUpdate
  // won't detect conflicts for chain-wide rows (cinemaId IS NULL). Delete first.
  console.log(`${info} Limpiando precios anteriores (cinema_id IS NULL)…`);
  await db.delete(prices).where(isNull(prices.cinemaId));

  // Also clean up per-cinema seed rows (York/Munro) so re-seeding is idempotent.
  const SEEDED_CINEMA_IDS = [48, 49, 88, 89]; // MALBA, Cine Lorca, Cine York, C.C. Munro
  await db.delete(prices).where(
    and(eq(prices.chain, "independiente"), inArray(prices.cinemaId, SEEDED_CINEMA_IDS))
  );

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < SEED_DATA.length; i += BATCH) {
    const batch = SEED_DATA.slice(i, i + BATCH);
    await db
      .insert(prices)
      .values(batch)
      .onConflictDoUpdate({
        target: [prices.chain, prices.cinemaId, prices.format, prices.dayType, prices.audienceType, prices.validFrom],
        set: { amountCents: sql`excluded.amount_cents`, scrapedAt: sql`excluded.scraped_at` },
      });
    inserted += batch.length;
  }

  console.log(`${ok} ${c.green}${c.bold}${inserted} precios cargados${c.reset}\n`);
  await closeDb();
}

main().catch(e => {
  console.error(`\x1b[31m✗\x1b[0m Error:`, e.message);
  process.exit(1);
});
