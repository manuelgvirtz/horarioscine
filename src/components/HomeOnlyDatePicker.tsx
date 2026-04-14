"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { DatePicker } from "./DatePicker";

export function HomeOnlyDatePicker() {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return (
    <div className="hidden md:block">
      <Suspense fallback={null}>
        <DatePicker />
      </Suspense>
    </div>
  );
}
