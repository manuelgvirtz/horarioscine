/**
 * import-excel.ts
 * Reads admin/showtimes.xlsx and syncs changes back to the database.
 *
 * Strategy: for each date present in the file, replace all showtimes for
 * that date with the rows in the file. Dates not in the file are untouched.
 *
 * Usage:
 *   npm run import:excel
 *   npm run import:excel -- --file admin/my-export.xlsx
 *   npm run import:excel -- --dry-run
 */

import { db, closeDb } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import * as path from "path";
import * as fs from "fs";

const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m" };
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const err  = `${c.red}✗${c.reset}`;

// ── Args ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const isDryRun = args.includes("--dry-run");
const filePath = getArg("--file") ?? path.join(process.cwd(), "admin", "showtimes.xlsx");

if (!fs.existsSync(filePath)) {
  console.error(`${err} No se encontró el archivo: ${filePath}`);
  console.error(`   Generalo primero con: npm run export:excel`);
  process.exit(1);
}

// ── Read Excel ─────────────────────────────────────────────────────────────────
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets["Funciones"];
const wsMovies = wb.Sheets["Películas"];
if (!ws) {
  console.error(`${err} El archivo no tiene una hoja llamada "Funciones"`);
  process.exit(1);
}

interface ExcelRow {
  ID?: number | string;
  Fecha: string;
  Hora: string;
  Película: string;
  Cine: string;
  Formato: string;
  Idioma: string;
  "URL Compra"?: string;
}

const rows = XLSX.utils.sheet_to_json<ExcelRow>(ws, { defval: "" });

// ── Validate and normalize rows ────────────────────────────────────────────────
const VALID_FORMATS  = new Set(["2D", "3D", "4DX", "IMAX", "IMAX 3D", "4DX 3D", "XD"]);
const VALID_LANGUAGES = new Set(["cas", "sub", "vos", "dob"]);

interface ParsedRow {
  id:         number | null;
  date:       string;
  time:       string;
  movie:      string;
  cinema:     string;
  format:     string;
  language:   string;
  bookingUrl: string;
}

const parsed: ParsedRow[] = [];
const parseErrors: string[] = [];

rows.forEach((row, i) => {
  const rowNum = i + 2;
  const rowId = row.ID ? Number(row.ID) : null;

  if (!row.Fecha || !row.Hora || !row.Película || !row.Cine) {
    parseErrors.push(`Fila ${rowNum}: faltan campos obligatorios (Fecha, Hora, Película, Cine)`);
    return;
  }

  const date = String(row.Fecha).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    parseErrors.push(`Fila ${rowNum}: fecha inválida "${date}" (esperado YYYY-MM-DD)`);
    return;
  }

  const time = String(row.Hora).trim();
  if (!/^\d{2}:\d{2}$/.test(time)) {
    parseErrors.push(`Fila ${rowNum}: hora inválida "${time}" (esperado HH:MM)`);
    return;
  }

  const format = String(row.Formato).trim().toUpperCase();
  if (format && !VALID_FORMATS.has(format)) {
    parseErrors.push(`Fila ${rowNum}: formato inválido "${format}" (válidos: ${[...VALID_FORMATS].join(", ")})`);
    return;
  }

  const language = String(row.Idioma).trim().toLowerCase();
  if (language && !VALID_LANGUAGES.has(language)) {
    parseErrors.push(`Fila ${rowNum}: idioma inválido "${language}" (válidos: ${[...VALID_LANGUAGES].join(", ")})`);
    return;
  }

  parsed.push({
    id:         rowId && !isNaN(rowId) ? rowId : null,
    date,
    time,
    movie:      String(row.Película).trim(),
    cinema:     String(row.Cine).trim(),
    format:     format || "2D",
    language:   language || "cas",
    bookingUrl: String(row["URL Compra"] ?? "").trim(),
  });
});

if (parseErrors.length > 0) {
  console.error(`\n${err} Errores de validación:\n`);
  parseErrors.forEach(e => console.error(`  ${warn} ${e}`));
  console.error(`\nCorregí el archivo y volvé a correr el script.\n`);
  process.exit(1);
}

async function main() {
  // Build name → id lookup maps
  const movieMap = new Map<string, number>();
  const allMovies = await db.select({ id: movies.id, title: movies.title }).from(movies);
  for (const r of allMovies) movieMap.set(r.title.toLowerCase().trim(), r.id);

  const cinemaMap = new Map<string, number>();
  const allCinemas = await db.select({ id: cinemas.id, name: cinemas.name }).from(cinemas);
  for (const r of allCinemas) cinemaMap.set(r.name.toLowerCase().trim(), r.id);

  // Resolve movie/cinema names to IDs
  const lookupErrors: string[] = [];
  interface ResolvedRow extends ParsedRow { movieId: number; cinemaId: number; }
  const resolved: ResolvedRow[] = [];

  for (const row of parsed) {
    const movieId  = movieMap.get(row.movie.toLowerCase());
    const cinemaId = cinemaMap.get(row.cinema.toLowerCase());

    if (!movieId) { lookupErrors.push(`Película no encontrada: "${row.movie}"`); continue; }
    if (!cinemaId) { lookupErrors.push(`Cine no encontrado: "${row.cinema}"`); continue; }
    resolved.push({ ...row, movieId, cinemaId });
  }

  if (lookupErrors.length > 0) {
    console.error(`\n${err} No se pudieron resolver los siguientes nombres:\n`);
    [...new Set(lookupErrors)].forEach(e => console.error(`  ${warn} ${e}`));
    await closeDb();
    process.exit(1);
  }

  // Group by date
  const dateGroups = new Map<string, ResolvedRow[]>();
  for (const row of resolved) {
    if (!dateGroups.has(row.date)) dateGroups.set(row.date, []);
    dateGroups.get(row.date)!.push(row);
  }

  const now = new Date().toISOString();
  let inserted = 0, updated = 0, deleted = 0;

  console.log(`\n${c.bold}horariosdeloscines — Importar Excel${c.reset}${isDryRun ? ` ${c.yellow}[DRY RUN]${c.reset}` : ""}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${c.cyan}→${c.reset} Archivo: ${filePath}`);
  console.log(`${c.cyan}→${c.reset} ${resolved.length} filas · ${dateGroups.size} fechas\n`);

  for (const [date, rowsForDate] of dateGroups) {
    const existing = await db.select({ id: showtimes.id }).from(showtimes).where(eq(showtimes.date, date));
    const existingIds = new Set(existing.map(r => r.id));
    const excelIds = new Set(rowsForDate.filter(r => r.id !== null).map(r => r.id as number));

    // Delete rows in DB but not in Excel
    const toDelete = [...existingIds].filter(id => !excelIds.has(id));
    if (!isDryRun) {
      for (const id of toDelete) {
        await db.delete(showtimes).where(eq(showtimes.id, id));
      }
    }
    deleted += toDelete.length;

    for (const row of rowsForDate) {
      if (row.id && existingIds.has(row.id)) {
        if (!isDryRun) {
          await db.update(showtimes).set({
            time: row.time, format: row.format, language: row.language,
            bookingUrl: row.bookingUrl || null, scrapedAt: now,
          }).where(eq(showtimes.id, row.id));
        }
        updated++;
      } else {
        if (!isDryRun) {
          await db.insert(showtimes).values({
            movieId: row.movieId, cinemaId: row.cinemaId,
            date: row.date, time: row.time, format: row.format,
            language: row.language, bookingUrl: row.bookingUrl || null,
            scrapedAt: now,
          });
        }
        inserted++;
      }
    }

    console.log(`  ${ok} ${date}: +${rowsForDate.filter(r => !r.id || !existingIds.has(r.id)).length} nuevas, ${toDelete.length} eliminadas`);
  }

  // ── Movie ratings ──────────────────────────────────────────────────────────────
  let ratingsUpdated = 0;

  if (wsMovies) {
    interface MovieRatingRow {
      ID?: number | string;
      "IMDb"?: number | string;
      "RT Tomatómetro"?: number | string;
      "RT Audiencia"?: number | string;
      "Metacritic"?: number | string;
      "Letterboxd"?: number | string;
    }

    const movieRatingRows = XLSX.utils.sheet_to_json<MovieRatingRow>(wsMovies, { defval: "" });
    const now2 = new Date().toISOString();

    for (const row of movieRatingRows) {
      const id = row.ID ? Number(row.ID) : null;
      if (!id || isNaN(id)) continue;

      const toNum = (v: any) => v === "" || v === null || v === undefined ? null : Number(v);

      if (!isDryRun) {
        await db.update(movies).set({
          imdbScore:       toNum(row["IMDb"]),
          rtTomatometer:   toNum(row["RT Tomatómetro"]),
          rtAudience:      toNum(row["RT Audiencia"]),
          metacriticScore: toNum(row["Metacritic"]),
          letterboxdScore: toNum(row["Letterboxd"]),
          ratingsUpdatedAt: now2,
        }).where(eq(movies.id, id));
      }
      ratingsUpdated++;
    }

    console.log(`  ${ok} Ratings: ${ratingsUpdated} películas actualizadas`);
  }

  await closeDb();

  console.log(`\n${c.green}${c.bold}✓ Completado${isDryRun ? " (simulación)" : ""}${c.reset}`);
  console.log(`${c.gray}  Funciones: ${inserted} insertadas · ${updated} actualizadas · ${deleted} eliminadas`);
  if (wsMovies) console.log(`  Películas: ${ratingsUpdated} ratings actualizados${c.reset}\n`);
  else console.log(c.reset);
}

main().catch(e => { console.error(`${err} Error:`, e.message); process.exit(1); });
