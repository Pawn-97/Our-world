// Reusable paper-craft bits for the scrapbook place detail page: polaroids,
// washi tape, sticky notes, sticker pills, passport stamps and hand-drawn
// doodles. Presentation only — no content access, no Cesium, no state.
//
// All doodles are inline SVG so the page ships zero extra image requests and
// stays crisp on every device pixel ratio.

import type { CSSProperties, ReactNode } from 'react'
import { tiltFor, tornPolygon } from './scrapbookStyle'

export const ScrapPaperCard = ({
  seed,
  children,
  className = '',
  style,
  onClick,
  ariaLabel,
}: {
  seed: string
  children: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: () => void
  ariaLabel?: string
}) => {
  const cardStyle: CSSProperties = {
    ...style,
    clipPath: tornPolygon(seed),
    transform: `rotate(${tiltFor(seed, 1.1)}deg)`,
    filter: 'drop-shadow(0 12px 18px rgba(38, 42, 54, 0.16))',
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={`scrap-torn block w-full cursor-pointer bg-[#fffdf6] text-left transition-transform duration-200 hover:-translate-y-0.5 ${className}`}
        style={cardStyle}
      >
        {children}
      </button>
    )
  }
  return (
    <div className={`scrap-torn bg-[#fffdf6] ${className}`} style={cardStyle} aria-label={ariaLabel}>
      {children}
    </div>
  )
}

export const PaperTape = ({
  seed,
  className = '',
  tone = 'sky',
}: {
  seed: string
  className?: string
  tone?: 'sky' | 'butter' | 'rose' | 'mint'
}) => (
  <span
    aria-hidden="true"
    className={`scrap-tape pointer-events-none absolute h-6 w-20 ${className}`}
    style={{
      transform: `rotate(${tiltFor(seed, 8)}deg)`,
      background:
        tone === 'butter'
          ? 'linear-gradient(180deg, rgba(255,224,138,.92), rgba(248,205,105,.86))'
          : tone === 'rose'
            ? 'linear-gradient(180deg, rgba(255,196,201,.9), rgba(244,160,170,.84))'
            : tone === 'mint'
              ? 'linear-gradient(180deg, rgba(186,235,206,.9), rgba(150,214,182,.84))'
              : 'linear-gradient(180deg, rgba(191,222,244,.92), rgba(157,199,232,.86))',
      boxShadow: '0 2px 5px rgba(40,46,58,.16)',
    }}
  />
)

export const StickyNote = ({
  seed,
  children,
  className = '',
}: {
  seed: string
  children: ReactNode
  className?: string
}) => (
  <div
    className={`scrap-sticky-note absolute max-w-[46%] px-3 py-2 text-center ${className}`}
    style={{
      transform: `rotate(${tiltFor(seed, 5)}deg)`,
      background: 'linear-gradient(150deg, #ffe9a8 0%, #f7cf6b 100%)',
      boxShadow: '0 10px 16px -8px rgba(84, 66, 20, .5)',
    }}
  >
    <span className="scrap-hand block text-[15px] font-bold leading-tight text-[#5a4413]">{children}</span>
  </div>
)

export const StickerPill = ({
  icon,
  children,
  className = '',
  tone = 'violet',
}: {
  icon?: ReactNode
  children: ReactNode
  className?: string
  tone?: 'violet' | 'ink' | 'coral'
}) => (
  <span
    className={`scrap-sticker inline-flex max-w-full items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold text-white ${className}`}
    style={{
      background:
        tone === 'ink'
          ? 'linear-gradient(180deg,#2a3442,#141b24)'
          : tone === 'coral'
            ? 'linear-gradient(180deg,#ff8a6b,#ef5f5f)'
            : 'linear-gradient(180deg,#8f7bff,#6a4cf0)',
      boxShadow: '0 0 0 2px rgba(255,255,255,.92), 0 8px 14px -6px rgba(30,24,66,.55)',
    }}
  >
    {icon ? <span className="shrink-0 [&>svg]:size-3.5">{icon}</span> : null}
    <span className="truncate">{children}</span>
  </span>
)

/** Passport-stamp ring: country name curved around a centre mark. */
export const CountryStamp = ({
  label,
  center,
  accent = '#e2574c',
  className = '',
}: {
  label: string
  center?: string
  accent?: string
  className?: string
}) => (
  <span
    aria-hidden="true"
    className={`pointer-events-none size-[92px] place-items-center ${className}`}
    style={{ transform: 'rotate(-11deg)', opacity: 0.9 }}
  >
    <svg viewBox="0 0 100 100" className="size-full">
      <defs>
        <path id={`stamp-${label}`} d="M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0" />
      </defs>
      <circle cx="50" cy="50" r="46" fill="rgba(255,255,255,.55)" stroke={accent} strokeWidth="2" strokeDasharray="5 4" />
      <circle cx="50" cy="50" r="29" fill="none" stroke={accent} strokeWidth="1.2" />
      <text fill={accent} fontSize="9.5" fontWeight="700" letterSpacing="2.5">
        <textPath href={`#stamp-${label}`} startOffset="8%">
          {label}
        </textPath>
      </text>
      <text x="50" y="56" textAnchor="middle" fontSize="19">
        {center ?? ''}
      </text>
    </svg>
  </span>
)

export const Polaroid = ({
  src,
  alt,
  seed,
  caption,
  className = '',
  imgClassName = 'aspect-[4/5]',
  onClick,
  priority = false,
}: {
  src: string
  alt: string
  seed: string
  caption?: string
  className?: string
  imgClassName?: string
  onClick?: () => void
  priority?: boolean
}) => {
  const frame = (
    <figure
      className={`scrap-polaroid block ${className}`}
      style={{ transform: `rotate(${tiltFor(seed, 2.6)}deg)` }}
    >
      <img
        src={src}
        alt={alt}
        className={`w-full bg-[#e9e4da] object-cover ${imgClassName}`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
      {caption ? (
        <figcaption className="scrap-hand mt-2 truncate text-center text-[13px] text-[#5c6472]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
  if (!onClick) return frame
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`查看照片：${alt}`}
      className="group block cursor-pointer transition-transform duration-200 hover:-translate-y-1 focus-visible:-translate-y-1"
    >
      {frame}
    </button>
  )
}

/* ── Doodles ──────────────────────────────────────────────────────────── */

const doodleBase = 'pointer-events-none absolute'

export const CameraDoodle = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 64 48" aria-hidden="true" className={`${doodleBase} ${className}`}>
    <rect x="6" y="12" width="52" height="30" rx="6" fill="#f08c5b" stroke="#3a2a24" strokeWidth="2.5" />
    <rect x="24" y="6" width="16" height="8" rx="3" fill="#f08c5b" stroke="#3a2a24" strokeWidth="2.5" />
    <circle cx="32" cy="27" r="10" fill="#dceefb" stroke="#3a2a24" strokeWidth="2.5" />
    <circle cx="32" cy="27" r="4" fill="#3a2a24" />
    <circle cx="50" cy="19" r="2.6" fill="#ffe08a" stroke="#3a2a24" strokeWidth="1.6" />
  </svg>
)

export const SunglassesDoodle = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 64 32" aria-hidden="true" className={`${doodleBase} ${className}`}>
    <path d="M4 8c8-4 16-4 24 0" stroke="#3a2a24" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M36 8c8-4 16-4 24 0" stroke="#3a2a24" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <rect x="6" y="8" width="22" height="16" rx="7" fill="#4c6b8a" stroke="#3a2a24" strokeWidth="2.5" />
    <rect x="36" y="8" width="22" height="16" rx="7" fill="#4c6b8a" stroke="#3a2a24" strokeWidth="2.5" />
    <path d="M11 12l6 8M17 12l4 8" stroke="rgba(255,255,255,.6)" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

export const PinDoodle = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 32 40" aria-hidden="true" className={`${doodleBase} ${className}`}>
    <path d="M16 2c7 0 12 5 12 12 0 9-12 24-12 24S4 23 4 14C4 7 9 2 16 2z" fill="#ef5f5f" stroke="#3a2a24" strokeWidth="2.4" />
    <circle cx="16" cy="14" r="5" fill="#fffdf6" stroke="#3a2a24" strokeWidth="2" />
  </svg>
)

export const PlaneDoodle = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 48 32" aria-hidden="true" className={`${doodleBase} ${className}`}>
    <path d="M2 18l44-12-8 12 8 12z" fill="#dfe8f2" stroke="#3a2a24" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M18 14l6 10" stroke="#3a2a24" strokeWidth="2.2" />
  </svg>
)

export const SunDoodle = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className={`${doodleBase} ${className}`}>
    <circle cx="24" cy="24" r="9" fill="#ffd166" stroke="#3a2a24" strokeWidth="2.2" />
    {Array.from({ length: 8 }, (_, index) => {
      const angle = (index * Math.PI) / 4
      const x1 = 24 + Math.cos(angle) * 14
      const y1 = 24 + Math.sin(angle) * 14
      const x2 = 24 + Math.cos(angle) * 20
      const y2 = 24 + Math.sin(angle) * 20
      return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3a2a24" strokeWidth="2.2" strokeLinecap="round" />
    })}
  </svg>
)

export const WaveDoodle = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 64 24" aria-hidden="true" className={`${doodleBase} ${className}`}>
    <path
      d="M2 16c6-10 10-10 16 0s10 10 16 0 10-10 16 0 8 6 12 2"
      fill="none"
      stroke="#4fa3c7"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
  </svg>
)
