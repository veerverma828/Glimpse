import { useEffect, useRef, useState } from 'react'
import { Download, X, Loader2 } from 'lucide-react'
import { isNativeApp } from '../lib/nativeScreenCapture'
import {
  canInstallApks,
  openInstallPermissionSettings,
  downloadUpdate,
  installDownloadedApk,
} from '../lib/apkUpdater'

const REPO = 'veerverma828/Glimpse'
const CURRENT_BUILD = Number(import.meta.env.VITE_APP_BUILD || 0)
const DISMISSED_KEY = 'glimpse-update-dismissed-build'

// Release tags are "apk-<run_number>" (see .github/workflows/build-apk.yml),
// so the run number doubles as a monotonically increasing build number --
// no separate versioning scheme needed.
function parseBuildNumber(tagName) {
  const match = /^apk-(\d+)$/.exec(tagName || '')
  return match ? Number(match[1]) : null
}

export default function UpdateChecker() {
  const [update, setUpdate] = useState(null) // { build, apkUrl } | null
  const [dismissed, setDismissed] = useState(false)
  // idle | downloading | downloaded | needs-permission | error
  const [phase, setPhase] = useState('idle')
  const [percent, setPercent] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!isNativeApp || !CURRENT_BUILD) return

    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then((res) => (res.ok ? res.json() : null))
      .then((release) => {
        if (!release) return
        const latestBuild = parseBuildNumber(release.tag_name)
        const apkAsset = release.assets?.find((a) => a.name.endsWith('.apk'))
        if (!latestBuild || !apkAsset || latestBuild <= CURRENT_BUILD) return

        const lastDismissed = Number(localStorage.getItem(DISMISSED_KEY) || 0)
        if (latestBuild <= lastDismissed) return

        setUpdate({ build: latestBuild, apkUrl: apkAsset.browser_download_url })
      })
      .catch(() => {}) // offline / rate-limited -- just skip, not worth surfacing
  }, [])

  if (!update || dismissed) return null

  const startDownload = () => {
    setPhase('downloading')
    setPercent(0)
    cancelRef.current = downloadUpdate(update.apkUrl, {
      onProgress: ({ percent: p }) => setPercent(p),
      onComplete: () => setPhase('downloaded'),
      onCancelled: () => setPhase('idle'),
      onError: (message) => {
        setErrorMessage(message || 'Download failed')
        setPhase('error')
      },
    })
  }

  const attemptInstall = async () => {
    const allowed = await canInstallApks()
    if (!allowed) {
      setPhase('needs-permission')
      return
    }
    try {
      await installDownloadedApk()
    } catch {
      setErrorMessage('Could not start the installer')
      setPhase('error')
    }
  }

  const dismiss = () => {
    cancelRef.current?.cancel()
    localStorage.setItem(DISMISSED_KEY, String(update.build))
    setDismissed(true)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
      <div className="mx-auto max-w-md rounded-xl border border-border-strong bg-surface-2/95 p-3 shadow-lg backdrop-blur">
        {phase === 'idle' && (
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 shrink-0 text-violet-light" />
            <p className="flex-1 text-xs text-text">A new version is available.</p>
            <button
              onClick={startDownload}
              className="shrink-0 rounded-lg bg-gradient-to-r from-violet to-cyan px-3 py-1.5 text-xs font-medium text-void"
            >
              Update
            </button>
            <button onClick={dismiss} className="shrink-0 text-muted hover:text-text" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {phase === 'downloading' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-light" />
              <p className="flex-1 text-xs text-text">Downloading update… {percent}%</p>
              <button
                onClick={() => cancelRef.current?.cancel()}
                className="shrink-0 text-xs font-medium text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet to-cyan transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}

        {phase === 'downloaded' && (
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 shrink-0 text-success" />
            <p className="flex-1 text-xs text-text">Update downloaded — ready to install.</p>
            <button
              onClick={attemptInstall}
              className="shrink-0 rounded-lg bg-gradient-to-r from-violet to-cyan px-3 py-1.5 text-xs font-medium text-void"
            >
              Install
            </button>
            <button onClick={dismiss} className="shrink-0 text-xs font-medium text-muted hover:text-text">
              Cancel
            </button>
          </div>
        )}

        {phase === 'needs-permission' && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-text">
              Allow Glimpse to install apps, then come back and tap Install again.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={openInstallPermissionSettings}
                className="flex-1 rounded-lg bg-gradient-to-r from-violet to-cyan px-3 py-1.5 text-xs font-medium text-void"
              >
                Open settings
              </button>
              <button
                onClick={attemptInstall}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text"
              >
                Try again
              </button>
              <button onClick={dismiss} className="text-xs font-medium text-muted hover:text-text">
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-xs text-danger">{errorMessage}</p>
            <button
              onClick={startDownload}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text"
            >
              Retry
            </button>
            <button onClick={dismiss} className="shrink-0 text-muted hover:text-text" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
