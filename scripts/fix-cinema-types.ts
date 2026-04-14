import { db, closeDb } from "./db";
import { cinemas } from "../src/db/schema";
import { inArray } from "drizzle-orm";

const INDEPENDIENTE = [
  "MALBA Cine",
  "Cine Lorca",
  "Cine York",
  "Centro Cultural Munro",
  "Cine Gaumont",
  "CineArte Cacodelphia",
  "El Cairo Cine Público",
];

async function main() {
  const result = await db
    .update(cinemas)
    .set({ type: "independiente" })
    .where(inArray(cinemas.name, INDEPENDIENTE))
    .returning({ name: cinemas.name, type: cinemas.type });
  console.log("Marked as independiente:", result.map((r) => r.name).join(", "));
  await closeDb();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
