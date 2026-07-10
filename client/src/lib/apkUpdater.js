import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Native in-app APK download + install, replacing "open the release in the
 * system browser and let Android's own download UI handle it". Gives a real
 * progress bar and a cancel/install choice inside the app itself.
 * See android/.../ApkUpdaterPlugin.java for the native side.
 */
const ApkUpdater = Capacitor.isNativePlatform() ? registerPlugin('ApkUpdater') : null

export async function canInstallApks() {
  if (!ApkUpdater) return false
  const { allowed } = await ApkUpdater.canInstall()
  return allowed
}

export async function openInstallPermissionSettings() {
  if (!ApkUpdater) return
  await ApkUpdater.openInstallPermissionSettings()
}

/**
 * Starts downloading the given APK URL. Progress/completion/error/cancel
 * arrive via the callbacks; call the returned cancel() to abort mid-download.
 */
export function downloadUpdate(url, { onProgress, onComplete, onError, onCancelled } = {}) {
  if (!ApkUpdater) {
    onError?.('Not running in the installed app')
    return { cancel: () => {} }
  }

  const listeners = []
  const cleanup = () => listeners.forEach((l) => l.remove())

  ApkUpdater.addListener('downloadProgress', (data) => onProgress?.(data)).then((l) => listeners.push(l))
  ApkUpdater.addListener('downloadComplete', (data) => {
    cleanup()
    onComplete?.(data)
  }).then((l) => listeners.push(l))
  ApkUpdater.addListener('downloadError', (data) => {
    cleanup()
    onError?.(data.message)
  }).then((l) => listeners.push(l))
  ApkUpdater.addListener('downloadCancelled', () => {
    cleanup()
    onCancelled?.()
  }).then((l) => listeners.push(l))

  ApkUpdater.download({ url }).catch((err) => {
    cleanup()
    onError?.(err.message || 'Download failed')
  })

  return {
    cancel: () => ApkUpdater.cancelDownload(),
  }
}

export async function installDownloadedApk() {
  if (!ApkUpdater) return
  await ApkUpdater.install()
}
