// Decorative background logo, pinned to the viewport (not the page) so it
// stays centered on screen through scrolling — same mark used on Measures'
// Site Measures page, just fixed instead of scrolling with the content.
export function Watermark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative background image, not content
    <img
      src="/logo.webp"
      alt=""
      aria-hidden="true"
      className="pointer-events-none fixed top-1/2 left-1/2 z-0 w-[900px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.11]"
    />
  )
}
