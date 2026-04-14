import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../src/db/schema";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export async function closeDb() {
  await pool.end();
}

/** Returns the Thursday date (YYYY-MM-DD) of the current cinema week. */
export function getCurrentDebutWeek(): string {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun,4=Thu
  const daysSinceThu = (dow + 3) % 7;
  const thu = new Date(now);
  thu.setDate(now.getDate() - daysSinceThu);
  return thu.toISOString().slice(0, 10);
}
