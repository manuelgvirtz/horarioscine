export function DatePickerSkeleton() {
  const widths = ["w-14", "w-20", "w-24", "w-24", "w-24", "w-24", "w-24"];
  return (
    <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-full overflow-hidden">
      {widths.map((w, i) => (
        <div key={i} className={`${w} h-8 rounded-full bg-surface-container-high animate-pulse shrink-0`} />
      ))}
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <section className="mb-6 md:mb-12">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
        {[0, 1].map((i) => (
          <div key={i} className="h-[52px] rounded-xl bg-surface-container-highest animate-pulse" />
        ))}
        <div className="col-span-2 sm:col-span-1 h-[52px] rounded-xl bg-surface-container-highest animate-pulse" />
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <div className="h-4 w-16 rounded bg-surface-container-high animate-pulse mr-2" />
        {["w-10", "w-10", "w-14", "w-10"].map((w, i) => (
          <div key={i} className={`${w} h-7 rounded-full bg-surface-container-high animate-pulse`} />
        ))}
        <div className="mx-2 w-px h-5 bg-outline-variant/30" />
        {["w-16", "w-20"].map((w, i) => (
          <div key={i} className={`${w} h-7 rounded-full bg-surface-container-high animate-pulse`} />
        ))}
      </div>
    </section>
  );
}

export function MovieFilterBarSkeleton() {
  return (
    <div className="flex flex-wrap gap-2 md:gap-3 items-center mb-6">
      <div className="grid grid-cols-2 gap-2 w-full md:contents">
        {[0, 1].map((i) => (
          <div key={i} className="h-[52px] rounded-xl bg-surface-container-highest animate-pulse md:min-w-[280px]" />
        ))}
      </div>
      <div className="hidden md:block w-px h-5 bg-outline-variant/30" />
      {["w-10", "w-10", "w-14", "w-10"].map((w, i) => (
        <div key={i} className={`${w} h-7 rounded-full bg-surface-container-high animate-pulse`} />
      ))}
      <div className="w-px h-5 bg-outline-variant/30" />
      {["w-16", "w-20"].map((w, i) => (
        <div key={i} className={`${w} h-7 rounded-full bg-surface-container-high animate-pulse`} />
      ))}
    </div>
  );
}
