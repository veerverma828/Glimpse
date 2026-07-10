// Shared speed<->quality slider math, used by both HostPage (outgoing share)
// and ViewerPage (outgoing share-back) so a "quality-request" message means
// the same thing regardless of which side sends or receives it.
//
// slider goes 0 (max speed: low res, high fps, low bitrate) to 100 (max
// quality: high res, capped fps, richer encode). Values in between are
// linearly interpolated so the user can land anywhere on the tradeoff.
const SPEED_END = {
  frameRate: { ideal: 30, max: 30 },
  width: { ideal: 1280 },
  height: { ideal: 720 },
  maxBitrate: 1_500_000,
}
const QUALITY_END = {
  frameRate: { ideal: 15, max: 20 },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  maxBitrate: 6_000_000,
}

const lerp = (a, b, t) => Math.round(a + (b - a) * t)

export function presetForValue(value) {
  const t = value / 100
  return {
    frameRate: {
      ideal: lerp(SPEED_END.frameRate.ideal, QUALITY_END.frameRate.ideal, t),
      max: lerp(SPEED_END.frameRate.max, QUALITY_END.frameRate.max, t),
    },
    width: { ideal: lerp(SPEED_END.width.ideal, QUALITY_END.width.ideal, t) },
    height: { ideal: lerp(SPEED_END.height.ideal, QUALITY_END.height.ideal, t) },
    contentHint: value >= 50 ? 'detail' : 'motion',
    maxBitrate: lerp(SPEED_END.maxBitrate, QUALITY_END.maxBitrate, t),
  }
}

export function applyBitrateCap(peerConnection, maxBitrate) {
  const sender = peerConnection?.getSenders?.().find((s) => s.track?.kind === 'video')
  if (!sender) return
  const params = sender.getParameters()
  if (!params.encodings?.length) params.encodings = [{}]
  params.encodings[0].maxBitrate = maxBitrate
  sender.setParameters(params).catch(() => {})
}
