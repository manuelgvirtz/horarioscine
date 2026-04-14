import pg from "pg";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(`
    SELECT
      p.chain,
      COALESCE(c.name, '(chain-wide)') as cinema,
      p.format,
      p.day_type,
      p.audience_type,
      p.amount_cents
    FROM prices p
    LEFT JOIN cinemas c ON p.cinema_id = c.id
    ORDER BY p.chain, c.name NULLS FIRST, p.format, p.day_type, p.audience_type
  `);
  console.log(JSON.stringify(r.rows));
  await pool.end();
}

main().catch(e => { process.stderr.write(e.message + "\n"); process.exit(1); });
