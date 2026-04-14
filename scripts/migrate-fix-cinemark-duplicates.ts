/**
 * migrate-fix-cinemark-duplicates.ts
 *
 * After fixing fetch-cinemark.ts (HOYTS_IDS + THEATER_NAME_OVERRIDE), the scraper
 * will write showtimes to the CORRECT existing cinema entries. But previous scraper
 * runs created orphaned duplicate entries with wrong names (e.g. "Cinemark Abasto"
 * when the canonical DB entry is "Hoyts Abasto"). This script removes them.
 *
 * Orphaned entries (created by the broken scraper, now replaced):
 *   - Cinemark Abasto          → replaced by Hoyts Abasto
 *   - Cinemark Alto Avellaneda → replaced by Cinemark Avellaneda
 *   - Hoyts DOT                → replaced by Hoyts Dot Baires
 *   - Cinemark Moreno          → replaced by Hoyts Moreno
 *   - Cinemark Moron           → replaced by Hoyts Morón
 *   - Cinemark Quilmes         → replaced by Hoyts Quilmes
 *   - Cinemark Santa Fe        → replaced by Hoyts Santa Fe
 *   - Hoyts Soleil             → replaced by Cinemark Soleil
 *   - Cinemark Temperley       → replaced by Hoyts Temperley
 *
 * Uso: npx tsx scripts/migrate-fix-cinemark-duplicates.ts
 */

import { db, closeDb } from "./db";
import { cinemas, showtimes } from "../src/db/schema";
import { inArray, sql } from "drizzle-orm";

const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m" };
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

const ORPHANED_NAMES = [
  "Cinemark Abasto",
  "Cinemark Alto Avellaneda",
  "Hoyts DOT",
  "Cinemark Moreno",
  "Cinemark Moron",
  "Cinemark Quilmes",
  "Cinemark Santa Fe",
  "Hoyts Soleil",
  "Cinemark Temperley",
];

async function main() {
  console.log(`\n${c.bold}migrate-fix-cinemark-duplicates${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}\n`);

  // Find orphaned cinema rows
  const allCinemas = await db.select().from(cinemas);
  const orphans = allCinemas.filter((ci) => ORPHANED_NAMES.includes(ci.name));

  if (orphans.length === 0) {
    console.log(`${ok} No orphaned entries found — nothing to do.\n`);
    await closeDb();
    return;
  }

  console.log(`${warn} Found ${orphans.length} orphaned cinema entries:`);
  for (const o of orphans) {
    console.log(`   ${c.yellow}[${o.id}]${c.reset} ${o.name}`);
  }

  const orphanIds = orphans.map((o) => o.id);

  // Count showtimes linked to orphaned entries
  const [{ stCount }] = await db
    .select({ stCount: sql<number>`count(*)` })
    .from(showtimes)
    .where(inArray(showtimes.cinemaId, orphanIds));

  console.log(`\n${info} Linked showtimes to delete: ${c.cyan}${stCount}${c.reset}`);

  // Delete showtimes first (FK constraint), then cinemas
  if (stCount > 0) {
    await db.delete(showtimes).where(inArray(showtimes.cinemaId, orphanIds));
    console.log(`${ok} Showtimes deleted`);
  }

  await db.delete(cinemas).where(inArray(cinemas.id, orphanIds));
  console.log(`${ok} Orphaned cinema entries deleted\n`);

  console.log(`${c.green}${c.bold}Done.${c.reset} Re-run npm run fetch:cinemark to populate showtimes for the correct entries.\n`);

  await closeDb();
}

main().catch((e) => {
  console.error(`\n${c.red}✗${c.reset} Error:`, e.message);
  process.exit(1);
});
