package com.veerverma.glimpse;

import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS bridge to GlimpseControlService. Exposes whether the accessibility
 * service is enabled, a way to open the settings screen to enable it, and
 * the injection primitives (tap/long-press/swipe/global) used when this
 * device is being remote-controlled by an approved viewer.
 *
 * Coordinates are normalized (0..1) in the captured frame; the service scales
 * them to real screen pixels.
 */
@CapacitorPlugin(name = "GlimpseControl")
public class ControlPlugin extends Plugin {

    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", GlimpseControlService.isRunning());
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private GlimpseControlService service(PluginCall call) {
        GlimpseControlService s = GlimpseControlService.getInstance();
        if (s == null) {
            call.reject("Remote control accessibility service is not enabled");
        }
        return s;
    }

    private float f(PluginCall call, String key) {
        Double d = call.getDouble(key);
        return d == null ? 0f : d.floatValue();
    }

    @PluginMethod
    public void tap(PluginCall call) {
        GlimpseControlService s = service(call);
        if (s == null) return;
        s.tapNorm(f(call, "x"), f(call, "y"));
        call.resolve();
    }

    @PluginMethod
    public void longPress(PluginCall call) {
        GlimpseControlService s = service(call);
        if (s == null) return;
        s.longPressNorm(f(call, "x"), f(call, "y"));
        call.resolve();
    }

    @PluginMethod
    public void swipe(PluginCall call) {
        GlimpseControlService s = service(call);
        if (s == null) return;
        Integer ms = call.getInt("ms");
        s.swipeNorm(f(call, "x1"), f(call, "y1"), f(call, "x2"), f(call, "y2"), ms == null ? 200 : ms);
        call.resolve();
    }

    @PluginMethod
    public void global(PluginCall call) {
        GlimpseControlService s = service(call);
        if (s == null) return;
        s.global(call.getString("name", "back"));
        call.resolve();
    }
}
