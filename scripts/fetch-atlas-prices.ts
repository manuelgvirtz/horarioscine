/**
 * fetch-atlas-prices.ts
 * Scrapes per-complex ticket prices from https://precios-atlas.pages.dev
 * (the iframe embedded in https://atlascines.com/DynamicPages?id_section=35)
 *
 * Row structure per format block:
 *   "General"                   → full price, general audience (Thu–Sun + full days)
 *   "Menores, Mayores y Discap."→ special audience price (Thu–Sun)
 *   "Lunes a Miércoles"         → half-price day, applies to all (Mon–Wed)
 *   "Jue a Dom"                 → redundant (same as Menores price) — ignored
 *
 * Day-type mapping:
 *   weekday  (Mon/Tue/Thu/Fri) → "General" price
 *   wednesday (miércoles)      → "Lunes a Miércoles" price
 *   weekend  (Sat/Sun)         → "General" price
 *
 * Run with: npm run fetch:atlas-prices
 */

import { execSync } from "child_process";
import { db, closeDb } from "./db";
import { prices, cinemas } from "../src/db/schema";
import { eq, and, inArray } from "drizzle-orm";

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", gray: "\x1b[90m", red: "\x1b[31m",
};
const ok   = `${c.green}✓${c.reset}`;
const info = `${c.cyan}→${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;

const SOURCE  = "https://precios-atlas.pages.dev";
const PRICES_URL = "https://precios-atlas.pages.dev";
const VALID_FROM = new Date().toISOString().slice(0, 10);

// Maps iframe panel key → DB cinema name (partial match)
const PANEL_TO_CINEMA: Record<string, string> = {
  alcorta:   "Atlas Alcorta",
  caballito: "Atlas Caballito",
  catan:     "Atlas Catan",
  flores:    "Atlas Flores",
  liniers:   "Atlas Liniers",
  nordelta:  "Atlas Nordelta",
  bullrich:  "Atlas Patio Bullrich",
};

// Maps format label in HTML → DB format value
const FORMAT_MAP: Record<string, string> = {
  "salas 2d": "2D",
  "salas 3d": "3D",
  "salas 4d": "4DX",
};

interface ParsedBlock {
  format: string;
  general: number | null;      // full price, general (weekday + weekend)
  special: number | null;      // Menores/Mayores/Discap full price
  lunesAMie: number | null;    // half-price Mon–Wed (all audiences)
}

function parsePesos(s: string): number | null {
  // "$12.000" → 1200000 (centavos)
  const clean = s.replace(/[$.]/g, "").replace(",", ".").trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : Math.round(n * 100);
}

function parsePanel(panelHtml: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];

  // Each format block is a .ac-block div
  const blockRe = /<div class="ac-block[^"]*">([\s\S]*?)<\/div>\s*(?=<div class="ac-block|<\/div>\s*<\/div>\s*<div class="ac-map|$)/g;
  let bm: RegExpExecArray | null;

  while ((bm = blockRe.exec(panelHtml)) !== null) {
    const blockHtml = bm[1];

    // Format title
    const titleMatch = blockHtml.match(/ac-block-title[^>]*>([^<]+)</);
    if (!titleMatch) continue;
    const formatKey = titleMatch[1].toLowerCase().trim();
    const format = FORMAT_MAP[formatKey];
    if (!format) continue;

    // Extract all label→amount rows
    const rowRe = /ac-lbl[^>]*>([^<]+)<\/span>\s*<span[^>]*ac-amt[^>]*>\$?([\d.,]+)/g;
    let rm: RegExpExecArray | null;
    const rows: Record<string, number | null> = {};

    while ((rm = rowRe.exec(blockHtml)) !== null) {
      const label = rm[1].toLowerCase().trim();
      const amount = parsePesos("$" + rm[2]);
      if (label.includes("general")) rows.general = amount;
      else if (label.includes("menores") || label.includes("mayor") || label.includes("discap")) rows.special = amount;
      else if (label.includes("lunes")) rows.lunesAMie = amount;
      // "Jue a Dom" is intentionally skipped — same value as special
    }

    blocks.push({
      format,
      general:   rows.general   ?? null,
      special:   rows.special   ?? null,
      lunesAMie: rows.lunesAMie ?? null,
    });
  }

  return blocks;
}

async function main() {
  console.log(`\n${c.bold}Atlas Cines Prices — Scraper${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Fuente: ${c.cyan}${PRICES_URL}${c.reset}\n`);

  // Fetch the iframe page
  let html: string;
  try {
    html = execSync(`curl -s "${PRICES_URL}"`, { encoding: "utf8", timeout: 15000 });
  } catch {
    console.error(`${c.red}✗ No se pudo descargar la página de precios${c.reset}`);
    process.exit(1);
  }

  // Load all Atlas cinemas from DB
  const atlasCinemas = await db.select().from(cinemas).where(eq(cinemas.chain, "atlas"));
  const cinemaByName = new Map(atlasCinemas.map(c => [c.name.toLowerCase(), c]));

  const allRows: (typeof prices.$inferInsert)[] = [];
  const cinemaIds: number[] = [];
  const scrapedAt = new Date().toISOString();

  // Parse each panel
  for (const [panelKey, cinemaName] of Object.entries(PANEL_TO_CINEMA)) {
    // Extract panel HTML by string search (avoids regex escaping issues)
    const panelStart = `class="ac-panel ac-panel-${panelKey}">`;
    const startIdx = html.indexOf(panelStart);
    if (startIdx === -1) {
      console.log(`${warn} Panel "${panelKey}" no encontrado — saltando`);
      continue;
    }
    // Find the next panel start (or end of panels section) to slice
    const nextPanelIdx = html.indexOf(`class="ac-panel ac-panel-`, startIdx + panelStart.length);
    const panelHtml = nextPanelIdx === -1
      ? html.slice(startIdx)
      : html.slice(startIdx, nextPanelIdx);

    const pm = [null, panelHtml]; // mimic match array

    const cinema = cinemaByName.get(cinemaName.toLowerCase());
    if (!cinema) {
      console.log(`${warn} Cinema "${cinemaName}" no encontrado en DB — saltando`);
      continue;
    }

    const blocks = parsePanel(pm[1]);
    if (blocks.length === 0) {
      console.log(`${warn} ${cinemaName}: sin bloques de precios parseados`);
      continue;
    }

    console.log(`${ok} ${c.bold}${cinemaName}${c.reset} (id=${cinema.id})`);
    cinemaIds.push(cinema.id);

    for (const blk of blocks) {
      const dayTypes = [
        { dayType: "weekday",   price: blk.general },
        { dayType: "wednesday", price: blk.lunesAMie },
        { dayType: "weekend",   price: blk.general },
      ];

      for (const { dayType, price } of dayTypes) {
        if (price === null) continue;

        // General audience
        allRows.push({
          chain: "atlas", cinemaId: cinema.id, format: blk.format,
          dayType, audienceType: "general",
          amountCents: price, validFrom: VALID_FROM, source: SOURCE, scrapedAt,
        });

        // Special audiences (jubilado, menor) — use full special price on weekday/weekend,
        // and half of special price on Lun-Mié (if special price known)
        if (blk.special !== null) {
          const specialPrice = dayType === "wednesday"
            ? Math.round(blk.special / 2)
            : blk.special;

          for (const aud of ["jubilado", "menor"] as const) {
            allRows.push({
              chain: "atlas", cinemaId: cinema.id, format: blk.format,
              dayType, audienceType: aud,
              amountCents: specialPrice, validFrom: VALID_FROM, source: SOURCE, scrapedAt,
            });
          }
        }
      }

      const wdFmt = blk.general ? `$${(blk.general / 100).toLocaleString("es-AR")}` : "—";
      const mieFmt = blk.lunesAMie ? `$${(blk.lunesAMie / 100).toLocaleString("es-AR")}` : "—";
      const spFmt = blk.special ? `$${(blk.special / 100).toLocaleString("es-AR")}` : "—";
      console.log(`   ${blk.format.padEnd(4)} gral: ${wdFmt.padEnd(10)} mié: ${mieFmt.padEnd(10)} men/may: ${spFmt}`);
    }
  }

  if (allRows.length === 0) {
    console.log(`\n${warn} No se encontraron precios para guardar.`);
    await closeDb();
    return;
  }

  // Delete stale per-cinema atlas prices before upserting
  console.log(`\n${info} Limpiando precios anteriores de ${cinemaIds.length} cines…`);
  await db.delete(prices).where(
    and(eq(prices.chain, "atlas"), inArray(prices.cinemaId, cinemaIds))
  );

  // Upsert
  await db.insert(prices).values(allRows)
    .onConflictDoUpdate({
      target: [prices.chain, prices.cinemaId, prices.format, prices.dayType, prices.audienceType, prices.validFrom],
      set: { amountCents: prices.amountCents, scrapedAt: prices.scrapedAt },
    });

  console.log(`\n${ok} ${c.green}${c.bold}${allRows.length} precios guardados${c.reset}`);
  await closeDb();
}

main();
