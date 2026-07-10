package com.veerverma.glimpse;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Downloads a new release APK with progress events, and launches Android's
 * package installer on it, all without leaving the app. Replaces the
 * "open in system browser and let Android's download UI handle it" flow --
 * this gives the in-app progress bar / cancel / install UX instead.
 *
 * Not using Android's DownloadManager because its progress reporting
 * requires a separate polling ContentObserver query; a plain
 * HttpURLConnection stream copy with a byte counter is simpler and gives
 * exact progress with a trivially cancellable flag.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private volatile boolean cancelRequested = false;
    private volatile Thread downloadThread;
    private File downloadedFile;

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("Missing url");
            return;
        }

        cancelRequested = false;
        call.setKeepAlive(true);

        downloadThread = new Thread(() -> runDownload(call, url));
        downloadThread.start();
    }

    private void runDownload(PluginCall call, String urlString) {
        HttpURLConnection connection = null;
        try {
            File outFile = new File(getContext().getCacheDir(), "glimpse-update.apk");
            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.connect();

            int totalBytes = connection.getContentLength();
            long downloaded = 0;
            int lastPercent = -1;

            try (InputStream input = connection.getInputStream();
                 FileOutputStream output = new FileOutputStream(outFile)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (cancelRequested) {
                        outFile.delete();
                        JSObject data = new JSObject();
                        notifyListeners("downloadCancelled", data);
                        call.resolve();
                        return;
                    }
                    output.write(buffer, 0, read);
                    downloaded += read;

                    if (totalBytes > 0) {
                        int percent = (int) ((downloaded * 100) / totalBytes);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject progress = new JSObject();
                            progress.put("percent", percent);
                            progress.put("bytesDownloaded", downloaded);
                            progress.put("totalBytes", totalBytes);
                            notifyListeners("downloadProgress", progress);
                        }
                    }
                }
            }

            downloadedFile = outFile;
            JSObject ret = new JSObject();
            ret.put("filePath", outFile.getAbsolutePath());
            notifyListeners("downloadComplete", ret);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject err = new JSObject();
            err.put("message", e.getMessage() != null ? e.getMessage() : "Download failed");
            notifyListeners("downloadError", err);
            call.reject("Download failed", e);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelRequested = true;
        call.resolve();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        boolean can = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
        ret.put("allowed", can);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available");
            return;
        }
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
        intent.setData(Uri.parse("package:" + activity.getPackageName()));
        activity.startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available");
            return;
        }
        if (downloadedFile == null || !downloadedFile.exists()) {
            call.reject("No downloaded APK to install");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Install permission not granted");
            return;
        }

        Uri apkUri = FileProvider.getUriForFile(
                activity, activity.getPackageName() + ".fileprovider", downloadedFile);

        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(installIntent);
        call.resolve();
    }
}
