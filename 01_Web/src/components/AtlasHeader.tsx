export function AtlasHeader() {
  return (
    <header
      className="atlas-app-header cesium-lab-title hero-glass-layer absolute left-[50vw] top-4 z-50 w-[min(760px,calc(100vw-32px))] -translate-x-1/2 px-6 py-4 text-center sm:px-8"
      data-page="map"
    >
      <h1 className="text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
        Our World
      </h1>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-white sm:text-base">
        A private globe of the places we have been — every visit a memory to revisit.
      </p>
    </header>
  )
}
