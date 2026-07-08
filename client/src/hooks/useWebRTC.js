const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Add TURN server here for production reliability:
  // { urls: 'turn:your-turn-server', username: 'user', credential: 'pass' }
];

const ICE_CONNECTION_TIMEOUT = 15_000; // 15s timeout for ICE to connect

/**
 * Create a configured RTCPeerConnection with standard event handlers.
 *
 * @param {object} opts
 * @param {(candidate: RTCIceCandidate) => void} opts.onIceCandidate
 * @param {(event: RTCTrackEvent) => void} opts.onTrack
 * @param {(state: RTCIceConnectionState) => void} opts.onIceStateChange
 * @param {() => void} opts.onIceFailure - Called when ICE fails or times out
 * @param {(pc: RTCPeerConnection) => void} opts.onNegotiationNeeded
 * @returns {RTCPeerConnection}
 */
export function createPeerConnection(opts = {}) {
  const {
    onIceCandidate,
    onTrack,
    onIceStateChange,
    onIceFailure,
    onNegotiationNeeded,
  } = opts;

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  let iceTimeout = null;

  const clearIceTimeout = () => {
    if (iceTimeout) {
      clearTimeout(iceTimeout);
      iceTimeout = null;
    }
  };

  const startIceTimeout = () => {
    clearIceTimeout();
    iceTimeout = setTimeout(() => {
      const state = pc.iceConnectionState;
      if (state !== 'connected' && state !== 'completed') {
        console.warn('[ICE] Timed out waiting for connection, state:', state);
        onIceFailure?.();
      }
    }, ICE_CONNECTION_TIMEOUT);
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      const parts = e.candidate.candidate.split(' ');
      const ip = parts[4];
      const proto = parts[7];
      console.log('[ICE] Local candidate gathered:', e.candidate.type, 'ip:', ip, 'proto:', proto);
      onIceCandidate?.(e.candidate);
    }
  };

  if (onTrack) {
    pc.ontrack = onTrack;
  }

  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    console.log('[ICE] Connection state:', state);
    onIceStateChange?.(state);

    switch (state) {
      case 'checking':
        startIceTimeout();
        break;
      case 'connected':
      case 'completed':
        clearIceTimeout();
        break;
      case 'failed':
        clearIceTimeout();
        console.error('[ICE] Connection failed');
        onIceFailure?.();
        break;
      case 'disconnected':
        // ICE may recover; give it a chance before declaring failure
        clearIceTimeout();
        iceTimeout = setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            console.warn('[ICE] Still disconnected after grace period');
            onIceFailure?.();
          }
        }, 5_000);
        break;
      case 'closed':
        clearIceTimeout();
        break;
    }
  };

  pc.onicegatheringstatechange = () => {
    console.log('[ICE] Gathering state:', pc.iceGatheringState);
  };

  if (onNegotiationNeeded) {
    let negotiating = false;
    pc.onnegotiationneeded = async () => {
      if (negotiating) return;
      negotiating = true;
      try {
        console.log('[ICE] Negotiation needed');
        await onNegotiationNeeded(pc);
      } catch (e) {
        console.error('[ICE] Negotiation error:', e);
      } finally {
        negotiating = false;
      }
    };
  }

  return pc;
}

/**
 * Attempt ICE restart on a peer connection.
 * Creates new offer, sets local description, returns offer SDP.
 */
export async function restartIce(pc) {
  try {
    console.log('[ICE] Restarting ICE...');
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    return offer;
  } catch (e) {
    console.error('[ICE] restartIce error:', e);
    throw e;
  }
}

/**
 * Safely close a peer connection and release resources.
 */
export function closePeerConnection(pc) {
  if (!pc) return;
  try {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.oniceconnectionstatechange = null;
    pc.onicegatheringstatechange = null;
    pc.onnegotiationneeded = null;
    pc.close();
  } catch (e) {
    console.warn('[ICE] Error closing PC:', e);
  }
}
