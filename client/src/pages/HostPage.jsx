import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, ScreenShare, Square, MonitorX, Volume2, VolumeX, Maximize, Minimize, X } from 'lucide-react'
import toast from 'react-hot-toast'
import useWebRTC from '../hooks/useWebRTC'
import useFullscreen from '../hooks/useFullscreen'
import { generateRoomId, roomIdToPeerId } from '../lib/roomId'
import { isNativeApp, startNativeScreenShare, stopNativeScreenShare } from '../lib/nativeScreenCapture'
import { getUnsupportedShareMessage, isShareUnsupportedPermanently } from '../lib/screenShareSupport'
import Card from '../components/Card'
import Button from '../components/Button'
import StatusBadge from '../components/StatusBadge'
import ErrorAlert from '../components/ErrorAlert'
import SignalPulse from '../components/SignalPulse'
import EmptyState from '../components/EmptyState'
import QualitySlider from '../components/QualitySlider'

// Inside the installed app, Capacitor serves the WebView from its own
// virtual https://localhost origin -- that's not a real, reachable address,
// so window.location.origin is useless there for a link/QR code a *different*
// device needs to open. Use the real hosted site instead.
const PUBLIC_SITE_ORIGIN = 'https://veerverma828.github.io/Glimpse/'

function buildJoinUrl(roomId) {
  const base = isNativeApp ? PUBLIC_SITE_ORIGIN : window.location.origin + import.meta.env.BASE_URL
  return `${base}join/${roomId}`.replace(/([^:])\/\//g, '$1/')
}

// Same virtual-origin issue: Capacitor's WebView hostname is always
// "localhost" by design, which isn't the "you typed localhost by mistake on
// your phone" case this warning exists for -- so it must never fire natively.
const isLocalHostname =
  !isNativeApp &&
  ['localhost', '127.0.0.1', '0.0.0.0', ''].includes(window.location.hostname)

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

function presetForValue(value) {
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

function applyBitrateCap(peerConnection, maxBitrate) {
  const sender = peerConnection?.getSenders?.().find((s) => s.track?.kind === 'video')
  if (!sender) return
  const params = sender.getParameters()
  if (!params.encodings?.length) params.encodings = [{}]
  params.encodings[0].maxBitrate = maxBitrate
  sender.setParameters(params).catch(() => {})
}

export default function HostPage() {
  const [roomId, setRoomId] = useState(() => generateRoomId())
  const { peer, status: peerStatus, error: peerError } = useWebRTC(roomIdToPeerId(roomId))

  const [viewerConn, setViewerConn] = useState(null)
  const [call, setCall] = useState(null)
  const [isSharing, setIsSharing] = useState(false)
  const [shareError, setShareError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [qualityValue, setQualityValue] = useState(100)
  const localStreamRef = useRef(null)
  const videoRef = useRef(null)
  const qualityValueRef = useRef(qualityValue)
  qualityValueRef.current = qualityValue
  const nativeShareRef = useRef(null)

  // viewer sharing their screen back to us
  const [incomingCall, setIncomingCall] = useState(null)
  const [incomingStream, setIncomingStream] = useState(null)
  const [incomingMuted, setIncomingMuted] = useState(true)
  const incomingVideoRef = useRef(null)
  const incomingContainerRef = useRef(null)
  const { isFullscreen: incomingFullscreen, toggleFullscreen: toggleIncomingFullscreen, supported: incomingFullscreenSupported } =
    useFullscreen(incomingContainerRef, incomingVideoRef)

  // room id already in use -> mint a new one and let the hook re-init
  useEffect(() => {
    if (peerError && peerStatus === 'error' && peerError.includes('already in use')) {
      const t = setTimeout(() => setRoomId(generateRoomId()), 400)
      return () => clearTimeout(t)
    }
  }, [peerError, peerStatus])

  // accept the viewer's incoming data connection (used purely as a presence signal)
  useEffect(() => {
    if (!peer) return undefined

    const onConnection = (conn) => {
      setViewerConn(conn)
      conn.on('close', () => setViewerConn(null))
      conn.on('open', () => {
        toast.success('A viewer joined')
        if (localStreamRef.current) {
          const outgoingCall = peer.call(conn.peer, localStreamRef.current)
          applyBitrateCap(
            outgoingCall.peerConnection,
            presetForValue(qualityValueRef.current).maxBitrate
          )
          setCall(outgoingCall)
        }
      })

      // Mirrors ViewerPage's onNativeSignal handler: if the *viewer* is
      // running the native Android app, its "share your screen with the
      // host" offer arrives as plain SDP over this data connection instead
      // of a peer.call() (same reason as the host's native path -- Chrome
      // for Android has no getDisplayMedia()). Answer it with an ordinary
      // RTCPeerConnection, same as ViewerPage does for the reverse direction.
      let nativePeerConnection = null
      const onNativeSignal = async (msg) => {
        if (!msg || typeof msg !== 'object') return

        if (msg.type === 'native-offer') {
          try {
            nativePeerConnection = new RTCPeerConnection({
              iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            })
            nativePeerConnection.ontrack = (event) => {
              const [remoteStream] = event.streams
              setIncomingCall({ close: () => nativePeerConnection?.close() })
              setIncomingStream(remoteStream)
              setIncomingMuted(true)
              toast.success("Viewer's screen is streaming in")
            }
            nativePeerConnection.onicecandidate = (event) => {
              if (event.candidate) {
                conn.send({
                  type: 'native-ice-from-remote',
                  sdpMid: event.candidate.sdpMid,
                  sdpMLineIndex: event.candidate.sdpMLineIndex,
                  candidate: event.candidate.candidate,
                })
              }
            }
            nativePeerConnection.onconnectionstatechange = () => {
              if (['disconnected', 'failed', 'closed'].includes(nativePeerConnection.connectionState)) {
                setIncomingCall(null)
                setIncomingStream(null)
              }
            }

            await nativePeerConnection.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
            const answer = await nativePeerConnection.createAnswer()
            await nativePeerConnection.setLocalDescription(answer)
            conn.send({ type: 'native-answer', sdp: answer.sdp })
          } catch (err) {
            conn.send({ type: 'native-error', message: err.message })
          }
        } else if (msg.type === 'native-ice' && nativePeerConnection) {
          try {
            await nativePeerConnection.addIceCandidate({
              sdpMid: msg.sdpMid,
              sdpMLineIndex: msg.sdpMLineIndex,
              candidate: msg.candidate,
            })
          } catch {
            // stale/duplicate candidates are safe to ignore
          }
        }
      }
      conn.on('data', onNativeSignal)
      conn.on('close', () => nativePeerConnection?.close())
    }

    peer.on('connection', onConnection)
    return () => peer.off('connection', onConnection)
  }, [peer])

  // receive a viewer sharing their own screen back to us (browser viewer path)
  useEffect(() => {
    if (!peer) return undefined

    const onCall = (call) => {
      call.answer()
      call.on('stream', (stream) => {
        setIncomingCall(call)
        setIncomingStream(stream)
        setIncomingMuted(true)
        toast.success("Viewer's screen is streaming in")
      })
      call.on('close', () => {
        setIncomingCall(null)
        setIncomingStream(null)
      })
    }

    peer.on('call', onCall)
    return () => peer.off('call', onCall)
  }, [peer])

  const stopWatchingIncoming = useCallback(() => {
    incomingCall?.close()
    setIncomingCall(null)
    setIncomingStream(null)
  }, [incomingCall])

  const stopSharing = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    if (nativeShareRef.current) {
      nativeShareRef.current.stop().catch(() => {})
      nativeShareRef.current = null
    } else {
      stopNativeScreenShare().catch(() => {})
    }
    call?.close()
    setCall(null)
    setIsSharing(false)
  }, [call])

  const startSharing = useCallback(async () => {
    setShareError(null)

    // Native path: running inside the packaged Android app, where Chrome's
    // getDisplayMedia() doesn't exist at all (deliberately hidden on
    // Android since Chrome 88 -- not a bug or permissions issue). Use the
    // native MediaProjection-backed capture instead, relayed through the
    // existing viewer DataConnection. See lib/nativeScreenCapture.js.
    if (isNativeApp) {
      if (!viewerConn?.open) {
        setShareError('Waiting for a viewer to join before sharing can start.')
        return
      }
      try {
        const handle = await startNativeScreenShare(viewerConn, {
          onError: (message) => {
            setShareError(message)
            setIsSharing(false)
            nativeShareRef.current = null
          },
          onStopped: () => {
            setIsSharing(false)
            nativeShareRef.current = null
          },
        })
        nativeShareRef.current = handle
        setIsSharing(true)
      } catch (err) {
        setShareError(err.message || 'Failed to start native screen sharing')
      }
      return
    }

    if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
      if (!window.isSecureContext) {
        setShareError(
          'This page is not a fully-trusted secure origin, so the browser hides screen capture. Open it over HTTPS with a certificate your phone trusts (a self-signed / bypassed cert is not enough).'
        )
      } else if (!navigator.mediaDevices) {
        setShareError(
          'Your browser exposes no media APIs on this page. Make sure the URL is HTTPS and the certificate is fully trusted (green padlock, no warning).'
        )
      } else {
        setShareError(getUnsupportedShareMessage())
      }
      return
    }

    try {
      const preset = presetForValue(qualityValue)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: preset.frameRate, width: preset.width, height: preset.height },
        audio: true,
      })
      stream.getVideoTracks()[0].contentHint = preset.contentHint
      localStreamRef.current = stream
      setIsSharing(true)

      stream.getVideoTracks()[0].addEventListener('ended', stopSharing)

      if (peer && viewerConn?.open) {
        const outgoingCall = peer.call(viewerConn.peer, stream)
        applyBitrateCap(outgoingCall.peerConnection, preset.maxBitrate)
        setCall(outgoingCall)
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setShareError('Screen-share permission was denied. Allow it to start broadcasting.')
      } else if (err.name === 'NotFoundError' || err.name === 'NotSupportedError') {
        setShareError("This browser can't share a screen. Try Chrome, Edge, or Firefox on desktop.")
      } else {
        setShareError(`Could not start screen sharing: ${err.name || 'Error'} — ${err.message || 'no details'}`)
      }
    }
  }, [peer, viewerConn, stopSharing, qualityValue])

  useEffect(() => stopSharing, []) // eslint-disable-line react-hooks/exhaustive-deps

  // attach the captured stream once the <video> element exists (it only
  // mounts after isSharing flips true, one render after the stream is ready)
  useEffect(() => {
    if (isSharing && videoRef.current && localStreamRef.current) {
      videoRef.current.srcObject = localStreamRef.current
    }
  }, [isSharing])

  const commitQuality = (value) => {
    const preset = presetForValue(value)
    // live-switch an already-running share without restarting capture
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (track) {
      track.applyConstraints({ frameRate: preset.frameRate, width: preset.width, height: preset.height }).catch(() => {})
      track.contentHint = preset.contentHint
    }
    if (call?.peerConnection) {
      applyBitrateCap(call.peerConnection, preset.maxBitrate)
    }
  }

  // attach the viewer's incoming stream once the overlay's <video> mounts
  useEffect(() => {
    if (incomingStream && incomingVideoRef.current) {
      incomingVideoRef.current.srcObject = incomingStream
      incomingVideoRef.current.play().catch(() => {})
    }
  }, [incomingStream])

  const joinUrl = buildJoinUrl(roomId)

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    toast.success('Link copied')
    setTimeout(() => setCopied(false), 1800)
  }

  const status =
    peerStatus === 'error'
      ? 'error'
      : isSharing
        ? 'sharing'
        : viewerConn?.open
          ? 'connected'
          : peerStatus === 'ready'
            ? 'waiting'
            : 'connecting'

  const qualityToggle = (
    <QualitySlider value={qualityValue} onChange={setQualityValue} onCommit={commitQuality} />
  )

  // Permanently-unsupported platforms (Android browser, iOS Safari, an old
  // desktop browser) never get a working "Start sharing" click -- so don't
  // show the button at all instead of letting them tap it into an error.
  // Native app is always exempt (it never uses getDisplayMedia at all).
  const canShare = isNativeApp || !isShareUnsupportedPermanently()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-12 sm:px-8 sm:pb-16">
      <section className="mx-auto max-w-2xl pt-6 pb-8 text-center sm:pt-14 sm:pb-14">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan">Peer to peer &middot; zero setup</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text sm:mt-4 sm:text-4xl md:text-5xl">
          Beam your screen<br className="hidden sm:block" /> to any device
        </h1>
        <p className="mt-3 text-sm text-muted sm:mt-4 sm:text-base">
          Start broadcasting, share the code, and watch it appear on the other screen in seconds.
          Nothing passes through a server.
        </p>
      </section>

      <div className="grid min-w-0 flex-1 gap-5 sm:gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="flex min-w-0 flex-col items-center justify-center gap-5 p-5 sm:gap-6 sm:p-8 lg:p-10" glow={isSharing}>
          {!isSharing ? (
            <>
              <SignalPulse active={peerStatus === 'ready'} tone={viewerConn?.open ? 'cyan' : 'violet'} />
              <div className="text-center">
                <StatusBadge status={status} />
              </div>
              <ErrorAlert message={peerError} className="w-full max-w-sm" />
              {canShare ? (
                <>
                  <ErrorAlert message={shareError} title="Couldn't start sharing" className="w-full max-w-sm" />
                  {qualityToggle}
                  <Button
                    size="lg"
                    onClick={startSharing}
                    disabled={peerStatus !== 'ready'}
                    className="w-full max-w-xs"
                  >
                    <ScreenShare className="h-4 w-4" strokeWidth={2.25} />
                    Start sharing
                  </Button>
                  <p className="max-w-xs text-center text-xs text-faint">
                    {viewerConn?.open
                      ? 'A viewer is connected and ready to watch.'
                      : 'Share the code on the right so a viewer can join first, or start now — they can join any time.'}
                  </p>
                </>
              ) : (
                <p className="max-w-xs text-center text-sm text-muted">{getUnsupportedShareMessage()}</p>
              )}
            </>
          ) : (
            <div className="flex w-full flex-col items-center gap-5">
              <div className="relative w-full overflow-hidden rounded-xl border border-border-strong bg-void">
                <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-contain" />
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-void/70 px-2.5 py-1 text-[11px] font-medium text-danger backdrop-blur">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> LIVE
                </span>
              </div>
              <StatusBadge status={status} />
              {qualityToggle}
              <Button variant="danger" size="lg" onClick={stopSharing} className="w-full max-w-xs">
                <Square className="h-4 w-4" strokeWidth={2.25} />
                Stop sharing
              </Button>
            </div>
          )}
        </Card>

        <Card className="flex min-w-0 flex-col gap-5 p-5 sm:gap-6 sm:p-8 lg:p-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Room code</p>
            <p className="mt-1.5 font-mono text-2xl font-medium tracking-[0.15em] text-text sm:text-3xl">{roomId}</p>
          </div>

          {peerStatus === 'ready' ? (
            <>
              {isLocalHostname && (
                <p className="rounded-lg border border-warning/25 bg-warning/8 px-3 py-2 text-center text-[11px] leading-relaxed text-warning">
                  You're on <code className="font-mono">localhost</code> — other devices can't reach that.
                  Open this page using your computer's network address instead (printed in the terminal
                  running <code className="font-mono">npm run dev</code>, e.g. <code className="font-mono">https://192.168.x.x:5173</code>),
                  then the code and QR below will work. Your browser will warn about the certificate first — click "Advanced" then "Proceed".
                </p>
              )}
              <div className="flex items-center justify-center rounded-xl border border-border bg-white p-4">
                <QRCodeSVG value={joinUrl} size={168} bgColor="#ffffff" fgColor="#08080d" />
              </div>

              <button
                onClick={copyLink}
                className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-left transition-colors hover:border-border-strong"
              >
                <span className="min-w-0 truncate font-mono text-xs text-muted">{joinUrl}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-violet-light">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </span>
              </button>
            </>
          ) : (
            <EmptyState
              icon={MonitorX}
              title={peerStatus === 'error' ? 'Connection unavailable' : 'Setting things up'}
              message={
                peerStatus === 'error'
                  ? 'Retrying with a fresh room code…'
                  : 'Getting your room ready to receive a connection.'
              }
            />
          )}
        </Card>
      </div>

      {incomingStream && (
        <div
          ref={incomingContainerRef}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-void"
        >
          <video
            ref={incomingVideoRef}
            autoPlay
            playsInline
            muted={incomingMuted}
            className="h-full w-full object-contain"
          />
          <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-void/70 px-2.5 py-1 text-[11px] font-medium text-danger backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> VIEWER'S SCREEN
          </span>
          <div className="absolute bottom-4 right-4 flex items-center gap-2">
            <button
              onClick={() => setIncomingMuted((m) => !m)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-void/70 text-text backdrop-blur transition-colors hover:border-border-strong active:scale-95"
              aria-label={incomingMuted ? 'Unmute' : 'Mute'}
            >
              {incomingMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            {incomingFullscreenSupported && (
              <button
                onClick={toggleIncomingFullscreen}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-void/70 text-text backdrop-blur transition-colors hover:border-border-strong active:scale-95"
                aria-label={incomingFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {incomingFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={stopWatchingIncoming}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-void/70 text-danger backdrop-blur transition-colors hover:border-border-strong active:scale-95"
              aria-label="Stop viewing"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
