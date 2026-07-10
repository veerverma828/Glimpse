// getDisplayMedia() is straightforwardly missing in three distinct browser
// situations, each with a different fix (or no fix at all) -- see each
// branch below. Only called once insecure-origin and no-mediaDevices cases
// (different root causes: cert/HTTPS, not capability) have been ruled out.
export function getUnsupportedShareMessage() {
  const ua = navigator.userAgent

  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (isIOS) {
    return "iOS Safari has no screen-capture API at all -- Apple doesn't expose it to any browser on iPhone/iPad, and there's no workaround. Sharing your screen from an iPhone or iPad isn't possible on Glimpse. You can still watch a shared screen here just fine."
  }

  const isAndroid = /Android/i.test(ua)
  if (isAndroid) {
    return "Chrome (and every other Android browser) deliberately leaves out screen capture -- it's not a bug or a permissions issue, Google just doesn't expose it. Watching a shared screen works fine in this browser, but to share your phone's screen, install the Glimpse app and share from there instead."
  }

  return "This browser doesn't implement screen capture. Try the latest Chrome, Edge, or Firefox on desktop."
}

// True only when the platform itself will never support sharing (Android
// browser, iOS Safari, an old/unsupported desktop browser) -- not when it's
// just an HTTP/insecure-origin issue, which is fixable by the user and
// should still surface as an actionable error on click rather than being
// silently hidden.
export function isShareUnsupportedPermanently() {
  if (!window.isSecureContext) return false
  if (!navigator.mediaDevices) return false
  return typeof navigator.mediaDevices.getDisplayMedia !== 'function'
}
