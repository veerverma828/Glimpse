// Plays back the raw 16-bit mono PCM frames streamed from AudioCapturer.java
// over the PeerJS data connection (see nativeScreenCapture.js). Schedules
// each 20ms frame back-to-back on the Web Audio timeline so frames arriving
// close together play seamlessly instead of overlapping or gapping.
export function createPcmPlayer() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const ctx = new AudioCtx()
  const gain = ctx.createGain()
  gain.gain.value = 0 // starts muted, matching StreamViewer's default muted video state
  gain.connect(ctx.destination)

  let nextTime = 0

  function push(base64, sampleRate) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    const binary = atob(base64)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
    const view = new DataView(bytes.buffer)

    const sampleCount = len / 2
    if (sampleCount <= 0) return
    const float32 = new Float32Array(sampleCount)
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768
    }

    const buffer = ctx.createBuffer(1, sampleCount, sampleRate || 16000)
    buffer.copyToChannel(float32, 0)

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(gain)

    const now = ctx.currentTime
    // small fixed lead so the first frame (and any frame after a gap) has
    // room to schedule instead of being asked to start in the past
    const startAt = Math.max(nextTime, now + 0.06)
    src.start(startAt)
    nextTime = startAt + buffer.duration
  }

  function setMuted(muted) {
    gain.gain.value = muted ? 0 : 1
  }

  function stop() {
    ctx.close().catch(() => {})
  }

  return { push, setMuted, stop }
}
