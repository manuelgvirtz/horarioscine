export default function Loading() {
  return (
    <div>
      {/* Hero skeleton */}
      <div className="rounded-2xl overflow-hidden mb-8 md:mb-12 bg-surface-container-low">
        <div className="px-5 pt-5 pb-8 md:px-10 md:pt-10 md:pb-14 flex gap-6 md:gap-10">
          <div className="w-28 md:w-40 shrink-0 aspect-[2/3] rounded-xl bg-surface-container-high animate-pulse" />
          <div className="flex-1 space-y-3 pt-2">
            <div className="h-4 w-24 rounded bg-surface-container-high animate-pulse" />
            <div className="h-10 md:h-16 w-3/4 rounded bg-surface-container-high animate-pulse" />
            <div className="h-4 w-48 rounded bg-surface-container-high animate-pulse" />
            <div className="h-4 w-36 rounded bg-surface-container-high animate-pulse" />
            <div className="flex gap-2 pt-2">
              <div className="h-8 w-20 rounded-full bg-surface-container-high animate-pulse" />
              <div className="h-8 w-24 rounded-full bg-surface-container-high animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar skeleton */}
      <div className="flex flex-wrap gap-2 md:gap-3 items-center mb-6">
        <div className="grid grid-cols-2 gap-2 w-full md:contents">
          {[0, 1].map((i) => (
            <div key={i} className="h-[52px] rounded-xl bg-surface-container-highest animate-pulse md:min-w-[280px]" />
          ))}
        </div>
        <div className="hidden md:block w-px h-5 bg-outline-variant/30" />
        {["w-10", "w-10", "w-14", "w-10"].map((w, i) => (
          <div key={i} className={`${w} h-8 rounded-full bg-surface-container-high animate-pulse`} />
        ))}
        <div className="w-px h-5 bg-outline-variant/30" />
        {["w-16", "w-20"].map((w, i) => (
          <div key={i} className={`${w} h-8 rounded-full bg-surface-container-high animate-pulse`} />
        ))}
      </div>

      {/* Cinema list skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-surface-container rounded-2xl h-24 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
