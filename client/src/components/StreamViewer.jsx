import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Volume2, VolumeX, Maximize, Minimize, RotateCw,
  PictureInPicture2, ZoomIn, ZoomOut, Activity, SlidersHorizontal,
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
export default function StreamViewer({ stream, pcRef, onRequestQuality }) {
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

  const pipSupported = typeof document !== 'undefined' && document.pictureInPictureEnabled

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
      onDoubleClick={toggleFullscreen}
      onWheel={onWheel}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      className="relative w-full overflow-hidden rounded-xl border border-border-strong bg-void"
      style={{ touchAction: zoom > 1 ? 'none' : 'auto', cursor: zoom > 1 ? 'grab' : 'default' }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="aspect-video w-full object-contain transition-transform duration-150"
        style={{ transform, transformOrigin: 'center center' }}
      />

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
