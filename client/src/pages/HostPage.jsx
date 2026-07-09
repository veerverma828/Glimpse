import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, ScreenShare, Square, MonitorX } from 'lucide-react'
import toast from 'react-hot-toast'
import useWebRTC from '../hooks/useWebRTC'
import { generateRoomId, roomIdToPeerId } from '../lib/roomId'
import Card from '../components/Card'
import Button from '../components/Button'
import StatusBadge from '../components/StatusBadge'
import ErrorAlert from '../components/ErrorAlert'
import SignalPulse from '../components/SignalPulse'
import EmptyState from '../components/EmptyState'

function buildJoinUrl(roomId) {
  const base = window.location.origin + import.meta.env.BASE_URL
  return `${base}join/${roomId}`.replace(/([^:])\/\//g, '$1/')
}

const isLocalHostname = ['localhost', '127.0.0.1', '0.0.0.0', ''].includes(
  window.location.hostname
)

export default function HostPage() {
  const [roomId, setRoomId] = useState(() => generateRoomId())
  const { peer, status: peerStatus, error: peerError } = useWebRTC(roomIdToPeerId(roomId))

  const [viewerConn, setViewerConn] = useState(null)
  const [call, setCall] = useState(null)
  const [isSharing, setIsSharing] = useState(false)
  const [shareError, setShareError] = useState(null)
  const [copied, setCopied] = useState(false)
  const localStreamRef = useRef(null)
  const videoRef = useRef(null)

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
          setCall(outgoingCall)
        }
      })
    }

    peer.on('connection', onConnection)
    return () => peer.off('connection', onConnection)
  }, [peer])

  const stopSharing = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    call?.close()
    setCall(null)
    setIsSharing(false)
  }, [call])

  const startSharing = useCallback(async () => {
    setShareError(null)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      localStreamRef.current = stream
      setIsSharing(true)

      stream.getVideoTracks()[0].addEventListener('ended', stopSharing)

      if (peer && viewerConn?.open) {
        const outgoingCall = peer.call(viewerConn.peer, stream)
        setCall(outgoingCall)
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setShareError('Screen-share permission was denied. Allow it to start broadcasting.')
      } else if (err.name === 'NotFoundError' || err.name === 'NotSupportedError') {
        setShareError("This browser can't share a screen. Try Chrome, Edge, or Firefox on desktop.")
      } else {
        setShareError('Could not start screen sharing. Please try again.')
      }
    }
  }, [peer, viewerConn, stopSharing])

  useEffect(() => stopSharing, []) // eslint-disable-line react-hooks/exhaustive-deps

  // attach the captured stream once the <video> element exists (it only
  // mounts after isSharing flips true, one render after the stream is ready)
  useEffect(() => {
    if (isSharing && videoRef.current && localStreamRef.current) {
      videoRef.current.srcObject = localStreamRef.current
    }
  }, [isSharing])

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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-16 sm:px-8">
      <section className="mx-auto max-w-2xl pt-8 pb-10 text-center sm:pt-14 sm:pb-14">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan">Peer to peer &middot; zero setup</p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-text sm:text-5xl">
          Beam your screen<br className="hidden sm:block" /> to any device
        </h1>
        <p className="mt-4 text-sm text-muted sm:text-base">
          Start broadcasting, share the code, and watch it appear on the other screen in seconds.
          Nothing passes through a server.
        </p>
      </section>

      <div className="grid flex-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="flex flex-col items-center justify-center gap-6 p-8 sm:p-10" glow={isSharing}>
          {!isSharing ? (
            <>
              <SignalPulse active={peerStatus === 'ready'} tone={viewerConn?.open ? 'cyan' : 'violet'} />
              <div className="text-center">
                <StatusBadge status={status} />
              </div>
              <ErrorAlert message={peerError} className="w-full max-w-sm" />
              <ErrorAlert message={shareError} title="Couldn't start sharing" className="w-full max-w-sm" />
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
            <div className="flex w-full flex-col items-center gap-5">
              <div className="relative w-full overflow-hidden rounded-xl border border-border-strong bg-void">
                <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-contain" />
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-void/70 px-2.5 py-1 text-[11px] font-medium text-danger backdrop-blur">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> LIVE
                </span>
              </div>
              <StatusBadge status={status} />
              <Button variant="danger" size="lg" onClick={stopSharing} className="w-full max-w-xs">
                <Square className="h-4 w-4" strokeWidth={2.25} />
                Stop sharing
              </Button>
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-6 p-8 sm:p-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Room code</p>
            <p className="mt-1.5 font-mono text-3xl font-medium tracking-[0.15em] text-text">{roomId}</p>
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
                <span className="truncate font-mono text-xs text-muted">{joinUrl}</span>
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
    </div>
  )
}
