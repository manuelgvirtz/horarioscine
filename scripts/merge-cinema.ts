/**
 * merge-cinema.ts
 * Merges duplicate cinemas: reassigns all showtimes from the duplicate to the
 * canonical cinema, then deletes the duplicate.
 *
 * Usage: npx tsx scripts/merge-cinema.ts
 */

import { db, closeDb } from "./db";
import { cinemas, showtimes } from "../src/db/schema";
import { or, ilike, eq, count } from "drizzle-orm";

async function main() {
  // Find candidates
  const candidates = await db
    .select({ id: cinemas.id, name: cinemas.name, chain: cinemas.chain, zone: cinemas.zone })
    .from(cinemas)
    .where(or(ilike(cinemas.name, "%norte%"), ilike(cinemas.name, "%norcenter%"), ilike(cinemas.name, "%showcenter%")))
    .orderBy(cinemas.id);

  console.log("Candidates:", JSON.stringify(candidates, null, 2));

  if (candidates.length < 2) {
    console.log("Nothing to merge.");
    return;
  }

  // Keep the lower id as canonical
  const canonical = candidates[0];
  const duplicate = candidates[1];

  console.log(`\nMerging: "${duplicate.name}" (id=${duplicate.id}) → "${canonical.name}" (id=${canonical.id})`);

  // Count showtimes before merge
  const [{ value: before }] = await db
    .select({ value: count() })
    .from(showtimes)
    .where(eq(showtimes.cinemaId, duplicate.id));
  console.log(`Showtimes on duplicate: ${before}`);

  // Reassign showtimes
  const updated = await db
    .update(showtimes)
    .set({ cinemaId: canonical.id })
    .where(eq(showtimes.cinemaId, duplicate.id))
    .returning({ id: showtimes.id });

  console.log(`Reassigned ${updated.length} showtimes.`);

  // Delete duplicate cinema
  await db.delete(cinemas).where(eq(cinemas.id, duplicate.id));
  console.log(`Deleted cinema "${duplicate.name}" (id=${duplicate.id}).`);
}

main().finally(closeDb);
