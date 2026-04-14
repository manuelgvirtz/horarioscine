import { getCinemasWithShowtimeCounts } from "@/lib/queries";
import { getToday, slugify } from "@/lib/utils";
import { ZONES, CHAINS } from "@/types";
import Link from "next/link";
import type { Metadata } from "next";
import type { Zone } from "@/types";
import { CinesFilterBar } from "./CinesFilterBar";

export const metadata: Metadata = {
  title: "Cines — cartelera.ar",
  description: "Todos los cines con cartelera en Argentina.",
};

interface Props {
  searchParams: { zona?: string; type?: string };
}

export default async function CinesPage({ searchParams }: Props) {
  const today = getToday();
  const all = await getCinemasWithShowtimeCounts(today);

  const zona = searchParams.zona || "";
  const type = searchParams.type || "";

  const cinemas = all
    .filter((c) => !zona || c.zone === zona)
    .filter((c) => !type || c.type === type);

  const byZone = new Map<Zone, typeof cinemas>();
  for (const cinema of cinemas) {
    const zone = cinema.zone as Zone;
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone)!.push(cinema);
  }

  const orderedZones = ZONES.filter((z) => byZone.has(z));

  return (
    <div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors font-semibold mb-6 py-2"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
        Cartelera
      </Link>

      <div className="border-b border-outline-variant/20 pb-5 md:pb-7 space-y-4">
        <div>
          <h1 className="text-4xl md:text-7xl lg:text-8xl font-headline font-black tracking-tighter text-on-surface leading-none">
            Cines
          </h1>
          <p className="text-on-surface-variant mt-3 font-body text-base">
            {cinemas.length} {cinemas.length === 1 ? "cine" : "cines"} en cartelera
          </p>
        </div>
        <CinesFilterBar />
      </div>

      {cinemas.length === 0 ? (
        <div className="mt-12 bg-surface-container-low rounded-2xl p-12 text-center flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40" aria-hidden="true">
            theaters
          </span>
          <div className="space-y-1">
            <p className="text-on-surface font-semibold">Sin cines para los filtros seleccionados.</p>
            <p className="text-sm text-on-surface-variant">Probá con otra zona o tipo de cine.</p>
          </div>
          <Link
            href="/cines"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-outline-variant/30 text-on-surface-variant text-sm font-semibold hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            Limpiar filtros
          </Link>
        </div>
      ) : (
        <div className="mt-6 md:mt-8 space-y-10">
          {orderedZones.map((zone) => {
            const zoneCinemas = byZone.get(zone)!;
            return (
              <section key={zone}>
                <h2 className="flex items-center gap-3 mb-6">
                  <span className="w-[3px] h-6 bg-primary rounded-full shrink-0" aria-hidden="true" />
                  <span className="text-sm font-headline font-black tracking-tight text-on-surface">
                    {zone}
                  </span>
                  <span className="flex-1 h-px bg-outline-variant/20" />
                  <span className="text-xs font-bold text-outline shrink-0">
                    {zoneCinemas.length} {zoneCinemas.length === 1 ? "cine" : "cines"}
                  </span>
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                  {[...zoneCinemas].sort((a, b) => (b.showtimeCount > 0 ? 1 : 0) - (a.showtimeCount > 0 ? 1 : 0)).map((cinema) => {
                    const chainLabel = CHAINS.find((c) => c.value === cinema.chain)?.label ?? cinema.chain;
                    const slug = cinema.slug || slugify(cinema.name);
                    const hasShowtimes = cinema.showtimeCount > 0;
                    return (
                      <Link
                        key={cinema.id}
                        href={`/cine/${slug}?from=cines`}
                        className="group"
                      >
                        <article className={`bg-surface-container rounded-xl p-4 h-full flex flex-col gap-2 border-l-2 transition-colors group-hover:bg-surface-container-high ${hasShowtimes ? "border-primary/50 group-hover:border-primary" : "border-outline-variant/20"}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-semibold text-on-surface-variant/50 tracking-wide mb-0.5 truncate">
                              {chainLabel}
                            </p>
                            <h3 className="font-headline font-black text-on-surface tracking-tight text-base leading-snug group-hover:text-primary transition-colors">
                              {cinema.name}
                            </h3>
                            {cinema.address && (
                              <p className="text-xs text-on-surface-variant/60 mt-1 line-clamp-1">
                                {cinema.address}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {cinema.showtimeCount > 0 ? (
                              <span className="text-xs font-bold text-primary">
                                {cinema.showtimeCount} {Number(cinema.showtimeCount) === 1 ? "película" : "películas"}
                              </span>
                            ) : (
                              <span className="text-xs text-on-surface-variant/40">Sin funciones</span>
                            )}
                            {cinema.type === "independiente" && (
                              <span className="text-[10px] font-bold text-on-surface-variant/50 border border-outline-variant/20 px-1.5 py-0.5 rounded-sm tracking-wide">
                                Indie
                              </span>
                            )}
                          </div>
                        </article>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
