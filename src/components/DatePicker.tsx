"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { getNextDays, getToday } from "@/lib/utils";

export function DatePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedDate = searchParams.get("date") || getToday();
  const days = getNextDays(7);

  function handleSelect(date: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", date);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="relative" role="group" aria-label="Seleccionar fecha">
      <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-full hide-scrollbar overflow-x-auto">
        {days.map(({ date, label }) => (
          <button
            key={date}
            aria-pressed={date === selectedDate}
            onClick={() => handleSelect(date)}
            className={`px-5 py-3 md:py-1.5 rounded-full text-sm transition-colors whitespace-nowrap min-h-[44px] md:min-h-0 flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              date === selectedDate
                ? "bg-primary-container text-on-primary-container font-bold"
                : "font-semibold text-on-surface-variant hover:text-primary hover:bg-surface-container-high"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Fade mask — signals horizontal scroll on mobile */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-surface-container-lowest to-transparent rounded-r-full md:hidden" aria-hidden="true" />
    </div>
  );
}
