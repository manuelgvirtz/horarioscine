/**
 * fix-booking-urls.ts
 * Sets chain-level booking URLs for showtimes missing them.
 *
 * - Cinépolis → https://www.cinepolis.com.ar
 * - Cinemark  → https://www.cinemark.com.ar
 *
 * Run with:  npx tsx scripts/fix-booking-urls.ts
 */

import { db, closeDb } from "./db";
import { showtimes, cinemas } from "../src/db/schema";
import { eq, isNull, sql } from "drizzle-orm";

async function main() {
  // Cinépolis: set all booking URLs to generic domain
  await db.update(showtimes)
    .set({ bookingUrl: "https://www.cinepolis.com.ar" })
    .where(
      sql`${showtimes.cinemaId} IN (SELECT id FROM ${cinemas} WHERE chain = 'cinepolis')`
    );
  console.log("Cinépolis URLs updated");

  // Cinemark: set all booking URLs to generic domain
  await db.update(showtimes)
    .set({ bookingUrl: "https://www.cinemark.com.ar" })
    .where(
      sql`${showtimes.cinemaId} IN (SELECT id FROM ${cinemas} WHERE chain = 'cinemark')`
    );
  console.log("Cinemark URLs updated");

  await closeDb();
}
main();
