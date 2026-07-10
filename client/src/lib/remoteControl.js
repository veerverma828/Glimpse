import { Capacitor, registerPlugin } from '@capacitor/core'

// Bridge to the native GlimpseControl plugin (accessibility-backed input
// injection). Null on the web, where a device can never be controlled --
// only the packaged Android app can inject input into itself.
const Control = Capacitor.isNativePlatform() ? registerPlugin('GlimpseControl') : null

export const controlSupported = Capacitor.isNativePlatform()

// Is the accessibility service actually enabled by the user right now?
export async function isControlServiceEnabled() {
  if (!Control) return false
  try {
    const { enabled } = await Control.isEnabled()
    return Boolean(enabled)
  } catch {
    return false
  }
}

// Open Settings > Accessibility so the user can flip the service on.
export async function openControlSettings() {
  await Control?.openSettings()
}

// Apply one control message (received from the controlling peer) to this
// device. Coordinates are normalized 0..1 in the shared frame. No-op unless
// running natively with the service enabled -- the caller is expected to have
// gated this on the local "Allow remote control" toggle already.
export async function applyControl(msg) {
  if (!Control || !msg) return
  try {
    switch (msg.action) {
      case 'tap':
        await Control.tap({ x: msg.nx, y: msg.ny })
        break
      case 'long':
        await Control.longPress({ x: msg.nx, y: msg.ny })
        break
      case 'swipe':
        await Control.swipe({ x1: msg.nx1, y1: msg.ny1, x2: msg.nx2, y2: msg.ny2, ms: msg.ms || 200 })
        break
      case 'global':
        await Control.global({ name: msg.name })
        break
      default:
        break
    }
  } catch {
    // service not enabled / gesture rejected -- silently ignore
  }
}
