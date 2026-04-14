import { db, closeDb } from "./db";
import { showtimes, cinemas } from "../src/db/schema";
import { eq, isNotNull, isNull } from "drizzle-orm";

async function main() {
  const rows = await db.select({
    chain: cinemas.chain,
    url: showtimes.bookingUrl,
  }).from(showtimes)
    .innerJoin(cinemas, eq(showtimes.cinemaId, cinemas.id))
    .limit(20000);

  const byChain = new Map<string, { withUrl: Set<string>; noUrl: number }>();
  for (const r of rows) {
    if (!byChain.has(r.chain)) byChain.set(r.chain, { withUrl: new Set(), noUrl: 0 });
    const entry = byChain.get(r.chain)!;
    if (r.url) {
      entry.withUrl.add(r.url.substring(0, 80));
    } else {
      entry.noUrl++;
    }
  }
  for (const [chain, { withUrl, noUrl }] of byChain) {
    const arr = [...withUrl].slice(0, 3);
    console.log(`\n${chain} (${withUrl.size} unique URLs, ${noUrl} null):`);
    for (const u of arr) console.log(`  ${u}`);
  }
  await closeDb();
}
main();
