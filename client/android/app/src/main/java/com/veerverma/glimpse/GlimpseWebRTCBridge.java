package com.veerverma.glimpse;

import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjection;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpReceiver;
import org.webrtc.ScreenCapturerAndroid;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Owns a single native WebRTC PeerConnection whose only purpose is to send
 * a screen-capture video track to a remote peer. Signaling (SDP/ICE
 * exchange with the actual remote browser) is relayed through JS/PeerJS via
 * the Listener callbacks -- this class never talks to a signaling server
 * directly.
 */
class GlimpseWebRTCBridge {

    interface Listener {
        void onLocalOffer(String sdp);
        void onLocalIceCandidate(String sdpMid, int sdpMLineIndex, String candidate);
        void onCaptureStopped();
        void onError(String message);
    }

    private static final String STREAM_ID = "glimpse-screen-stream";
    private static final String VIDEO_TRACK_ID = "glimpse-screen-video";

    private final Context context;
    private final Listener listener;
    private final EglBase eglBase;
    private final PeerConnectionFactory peerConnectionFactory;

    private PeerConnection peerConnection;
    private ScreenCapturerAndroid screenCapturer;
    private VideoSource videoSource;
    private VideoTrack videoTrack;
    private SurfaceTextureHelper surfaceTextureHelper;

    GlimpseWebRTCBridge(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
        this.eglBase = EglBase.create();

        PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(this.context)
                        .createInitializationOptions()
        );

        this.peerConnectionFactory = PeerConnectionFactory.builder()
                .setVideoDecoderFactory(new DefaultVideoDecoderFactory(eglBase.getEglBaseContext()))
                .setVideoEncoderFactory(new DefaultVideoEncoderFactory(
                        eglBase.getEglBaseContext(), true, true))
                .createPeerConnectionFactory();
    }

    boolean startScreenCapture(int resultCode, Intent projectionData) {
        try {
            screenCapturer = new ScreenCapturerAndroid(
                    projectionData,
                    new MediaProjection.Callback() {
                        @Override
                        public void onStop() {
                            listener.onCaptureStopped();
                        }
                    }
            );

            surfaceTextureHelper = SurfaceTextureHelper.create(
                    "GlimpseCaptureThread", eglBase.getEglBaseContext());

            videoSource = peerConnectionFactory.createVideoSource(true /* isScreencast */);
            screenCapturer.initialize(surfaceTextureHelper, context, videoSource.getCapturerObserver());

            // Display metrics: capture at native resolution, cap frame rate
            // to keep bitrate/CPU reasonable for a phone-to-phone link.
            android.util.DisplayMetrics metrics = context.getResources().getDisplayMetrics();
            screenCapturer.startCapture(metrics.widthPixels, metrics.heightPixels, 15);

            videoTrack = peerConnectionFactory.createVideoTrack(VIDEO_TRACK_ID, videoSource);
            videoTrack.setEnabled(true);

            createPeerConnectionAndOffer();
            return true;
        } catch (Exception e) {
            listener.onError("startScreenCapture failed: " + e.getMessage());
            return false;
        }
    }

    private void createPeerConnectionAndOffer() {
        List<PeerConnection.IceServer> iceServers = new ArrayList<>();
        iceServers.add(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer());
        // TURN servers should be added here for production reliability across
        // restrictive networks -- see note in README about STUN/TURN config.

        PeerConnection.RTCConfiguration rtcConfig = new PeerConnection.RTCConfiguration(iceServers);
        rtcConfig.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;

        peerConnection = peerConnectionFactory.createPeerConnection(rtcConfig, new PeerConnection.Observer() {
            @Override
            public void onIceCandidate(IceCandidate candidate) {
                listener.onLocalIceCandidate(candidate.sdpMid, candidate.sdpMLineIndex, candidate.sdp);
            }

            @Override public void onSignalingChange(PeerConnection.SignalingState newState) {}
            @Override public void onIceConnectionChange(PeerConnection.IceConnectionState newState) {}
            @Override public void onIceConnectionReceivingChange(boolean receiving) {}
            @Override public void onIceGatheringChange(PeerConnection.IceGatheringState newState) {}
            @Override public void onIceCandidatesRemoved(IceCandidate[] candidates) {}
            @Override public void onAddStream(MediaStream stream) {}
            @Override public void onRemoveStream(MediaStream stream) {}
            @Override public void onDataChannel(org.webrtc.DataChannel dataChannel) {}
            @Override public void onRenegotiationNeeded() {}
            @Override public void onAddTrack(RtpReceiver receiver, MediaStream[] mediaStreams) {}
        });

        if (peerConnection == null) {
            listener.onError("Failed to create native PeerConnection");
            return;
        }

        MediaStream localStream = peerConnectionFactory.createLocalMediaStream(STREAM_ID);
        localStream.addTrack(videoTrack);
        List<String> streamIds = Collections.singletonList(STREAM_ID);
        peerConnection.addTrack(videoTrack, streamIds);

        MediaConstraints offerConstraints = new MediaConstraints();
        peerConnection.createOffer(new SdpObserver() {
            @Override
            public void onCreateSuccess(SessionDescription sdp) {
                peerConnection.setLocalDescription(new SdpObserver() {
                    @Override public void onCreateSuccess(SessionDescription sdp2) {}
                    @Override public void onSetSuccess() {
                        listener.onLocalOffer(sdp.description);
                    }
                    @Override public void onCreateFailure(String error) {}
                    @Override public void onSetFailure(String error) {
                        listener.onError("setLocalDescription failed: " + error);
                    }
                }, sdp);
            }

            @Override public void onSetSuccess() {}

            @Override
            public void onCreateFailure(String error) {
                listener.onError("createOffer failed: " + error);
            }

            @Override public void onSetFailure(String error) {}
        }, offerConstraints);
    }

    void applyRemoteAnswer(String sdp) {
        if (peerConnection == null) {
            listener.onError("applyRemoteAnswer called with no active PeerConnection");
            return;
        }
        SessionDescription answer = new SessionDescription(SessionDescription.Type.ANSWER, sdp);
        peerConnection.setRemoteDescription(new SdpObserver() {
            @Override public void onCreateSuccess(SessionDescription sdp2) {}
            @Override public void onSetSuccess() {}
            @Override public void onCreateFailure(String error) {}
            @Override
            public void onSetFailure(String error) {
                listener.onError("setRemoteDescription failed: " + error);
            }
        }, answer);
    }

    void addRemoteIceCandidate(String sdpMid, int sdpMLineIndex, String candidate) {
        if (peerConnection == null) return;
        peerConnection.addIceCandidate(new IceCandidate(sdpMid, sdpMLineIndex, candidate));
    }

    void stopScreenCapture() {
        try {
            if (screenCapturer != null) {
                screenCapturer.stopCapture();
                screenCapturer.dispose();
                screenCapturer = null;
            }
        } catch (Exception ignored) {}

        if (videoTrack != null) {
            videoTrack.dispose();
            videoTrack = null;
        }
        if (videoSource != null) {
            videoSource.dispose();
            videoSource = null;
        }
        if (surfaceTextureHelper != null) {
            surfaceTextureHelper.dispose();
            surfaceTextureHelper = null;
        }
        if (peerConnection != null) {
            peerConnection.close();
            peerConnection = null;
        }
    }
}
