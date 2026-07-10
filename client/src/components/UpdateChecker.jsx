import { Download, X, Loader2 } from 'lucide-react'
import { openInstallPermissionSettings } from '../lib/apkUpdater'
import { useAppUpdate } from '../hooks/useAppUpdate'

export default function UpdateChecker() {
  const {
    update,
    dismissed,
    phase,
    percent,
    errorMessage,
    startDownload,
    attemptInstall,
    cancelDownload,
    dismiss,
  } = useAppUpdate()

  if (!update || dismissed) return null

  return (
    <div className="fixed inset-x-0 bottom-14 z-50 px-4 pb-4 sm:px-6">
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
                onClick={cancelDownload}
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
