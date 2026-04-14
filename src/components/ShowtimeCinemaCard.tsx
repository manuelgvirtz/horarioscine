"use client";

import { useState, useRef, useLayoutEffect } from "react";
import Link from "next/link";
import { slugify, formatGroupLabel } from "@/lib/utils";
import { PriceTierBadges } from "@/components/PriceTierBadges";
import type { Cinema, ShowtimeItem, PricesByFormat } from "@/types";

function isSpecialFormat(format: string): boolean {
  return ["IMAX", "4DX", "XD", "DBOX"].includes(format);
}

function ShowtimeGroup({
  format,
  language,
  items,
  tiers,
}: {
  format: string;
  language: string;
  items: ShowtimeItem[];
  tiers?: { general?: number; jubilado?: number; menor?: number; dosxuno?: number };
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [rowHeight, setRowHeight] = useState(44);
  const timesRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = timesRef.current;
    if (!el) return;

    let frameId: number;

    const check = () => {
      const firstChild = el.firstElementChild as HTMLElement | null;
      const h = firstChild?.offsetHeight ?? 44;
      setRowHeight(h);
      setOverflows(el.scrollHeight > h + 1);
    };

    check(); // synchronous after DOM commit — reliable layout measurement

    const onResize = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(check);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
    };
  }, [items]);

  const special = isSpecialFormat(format);

  return (
    <div className="space-y-3">
      {/* Badge + prices — stacked, left-aligned */}
      <div className="flex flex-col gap-2">
        <span
          className={`inline-block px-2.5 py-1 text-xs font-black tracking-widest rounded uppercase self-start ${
            special
              ? "bg-tertiary text-on-tertiary"
              : language === "sub"
              ? "bg-primary/15 text-primary border border-primary/20"
              : "bg-surface-container-highest text-on-surface border border-outline-variant/20"
          }`}
        >
          {formatGroupLabel(format, language)}
        </span>
        {tiers && <PriceTierBadges tiers={tiers} />}
      </div>

      {/* Times — capped to one row when not expanded */}
      <div className="relative">
        <div
          ref={timesRef}
          className="flex flex-wrap gap-2 overflow-hidden"
          style={!expanded ? { maxHeight: `${rowHeight}px` } : undefined}
        >
          {items.map((st) =>
            st.bookingUrl ? (
              <a
                key={st.id}
                href={st.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Comprar entrada — ${st.time}`}
                className="group flex items-center bg-primary/10 border border-primary/50 rounded-lg px-3 py-1 min-h-[44px] md:min-h-[32px] hover:bg-primary hover:border-primary transition-colors"
              >
                <span className="text-sm font-headline font-bold group-hover:text-on-primary">
                  {st.time}
                </span>
              </a>
            ) : (
              <span
                key={st.id}
                title="Sin compra online"
                className="flex items-center rounded-lg px-3 py-1 min-h-[44px] md:min-h-[32px] select-none"
              >
                <span className="text-sm font-headline font-bold text-on-surface-variant/40">
                  {st.time}
                </span>
              </span>
            )
          )}
        </div>
        {/* Bottom fade — visible only when collapsed and overflowing */}
        {overflows && !expanded && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-surface-container-low"
          />
        )}
      </div>

      {/* Expand / collapse toggle */}
      {overflows && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 py-2 text-[11px] font-bold text-primary/70 hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[13px] leading-none">
            {expanded ? "expand_less" : "expand_more"}
          </span>
          {expanded ? "ver menos" : `ver todos (${items.length})`}
        </button>
      )}
    </div>
  );
}

const CHAIN_DOT: Record<string, string> = {
  cinemark:  "bg-red-500/70",
  cinepolis: "bg-purple-400/70",
  showcase:  "bg-blue-400/70",
};

export function ShowtimeCinemaCard({
  cinema,
  showtimes,
  pricesByFormat,
}: {
  cinema: Cinema;
  showtimes: ShowtimeItem[];
  pricesByFormat?: PricesByFormat;
}) {
  const cinemaSlug = slugify(cinema.name);
  const dotClass = CHAIN_DOT[cinema.chain] ?? "bg-outline-variant/40";

  const groups = new Map<string, ShowtimeItem[]>();
  for (const st of showtimes) {
    const key = `${st.format}|${st.language}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(st);
  }

  return (
    <div className="bg-surface-container-low rounded-xl px-4 md:px-6 py-5 md:py-6 shadow-lg shadow-black/40">
      <div className="flex items-center gap-3 mb-5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} aria-hidden="true" />
        <Link
          href={`/cine/${cinemaSlug}`}
          className="text-2xl md:text-3xl lg:text-4xl font-headline font-black text-primary hover:text-primary-fixed-dim transition-colors leading-none"
        >
          {cinema.name}
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60">{cinema.zone}</span>
      </div>

      <div className="flex flex-col divide-y divide-outline-variant/20">
        {Array.from(groups.entries()).map(([key, items]) => {
          const [format, language] = key.split("|");
          const tiers = pricesByFormat?.[format];
          return (
            <div key={key} className="pt-4 pb-4 first:pt-0 last:pb-0">
              <ShowtimeGroup
                format={format}
                language={language}
                items={items}
                tiers={tiers}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
