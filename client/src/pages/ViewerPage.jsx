import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Monitor, RefreshCw } from 'lucide-react';
import { createPeerConnection, closePeerConnection } from '../hooks/useWebRTC';
import Logo from '../components/Logo';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';

const SIGNAL_URL = import.meta.env.VITE_SIGNAL_URL || 'http://localhost:4000';
console.log('[ViewerPage] SIGNAL_URL:', SIGNAL_URL);
console.log('[ViewerPage] window.location.origin:', window.location.origin);

export default function ViewerPage() {
  const { roomId } = useParams();
  console.log('[ViewerPage] roomId from URL params:', roomId);
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const hostSocketIdRef = useRef(null);
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
    console.log('[ViewerPage] Connecting socket to:', SIGNAL_URL);
    const socket = io(SIGNAL_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => console.log('[ViewerPage] Socket connected, id:', socket.id));
    socket.on('connect_error', (err) => {
      console.error('[ViewerPage] Socket connect error:', err.message);
      setConnectionStatus('error');
      setErrorMessage('Could not connect to signaling server. Make sure you are on the same network.');
    });

    const pc = createPeerConnection({
      onIceCandidate: (candidate) => {
        const targetId = hostSocketIdRef.current;
        if (targetId) {
          socket.emit('signal', { to: targetId, data: { candidate } });
        } else {
          console.warn('[Viewer] No host socket ID yet, dropping ICE candidate');
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

    // Wait for socket connection before joining room
    const onConnected = () => {
      socket.emit('viewer-join', { roomId });
    };

    if (socket.connected) {
      onConnected();
    } else {
      socket.on('connect', onConnected);
    }

    // Handle room not active error - retry after a delay
    socket.on('error-msg', (msg) => {
      console.warn('[Viewer] Server error:', msg);
      if (msg === 'Room not active') {
        setTimeout(() => {
          if (socket.connected) {
            console.log('[Viewer] Retrying viewer-join...');
            socket.emit('viewer-join', { roomId });
          }
        }, 2000);
      } else {
        setConnectionStatus('error');
        setErrorMessage(msg);
      }
    });

    // Acknowledgment that we joined successfully
    socket.on('viewer-joined-ack', ({ roomId: ackRoomId }) => {
      console.log('[Viewer] Successfully joined room:', ackRoomId);
    });

    socket.on('signal', async ({ from, data }) => {
      try {
        if (data.sdp && data.sdp.type === 'offer') {
          hostSocketIdRef.current = from;
          console.log('[Viewer] Received offer from host:', from);

          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { to: from, data: { sdp: answer } });

          await flushPendingCandidates(pc);
        } else if (data.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            console.log('[Viewer] Queuing ICE candidate until remote description is set');
            pendingCandidatesRef.current.push(data.candidate);
          }
        }
      } catch (e) {
        console.error('[Viewer] WebRTC error:', e);
        setConnectionStatus('error');
        setErrorMessage('WebRTC error: ' + e.message);
      }
    });

    socket.on('host-left', () => {
      console.log('[Viewer] Host disconnected');
      if (videoRef.current) videoRef.current.srcObject = null;
      setHasStream(false);
      setConnectionStatus('disconnected');
    });

    return () => {
      socket.disconnect();
      closePeerConnection(pc);
    };
  }, [roomId, retryCount, flushPendingCandidates]);

  const handleRetry = () => {
    closePeerConnection(pcRef.current);
    pcRef.current = null;
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    pendingCandidatesRef.current = [];
    hostSocketIdRef.current = null;
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
