export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function parseGenres(genresJson: string | null): string[] {
  if (!genresJson) return [];
  try {
    return JSON.parse(genresJson);
  } catch {
    return [];
  }
}

export function formatDuration(minutes: number | null): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export function getLanguageLabel(lang: string): string {
  const map: Record<string, string> = {
    cas: "Doblada",
    sub: "Subtitulada",
    vos: "V.O.S.",
  };
  return map[lang] || lang;
}

export function getLanguageShortLabel(lang: string): string {
  const map: Record<string, string> = { cas: "CAS", sub: "SUB", vos: "VOS" };
  return map[lang] ?? lang.toUpperCase();
}

export function formatGroupLabel(format: string, language: string): string {
  return `${format} ${getLanguageLabel(language)}`;
}

// Tailwind classes (bg + text color) for a solid Metacritic score badge
export function metacriticClasses(score: number): string {
  if (score >= 61) return "bg-[#66cc33] text-white";
  if (score >= 40) return "bg-[#ffcc33] text-black";
  return "bg-[#ff0000] text-white";
}

// Inline style for the bordered/tinted Metacritic badge used in CinemaMovieCard
export function metacriticInlineStyle(score: number) {
  const color = score >= 61 ? "#66cc33" : score >= 40 ? "#ffcc33" : "#ff0000";
  return { background: `${color}1a`, color, border: `1px solid ${color}33` };
}

const TZ = "America/Argentina/Buenos_Aires";

export function getToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function getCurrentArgTime(): string {
  return new Date().toLocaleTimeString("en-CA", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).slice(0, 5);
}

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function formatDateDisplay(dateStr: string): string {
  if (dateStr === getToday()) return "Hoy";
  if (dateStr === getTomorrow()) return "Mañana";

  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatDateLong(dateStr: string): string {
  const s = new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  // Capitalize first letter only — Spanish dates are lowercase by default
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Returns the Thursday-to-Wednesday cinema week boundaries for a given date.
 * Argentine cinema weeks run Thu→Wed (new releases on Thursdays).
 * Returns { thisWeekStart, thisWeekEnd, prevWeekStart, prevWeekEnd } as YYYY-MM-DD strings.
 */
export function getCinemaWeek(dateStr: string): {
  thisWeekStart: string;
  thisWeekEnd: string;
  prevWeekStart: string;
  prevWeekEnd: string;
} {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0=Sun,1=Mon,...,4=Thu,...,6=Sat
  // Days since last Thursday: Thu=0, Fri=1, Sat=2, Sun=3, Mon=4, Tue=5, Wed=6
  const daysSinceThursday = (dow + 3) % 7;
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - daysSinceThursday);

  const fmt = (dt: Date) => dt.toLocaleDateString("en-CA", { timeZone: "UTC" });

  const thisWeekStart = fmt(thursday);
  const thisWeekEnd = new Date(thursday.getTime() + 6 * 86400000);
  const prevWeekEnd = new Date(thursday.getTime() - 86400000);
  const prevWeekStart = new Date(thursday.getTime() - 7 * 86400000);

  return {
    thisWeekStart,
    thisWeekEnd: fmt(thisWeekEnd),
    prevWeekStart: fmt(prevWeekStart),
    prevWeekEnd: fmt(prevWeekEnd),
  };
}

export function getNextDays(count: number): { date: string; label: string }[] {
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toLocaleDateString("en-CA", { timeZone: TZ });
    days.push({ date: dateStr, label: formatDateDisplay(dateStr) });
  }
  return days;
}

/** Formats ARS centavos as a localized price string: 860000 → "$8.600" */
export function formatPrice(cents: number): string {
  if (cents === 0) return "Gratis";
  return `$${(cents / 100).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

/** Maps a YYYY-MM-DD date string to its Argentine cinema day-type. */
export function getDayType(dateStr: string): "weekday" | "wednesday" | "weekend" {
  const day = new Date(dateStr + "T12:00:00").getDay(); // 0=Sun, 3=Wed, 6=Sat
  if (day === 0 || day === 6) return "weekend";
  if (day === 3) return "wednesday";
  return "weekday";
}

export function groupBy<K, V>(items: V[], keyFn: (item: V) => K): Map<K, V[]> {
  const map = new Map<K, V[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}
