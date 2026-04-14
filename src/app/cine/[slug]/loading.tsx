export default function Loading() {
  return (
    <div>
      {/* Hero skeleton */}
      <div className="rounded-2xl overflow-hidden mb-10 md:mb-14 bg-surface-container-low">
        <div className="px-5 pt-5 pb-8 md:px-10 md:pt-8 md:pb-12 space-y-4">
          <div className="h-5 w-20 rounded bg-surface-container-high animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-surface-container-high animate-pulse" />
            <div className="h-12 md:h-20 w-3/4 rounded bg-surface-container-high animate-pulse" />
            <div className="h-4 w-36 rounded bg-surface-container-high animate-pulse mt-1" />
          </div>
          <div className="flex gap-3">
            <div className="h-4 w-40 rounded bg-surface-container-high animate-pulse" />
            <div className="h-4 w-28 rounded bg-surface-container-high animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded-lg bg-surface-container-high animate-pulse" />
            <div className="h-9 w-24 rounded-lg bg-surface-container-high animate-pulse" />
          </div>
        </div>
      </div>

      {/* Schedule section skeleton */}
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-10 md:h-12 w-64 rounded bg-surface-container-high animate-pulse" />
            <div className="h-3 w-32 rounded bg-surface-container-high animate-pulse" />
          </div>
          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-full overflow-hidden">
            {["w-14", "w-20", "w-24", "w-24", "w-24", "w-24", "w-24"].map((w, i) => (
              <div key={i} className={`${w} h-8 rounded-full bg-surface-container-high animate-pulse shrink-0`} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[2/3] rounded-2xl bg-surface-container animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-surface-container animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-surface-container animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
