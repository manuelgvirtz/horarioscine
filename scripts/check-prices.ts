import { db, closeDb } from "./db";
import { prices } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db.select().from(prices).where(eq(prices.chain, "cinepolis"));
  console.log("cinepolis rows:", rows.length);
  rows.filter(r => r.format === "2D").forEach(r =>
    console.log(r.dayType, r.audienceType, r.amountCents)
  );
  await closeDb();
}

main();
