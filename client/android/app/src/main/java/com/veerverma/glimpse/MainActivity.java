package com.veerverma.glimpse;

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
        super.onCreate(savedInstanceState);
    }
}
