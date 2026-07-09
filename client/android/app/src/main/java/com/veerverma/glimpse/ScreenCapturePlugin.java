package com.veerverma.glimpse;

import android.app.Activity;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges JS (PeerJS running in the WebView) to native screen capture.
 *
 * Design: this plugin does NOT reimplement PeerJS signaling in Kotlin/Java.
 * All signaling (SDP offer/answer, ICE candidates, room codes) continues to
 * be handled by the existing JS PeerJS client, unchanged. This plugin's only
 * job is to supply a native-captured video track to the native WebRTC
 * PeerConnection that GlimpseWebRTCBridge manages, and to relay SDP/ICE
 * between that native PeerConnection and the JS side via plugin events.
 *
 * Flow:
 *  1. JS calls startCapture() when the user taps "Share screen" on HostPage.
 *  2. Plugin starts ScreenCaptureService (foreground service) FIRST.
 *  3. Plugin requests MediaProjection consent via system dialog.
 *  4. On consent, GlimpseWebRTCBridge builds a native PeerConnection with a
 *     ScreenCapturerAndroid-backed video track and creates an SDP offer.
 *  5. Plugin emits "nativeOffer" event with the SDP; JS relays it to the
 *     remote peer using its existing PeerJS connection object, exactly like
 *     it already does for browser-to-browser calls.
 *  6. JS calls applyAnswer() with the SDP answer it gets back from PeerJS;
 *     plugin applies it to the native PeerConnection.
 *  7. ICE candidates flow both directions via addIceCandidate()/"nativeIceCandidate".
 */
@CapacitorPlugin(name = "GlimpseScreenCapture")
public class ScreenCapturePlugin extends Plugin {

    private GlimpseWebRTCBridge webrtcBridge;
    private PluginCall pendingStartCall;

    @Override
    public void load() {
        webrtcBridge = new GlimpseWebRTCBridge(getContext(), new GlimpseWebRTCBridge.Listener() {
            @Override
            public void onLocalOffer(String sdp) {
                JSObject data = new JSObject();
                data.put("sdp", sdp);
                notifyListeners("nativeOffer", data);
            }

            @Override
            public void onLocalIceCandidate(String sdpMid, int sdpMLineIndex, String candidate) {
                JSObject data = new JSObject();
                data.put("sdpMid", sdpMid);
                data.put("sdpMLineIndex", sdpMLineIndex);
                data.put("candidate", candidate);
                notifyListeners("nativeIceCandidate", data);
            }

            @Override
            public void onCaptureStopped() {
                notifyListeners("captureStopped", new JSObject());
            }

            @Override
            public void onError(String message) {
                JSObject data = new JSObject();
                data.put("message", message);
                notifyListeners("captureError", data);
            }
        });
    }

    @PluginMethod
    public void startCapture(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available");
            return;
        }

        // Start the foreground service BEFORE requesting the projection.
        // Required on Android 14+ (API 34) or MediaProjectionManager throws
        // SecurityException.
        Intent serviceIntent = new Intent(activity, ScreenCaptureService.class);
        activity.startForegroundService(serviceIntent);

        pendingStartCall = call;
        call.setKeepAlive(true);

        MediaProjectionManager projectionManager =
                (MediaProjectionManager) activity.getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE);
        Intent captureIntent = projectionManager.createScreenCaptureIntent();
        startActivityForResult(call, captureIntent, "handleCaptureResult");
    }

    @ActivityCallback
    private void handleCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Screen capture permission was denied");
            stopForegroundService();
            return;
        }

        boolean started = webrtcBridge.startScreenCapture(result.getResultCode(), result.getData());
        if (!started) {
            call.reject("Failed to start native screen capture");
            stopForegroundService();
            return;
        }

        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void applyAnswer(PluginCall call) {
        String sdp = call.getString("sdp");
        if (sdp == null) {
            call.reject("Missing sdp");
            return;
        }
        webrtcBridge.applyRemoteAnswer(sdp);
        call.resolve();
    }

    @PluginMethod
    public void addIceCandidate(PluginCall call) {
        String sdpMid = call.getString("sdpMid");
        Integer sdpMLineIndex = call.getInt("sdpMLineIndex");
        String candidate = call.getString("candidate");
        if (candidate == null || sdpMLineIndex == null) {
            call.reject("Missing ICE candidate fields");
            return;
        }
        webrtcBridge.addRemoteIceCandidate(sdpMid, sdpMLineIndex, candidate);
        call.resolve();
    }

    @PluginMethod
    public void stopCapture(PluginCall call) {
        webrtcBridge.stopScreenCapture();
        stopForegroundService();
        call.resolve();
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        // Native path is available whenever this plugin is running inside
        // the packaged app (i.e. always, once installed) -- the whole point
        // is to cover the case where the WebView/browser lacks getDisplayMedia.
        ret.put("supported", true);
        call.resolve(ret);
    }

    private void stopForegroundService() {
        Activity activity = getActivity();
        if (activity != null) {
            activity.stopService(new Intent(activity, ScreenCaptureService.class));
        }
    }
}
