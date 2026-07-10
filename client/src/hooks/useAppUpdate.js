import { useCallback, useEffect, useRef, useState } from 'react'
import { isNativeApp } from '../lib/nativeScreenCapture'
import {
  canInstallApks,
  openInstallPermissionSettings,
  downloadUpdate,
  installDownloadedApk,
} from '../lib/apkUpdater'

export const REPO = 'veerverma828/Glimpse'
export const CURRENT_BUILD = Number(import.meta.env.VITE_APP_BUILD || 0)
const DISMISSED_KEY = 'glimpse-update-dismissed-build'

// Release tags are "apk-<run_number>" (see .github/workflows/build-apk.yml),
// so the run number doubles as a monotonically increasing build number --
// no separate versioning scheme needed.
function parseBuildNumber(tagName) {
  const match = /^apk-(\d+)$/.exec(tagName || '')
  return match ? Number(match[1]) : null
}

/**
 * Single source of truth for update-checking, downloading, and installing,
 * shared by the auto-popup banner (UpdateChecker) and the manual
 * "check for update" section on the About page.
 */
export function useAppUpdate() {
  const [update, setUpdate] = useState(null) // { build, apkUrl } | null
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  // idle | downloading | downloaded | needs-permission | error
  const [phase, setPhase] = useState('idle')
  const [percent, setPercent] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const cancelRef = useRef(null)

  const checkForUpdate = useCallback(async () => {
    if (!isNativeApp || !CURRENT_BUILD) return
    setChecking(true)
    setCheckError(false)
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      const release = res.ok ? await res.json() : null
      const latestBuild = parseBuildNumber(release?.tag_name)
      const apkAsset = release?.assets?.find((a) => a.name.endsWith('.apk'))

      if (latestBuild && apkAsset && latestBuild > CURRENT_BUILD) {
        const lastDismissed = Number(localStorage.getItem(DISMISSED_KEY) || 0)
        setUpdate({ build: latestBuild, apkUrl: apkAsset.browser_download_url })
        // a manual check should surface the update even if it was previously
        // dismissed as a popup -- only auto-checks respect the dismissal
        if (latestBuild <= lastDismissed) setDismissed(true)
        else setDismissed(false)
      } else {
        setUpdate(null)
      }
    } catch {
      setCheckError(true) // offline / rate-limited
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    checkForUpdate()
  }, [checkForUpdate])

  const startDownload = () => {
    if (!update) return
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
    if (update) localStorage.setItem(DISMISSED_KEY, String(update.build))
    setDismissed(true)
  }

  const cancelDownload = () => cancelRef.current?.cancel()

  return {
    currentBuild: CURRENT_BUILD,
    update,
    checking,
    checkError,
    dismissed,
    phase,
    percent,
    errorMessage,
    checkForUpdate,
    startDownload,
    attemptInstall,
    cancelDownload,
    dismiss,
  }
}
