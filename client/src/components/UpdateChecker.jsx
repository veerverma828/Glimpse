import { useEffect, useState } from 'react'
import { Browser } from '@capacitor/browser'
import { Download, X } from 'lucide-react'
import { isNativeApp } from '../lib/nativeScreenCapture'

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

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border-strong bg-surface-2/95 p-3 shadow-lg backdrop-blur">
        <Download className="h-5 w-5 shrink-0 text-violet-light" />
        <p className="flex-1 text-xs text-text">
          A new version is available.
        </p>
        <button
          onClick={() => Browser.open({ url: update.apkUrl })}
          className="shrink-0 rounded-lg bg-gradient-to-r from-violet to-cyan px-3 py-1.5 text-xs font-medium text-void"
        >
          Update
        </button>
        <button
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, String(update.build))
            setDismissed(true)
          }}
          className="shrink-0 text-muted hover:text-text"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
