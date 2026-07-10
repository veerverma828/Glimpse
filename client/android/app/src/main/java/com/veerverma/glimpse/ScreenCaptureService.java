package com.veerverma.glimpse;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
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
    // Broadcast the notification's "Stop sharing" button fires; the screen-
    // capture plugin listens for it and tears the share down cleanly.
    public static final String ACTION_STOP_SHARING = "com.veerverma.glimpse.STOP_SHARING";

    // Brand violet (matches the web UI's --violet) for the colorized notification.
    private static final int ACCENT = 0xFF7C5CFF;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // tapping the notification body reopens the app
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent openPi = PendingIntent.getActivity(
                this, 0, openIntent, PendingIntent.FLAG_IMMUTABLE);

        // "Stop sharing" action -> broadcast picked up by ScreenCapturePlugin
        Intent stopIntent = new Intent(ACTION_STOP_SHARING).setPackage(getPackageName());
        PendingIntent stopPi = PendingIntent.getBroadcast(
                this, 1, stopIntent, PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Glimpse is live")
                .setContentText("Sharing your screen right now")
                .setStyle(new NotificationCompat.BigTextStyle()
                        .bigText("Your screen is being shared live with everyone in your room. Tap “Stop sharing” to end it anytime."))
                .setSmallIcon(android.R.drawable.presence_video_online)
                .setColor(ACCENT)
                .setColorized(true)
                .setOngoing(true)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setContentIntent(openPi)
                .addAction(0, "Stop sharing", stopPi)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
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
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Shows when Glimpse is sharing your screen");
            channel.setSound(null, null);
            channel.enableVibration(false);
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
