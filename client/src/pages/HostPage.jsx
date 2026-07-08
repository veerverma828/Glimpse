import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, MonitorStop, Copy, Users, Link as LinkIcon, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { createPeerConnection, restartIce, closePeerConnection } from '../hooks/useWebRTC';
import Logo from '../components/Logo';
import Button from '../components/Button';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import ErrorAlert from '../components/ErrorAlert';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

// Generate a random 6-character room ID
function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Derive the public-facing host for the QR code / join link.
const PUBLIC_HOST = (() => {
  if (window.location.origin.includes('github.io')) {
    return window.location.origin + '/Glimpse';
  }
  return window.location.origin;
})();

export default function HostPage() {
  const [roomId, setRoomId] = useState(null);
  const [roomLoading, setRoomLoading] = useState(true);
  const [status, setStatus] = useState('idle'); // idle | sharing | error
  const [viewers, setViewers] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const videoRef = useRef(null);
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef(new Map()); // viewerId -> { pc, dataConn }
  const viewerIdCounter = useRef(0);

  // Create room on mount — just generate a local ID, no server needed
  useEffect(() => {
    const id = generateRoomId();
    console.log('[HostPage] Generated room ID:', id);
    setRoomId(id);
    setRoomLoading(false);
  }, []);

  // Helper to create a peer connection for a viewer
  const createPeerForViewer = useCallback(async (viewerId, dataConn) => {
    console.log('[Host] Creating peer connection for viewer:', viewerId);

    const pc = createPeerConnection({
      onIceCandidate: (candidate) => {
        // Send ICE candidate to viewer via PeerJS data channel
        if (dataConn && dataConn.open) {
          dataConn.send(JSON.stringify({ type: 'candidate', candidate }));
        }
      },
      onTrack: null, // host doesn't receive tracks
      onIceStateChange: (state) => {
        console.log(`[Host] ICE state for ${viewerId}:`, state);
      },
      onIceFailure: () => {
        console.warn(`[Host] ICE failed for viewer ${viewerId}, attempting restart`);
        restartIce(pc).then((offer) => {
          if (dataConn && dataConn.open) {
            dataConn.send(JSON.stringify({ type: 'offer', sdp: offer }));
          }
        }).catch((e) => {
          console.error('[Host] ICE restart failed, closing peer:', e);
          closePeerConnection(pc);
          peersRef.current.delete(viewerId);
          setViewers((prev) => prev.filter((id) => id !== viewerId));
        });
      },
      onNegotiationNeeded: async (p) => {
        console.log('[Host] Negotiation needed for viewer:', viewerId);
        const offer = await p.createOffer();
        await p.setLocalDescription(offer);
        if (dataConn && dataConn.open) {
          dataConn.send(JSON.stringify({ type: 'offer', sdp: offer }));
        }
      },
    });

    // Set up transceivers early to prevent black screen
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => pc.addTrack(t, streamRef.current));
    } else {
      pc.addTransceiver('video', { direction: 'sendonly' });
      pc.addTransceiver('audio', { direction: 'sendonly' });
    }

    peersRef.current.set(viewerId, { pc, dataConn });

    // Create initial offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (dataConn && dataConn.open) {
        dataConn.send(JSON.stringify({ type: 'offer', sdp: offer }));
      }
    } catch (e) {
      console.error('[Host] Error creating initial offer for viewer:', viewerId, e);
    }
  }, []);

  // PeerJS setup
  useEffect(() => {
    if (!roomId) return;

    console.log('[HostPage] Creating Peer with ID:', roomId);
    const peer = new Peer(roomId, {
      // Uses default cloud broker at 0.peerjs.com
    });

    peer.on('open', (id) => {
      console.log('[HostPage] Peer opened with ID:', id);
    });

    peer.on('connection', (dataConn) => {
      const viewerId = `viewer-${++viewerIdCounter.current}`;
      console.log('[HostPage] Viewer connected via PeerJS:', viewerId);

      // Handle incoming messages from viewer
      dataConn.on('data', (data) => {
        try {
          const msg = typeof data === 'string' ? JSON.parse(data) : data;
          console.log('[Host] Received from viewer:', msg.type);

          const entry = peersRef.current.get(viewerId);
          if (!entry) return;

          const { pc } = entry;

          if (msg.type === 'answer' && msg.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).catch((e) => {
              console.error('[Host] Error setting remote description:', e);
            });
          } else if (msg.type === 'candidate' && msg.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch((e) => {
              console.warn('[Host] Error adding ICE candidate:', e);
            });
          }
        } catch (e) {
          console.error('[Host] Error processing viewer message:', e);
        }
      });

      dataConn.on('open', () => {
        console.log('[Host] Data channel open for viewer:', viewerId);
        setViewers((prev) => [...prev, viewerId]);
        createPeerForViewer(viewerId, dataConn);
      });

      dataConn.on('close', () => {
        console.log('[Host] Viewer disconnected:', viewerId);
        const entry = peersRef.current.get(viewerId);
        if (entry) {
          closePeerConnection(entry.pc);
          peersRef.current.delete(viewerId);
        }
        setViewers((prev) => prev.filter((id) => id !== viewerId));
      });
    });

    peer.on('error', (err) => {
      console.error('[HostPage] Peer error:', err);
      // If ID is taken, regenerate
      if (err.type === 'unavailable-id') {
        const newId = generateRoomId();
        console.log('[HostPage] ID taken, regenerating:', newId);
        setRoomId(newId);
      } else {
        setErrorMessage('Peer connection error: ' + err.message);
      }
    });

    peerRef.current = peer;

    return () => {
      peer.destroy();
      peersRef.current.forEach((entry) => closePeerConnection(entry.pc));
      peersRef.current.clear();
    };
  }, [roomId, createPeerForViewer]);

  // When status changes to 'sharing', attach the stream to the video element
  useEffect(() => {
    if (status === 'sharing' && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [status]);

  const startSharing = async () => {
    setErrorMessage('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = stream;
      setStatus('sharing');
      stream.getVideoTracks()[0].onended = () => stopSharing();

      // Add tracks to all existing peer connections
      peersRef.current.forEach(({ pc }, viewerId) => {
        console.log('[Host] Adding tracks to existing peer for viewer:', viewerId);
        const senders = pc.getSenders();
        stream.getTracks().forEach((track) => {
          const existing = senders.find((s) => s.track?.kind === track.kind);
          if (existing) {
            existing.replaceTrack(track).catch((e) => {
              console.warn('[Host] replaceTrack failed, using addTrack:', e);
              pc.addTrack(track, stream);
            });
          } else {
            pc.addTrack(track, stream);
          }
        });
      });
    } catch (e) {
      console.error('Screen share error:', e);
      setStatus('error');
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setErrorMessage('Screen sharing was denied. Please allow screen sharing and try again.');
      } else if (e.name === 'NotFoundError') {
        setErrorMessage('No screen capture source found.');
      } else {
        setErrorMessage('An unexpected error occurred while starting screen sharing.');
      }
    }
  };

  const stopSharing = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
  };

  const copyToClipboard = () => {
    if (joinUrl) {
      navigator.clipboard.writeText(joinUrl);
      toast.success('Link copied to clipboard!', { duration: 2000 });
    }
  };

  const joinUrl = roomId ? `${PUBLIC_HOST}/join/${roomId}` : '';

  // Room creation loading state
  if (roomLoading) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center gap-6 p-6">
        <Logo size="lg" />
        <LoadingSpinner text="Creating your room..." />
      </div>
    );
  }

  // Room creation error state
  if (!roomId && errorMessage) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center gap-6 p-6">
        <Logo size="lg" />
        <Card className="max-w-md w-full text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-error/10 flex items-center justify-center">
              <AlertTriangle size={28} className="text-error" />
            </div>
            <h2 className="text-xl font-bold text-surface-100">Connection Error</h2>
            <p className="text-sm text-surface-400">{errorMessage}</p>
            <Button
              variant="primary"
              size="md"
              icon={RefreshCw}
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-surface-800/50">
        <Logo size="sm" />
        <StatusBadge status={status === 'sharing' ? 'sharing' : status === 'error' ? 'error' : 'idle'} />
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-6 max-w-7xl mx-auto w-full">
        {/* Left column - Video + Controls */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Video preview */}
          <Card className="relative overflow-hidden p-0 flex-1 min-h-[300px] flex items-center justify-center bg-surface-900">
            {status === 'sharing' ? (
              <motion.video
                ref={videoRef}
                autoPlay
                muted
                className="w-full h-full object-contain rounded-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              />
            ) : (
              <EmptyState
                icon={Monitor}
                title="Ready to share"
                description="Click the button below to start sharing your screen"
              />
            )}
          </Card>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <AnimatePresence mode="wait">
              {status !== 'sharing' ? (
                <motion.div
                  key="start"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <Button
                    variant="primary"
                    size="lg"
                    icon={Monitor}
                    onClick={startSharing}
                    disabled={status === 'error'}
                  >
                    Start Sharing
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="stop"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <Button
                    variant="danger"
                    size="lg"
                    icon={MonitorStop}
                    onClick={stopSharing}
                  >
                    Stop Sharing
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {viewers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-800 text-surface-300 text-sm"
              >
                <Users size={14} />
                <span className="font-medium">{viewers.length}</span>
              </motion.div>
            )}
          </div>

          {/* Error alert */}
          <AnimatePresence>
            {status === 'error' && errorMessage && (
              <ErrorAlert
                message={errorMessage}
                onRetry={startSharing}
                onDismiss={() => { setStatus('idle'); setErrorMessage(''); }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Right column - Share card */}
        {roomId && (
          <Card className="w-full lg:w-80 shrink-0 self-start" glow>
            <div className="flex flex-col items-center gap-4">
              <h2 className="text-lg font-semibold text-surface-100">Share this stream</h2>

              <div className="bg-white rounded-xl p-3 shadow-lg">
                <QRCodeSVG value={joinUrl} size={180} bgColor="#ffffff" fgColor="#11131e" level="H" />
              </div>

              <p className="text-xs text-surface-400 text-center">
                Scan with your phone to watch
              </p>

              <div className="w-full space-y-2">
                <p className="text-xs text-surface-500 font-medium uppercase tracking-wider">Or copy the link</p>
                <button
                  onClick={copyToClipboard}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-800 hover:bg-surface-700 border border-surface-700/50 transition-colors group cursor-pointer text-left"
                >
                  <LinkIcon size={14} className="text-surface-400 shrink-0" />
                  <span className="flex-1 text-xs text-surface-300 truncate">{joinUrl}</span>
                  <Copy size={14} className="text-surface-500 group-hover:text-glimpse-400 transition-colors shrink-0" />
                </button>
              </div>

              <div className="w-full pt-2 border-t border-surface-800">
                <div className="flex items-center justify-between text-xs text-surface-400">
                  <span>Room: <span className="font-mono text-glimpse-400">{roomId}</span></span>
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {viewers.length} viewer{viewers.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
