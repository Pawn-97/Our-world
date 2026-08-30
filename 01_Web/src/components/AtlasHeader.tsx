// Compact immersive header (UX-5): a small floating pill instead of the old
// hero banner. The tagline drops out on short screens (landscape phones) via
// the .atlas-app-tagline rules in index.css.
export function AtlasHeader() {
  return (
    <header
      className="atlas-app-header cesium-lab-title hero-glass-layer absolute left-[50vw] top-3 z-50 w-[min(520px,calc(100vw-24px))] -translate-x-1/2 px-5 py-2 text-center"
      data-page="map"
    >
      <h1 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
        Our World
      </h1>
      <p className="atlas-app-tagline mx-auto mt-0.5 max-w-xl text-[11px] leading-4 text-slate-400">
        A private globe of the places we have been — every visit a memory to revisit.
      </p>
    </header>
  )
}
