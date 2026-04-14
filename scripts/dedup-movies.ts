/**
 * dedup-movies.ts
 * Merges duplicate movies: transfers showtimes from dupes to canonical,
 * deletes dupes, and fixes any garbled titles.
 *
 * Uso: npx tsx scripts/dedup-movies.ts
 */

import { db, closeDb } from "./db";
import { movies, showtimes } from "../src/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m",
};
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Pick best canonical row from a group (prefers one with tmdb_id, then poster_url, then lowest id) */
function pickCanonical<T extends { id: number; tmdbId: number | null; posterUrl: string | null }>(group: T[]): T {
  return group.sort((a, b) => {
    if (a.tmdbId && !b.tmdbId) return -1;
    if (!a.tmdbId && b.tmdbId) return 1;
    if (a.posterUrl && !b.posterUrl) return -1;
    if (!a.posterUrl && b.posterUrl) return 1;
    return a.id - b.id;
  })[0];
}

async function main() {
  console.log(`\n${c.bold}Deduplicación de películas${c.reset}`);
  console.log(`${c.gray}${"─".repeat(40)}${c.reset}\n`);

  const allMovies = await db.select().from(movies);

  // Fix garbled title on id=23 (encoding issue: "Pelí©cula" or similar)
  const garbled = allMovies.find(m => m.id === 23);
  if (garbled && !garbled.title.includes("Película")) {
    await db.update(movies).set({ title: "Super Mario Galaxy: La Película" }).where(eq(movies.id, 23));
    console.log(`${ok} Fixed garbled title id=23 → "Super Mario Galaxy: La Película"`);
  }

  // Group by normalized title
  const groups = new Map<string, typeof allMovies>();
  for (const movie of allMovies) {
    const key = normalize(movie.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(movie);
  }

  let mergedCount = 0;
  let deletedCount = 0;

  for (const [key, group] of groups) {
    if (group.length <= 1) continue;

    const canonical = pickCanonical([...group]);
    const dupes = group.filter(m => m.id !== canonical.id);
    const dupeIds = dupes.map(m => m.id);

    console.log(`${warn} Duplicados para "${key}":`);
    console.log(`    ${c.green}✓ Canonical: id=${canonical.id} "${canonical.title}"${c.reset}`);
    for (const d of dupes) console.log(`    ${c.gray}✗ Dupe:      id=${d.id} "${d.title}"${c.reset}`);

    // Transfer showtimes from dupes to canonical
    const transferred = await db.update(showtimes)
      .set({ movieId: canonical.id })
      .where(inArray(showtimes.movieId, dupeIds))
      .returning({ id: showtimes.id });
    if (transferred.length > 0) {
      console.log(`    ${info} Transferred ${transferred.length} showtimes → id=${canonical.id}`);
    }

    // Delete duplicate movies
    await db.delete(movies).where(inArray(movies.id, dupeIds));
    console.log(`    ${c.red}✗ Deleted ${dupeIds.length} dupes${c.reset}\n`);
    mergedCount++;
    deletedCount += dupeIds.length;
  }

  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(movies);
  console.log(`${ok} ${c.bold}Dedup completo${c.reset}: ${mergedCount} grupos fusionados, ${deletedCount} filas eliminadas`);
  console.log(`${c.gray}Películas restantes: ${total}${c.reset}\n`);

  await closeDb();
}

main().catch(e => { console.error(`\n\x1b[31m✗\x1b[0m Error:`, e.message); process.exit(1); });
