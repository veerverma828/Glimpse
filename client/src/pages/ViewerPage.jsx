import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { MonitorPlay, ArrowLeft, ScreenShare, Square, Gamepad2 } from 'lucide-react'
import useWebRTC from '../hooks/useWebRTC'
import { roomIdToPeerId } from '../lib/roomId'
import { isNativeApp, startNativeScreenShare, stopNativeScreenShare } from '../lib/nativeScreenCapture'
import { controlSupported, isControlServiceEnabled, openControlSettings, applyControl } from '../lib/remoteControl'
import { presetForValue, applyBitrateCap } from '../lib/qualityPreset'
import Card from '../components/Card'
import StatusBadge from '../components/StatusBadge'
import ErrorAlert from '../components/ErrorAlert'
import SignalPulse from '../components/SignalPulse'
import StreamViewer from '../components/StreamViewer'

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY_MS = 2000

export default function ViewerPage() {
  const { roomId } = useParams()
  const { peer, status: peerStatus, error: peerError } = useWebRTC()

  const [hostConnStatus, setHostConnStatus] = useState('connecting') // connecting | connected | not-found
  const [hasStream, setHasStream] = useState(false)
  const [streamEnded, setStreamEnded] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [remoteStream, setRemoteStream] = useState(null)
  const [isSharingBack, setIsSharingBack] = useState(false)
  const [shareBackError, setShareBackError] = useState(null)
  const [hostControlAvailable, setHostControlAvailable] = useState(false) // host lets us control it
  const [allowControl, setAllowControl] = useState(false) // we let the host control us
  const allowControlRef = useRef(false)
  allowControlRef.current = allowControl
  const backStreamRef = useRef(null)
  const backCallRef = useRef(null)
  const hostConnRef = useRef(null)
  const nativeShareBackRef = useRef(null)
  const pcRef = useRef(null) // active RTCPeerConnection receiving the stream (for stats)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef(null)
  const [reconnectTick, setReconnectTick] = useState(0)

  // Schedule a reconnect after the host connection drops, unless we've hit
  // the attempt cap -- then give up and show the ended state. Manual stops
  // (leaving the page) clear the timer in the effect cleanup below.
  const scheduleReconnect = () => {
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setReconnecting(false)
      setStreamEnded(true)
      return
    }
    reconnectAttemptRef.current += 1
    setReconnecting(true)
    reconnectTimerRef.current = setTimeout(() => {
      setReconnectTick((t) => t + 1)
    }, RECONNECT_DELAY_MS)
  }

  useEffect(() => {
    if (!peer || peerStatus !== 'ready') return undefined

    const hostId = roomIdToPeerId(roomId)
    const conn = peer.connect(hostId, { reliable: true })
    hostConnRef.current = conn

    conn.on('open', () => {
      setHostConnStatus('connected')
      setReconnecting(false)
      reconnectAttemptRef.current = 0
      // tell the host whether it may control us
      advertiseControl(conn)
    })
    conn.on('error', () => setHostConnStatus('not-found'))
    conn.on('close', () => {
      setHasStream(false)
      scheduleReconnect()
    })

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
          pcRef.current = nativePeerConnection
          nativePeerConnection.ontrack = (event) => {
            const [incoming] = event.streams
            setRemoteStream(incoming)
            setHasStream(true)
            setStreamEnded(false)
            setReconnecting(false)
            reconnectAttemptRef.current = 0
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
            if (nativePeerConnection.connectionState === 'failed' ||
                nativePeerConnection.connectionState === 'closed') {
              setHasStream(false)
              scheduleReconnect()
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
      } else if (msg.type === 'control-available') {
        setHostControlAvailable(Boolean(msg.enabled))
      } else if (msg.type === 'control') {
        // host is controlling us (only honored if we opted in)
        if (allowControlRef.current) applyControl(msg)
      } else if (msg.type === 'quality-request') {
        // host asked us to adjust our shared-back quality; no-op if we're
        // not currently sharing back or the native path (no adjustable
        // constraints/peerConnection hook there, mirrors HostPage's
        // native-share behavior)
        const value = Math.max(0, Math.min(100, Number(msg.value) || 0))
        const preset = presetForValue(value)
        const track = backStreamRef.current?.getVideoTracks()[0]
        if (track) {
          track.applyConstraints({ frameRate: preset.frameRate, width: preset.width, height: preset.height }).catch(() => {})
          track.contentHint = preset.contentHint
        }
        if (backCallRef.current?.peerConnection) {
          applyBitrateCap(backCallRef.current.peerConnection, preset.maxBitrate)
        }
        if (track || backCallRef.current) toast('Host requested a quality change')
      }
    }
    conn.on('data', onNativeSignal)

    const onCall = (call) => {
      call.answer()
      call.on('stream', (incoming) => {
        pcRef.current = call.peerConnection
        setRemoteStream(incoming)
        setHasStream(true)
        setStreamEnded(false)
        setReconnecting(false)
        reconnectAttemptRef.current = 0

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
        scheduleReconnect()
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
  }, [peer, peerStatus, roomId, reconnectTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // clear any pending reconnect timer on unmount
  useEffect(() => () => clearTimeout(reconnectTimerRef.current), [])

  // ask the host to change quality (host applies it to its outgoing stream);
  // no-op if the host can't honor it (e.g. native-app host)
  const requestQuality = (value) => {
    hostConnRef.current?.open && hostConnRef.current.send({ type: 'quality-request', value })
  }

  // send a control gesture to the host (we're controlling the host device)
  const sendControl = (msg) => {
    hostConnRef.current?.open && hostConnRef.current.send({ type: 'control', ...msg })
  }

  // tell the host whether it may remote-control this device
  const advertiseControl = async (conn) => {
    const c = conn || hostConnRef.current
    if (!c?.open) return
    const enabled = controlSupported && allowControlRef.current && (await isControlServiceEnabled())
    c.send({ type: 'control-available', enabled })
  }

  const toggleAllowControl = async () => {
    if (!controlSupported) return
    if (!allowControl) {
      const enabled = await isControlServiceEnabled()
      if (!enabled) {
        toast('Enable “Glimpse” under Accessibility, then flip this on again')
        await openControlSettings()
        return
      }
      setAllowControl(true)
    } else {
      setAllowControl(false)
    }
  }

  // re-advertise whenever our opt-in changes, and when we return to the app
  // (the user may have just enabled the accessibility service)
  useEffect(() => { advertiseControl() }, [allowControl]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onFocus = () => { if (allowControlRef.current) advertiseControl() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // keep the screen awake while actively watching
  useEffect(() => {
    if (!hasStream || streamEnded || !navigator.wakeLock) return undefined
    let sentinel
    navigator.wakeLock.request('screen').then((s) => { sentinel = s }).catch(() => {})
    return () => { sentinel?.release().catch(() => {}) }
  }, [hasStream, streamEnded])

  const stopSharingBack = () => {
    backStreamRef.current?.getTracks().forEach((t) => t.stop())
    backStreamRef.current = null
    backCallRef.current?.close()
    backCallRef.current = null
    if (nativeShareBackRef.current) {
      nativeShareBackRef.current.stop().catch(() => {})
      nativeShareBackRef.current = null
    } else if (isNativeApp) {
      stopNativeScreenShare().catch(() => {})
    }
    setIsSharingBack(false)
  }

  // Native path: same reason as HostPage — Chrome for Android has no
  // getDisplayMedia() at all, so inside the packaged app this must go
  // through native MediaProjection capture instead, relayed over the
  // existing PeerJS DataConnection to the host (see lib/nativeScreenCapture.js
  // and the matching onNativeSignal handler in HostPage).
  const startSharingBackNative = async () => {
    const conn = hostConnRef.current
    if (!conn?.open) {
      setShareBackError('Not connected to the host yet.')
      return
    }
    try {
      const handle = await startNativeScreenShare(conn, {
        onError: (message) => {
          setShareBackError(message)
          setIsSharingBack(false)
          nativeShareBackRef.current = null
        },
        onStopped: () => {
          setIsSharingBack(false)
          nativeShareBackRef.current = null
        },
      })
      nativeShareBackRef.current = handle
      setIsSharingBack(true)
    } catch (err) {
      setShareBackError(err.message || 'Failed to start native screen sharing')
    }
  }

  // getDisplayMedia is missing on many mobile browsers, but detection is
  // unreliable (some expose the function yet throw at call time). So don't
  // block the click on feature-detection — always let the user try, and
  // surface a clear message only if the actual call fails.
  const startSharingBack = async () => {
    if (!peer || peerStatus !== 'ready') return
    setShareBackError(null)

    if (isNativeApp) {
      await startSharingBackNative()
      return
    }

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
      const preset = presetForValue(100) // start at max quality, adjustable after via the host's quality-request
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: preset.frameRate, width: preset.width, height: preset.height },
        audio: false,
      })
      stream.getVideoTracks()[0].contentHint = preset.contentHint
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
      : reconnecting
        ? 'connecting'
        : streamEnded
          ? 'error'
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
        {hasStream && !streamEnded && remoteStream ? (
          <StreamViewer
            stream={remoteStream}
            pcRef={pcRef}
            onRequestQuality={requestQuality}
            controlAvailable={hostControlAvailable}
            onControl={sendControl}
          />
        ) : (
          <>
            <SignalPulse active={status !== 'error'} tone="cyan" />
            <StatusBadge status={status} />

            {reconnecting && (
              <p className="max-w-xs text-center text-sm text-muted">
                Connection dropped — trying to reconnect…
              </p>
            )}

            {status === 'error' && !reconnecting && (
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

            {status === 'waiting' && !reconnecting && (
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

          {controlSupported && isSharingBack && (
            <button
              onClick={toggleAllowControl}
              className={`inline-flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
                allowControl
                  ? 'border-cyan/40 bg-cyan/10 text-cyan'
                  : 'border-border bg-surface-2 text-text hover:border-border-strong hover:bg-surface-3'
              }`}
            >
              <Gamepad2 className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              {allowControl ? 'Remote control allowed' : 'Allow host to control this screen'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
