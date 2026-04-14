/**
 * fetch-cinemark-prices.ts
 * Scrapes per-complex ticket prices from the RSC payload of
 * https://www.cinemark.com.ar/precios
 *
 * Data lives in a self.__next_f.push([1,"..."]) chunk as a JSON blob:
 *   prices.cines[].prices[0].experienceTypes[].{ title, prices[].{ price, description } }
 *
 * Format mapping:
 *   "SALAS 2D"         → 2D
 *   "SALAS 3D"         → 3D
 *   "SALAS 4D"         → 4DX
 *   "SALAS XD 2D"      → XD
 *   (DBOX/PREMIUM/COMFORT/XD 3D → skipped, not in our schema)
 *
 * Price description → (audienceType, dayType):
 *   "GENERAL"                  → general,  weekday + weekend
 *   "MENOR (*) - NAP"          → menor,    weekday + weekend
 *   "MAYORES DE 60 AÑOS - NAP" → jubilado, weekday + weekend
 *   "LUNES A MIÉRCOLES / MIÉRCOLES / LUNES A JUEVES"
 *                              → general,  wednesday
 *   jubilado/menor on wednesday → half of their full price (inferred)
 *
 * Run with: npm run fetch:cinemark-prices
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

const SOURCE    = "https://www.cinemark.com.ar/precios";
const VALID_FROM = new Date().toISOString().slice(0, 10);

// Cinemark API name → fragment of our DB cinema name (lowercase, partial match)
const NAME_MAP: Record<string, string> = {
  "moron":                "hoyts morón",
  "quilmes":              "hoyts quilmes",
  "abasto":               "hoyts abasto",
  "unicenter":            "hoyts unicenter",
  "nuevo centro":         "cinemark nuevo centro",
  "patio olmos":          "cinemark patio olmos",
  "salta alto noa":       "cinemark salta alto noa",
  "temperley":            "hoyts temperley",
  "moreno":               "hoyts moreno",
  "dot":                  "hoyts dot",
  "rosario":              "cinemark rosario",
  "puerto madero":        "cinemark puerto madero",
  "mendoza":              "cinemark mendoza",
  "palermo":              "cinemark palermo",
  "caballito":            "cinemark caballito",
  "soleil":               "cinemark soleil",
  "santa fe":             "hoyts santa fe",
  "san justo":            "cinemark san justo",
  "malvinas argentinas":  "cinemark malvinas argentina",
  "tortugas":             "cinemark tortugas",
  "salta hiper libertad": "cinemark salta hiper libertad",
  "neuquen":              "cinemark neuquén",
  "alto avellaneda":      "cinemark avellaneda",
};

// Format title → DB format (null = skip)
function mapFormat(title: string): string | null {
  const t = title.toLowerCase();
  if (t.startsWith("salas 2d")) return "2D";
  if (t.startsWith("salas 3d")) return "3D";
  if (t.startsWith("salas 4d")) return "4DX";
  if (t.startsWith("salas xd 2d")) return "XD";
  if (t.startsWith("salas imax")) return "IMAX";
  return null; // DBOX, PREMIUM, COMFORT, XD 3D → skip
}

function parsePesos(priceStr: string): number | null {
  // "$$ 16.800" → 1680000
  const clean = priceStr.replace(/\$/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(clean);
  if (isNaN(n) || n === 0) return null;
  return Math.round(n * 100);
}

interface PriceEntry { price: string; description: string; }
interface ExperienceType { title: string; prices: PriceEntry[]; }
interface CineData {
  id: number;
  name: string;
  prices: Array<{ experienceTypes: ExperienceType[] }>;
}

function extractRscText(html: string): string {
  const parts = html.split("__next_f.push");
  let all = "";
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part.startsWith('([1,"')) continue;
    const closeIdx = part.lastIndexOf('"])');
    if (closeIdx === -1) continue;
    const inner = part.slice(5, closeIdx);
    all += inner
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
  }
  return all;
}

function extractCinesJson(text: string): CineData[] {
  const startMarker = '"cines":[';
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) throw new Error('"cines" not found in RSC payload');

  let depth = 0;
  let endIdx = startIdx + '"cines":'.length;
  for (let j = endIdx; j < text.length; j++) {
    if (text[j] === "[") depth++;
    else if (text[j] === "]") { depth--; if (depth === 0) { endIdx = j + 1; break; } }
  }
  return JSON.parse(text.slice(startIdx + '"cines":'.length, endIdx));
}

async function main() {
  console.log(`\n${c.bold}Cinemark Prices — Scraper${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Fuente: ${c.cyan}${SOURCE}${c.reset}\n`);

  // Fetch page
  let html: string;
  try {
    html = execSync(`curl -s "${SOURCE}"`, { encoding: "utf8", timeout: 20000 });
  } catch {
    console.error(`${c.red}✗ No se pudo descargar la página${c.reset}`);
    process.exit(1);
  }

  const rscText = extractRscText(html);
  const cinesData = extractCinesJson(rscText);
  console.log(`${ok} ${cinesData.length} complejos encontrados en la API\n`);

  // Load all Cinemark cinemas from DB
  const dbCinemas = await db.select().from(cinemas).where(eq(cinemas.chain, "cinemark"));
  const dbByName = new Map(dbCinemas.map(c => [c.name.toLowerCase(), c]));

  const allRows: (typeof prices.$inferInsert)[] = [];
  const cinemaIds: number[] = [];
  const scrapedAt = new Date().toISOString();

  for (const cine of cinesData) {
    const apiName = cine.name.toLowerCase().trim();
    const targetName = NAME_MAP[apiName];
    if (!targetName) {
      console.log(`${warn} Sin mapeo para "${cine.name}" — saltando`);
      continue;
    }

    // Match DB cinema by partial name
    const dbCinema = [...dbByName.values()].find(c => c.name.toLowerCase().includes(targetName));
    if (!dbCinema) {
      console.log(`${warn} No encontrado en DB: "${targetName}" — saltando`);
      continue;
    }

    const expTypes = cine.prices?.[0]?.experienceTypes ?? [];
    if (expTypes.length === 0) {
      console.log(`${warn} ${cine.name}: sin experienceTypes`);
      continue;
    }

    console.log(`${ok} ${c.bold}${dbCinema.name}${c.reset} (id=${dbCinema.id})`);
    cinemaIds.push(dbCinema.id);

    for (const expType of expTypes) {
      const format = mapFormat(expType.title);
      if (!format) continue;

      // Collect prices per description type
      let generalFull: number | null = null;
      let menorFull: number | null = null;
      let jubiladoFull: number | null = null;
      let discountWed: number | null = null; // general discount price

      for (const entry of expType.prices) {
        const desc = entry.description.toUpperCase().trim();
        const amount = parsePesos(entry.price);
        if (!amount) continue;

        if (desc === "GENERAL") generalFull = amount;
        else if (desc.startsWith("MENOR")) menorFull = amount;
        else if (desc.startsWith("MAYORES")) jubiladoFull = amount;
        else if (
          desc.startsWith("LUNES A MIÉRCOLES") ||
          desc.startsWith("LUNES A MIERCOLES") ||
          desc.startsWith("MIÉRCOLES") ||
          desc.startsWith("MIERCOLES") ||
          desc.startsWith("LUNES A JUEVES")
        ) discountWed = amount;
      }

      if (!generalFull) continue;

      // Weekday + Weekend: general
      for (const dayType of ["weekday", "weekend"] as const) {
        allRows.push({
          chain: "cinemark", cinemaId: dbCinema.id, format,
          dayType, audienceType: "general",
          amountCents: generalFull, validFrom: VALID_FROM, source: SOURCE, scrapedAt,
        });
        if (menorFull) allRows.push({
          chain: "cinemark", cinemaId: dbCinema.id, format,
          dayType, audienceType: "menor",
          amountCents: menorFull, validFrom: VALID_FROM, source: SOURCE, scrapedAt,
        });
        if (jubiladoFull) allRows.push({
          chain: "cinemark", cinemaId: dbCinema.id, format,
          dayType, audienceType: "jubilado",
          amountCents: jubiladoFull, validFrom: VALID_FROM, source: SOURCE, scrapedAt,
        });
      }

      // Wednesday: discounted price
      if (discountWed) {
        allRows.push({
          chain: "cinemark", cinemaId: dbCinema.id, format,
          dayType: "wednesday", audienceType: "general",
          amountCents: discountWed, validFrom: VALID_FROM, source: SOURCE, scrapedAt,
        });
        // jubilado/menor on wednesday = half of their full price
        if (menorFull) allRows.push({
          chain: "cinemark", cinemaId: dbCinema.id, format,
          dayType: "wednesday", audienceType: "menor",
          amountCents: Math.round(menorFull / 2), validFrom: VALID_FROM, source: SOURCE, scrapedAt,
        });
        if (jubiladoFull) allRows.push({
          chain: "cinemark", cinemaId: dbCinema.id, format,
          dayType: "wednesday", audienceType: "jubilado",
          amountCents: Math.round(jubiladoFull / 2), validFrom: VALID_FROM, source: SOURCE, scrapedAt,
        });
      }

      const gFmt = `$${(generalFull/100).toLocaleString("es-AR")}`;
      const mFmt = menorFull ? `$${(menorFull/100).toLocaleString("es-AR")}` : "—";
      const wFmt = discountWed ? `$${(discountWed/100).toLocaleString("es-AR")}` : "—";
      console.log(`   ${format.padEnd(4)} gral:${gFmt.padEnd(10)} men/may:${mFmt.padEnd(10)} mié:${wFmt}`);
    }
  }

  if (allRows.length === 0) {
    console.log(`\n${warn} No se encontraron precios para guardar.`);
    await closeDb();
    return;
  }

  console.log(`\n${info} Limpiando precios anteriores de ${cinemaIds.length} cines…`);
  await db.delete(prices).where(
    and(eq(prices.chain, "cinemark"), inArray(prices.cinemaId, cinemaIds))
  );

  await db.insert(prices).values(allRows).onConflictDoUpdate({
    target: [prices.chain, prices.cinemaId, prices.format, prices.dayType, prices.audienceType, prices.validFrom],
    set: { amountCents: prices.amountCents, scrapedAt: prices.scrapedAt },
  });

  console.log(`\n${ok} ${c.green}${c.bold}${allRows.length} precios guardados${c.reset}`);
  await closeDb();
}

main();
