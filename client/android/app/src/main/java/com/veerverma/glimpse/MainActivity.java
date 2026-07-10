package com.veerverma.glimpse;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Custom plugins that live directly in this app module (as opposed to
    // published Capacitor plugin packages) aren't picked up by cap sync's
    // npm-plugin auto-discovery -- they must be registered explicitly here,
    // or JS calls to them fail with "plugin is not implemented on android".
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenCapturePlugin.class);
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(ControlPlugin.class);
        super.onCreate(savedInstanceState);

        // Keeps the WebView's JS (PeerJS websocket) alive while minimized --
        // see KeepAliveService for why this is needed.
        Intent keepAliveIntent = new Intent(this, KeepAliveService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(keepAliveIntent);
        } else {
            startService(keepAliveIntent);
        }
    }

    @Override
    public void onDestroy() {
        stopService(new Intent(this, KeepAliveService.class));
        super.onDestroy();
    }
}
