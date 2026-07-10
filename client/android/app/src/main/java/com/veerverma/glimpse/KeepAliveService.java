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
 * Keeps the app process at foreground priority for the whole time HostPage/
 * ViewerPage is open, not just while actively capturing. Without this,
 * Android throttles/suspends the WebView's JS (and with it the PeerJS
 * websocket) as soon as the app is minimized, dropping the signaling
 * connection before the user even taps "Start sharing" -- MainActivity
 * starts this in onCreate and stops it in onDestroy.
 */
public class KeepAliveService extends Service {

    public static final String CHANNEL_ID = "glimpse_keep_alive";
    public static final int NOTIFICATION_ID = 4211;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Glimpse")
                .setContentText("Glimpse is running")
                .setSmallIcon(android.R.drawable.presence_video_online)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Keep Alive",
                    NotificationManager.IMPORTANCE_MIN
            );
            channel.setDescription("Keeps Glimpse connected while minimized");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
