import { db, closeDb } from "./db";
import { sql } from "drizzle-orm";

async function main() {
  try {
    await db.execute(sql`ALTER TABLE cinemas ADD CONSTRAINT cinemas_name_unique UNIQUE (name)`);
    console.log("✓ Added cinemas_name_unique");
  } catch (e: any) {
    if (e.message?.includes("already exists") || e.cause?.message?.includes("already exists")) console.log("cinemas_name_unique already exists — skipping");
    else throw e;
  }

  // Deduplicate showtimes — keep the row with the lowest id for each natural key
  const dedup = await db.execute(sql`
    DELETE FROM showtimes
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM showtimes
      GROUP BY movie_id, cinema_id, date, time, format, language
    )
  `);
  console.log(`✓ Removed ${(dedup as any).rowCount ?? "?"} duplicate showtimes`);

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_showtimes_unique ON showtimes (movie_id, cinema_id, date, time, format, language)`);
  console.log("✓ Added idx_showtimes_unique");

  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
