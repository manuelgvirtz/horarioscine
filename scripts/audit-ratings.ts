import { db, closeDb } from "./db";
import { movies } from "../src/db/schema";

async function main() {
  const rows = await db.select({
    id: movies.id,
    title: movies.title,
    imdbId: movies.imdbId,
    imdbScore: movies.imdbScore,
    rtTomatometer: movies.rtTomatometer,
    metacriticScore: movies.metacriticScore,
    letterboxdScore: movies.letterboxdScore,
    tmdbId: movies.tmdbId,
  }).from(movies).orderBy(movies.title);

  const hasImdbId     = rows.filter(r => r.imdbId);
  const missingImdb   = hasImdbId.filter(r => r.imdbScore == null);
  const missingRt     = hasImdbId.filter(r => r.rtTomatometer == null);
  const missingMc     = hasImdbId.filter(r => r.metacriticScore == null);
  const missingLb     = rows.filter(r => r.tmdbId && r.letterboxdScore == null);
  const noImdbId      = rows.filter(r => !r.imdbId);

  console.log(`Total movies: ${rows.length}`);
  console.log(`Have imdb_id: ${hasImdbId.length}`);
  console.log();

  console.log(`Missing IMDb score (has imdb_id): ${missingImdb.length}`);
  missingImdb.forEach(r => console.log(`  [${r.id}] ${r.title}  ${r.imdbId}`));

  console.log(`\nMissing RT tomatometer (has imdb_id): ${missingRt.length}`);
  missingRt.forEach(r => console.log(`  [${r.id}] ${r.title}  ${r.imdbId}`));

  console.log(`\nMissing Metacritic (has imdb_id): ${missingMc.length}`);
  missingMc.forEach(r => console.log(`  [${r.id}] ${r.title}  ${r.imdbId}`));

  console.log(`\nMissing Letterboxd (has tmdb_id): ${missingLb.length}`);
  missingLb.forEach(r => console.log(`  [${r.id}] ${r.title}  tmdb:${r.tmdbId}`));

  console.log(`\nNo imdb_id at all: ${noImdbId.length}`);
  noImdbId.forEach(r => console.log(`  [${r.id}] ${r.title}  tmdb:${r.tmdbId ?? "—"}`));
}

main().finally(closeDb);
