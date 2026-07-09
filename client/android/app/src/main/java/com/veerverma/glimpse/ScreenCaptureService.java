package com.veerverma.glimpse;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service required by Android 14+ (API 34) before a
 * MediaProjection capture session can be started. Must be running
 * BEFORE MediaProjectionManager.getMediaProjection() is called, or
 * the OS throws a SecurityException.
 *
 * This service does no work itself -- it exists only to satisfy the
 * OS requirement and keep the process alive while ScreenCapturerAndroid
 * (driven from GlimpseScreenCapturePlugin) owns the actual capture.
 */
public class ScreenCaptureService extends Service {

    public static final String CHANNEL_ID = "glimpse_screen_share";
    public static final int NOTIFICATION_ID = 4210;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Glimpse")
                .setContentText("Screen sharing is active")
                .setSmallIcon(android.R.drawable.presence_video_online)
                .setOngoing(true)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // API 34+: must declare the foreground service type explicitly at
            // startForeground() call time as well as in the manifest.
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return START_NOT_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Screen Sharing",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows when Glimpse is sharing your screen");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
