/**
 * fetch-cinepolis-prices.ts
 * Scrapes all Cinépolis ticket prices from https://www.cinepolis.com.ar/precios
 * and upserts per-cinema, per-format, per-dayType rows into the prices table.
 *
 * Replaces the old per-session ticket-page approach with a single HTML scrape
 * that captures all day types (weekday, wednesday, weekend) in one pass.
 *
 * Run with:  npx tsx scripts/fetch-cinepolis-prices.ts
 */

import { execSync } from "child_process";
import { db, closeDb } from "./db";
import { cinemas, prices } from "../src/db/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";

// ── Colours ───────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
  cyan: "\x1b[36m", gray: "\x1b[90m",
};
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const fail = `${c.red}✗${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

// ── Config ────────────────────────────────────────────────────────────────────
const PRICES_URL = "https://www.cinepolis.com.ar/precios";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const VALID_FROM  = new Date().toISOString().slice(0, 10);
const scrapedAt   = new Date().toISOString();
const SOURCE      = PRICES_URL;

// ── Helpers ───────────────────────────────────────────────────────────────────
function curlGet(url: string): string {
  // Full browser-like header set. Cloudflare fingerprints requests by checking
  // for the presence & ordering of Sec-Ch-Ua / Sec-Fetch-* / Accept-Encoding
  // headers; curl omits them by default, which is a strong bot signal.
  // --compressed tells curl to decode gzip/br responses transparently.
  const headers = [
    `-H "User-Agent: ${UA}"`,
    `-H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"`,
    `-H "Accept-Language: es-AR,es;q=0.9,en;q=0.8"`,
    `-H "Accept-Encoding: gzip, deflate, br"`,
    `-H "Cache-Control: no-cache"`,
    `-H "Pragma: no-cache"`,
    `-H "Sec-Ch-Ua: \\"Chromium\\";v=\\"124\\", \\"Google Chrome\\";v=\\"124\\", \\"Not-A.Brand\\";v=\\"99\\""`,
    `-H "Sec-Ch-Ua-Mobile: ?0"`,
    `-H "Sec-Ch-Ua-Platform: \\"Windows\\""`,
    `-H "Sec-Fetch-Dest: document"`,
    `-H "Sec-Fetch-Mode: navigate"`,
    `-H "Sec-Fetch-Site: none"`,
    `-H "Sec-Fetch-User: ?1"`,
    `-H "Upgrade-Insecure-Requests: 1"`,
  ].join(" ");
  const cmd = `curl -sL --compressed ${headers} "${url}"`;
  return execSync(cmd, { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&eacute;/g, "é").replace(/&ntilde;/g, "ñ")
    .replace(/&oacute;/g, "ó").replace(/&aacute;/g, "á")
    .replace(/&iacute;/g, "í").replace(/&uacute;/g, "ú")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse "$16.400" → 1640000 (centavos). Returns null if no price found. */
function parseAmount(s: string): number | null {
  const m = s.match(/\$\s*([\d.]+)/);
  if (!m) return null;
  return parseInt(m[1].replace(/\./g, ""), 10) * 100;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// ── Types ─────────────────────────────────────────────────────────────────────
type DayType = "weekday" | "wednesday" | "weekend";
type AudienceType = "general" | "menor" | "jubilado";

interface ExtractedRow {
  format:       string;
  dayType:      DayType;
  audienceType: AudienceType;
  amountCents:  number;
}

// ── Page parser ───────────────────────────────────────────────────────────────
function parseCinemaSection(regularHtml: string): ExtractedRow[] {
  const rows: ExtractedRow[] = [];

  // Split by h5 headers to get named sub-sections (Salas tradicionales, 4D, etc.)
  const h5Blocks = regularHtml.split(/<h5[^>]*>/i);

  for (const block of h5Blocks.slice(1)) {
    const h5End = block.indexOf("</h5>");
    if (h5End < 0) continue;

    const sectionTitle = stripTags(block.slice(0, h5End));
    const tableHtml    = block.slice(h5End);

    // Skip premium formats — they can't be matched from showtime data
    if (/Monster\s*Screen|Gold\s*Class/i.test(sectionTitle)) continue;

    const is4D   = /4D/i.test(sectionTitle);
    const isIMAX = /IMAX/i.test(sectionTitle);

    // Extract <tr> rows from the table
    const trMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const [, rowHtml] of trMatches) {
      const cells = [...rowHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map(m => stripTags(m[1]));
      if (cells.length < 2) continue;

      const label  = cells[0];
      const amount = parseAmount(cells[cells.length - 1]);
      if (!amount) continue;

      // ── Niños y Mayores de 65 años ────────────────────────────────────────
      if (/ni.os|mayor.*65/i.test(label)) {
        // Apply to both 2D and 3D (or 4D if in 4D section), all day types
        const formats = is4D ? ["4D"] : isIMAX ? ["IMAX"] : ["2D", "3D"];
        for (const fmt of formats) {
          for (const dayType of ["weekday", "wednesday", "weekend"] as DayType[]) {
            rows.push({ format: fmt, dayType, audienceType: "menor",   amountCents: amount });
            rows.push({ format: fmt, dayType, audienceType: "jubilado", amountCents: amount });
          }
        }
        continue;
      }

      // ── Lunes a Miércoles 50% (wednesday discount) ────────────────────────
      if (/lunes.*mi.rcoles|lun.*mi.rcoles/i.test(label)) {
        const is3D = /3D/i.test(label);
        if (is4D && is3D) continue; // skip 3D variant inside 4D section
        const fmt = is4D ? "4D" : isIMAX ? "IMAX" : (is3D ? "3D" : "2D");
        rows.push({ format: fmt, dayType: "wednesday", audienceType: "general", amountCents: amount });
        continue;
      }

      // ── Entrada General (weekday + weekend price) ─────────────────────────
      if (/entrada.*general|entrada.*sala/i.test(label)) {
        const is3D = /3D/i.test(label);
        if (is4D && is3D) continue; // skip 3D variant inside 4D section
        const fmt = is4D ? "4D" : isIMAX ? "IMAX" : (is3D ? "3D" : "2D");
        rows.push({ format: fmt, dayType: "weekday",  audienceType: "general", amountCents: amount });
        rows.push({ format: fmt, dayType: "weekend",  audienceType: "general", amountCents: amount });
        continue;
      }

      // ── Gold Class / Sala especial (no inline label) ──────────────────────
      if (/sala\s+gold|sala\s+especial|sala\s+vip/i.test(label)) continue;
    }
  }

  return rows;
}

function parsePage(html: string): Array<{ cinemaName: string; rows: ExtractedRow[] }> {
  const result: Array<{ cinemaName: string; rows: ExtractedRow[] }> = [];

  const sections = html.split('<div class="card panel panel-primary">').slice(1);

  for (const section of sections) {
    const nameM = section.match(/<button class="btn btn-link[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/button>/);
    if (!nameM) continue;
    const cinemaName = stripTags(nameM[1]);

    // Truncate at the Semana Santa / special pricing block header
    const specialRe = /Precios del \d+ al \d+ de \w+/i;
    const santaIdx  = section.search(specialRe);
    const regularHtml = santaIdx > 0 ? section.slice(0, santaIdx) : section;
    const specialHtml = santaIdx > 0 ? section.slice(santaIdx)    : "";

    const rows = parseCinemaSection(regularHtml);

    // If the regular block has no niños/jubilados rows (e.g. Houssay), fall back
    // to the special block — the price is still representative of their tier policy.
    const hasNinos = rows.some(r => r.audienceType === "menor" || r.audienceType === "jubilado");
    if (!hasNinos && specialHtml) {
      const specialRows = parseCinemaSection(specialHtml);
      rows.push(...specialRows.filter(r => r.audienceType === "menor" || r.audienceType === "jubilado"));
    }

    result.push({ cinemaName, rows });
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}Cinépolis Prices — Web Scraper${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Fuente: ${c.cyan}${PRICES_URL}${c.reset}\n`);

  // ── Fetch page ──────────────────────────────────────────────────────────────
  console.log(`${info} Descargando página de precios...`);
  const html = curlGet(PRICES_URL);

  // Diagnostic check — case-insensitive + debug dump if sentinel missing
  const hasSentinel = /entrada\s+general/i.test(html);
  if (!hasSentinel) {
    const fs = await import("fs");
    const debugPath = "/tmp/cinepolis-debug.html";
    try { fs.writeFileSync(debugPath, html); } catch { /* ignore */ }

    console.error(`\n${fail} Sentinel "Entrada General" no encontrado en el HTML.`);
    console.error(`${info} Tamaño del HTML: ${html.length} bytes`);

    const titleM = html.match(/<title>([^<]*)<\/title>/i);
    if (titleM) console.error(`${info} <title>: ${titleM[1].trim()}`);

    if (/cloudflare|cf-ray|just a moment|attention required|ddos/i.test(html)) {
      console.error(`${warn} Detectada protección tipo Cloudflare — curl fue bloqueado`);
    }
    if (html.length < 5000) {
      console.error(`${warn} HTML muy corto — posible redirect, página vacía o SPA sin SSR`);
    }
    if (/<div\s+id=["']?(root|app|__next)["']?/i.test(html)) {
      console.error(`${warn} Detectado contenedor SPA — contenido probablemente renderizado con JS`);
    }

    console.error(`${info} Primeros 500 chars del HTML:\n${html.slice(0, 500)}`);
    console.error(`${info} HTML completo guardado en: ${debugPath}\n`);

    throw new Error("Unexpected page content — Cinépolis may have changed their layout");
  }
  console.log(`${ok} Página descargada (${(html.length / 1024).toFixed(0)} KB)\n`);

  // ── Parse ───────────────────────────────────────────────────────────────────
  const parsed = parsePage(html);
  console.log(`${info} Complejos encontrados: ${c.cyan}${parsed.length}${c.reset}\n`);

  // ── Match page names → DB cinemas ───────────────────────────────────────────
  const dbCinemas = await db.select().from(cinemas);

  function findCinema(pageTitle: string) {
    const normPage = normalize(pageTitle);
    return dbCinemas.find(cin => {
      const normDb = normalize(cin.name);
      return normPage === normDb
        || normPage.startsWith(normDb + " ")
        || normPage.startsWith(normDb + " -")
        || normDb.startsWith(normPage + " ");
    });
  }

  // ── Delete stale per-cinema Cinépolis prices ────────────────────────────────
  console.log(`${info} Limpiando precios anteriores de Cinépolis...`);
  await db.delete(prices).where(
    and(eq(prices.chain, "cinepolis"), isNotNull(prices.cinemaId))
  );
  console.log(`${ok} Precios anteriores eliminados\n`);

  // ── Build insert batch ──────────────────────────────────────────────────────
  const toInsert: object[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const { cinemaName, rows } of parsed) {
    const cinema = findCinema(cinemaName);

    if (!cinema) {
      console.log(`  ${warn} Sin coincidencia en DB: "${cinemaName}"`);
      unmatchedCount++;
      continue;
    }

    if (rows.length === 0) {
      console.log(`  ${warn} Sin precios parseados: "${cinemaName}"`);
      continue;
    }

    // Deduplicate rows (same key → last wins)
    const seen = new Map<string, ExtractedRow>();
    for (const row of rows) {
      seen.set(`${row.format}|${row.dayType}|${row.audienceType}`, row);
    }

    const formats = [...new Set([...seen.values()].map(r => r.format))].sort().join(", ");
    const tierCount = seen.size;
    console.log(`  ${ok} ${cinema.name.padEnd(32)} ${String(tierCount).padStart(3)} tiers  [${formats}]`);

    for (const row of seen.values()) {
      toInsert.push({
        chain:        "cinepolis",
        cinemaId:     cinema.id,
        format:       row.format,
        dayType:      row.dayType,
        audienceType: row.audienceType,
        amountCents:  row.amountCents,
        currency:     "ARS",
        validFrom:    VALID_FROM,
        validUntil:   null,
        source:       SOURCE,
        scrapedAt,
      });
    }

    matchedCount++;
  }

  // ── Upsert ──────────────────────────────────────────────────────────────────
  if (toInsert.length > 0) {
    const BATCH = 200;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      await db.insert(prices).values(toInsert.slice(i, i + BATCH) as any).onConflictDoNothing();
    }
  }

  console.log(`\n${ok} ${c.green}${c.bold}${toInsert.length} precios guardados${c.reset}`);
  console.log(`${c.gray}${matchedCount} complejos OK, ${unmatchedCount} sin coincidencia${c.reset}\n`);

  await closeDb();
}

main().catch(e => {
  console.error(`\n${fail} Error:`, e.message);
  process.exit(1);
});
