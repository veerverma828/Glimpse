import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Volume2, VolumeX, Maximize, Minimize, RotateCw,
  PictureInPicture2, ZoomIn, ZoomOut, Activity, SlidersHorizontal,
  Gamepad2, ArrowLeft, Home, SquareStack,
} from 'lucide-react'
import useFullscreen from '../hooks/useFullscreen'

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

// Poll interval for the live-stats overlay.
const STATS_INTERVAL_MS = 1000

function IconButton({ label, active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur transition-colors active:scale-95 ${
        active
          ? 'border-violet-light bg-violet/20 text-violet-light'
          : 'border-border bg-void/70 text-text hover:border-border-strong'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * The live video surface plus every viewer-side control: mute, fullscreen,
 * auto/manual rotate, zoom+pan, picture-in-picture, a live-stats overlay,
 * and a quality request sent back to the host. Kept separate from
 * ViewerPage so the page stays focused on connection lifecycle.
 *
 * pcRef:   a ref whose .current is the active RTCPeerConnection receiving
 *          the stream (used for getStats()); may be null between streams.
 * onRequestQuality: (value 0..100) => void, relayed to the host over the
 *          existing data connection so the viewer can nudge quality.
 */
export default function StreamViewer({ stream, pcRef, onRequestQuality, controlAvailable, onControl }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const { isFullscreen, toggleFullscreen, supported: fullscreenSupported } =
    useFullscreen(containerRef, videoRef)

  const [muted, setMuted] = useState(true)
  const [rotation, setRotation] = useState(0) // 0 | 90 | 180 | 270
  const [manualRotate, setManualRotate] = useState(false)
  const [streamPortrait, setStreamPortrait] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [fitScale, setFitScale] = useState(1)
  const [pipActive, setPipActive] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState(null)
  const [showQuality, setShowQuality] = useState(false)
  const [quality, setQuality] = useState(100)
  const [controlMode, setControlMode] = useState(false)

  const pipSupported = typeof document !== 'undefined' && document.pictureInPictureEnabled

  // control can't be on if the far side stopped advertising it
  useEffect(() => {
    if (!controlAvailable) setControlMode(false)
  }, [controlAvailable])

  // attach stream
  useEffect(() => {
    const video = videoRef.current
    if (video && stream) {
      video.srcObject = stream
      video.play().catch(() => {})
    }
  }, [stream])

  // track the stream's real aspect so we know when it's portrait
  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    const update = () => {
      if (video.videoWidth && video.videoHeight) {
        setStreamPortrait(video.videoHeight > video.videoWidth)
      }
    }
    video.addEventListener('loadedmetadata', update)
    video.addEventListener('resize', update)
    update()
    return () => {
      video.removeEventListener('loadedmetadata', update)
      video.removeEventListener('resize', update)
    }
  }, [stream])

  // auto-rotate: a portrait stream shown fullscreen on a landscape display
  // gets spun 90deg so it fills the screen -- unless the user has taken
  // manual control of rotation.
  useEffect(() => {
    if (manualRotate) return
    const displayLandscape = window.innerWidth >= window.innerHeight
    if (isFullscreen && streamPortrait && displayLandscape) {
      setRotation(90)
    } else {
      setRotation(0)
    }
  }, [isFullscreen, streamPortrait, manualRotate])

  // when rotated 90/270 the video's bounding box swaps W/H; scale it down so
  // that rotated box still fits inside the container instead of overflowing
  useEffect(() => {
    const compute = () => {
      const el = containerRef.current
      if (!el) return
      const { clientWidth: w, clientHeight: h } = el
      if (!w || !h) return
      const rotated = rotation === 90 || rotation === 270
      setFitScale(rotated ? Math.min(w, h) / Math.max(w, h) : 1)
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [rotation, isFullscreen])

  // reset pan whenever we return to 1x so the image can't get stuck offscreen
  useEffect(() => {
    if (zoom === 1) setPan({ x: 0, y: 0 })
  }, [zoom])

  const rotate = () => {
    setManualRotate(true)
    setRotation((r) => (r + 90) % 360)
  }

  const changeZoom = useCallback((delta) => {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2))))
  }, [])

  const onWheel = (e) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return
    e.preventDefault()
    changeZoom(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
  }

  // drag to pan (mouse + touch), only meaningful while zoomed in
  const dragRef = useRef(null)
  const startPan = (e) => {
    if (zoom === 1) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const movePan = (e) => {
    const d = dragRef.current
    if (!d) return
    setPan({ x: d.baseX + (e.clientX - d.startX), y: d.baseY + (e.clientY - d.startY) })
  }
  const endPan = () => { dragRef.current = null }

  // Invert the on-screen transform (translate/rotate/scale + object-contain
  // letterboxing) to turn a screen click into normalized 0..1 coords in the
  // original captured frame. Returns null if the click landed on the letterbox
  // rather than the actual video.
  const mapPointerToFrame = (clientX, clientY) => {
    const el = containerRef.current
    const video = videoRef.current
    if (!el || !video || !video.videoWidth) return null
    const rect = el.getBoundingClientRect()
    const W = rect.width, H = rect.height
    const centerX = W / 2, centerY = H / 2

    // undo translate(pan) and recentre
    let qx = (clientX - rect.left) - pan.x - centerX
    let qy = (clientY - rect.top) - pan.y - centerY
    // undo uniform scale
    const s = zoom * fitScale
    qx /= s; qy /= s
    // undo rotation
    const rad = (-rotation * Math.PI) / 180
    const rx = qx * Math.cos(rad) - qy * Math.sin(rad)
    const ry = qx * Math.sin(rad) + qy * Math.cos(rad)
    const ex = rx + centerX, ey = ry + centerY

    // object-contain layout of the intrinsic video inside the WxH box
    const vw = video.videoWidth, vh = video.videoHeight
    const scale0 = Math.min(W / vw, H / vh)
    const contentW = vw * scale0, contentH = vh * scale0
    const offX = (W - contentW) / 2, offY = (H - contentH) / 2
    const fx = (ex - offX) / contentW
    const fy = (ey - offY) / contentH
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null
    return { nx: fx, ny: fy }
  }

  // control-mode gestures: tap / long-press / swipe, sent to the far device
  const controlRef = useRef(null)
  const startControl = (e) => {
    const p = mapPointerToFrame(e.clientX, e.clientY)
    if (!p) return
    controlRef.current = { ...p, startX: e.clientX, startY: e.clientY, t: Date.now(), moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const moveControl = (e) => {
    const d = controlRef.current
    if (!d) return
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8) d.moved = true
  }
  const endControl = (e) => {
    const d = controlRef.current
    controlRef.current = null
    if (!d) return
    const end = mapPointerToFrame(e.clientX, e.clientY) || { nx: d.nx, ny: d.ny }
    const dt = Date.now() - d.t
    if (d.moved) {
      onControl?.({ action: 'swipe', nx1: d.nx, ny1: d.ny, nx2: end.nx, ny2: end.ny, ms: Math.min(800, Math.max(80, dt)) })
    } else if (dt > 500) {
      onControl?.({ action: 'long', nx: d.nx, ny: d.ny })
    } else {
      onControl?.({ action: 'tap', nx: d.nx, ny: d.ny })
    }
  }

  const pointerDown = controlMode ? startControl : startPan
  const pointerMove = controlMode ? moveControl : movePan
  const pointerUp = controlMode ? endControl : endPan

  const togglePip = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await video.requestPictureInPicture()
      }
    } catch {
      // user gesture / support issues -- ignore, button is best-effort
    }
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    const onEnter = () => setPipActive(true)
    const onLeave = () => setPipActive(false)
    video.addEventListener('enterpictureinpicture', onEnter)
    video.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter)
      video.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [stream])

  // live stats overlay -- poll getStats() and derive the readable numbers
  useEffect(() => {
    if (!showStats) return undefined
    let lastBytes = 0
    let lastTs = 0
    const timer = setInterval(async () => {
      const pc = pcRef?.current
      if (!pc) return
      try {
        const report = await pc.getStats()
        let out = { state: pc.connectionState }
        report.forEach((r) => {
          if (r.type === 'inbound-rtp' && r.kind === 'video') {
            out.fps = r.framesPerSecond
            out.width = r.frameWidth
            out.height = r.frameHeight
            if (lastTs) {
              const bits = (r.bytesReceived - lastBytes) * 8
              const secs = (r.timestamp - lastTs) / 1000
              if (secs > 0) out.kbps = Math.round(bits / secs / 1000)
            }
            lastBytes = r.bytesReceived
            lastTs = r.timestamp
          }
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) {
            out.rtt = Math.round(r.currentRoundTripTime * 1000)
          }
        })
        setStats(out)
      } catch {
        // stats unavailable this tick -- skip
      }
    }, STATS_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [showStats, pcRef])

  const commitQuality = (value) => {
    setQuality(value)
    onRequestQuality?.(value)
  }

  const transform =
    `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${(zoom * fitScale).toFixed(3)})`

  return (
    <div
      ref={containerRef}
      onDoubleClick={controlMode ? undefined : toggleFullscreen}
      onWheel={onWheel}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      className={`relative w-full overflow-hidden rounded-xl border bg-void ${
        controlMode ? 'border-cyan ring-2 ring-cyan/40' : 'border-border-strong'
      }`}
      style={{
        touchAction: controlMode || zoom > 1 ? 'none' : 'auto',
        cursor: controlMode ? 'crosshair' : zoom > 1 ? 'grab' : 'default',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="aspect-video w-full object-contain transition-transform duration-150"
        style={{ transform, transformOrigin: 'center center' }}
      />

      {controlMode && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-cyan/20 px-2.5 py-1 text-[11px] font-medium text-cyan backdrop-blur">
          <Gamepad2 className="h-3.5 w-3.5" /> Controlling
        </div>
      )}

      {controlMode && (
        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2">
          <IconButton label="Back" onClick={() => onControl?.({ action: 'global', name: 'back' })}>
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
          <IconButton label="Home" onClick={() => onControl?.({ action: 'global', name: 'home' })}>
            <Home className="h-4 w-4" />
          </IconButton>
          <IconButton label="Recents" onClick={() => onControl?.({ action: 'global', name: 'recents' })}>
            <SquareStack className="h-4 w-4" />
          </IconButton>
        </div>
      )}

      {showStats && stats && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-void/80 px-3 py-2 font-mono text-[11px] leading-relaxed text-cyan backdrop-blur">
          <div>{stats.width || '–'}×{stats.height || '–'} @ {stats.fps ?? '–'}fps</div>
          <div>{stats.kbps ?? '–'} kbps · {stats.rtt ?? '–'} ms</div>
          <div>state: {stats.state}</div>
        </div>
      )}

      {showQuality && (
        <div className="absolute left-1/2 top-3 flex w-[min(90%,20rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-void/85 px-4 py-3 backdrop-blur">
          <span className="text-[11px] font-medium text-muted">Speed</span>
          <input
            type="range"
            min={0}
            max={100}
            value={quality}
            onChange={(e) => commitQuality(Number(e.target.value))}
            className="flex-1 accent-violet-light"
          />
          <span className="text-[11px] font-medium text-muted">Quality</span>
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex flex-wrap items-center justify-end gap-2">
        {controlAvailable && (
          <IconButton label="Remote control" active={controlMode} onClick={() => setControlMode((c) => !c)}>
            <Gamepad2 className="h-4 w-4" />
          </IconButton>
        )}
        {onRequestQuality && (
          <IconButton label="Request quality" active={showQuality} onClick={() => setShowQuality((s) => !s)}>
            <SlidersHorizontal className="h-4 w-4" />
          </IconButton>
        )}
        <IconButton label="Stats" active={showStats} onClick={() => setShowStats((s) => !s)}>
          <Activity className="h-4 w-4" />
        </IconButton>
        <IconButton label="Zoom out" onClick={() => changeZoom(-ZOOM_STEP)}>
          <ZoomOut className="h-4 w-4" />
        </IconButton>
        <IconButton label="Zoom in" onClick={() => changeZoom(ZOOM_STEP)}>
          <ZoomIn className="h-4 w-4" />
        </IconButton>
        {pipSupported && (
          <IconButton label="Picture in picture" active={pipActive} onClick={togglePip}>
            <PictureInPicture2 className="h-4 w-4" />
          </IconButton>
        )}
        <IconButton label="Rotate" onClick={rotate}>
          <RotateCw className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={muted ? 'Unmute' : 'Mute'}
          onClick={() => { setMuted((m) => !m); videoRef.current?.play().catch(() => {}) }}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </IconButton>
        {fullscreenSupported && (
          <IconButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </IconButton>
        )}
      </div>
    </div>
  )
}
