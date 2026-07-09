import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MonitorPlay, ArrowLeft, Volume2, VolumeX } from 'lucide-react'
import useWebRTC from '../hooks/useWebRTC'
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
  const videoRef = useRef(null)
  const remoteStreamRef = useRef(null)

  useEffect(() => {
    if (!peer || peerStatus !== 'ready') return undefined

    const hostId = roomIdToPeerId(roomId)
    const conn = peer.connect(hostId, { reliable: true })

    conn.on('open', () => setHostConnStatus('connected'))
    conn.on('error', () => setHostConnStatus('not-found'))
    conn.on('close', () => setStreamEnded(true))

    const onCall = (call) => {
      call.answer()
      call.on('stream', (remoteStream) => {
        remoteStreamRef.current = remoteStream
        setHasStream(true)
        setStreamEnded(false)
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
          <div className="relative w-full overflow-hidden rounded-xl border border-border-strong bg-void">
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
    </div>
  )
}
