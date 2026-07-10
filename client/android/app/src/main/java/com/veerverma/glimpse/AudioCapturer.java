package com.veerverma.glimpse;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.projection.MediaProjection;
import android.os.Build;

import java.util.Arrays;

/**
 * Captures the device's own playing audio (media/game/app sound -- what
 * AudioPlaybackCaptureConfiguration calls "playback capture", Android 10+)
 * and hands 20ms PCM frames to a listener.
 *
 * Deliberately bypasses WebRTC's audio pipeline entirely: WebRTC's Android
 * AudioDeviceModule only knows how to record the microphone (its AudioRecord
 * is built with the legacy int-audioSource constructor, which structurally
 * cannot accept an AudioPlaybackCaptureConfiguration -- that config only
 * attaches via the newer AudioRecord.Builder path). Real system-audio
 * support in apps like Discord requires forking WebRTC's native audio
 * module; instead we capture with the plain public Android SDK API here and
 * stream frames as a side channel over the existing PeerJS DataConnection
 * (see nativeScreenCapture.js), reconstructing playback with the Web Audio
 * API on the receiving end. Lower-level than WebRTC's built-in audio track,
 * but fully achievable with public, documented APIs only.
 */
class AudioCapturer {

    interface Listener {
        void onAudioFrame(byte[] pcm16Mono);
        void onError(String message);
    }

    static final int SAMPLE_RATE = 16000; // enough for intelligible screen/media audio, keeps bandwidth low
    private static final int FRAME_MS = 20;

    private final Listener listener;
    private AudioRecord audioRecord;
    private Thread captureThread;
    private volatile boolean running = false;

    AudioCapturer(Listener listener) {
        this.listener = listener;
    }

    boolean start(MediaProjection mediaProjection) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            listener.onError("Audio capture needs Android 10 or newer");
            return false;
        }
        try {
            AudioPlaybackCaptureConfiguration config = new AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                    .build();

            int channelConfig = AudioFormat.CHANNEL_IN_MONO;
            AudioFormat format = new AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(channelConfig)
                    .build();

            int minBufSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, channelConfig, AudioFormat.ENCODING_PCM_16BIT);
            if (minBufSize <= 0) minBufSize = 4096;

            audioRecord = new AudioRecord.Builder()
                    .setAudioPlaybackCaptureConfig(config)
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(minBufSize * 2)
                    .build();

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                listener.onError("AudioRecord failed to initialize for playback capture");
                audioRecord.release();
                audioRecord = null;
                return false;
            }

            audioRecord.startRecording();
            running = true;
            captureThread = new Thread(this::captureLoop, "GlimpseAudioCapture");
            captureThread.start();
            return true;
        } catch (Exception e) {
            listener.onError("Audio capture failed: " + e.getMessage());
            return false;
        }
    }

    private void captureLoop() {
        // 20ms of 16-bit mono PCM at SAMPLE_RATE
        int frameBytes = (SAMPLE_RATE / 1000 * FRAME_MS) * 2;
        byte[] buffer = new byte[frameBytes];
        while (running && audioRecord != null) {
            int read = audioRecord.read(buffer, 0, buffer.length);
            if (read > 0 && running) {
                byte[] frame = read == buffer.length ? buffer.clone() : Arrays.copyOf(buffer, read);
                listener.onAudioFrame(frame);
            }
        }
    }

    void stop() {
        running = false;
        try {
            if (captureThread != null) captureThread.join(300);
        } catch (InterruptedException ignored) {
        }
        captureThread = null;
        if (audioRecord != null) {
            try {
                audioRecord.stop();
            } catch (Exception ignored) {
            }
            audioRecord.release();
            audioRecord = null;
        }
    }
}
