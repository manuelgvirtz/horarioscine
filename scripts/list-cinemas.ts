import { db, closeDb } from "./db";
import { cinemas } from "../src/db/schema";

async function main() {
  const rows = await db.select().from(cinemas);
  for (const r of rows) process.stdout.write(`${r.id} | ${r.chain} | ${r.name} | ${r.slug}\n`);
  await closeDb();
}
main();
