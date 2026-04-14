/**
 * migrate-cinema-type.ts
 * Populates the `type` column in the cinemas table.
 * (The column is added by `npm run db:push` via schema.ts)
 *
 * Independiente: Cine Lorca, MALBA, Cine York, Centro Cultural Munro, Cine Gaumont, CineArte Cacodelphia
 * Comercial: all others
 *
 * Uso:
 *   npm run db:push          # add the column first
 *   npx tsx scripts/migrate-cinema-type.ts
 */

import { db, closeDb } from "./db";
import { cinemas } from "../src/db/schema";
import { inArray, isNull, sql } from "drizzle-orm";

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m",
};
const ok   = `${c.green}✓${c.reset}`;
const info = `${c.cyan}→${c.reset}`;
const err  = `${c.red}✗${c.reset}`;

const INDEPENDIENTE_NAMES = [
  "Cine Lorca",
  "MALBA",
  "Malba Cine",
  "MALBA Cine",
  "Cine York",
  "Centro Cultural Munro",
  "Cine Gaumont",
  "CineArte Cacodelphia",
  "El Cairo Cine Público",
];

async function main() {
  console.log(`\n${c.bold}Migración: columna type en cinemas${c.reset}`);
  console.log(`${c.gray}${"─".repeat(40)}${c.reset}`);

  // Mark independiente
  const indResult = await db
    .update(cinemas)
    .set({ type: "independiente" })
    .where(inArray(cinemas.name, INDEPENDIENTE_NAMES))
    .returning({ name: cinemas.name });
  console.log(`${info} ${indResult.length} cines marcados como ${c.cyan}independiente${c.reset}: ${indResult.map(r => r.name).join(", ")}`);

  // Mark the rest as comercial
  const comResult = await db
    .update(cinemas)
    .set({ type: "comercial" })
    .where(isNull(cinemas.type))
    .returning({ name: cinemas.name });
  console.log(`${info} ${comResult.length} cines marcados como ${c.cyan}comercial${c.reset}`);

  // Summary
  const all = await db.select({ name: cinemas.name, type: cinemas.type }).from(cinemas).orderBy(sql`type, name`);
  console.log(`\n${c.gray}Cines en DB:${c.reset}`);
  for (const row of all) {
    const badge = row.type === "independiente" ? `${c.yellow}ind${c.reset}` : `${c.gray}com${c.reset}`;
    console.log(`  [${badge}] ${row.name}`);
  }

  await closeDb();
  console.log(`\n${ok} ${c.bold}Migración completa${c.reset}\n`);
}

main().catch((e) => {
  console.error(`\n${err} Error:`, e.message);
  process.exit(1);
});
