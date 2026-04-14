"use client";

import { useState } from "react";

export function MobileDetailsToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden w-full">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="movie-details-mobile"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-primary text-xs font-bold select-none min-h-[44px]"
      >
        <span
          className="material-symbols-outlined text-sm transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        >
          expand_more
        </span>
        {open ? "Ocultar" : "Ver sinopsis y reparto"}
      </button>
      <div
        id="movie-details-mobile"
        role="region"
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="pt-3 space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
