import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Peer from 'peerjs';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Monitor, RefreshCw } from 'lucide-react';
import { createPeerConnection, closePeerConnection } from '../hooks/useWebRTC';
import Logo from '../components/Logo';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';

export default function ViewerPage() {
  const { roomId } = useParams();
  console.log('[ViewerPage] roomId from URL params:', roomId);
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const peerRef = useRef(null);
  const dataConnRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting | connected | disconnected | error
  const [hasStream, setHasStream] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // Helper to flush any queued ICE candidates
  const flushPendingCandidates = useCallback(async (pc) => {
    const pending = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[Viewer] Failed to add queued ICE candidate:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (!roomId) return;

    console.log('[ViewerPage] Creating Peer and connecting to room:', roomId);
    const peer = new Peer();

    peer.on('open', (myId) => {
      console.log('[ViewerPage] Peer opened with ID:', myId);
      console.log('[ViewerPage] Connecting to host peer:', roomId);

      // Connect to the host's Peer ID (which is the roomId)
      const dataConn = peer.connect(roomId, {
        reliable: true,
      });

      dataConnRef.current = dataConn;

      dataConn.on('open', () => {
        console.log('[ViewerPage] Data channel opened to host');
      });

      dataConn.on('data', (data) => {
        try {
          const msg = typeof data === 'string' ? JSON.parse(data) : data;
          console.log('[Viewer] Received from host:', msg.type);

          const pc = pcRef.current;
          if (!pc) return;

          if (msg.type === 'offer' && msg.sdp) {
            console.log('[Viewer] Received offer');
            pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
              .then(async () => {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                if (dataConn.open) {
                  dataConn.send(JSON.stringify({ type: 'answer', sdp: answer }));
                }
                await flushPendingCandidates(pc);
              })
              .catch((e) => {
                console.error('[Viewer] Error handling offer:', e);
              });
          } else if (msg.type === 'candidate' && msg.candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch((e) => {
                console.warn('[Viewer] Error adding ICE candidate:', e);
              });
            } else {
              console.log('[Viewer] Queuing ICE candidate until remote description is set');
              pendingCandidatesRef.current.push(msg.candidate);
            }
          }
        } catch (e) {
          console.error('[Viewer] Error processing message:', e);
        }
      });

      dataConn.on('close', () => {
        console.log('[Viewer] Data channel closed');
        if (videoRef.current) videoRef.current.srcObject = null;
        setHasStream(false);
        setConnectionStatus('disconnected');
      });
    });

    peer.on('error', (err) => {
      console.error('[ViewerPage] Peer error:', err);
      setConnectionStatus('error');
      if (err.type === 'peer-unavailable') {
        setErrorMessage('Room not found. The host may not be active yet. Try again later.');
      } else {
        setErrorMessage('Connection error: ' + err.message);
      }
    });

    // Create the RTCPeerConnection for receiving media
    const pc = createPeerConnection({
      onIceCandidate: (candidate) => {
        const dc = dataConnRef.current;
        if (dc && dc.open) {
          dc.send(JSON.stringify({ type: 'candidate', candidate }));
        } else {
          console.warn('[Viewer] No data channel open, dropping ICE candidate');
        }
      },
      onTrack: (event) => {
        console.log('[Viewer] Received track, stream id:', event.streams[0]?.id);
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
        }
        setHasStream(true);
        setConnectionStatus('connected');
      },
      onIceStateChange: (state) => {
        console.log('[Viewer] ICE connection state:', state);
        if (state === 'connected' || state === 'completed') {
          setConnectionStatus('connected');
        } else if (state === 'failed') {
          console.error('[Viewer] ICE connection failed');
          setConnectionStatus('error');
          setErrorMessage('ICE connection failed. The host may be unreachable.');
        } else if (state === 'disconnected') {
          console.warn('[Viewer] ICE connection disconnected (may recover)');
        }
      },
      onIceFailure: () => {
        console.error('[Viewer] ICE failed/timed out');
        setConnectionStatus('error');
        setErrorMessage('Connection lost. The host may be unreachable.');
      },
    });
    pcRef.current = pc;

    peerRef.current = peer;

    return () => {
      if (dataConnRef.current) {
        dataConnRef.current.close();
        dataConnRef.current = null;
      }
      peer.destroy();
      closePeerConnection(pc);
    };
  }, [roomId, retryCount, flushPendingCandidates]);

  const handleRetry = () => {
    closePeerConnection(pcRef.current);
    pcRef.current = null;
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (dataConnRef.current) {
      dataConnRef.current.close();
      dataConnRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    pendingCandidatesRef.current = [];
    setHasStream(false);
    setConnectionStatus('connecting');
    setErrorMessage('');
    setRetryCount((c) => c + 1);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-md border-b border-white/5 z-10">
        <Logo size="sm" showText={false} />
        <div className="flex items-center gap-3">
          <StatusBadge
            status={
              connectionStatus === 'connected' && hasStream
                ? 'connected'
                : connectionStatus === 'disconnected'
                  ? 'disconnected'
                  : connectionStatus === 'error'
                    ? 'error'
                    : 'connecting'
            }
          />
        </div>
      </header>

      {/* Video area */}
      <div className="flex-1 relative flex items-center justify-center">
        <AnimatePresence mode="wait">
          {hasStream ? (
            <motion.video
              key="stream"
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            />
          ) : connectionStatus === 'disconnected' ? (
            <motion.div
              key="disconnected"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <EmptyState
                icon={WifiOff}
                title="Stream ended"
                description="The host has stopped sharing or disconnected"
              />
            </motion.div>
          ) : connectionStatus === 'error' ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="flex flex-col items-center gap-4">
                <EmptyState
                  icon={WifiOff}
                  title="Connection failed"
                  description={errorMessage || 'Could not connect to the stream. The room may not exist or the host is offline.'}
                />
                <Button
                  variant="primary"
                  size="md"
                  icon={RefreshCw}
                  onClick={handleRetry}
                >
                  Retry Connection
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="connecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="flex flex-col items-center gap-6">
                <Logo size="lg" />
                <LoadingSpinner text="Connecting to stream..." />
                <p className="text-xs text-surface-500 font-mono">Room: {roomId}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
