/**
 * fix-grazia-mario.ts
 * 1. Merge "La Grazia: La Belleza De La Duda" into "La grazia" (same film)
 * 2. Fix missing IMDb rating for Mario
 */

import { db, closeDb } from "./db";
import { movies, showtimes } from "../src/db/schema";
import { like, or, eq, inArray } from "drizzle-orm";

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m",
};

async function main() {
  // ── 1. Query La Grazia variants ──────────────────────────────────────────
  const graziaRows = await db.select().from(movies).where(like(movies.title, "%razia%"));
  console.log("\nLa Grazia candidates:");
  for (const r of graziaRows) {
    const stCount = (await db.select().from(showtimes).where(eq(showtimes.movieId, r.id))).length;
    console.log(`  id=${r.id}  title="${r.title}"  tmdbId=${r.tmdbId}  showtimes=${stCount}`);
    console.log(`    ratingsJson=${r.ratingsJson}`);
  }

  if (graziaRows.length >= 2) {
    // Prefer the one with tmdbId as canonical; otherwise prefer the one with showtimes
    const sorted = [...graziaRows].sort((a, b) => {
      if (a.tmdbId && !b.tmdbId) return -1;
      if (!a.tmdbId && b.tmdbId) return 1;
      return a.id - b.id;
    });
    const canonical = sorted[0];
    const dupes = sorted.slice(1);
    const dupeIds = dupes.map(r => r.id);

    console.log(`\n${c.yellow}Merging into canonical id=${canonical.id} "${canonical.title}"${c.reset}`);

    const transferred = await db.update(showtimes)
      .set({ movieId: canonical.id })
      .where(inArray(showtimes.movieId, dupeIds))
      .returning({ id: showtimes.id });
    console.log(`${c.cyan}→ Transferred ${transferred.length} showtimes${c.reset}`);

    await db.delete(movies).where(inArray(movies.id, dupeIds));
    console.log(`${c.red}✗ Deleted ${dupeIds.length} dupes: ${dupeIds.join(", ")}${c.reset}`);
  } else {
    console.log("Only one La Grazia found — no merge needed.");
  }

  // ── 2. Query Mario ───────────────────────────────────────────────────────
  const marioRows = await db.select({
    id: movies.id,
    title: movies.title,
    tmdbId: movies.tmdbId,
    imdbId: movies.imdbId,
    imdbScore: movies.imdbScore,
    imdbVotes: movies.imdbVotes,
    rtTomatometer: movies.rtTomatometer,
    letterboxdScore: movies.letterboxdScore,
  }).from(movies).where(
    or(like(movies.title, "Mario%"), like(movies.title, "%Mario%"))
  );
  console.log("\nMario candidates:");
  for (const r of marioRows) {
    console.log(`  id=${r.id}  title="${r.title}"  tmdbId=${r.tmdbId}`);
    console.log(`    imdbId=${r.imdbId}  imdbScore=${r.imdbScore}  imdbVotes=${r.imdbVotes}  rt=${r.rtTomatometer}  letterboxd=${r.letterboxdScore}`);
  }

  await closeDb();
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
