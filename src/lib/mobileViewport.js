export function resetStickyMobileZoom() {
  if (typeof window === 'undefined') return

  // Close focused inputs to avoid Safari keeping form zoom after auth screen.
  const active = document.activeElement
  if (active && typeof active.blur === 'function') active.blur()

  window.scrollTo(0, 0)

  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return

  const original = meta.getAttribute('content') || 'width=device-width, initial-scale=1.0'
  const hasMax = /maximum-scale\s*=/i.test(original)
  const forced = hasMax
    ? original.replace(/maximum-scale\s*=\s*[^,]+/i, 'maximum-scale=1')
    : `${original}, maximum-scale=1`

  meta.setAttribute('content', forced)
  window.setTimeout(() => {
    meta.setAttribute('content', original)
  }, 260)
}
