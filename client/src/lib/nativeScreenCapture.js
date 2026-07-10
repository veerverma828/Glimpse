import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Bridges the native Android screen-capture module (GlimpseScreenCapture,
 * see android/.../ScreenCapturePlugin.java) to the existing PeerJS
 * DataConnection used for room presence.
 *
 * Why this exists: standalone Chrome for Android does not implement
 * getDisplayMedia() at all (the method is undefined, not just denied --
 * this is a deliberate Chromium platform decision, not a bug). When this
 * app is running inside the packaged native shell (Capacitor), we use a
 * native WebRTC PeerConnection driven by Android's MediaProjection API
 * instead. Signaling (SDP offer/answer, ICE candidates) is NOT
 * reimplemented against PeerJS's server protocol -- instead we piggyback
 * on the JS PeerJS DataConnection that's already open between host and
 * viewer, relaying native SDP/ICE as plain JSON messages. The remote
 * side (always a browser, using the unmodified web client) answers using
 * its normal browser WebRTC stack; from its point of view this looks
 * like any other incoming call, except the offer arrived over the data
 * channel + a plain RTCPeerConnection created client-side to answer it,
 * rather than through peer.call().
 */

const NativeScreenCapture = Capacitor.isNativePlatform()
  ? registerPlugin('GlimpseScreenCapture')
  : null

export const isNativeApp = Capacitor.isNativePlatform()

/**
 * Starts native screen capture and drives the signaling handshake over
 * the given PeerJS DataConnection. Returns a controller with stop().
 *
 * dataConn: an open PeerJS DataConnection (e.g. viewerConn from HostPage)
 * onRemoteTrack: not used on the host side (host only sends), kept for
 *   symmetry with a future viewer-side native path.
 */
export async function startNativeScreenShare(dataConn, { onError, onStopped } = {}) {
  if (!NativeScreenCapture) {
    throw new Error('Native screen capture is only available in the installed app')
  }

  const listeners = []
  const cleanupListeners = () => listeners.forEach((l) => l.remove())

  // The *remote* browser needs a real RTCPeerConnection to answer the
  // native offer with -- PeerJS's own peer.call() can't be reused here
  // because the offer originates natively, not from peer.call(). So we
  // ask the remote side (via a data-channel message) to spin up a plain
  // RTCPeerConnection, apply our offer, and send back an answer. The
  // remote-side handler for this lives in ViewerPage's native-offer
  // listener.
  const remoteAnswerPromise = new Promise((resolve, reject) => {
    const onData = (msg) => {
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'native-answer') {
        resolve(msg.sdp)
      } else if (msg.type === 'native-error') {
        reject(new Error(msg.message || 'Remote failed to answer native offer'))
      }
    }
    dataConn.on('data', onData)
    listeners.push({ remove: () => dataConn.off('data', onData) })
  })

  const offerListener = await NativeScreenCapture.addListener('nativeOffer', ({ sdp }) => {
    dataConn.send({ type: 'native-offer', sdp })
  })
  listeners.push(offerListener)

  const iceListener = await NativeScreenCapture.addListener(
    'nativeIceCandidate',
    ({ sdpMid, sdpMLineIndex, candidate }) => {
      dataConn.send({ type: 'native-ice', sdpMid, sdpMLineIndex, candidate })
    }
  )
  listeners.push(iceListener)

  const errorListener = await NativeScreenCapture.addListener('captureError', ({ message }) => {
    onError?.(message)
  })
  listeners.push(errorListener)

  const stoppedListener = await NativeScreenCapture.addListener('captureStopped', () => {
    onStopped?.()
  })
  listeners.push(stoppedListener)

  // Relay captured system-audio frames (see AudioCapturer.java) to the
  // remote peer over this same data connection -- bypasses WebRTC's audio
  // pipeline entirely, see lib/pcmPlayer.js for the receiving side.
  const audioListener = await NativeScreenCapture.addListener('audioFrame', ({ data, sampleRate }) => {
    if (dataConn.open) dataConn.send({ type: 'native-audio-frame', data, sampleRate })
  })
  listeners.push(audioListener)

  // relay remote ICE candidates (from the browser side) back into the
  // native PeerConnection
  const remoteIceHandler = (msg) => {
    if (msg?.type === 'native-ice-from-remote') {
      NativeScreenCapture.addIceCandidate({
        sdpMid: msg.sdpMid,
        sdpMLineIndex: msg.sdpMLineIndex,
        candidate: msg.candidate,
      })
    }
  }
  dataConn.on('data', remoteIceHandler)
  listeners.push({ remove: () => dataConn.off('data', remoteIceHandler) })

  await NativeScreenCapture.startCapture()

  const answerSdp = await remoteAnswerPromise
  await NativeScreenCapture.applyAnswer({ sdp: answerSdp })

  return {
    stop: async () => {
      cleanupListeners()
      await NativeScreenCapture.stopCapture()
    },
  }
}

export async function stopNativeScreenShare() {
  if (!NativeScreenCapture) return
  await NativeScreenCapture.stopCapture()
}
