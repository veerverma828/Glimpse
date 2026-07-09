import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MonitorPlay, ArrowLeft, Volume2, VolumeX, Maximize, Minimize, ScreenShare, Square } from 'lucide-react'
import useWebRTC from '../hooks/useWebRTC'
import useFullscreen from '../hooks/useFullscreen'
import { roomIdToPeerId } from '../lib/roomId'
import Card from '../components/Card'
import StatusBadge from '../components/StatusBadge'
import ErrorAlert from '../components/ErrorAlert'
import SignalPulse from '../components/SignalPulse'

export default function ViewerPage() {
  const { roomId } = useParams()
  const { peer, status: peerStatus, error: peerError } = useWebRTC()

  const [hostConnStatus, setHostConnStatus] = useState('connecting') // connecting | connected | not-found
  const [hasStream, setHasStream] = useState(false)
  const [streamEnded, setStreamEnded] = useState(false)
  const [muted, setMuted] = useState(true)
  const [isSharingBack, setIsSharingBack] = useState(false)
  const [shareBackError, setShareBackError] = useState(null)
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const backStreamRef = useRef(null)
  const backCallRef = useRef(null)
  const { isFullscreen, toggleFullscreen, supported: fullscreenSupported } = useFullscreen(
    containerRef,
    videoRef
  )

  useEffect(() => {
    if (!peer || peerStatus !== 'ready') return undefined

    const hostId = roomIdToPeerId(roomId)
    const conn = peer.connect(hostId, { reliable: true })

    conn.on('open', () => setHostConnStatus('connected'))
    conn.on('error', () => setHostConnStatus('not-found'))
    conn.on('close', () => setStreamEnded(true))

    // The host may be running the native Android app (see
    // client/src/lib/nativeScreenCapture.js) rather than a browser, in
    // which case its screen-share offer arrives as a plain SDP payload
    // over this data connection instead of through peer.call(). We answer
    // it with an ordinary RTCPeerConnection; from the host's native side
    // this looks like a normal WebRTC peer, no PeerJS server involvement
    // needed for this leg since PeerJS was only used to find each other
    // and open this data channel.
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
            remoteStreamRef.current = remoteStream
            setHasStream(true)
            setStreamEnded(false)
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
            if (nativePeerConnection.connectionState === 'disconnected' ||
                nativePeerConnection.connectionState === 'failed' ||
                nativePeerConnection.connectionState === 'closed') {
              setHasStream(false)
              setStreamEnded(true)
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

    const onCall = (call) => {
      call.answer()
      call.on('stream', (remoteStream) => {
        remoteStreamRef.current = remoteStream
        setHasStream(true)
        setStreamEnded(false)

        // minimize the receive-side jitter buffer (Chrome-only hint) so
        // frames get displayed as soon as they arrive instead of being
        // smoothed over a few hundred ms — trades a little robustness on
        // shaky networks for noticeably lower end-to-end lag
        call.peerConnection?.getReceivers?.().forEach((receiver) => {
          if (receiver.track?.kind === 'video' && 'playoutDelayHint' in receiver) {
            receiver.playoutDelayHint = 0
          }
        })
      })
      call.on('close', () => {
        setHasStream(false)
        setStreamEnded(true)
      })
    }

    peer.on('call', onCall)

    const failTimer = setTimeout(() => {
      setHostConnStatus((s) => (s === 'connecting' ? 'not-found' : s))
    }, 8000)

    return () => {
      clearTimeout(failTimer)
      peer.off('call', onCall)
      conn.off('data', onNativeSignal)
      nativePeerConnection?.close()
      conn.close()
    }
  }, [peer, peerStatus, roomId])

  // attach the remote stream once the <video> element exists (it only mounts
  // after hasStream flips true, one render after the stream arrives)
  useEffect(() => {
    if (hasStream && videoRef.current && remoteStreamRef.current) {
      const video = videoRef.current
      video.srcObject = remoteStreamRef.current
      // muted autoplay is allowed everywhere; unmuted autoplay is blocked on
      // mobile browsers without a user gesture, so retry play() defensively
      video.play().catch(() => {})
    }
  }, [hasStream])

  // lock to landscape while fullscreen (mobile only; silently no-ops elsewhere)
  useEffect(() => {
    if (isFullscreen) {
      screen.orientation?.lock?.('landscape').catch(() => {})
    } else {
      screen.orientation?.unlock?.()
    }
  }, [isFullscreen])

  // keep the screen awake while actively watching
  useEffect(() => {
    if (!hasStream || streamEnded || !navigator.wakeLock) return undefined
    let sentinel
    navigator.wakeLock.request('screen').then((s) => { sentinel = s }).catch(() => {})
    return () => { sentinel?.release().catch(() => {}) }
  }, [hasStream, streamEnded])

  // exit fullscreen if the host stops sharing / connection drops
  useEffect(() => {
    if (streamEnded && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }, [streamEnded])

  const stopSharingBack = () => {
    backStreamRef.current?.getTracks().forEach((t) => t.stop())
    backStreamRef.current = null
    backCallRef.current?.close()
    backCallRef.current = null
    setIsSharingBack(false)
  }

  // getDisplayMedia is missing on many mobile browsers, but detection is
  // unreliable (some expose the function yet throw at call time). So don't
  // block the click on feature-detection — always let the user try, and
  // surface a clear message only if the actual call fails.
  const startSharingBack = async () => {
    if (!peer || peerStatus !== 'ready') return
    setShareBackError(null)
    if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
      // distinguish the two real causes: insecure origin (mediaDevices
      // stripped) vs. a browser that genuinely lacks the API
      if (!window.isSecureContext) {
        setShareBackError(
          'This page is not a fully-trusted secure origin, so the browser hides screen capture. Open it over HTTPS with a certificate your phone trusts (a self-signed / bypassed cert is not enough).'
        )
      } else if (!navigator.mediaDevices) {
        setShareBackError(
          'Your browser exposes no media APIs on this page. Make sure the URL is HTTPS and the certificate is fully trusted (green padlock, no warning).'
        )
      } else {
        setShareBackError(
          "This browser doesn't implement screen capture. On Android, use the latest Chrome; iOS Safari can't screen-share at all."
        )
      }
      return
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 24, max: 30 } },
        audio: false,
      })
      backStreamRef.current = stream
      setIsSharingBack(true)
      stream.getVideoTracks()[0].addEventListener('ended', stopSharingBack)

      const hostId = roomIdToPeerId(roomId)
      const outgoingCall = peer.call(hostId, stream)
      backCallRef.current = outgoingCall
      outgoingCall.on('close', stopSharingBack)
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setShareBackError('Screen-share permission was denied.')
      } else if (err.name === 'NotFoundError' || err.name === 'NotSupportedError') {
        setShareBackError("This browser can't share a screen. Try Chrome, Edge, or Firefox on desktop.")
      } else {
        setShareBackError(`Could not start sharing your screen: ${err.name || 'Error'} — ${err.message || 'no details'}`)
      }
    }
  }

  // stop sharing our screen back if we navigate away or the host connection drops
  useEffect(() => stopSharingBack, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (streamEnded) stopSharingBack()
  }, [streamEnded])

  const status = peerError
    ? 'error'
    : hasStream
      ? 'connected'
      : hostConnStatus === 'connected'
        ? 'waiting'
        : hostConnStatus === 'not-found'
          ? 'error'
          : 'connecting'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-12 sm:px-8 sm:pb-16">
      <section className="mx-auto max-w-xl pt-6 pb-6 text-center sm:pt-14 sm:pb-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan">
          Room <span className="text-text">{roomId}</span>
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-text sm:mt-4 sm:text-3xl md:text-4xl">
          {hasStream ? 'Now watching' : 'Waiting for the broadcast'}
        </h1>
      </section>

      <Card className="flex flex-1 flex-col items-center justify-center gap-5 p-5 sm:gap-6 sm:p-8 lg:p-10" glow={hasStream}>
        {hasStream && !streamEnded ? (
          <div
            ref={containerRef}
            onDoubleClick={toggleFullscreen}
            className="relative w-full overflow-hidden rounded-xl border border-border-strong bg-void"
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={muted}
              className="aspect-video w-full object-contain"
            />
            <button
              onClick={() => {
                setMuted((m) => !m)
                videoRef.current?.play().catch(() => {})
              }}
              className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-void/70 text-text backdrop-blur transition-colors hover:border-border-strong active:scale-95"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            {fullscreenSupported && (
              <button
                onClick={toggleFullscreen}
                className="absolute bottom-3 right-16 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-void/70 text-text backdrop-blur transition-colors hover:border-border-strong active:scale-95"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
            )}
          </div>
        ) : (
          <>
            <SignalPulse active={status !== 'error'} tone="cyan" />
            <StatusBadge status={status} />

            {status === 'error' && (
              <ErrorAlert
                title="Can't reach that room"
                message={
                  peerError ||
                  (streamEnded
                    ? 'The host stopped sharing or left.'
                    : "This room doesn't exist, or the host hasn't opened it yet.")
                }
                className="w-full max-w-sm"
              />
            )}

            {status === 'waiting' && (
              <p className="max-w-xs text-center text-sm text-muted">
                You're connected. The screen will appear the moment the host starts sharing.
              </p>
            )}

            {status === 'error' && (
              <Link
                to="/"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-5 text-sm text-text transition-colors hover:border-border-strong hover:bg-surface-3"
              >
                <ArrowLeft className="h-4 w-4" />
                Start your own room
              </Link>
            )}
          </>
        )}
      </Card>

      {hasStream && !streamEnded && (
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-faint">
          <MonitorPlay className="h-3.5 w-3.5" />
          Streaming directly from the host's device
        </p>
      )}

      {hostConnStatus === 'connected' && !streamEnded && (
        <div className="mt-5 flex flex-col items-center gap-2">
          <ErrorAlert message={shareBackError} className="w-full max-w-sm" />
          {isSharingBack ? (
            <button
              onClick={stopSharingBack}
              className="inline-flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 text-sm font-medium text-danger transition-colors hover:border-danger/50"
            >
              <Square className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              Stop sharing your screen
            </button>
          ) : (
            <button
              onClick={startSharingBack}
              className="inline-flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-3"
            >
              <ScreenShare className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              Share your screen with the host
            </button>
          )}
        </div>
      )}
    </div>
  )
}
