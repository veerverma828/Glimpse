package com.veerverma.glimpse;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.graphics.Path;
import android.graphics.Point;
import android.os.Build;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;

/**
 * Accessibility service that injects a remote viewer's input into this device
 * so a shared screen can be remote-controlled. dispatchGesture() (API 24+) is
 * the only sanctioned way for a normal app to synthesize taps/swipes
 * system-wide; global actions (back/home/recents) go through
 * performGlobalAction().
 *
 * The system owns this service's lifecycle -- it's created when the user
 * enables Glimpse under Settings > Accessibility. We keep a static reference
 * to the running instance so ControlPlugin can reach it. Nothing here does
 * anything unless the app-side "Allow remote control" toggle gates the
 * incoming control messages first (see the pages' control handlers).
 *
 * Coordinates arrive normalized (0..1) in the captured frame and are scaled
 * to real screen pixels here so the caller never needs the device's metrics.
 */
public class GlimpseControlService extends AccessibilityService {

    private static GlimpseControlService instance;

    public static GlimpseControlService getInstance() { return instance; }
    public static boolean isRunning() { return instance != null; }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) { /* not used */ }

    @Override
    public void onInterrupt() { /* not used */ }

    @Override
    public boolean onUnbind(Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    private Point screenSize() {
        WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        Point p = new Point();
        wm.getDefaultDisplay().getRealSize(p);
        return p;
    }

    public void tapNorm(float nx, float ny) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
        Point s = screenSize();
        Path path = new Path();
        path.moveTo(nx * s.x, ny * s.y);
        GestureDescription.Builder b = new GestureDescription.Builder();
        b.addStroke(new GestureDescription.StrokeDescription(path, 0, 50));
        dispatchGesture(b.build(), null, null);
    }

    public void longPressNorm(float nx, float ny) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
        Point s = screenSize();
        Path path = new Path();
        path.moveTo(nx * s.x, ny * s.y);
        GestureDescription.Builder b = new GestureDescription.Builder();
        b.addStroke(new GestureDescription.StrokeDescription(path, 0, 600));
        dispatchGesture(b.build(), null, null);
    }

    public void swipeNorm(float nx1, float ny1, float nx2, float ny2, long durationMs) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
        Point s = screenSize();
        Path path = new Path();
        path.moveTo(nx1 * s.x, ny1 * s.y);
        path.lineTo(nx2 * s.x, ny2 * s.y);
        GestureDescription.Builder b = new GestureDescription.Builder();
        b.addStroke(new GestureDescription.StrokeDescription(path, 0, Math.max(1, durationMs)));
        dispatchGesture(b.build(), null, null);
    }

    public void global(String name) {
        int action;
        if ("home".equals(name)) {
            action = GLOBAL_ACTION_HOME;
        } else if ("recents".equals(name)) {
            action = GLOBAL_ACTION_RECENTS;
        } else {
            action = GLOBAL_ACTION_BACK;
        }
        performGlobalAction(action);
    }
}
