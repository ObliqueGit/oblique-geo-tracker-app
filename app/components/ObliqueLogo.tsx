/**
 * Oblique brand mark — crossed strokes with a ring and the signature red
 * oblique slash, recreated as SVG from the official logo. Pairs with the
 * "Oblique GEO" wordmark in the nav.
 */
export default function ObliqueLogo({ size = 22 }: { size?: number }) {
  const ink = 'var(--ink)'
  const red = '#E11D2F'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ flexShrink: 0, display: 'block', overflow: 'visible' }}
      aria-label="Oblique"
    >
      {/* crossed black strokes (bowtie / X) */}
      <line x1="20" y1="10" x2="66" y2="90" stroke={ink} strokeWidth="6" strokeLinecap="round" />
      <line x1="66" y1="10" x2="20" y2="90" stroke={ink} strokeWidth="6" strokeLinecap="round" />
      {/* ring nestled in the lower crossing */}
      <circle cx="43" cy="72" r="11.5" fill="none" stroke={ink} strokeWidth="6" />
      {/* signature red oblique slash */}
      <line x1="8" y1="94" x2="92" y2="8" stroke={red} strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  )
}
