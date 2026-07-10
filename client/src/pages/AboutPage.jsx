import { ExternalLink, RefreshCw, CheckCircle2, Download, Loader2 } from 'lucide-react'
import Card from '../components/Card'
import Button from '../components/Button'
import Logo from '../components/Logo'
import { openInstallPermissionSettings } from '../lib/apkUpdater'
import { useAppUpdate, REPO } from '../hooks/useAppUpdate'

export default function AboutPage() {
  const {
    currentBuild,
    update,
    checking,
    checkError,
    phase,
    percent,
    errorMessage,
    checkForUpdate,
    startDownload,
    attemptInstall,
    cancelDownload,
  } = useAppUpdate()

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-5 px-4 py-8 sm:px-8">
      <Logo size="lg" />

      <Card className="w-full p-5">
        <dl className="flex items-center justify-between text-sm">
          <dt className="text-muted">Build</dt>
          <dd className="font-mono text-text">{currentBuild ? `apk-${currentBuild}` : 'dev'}</dd>
        </dl>
      </Card>

      <Card className="w-full p-5">
        {update && phase === 'idle' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-text">
              <Download className="h-4 w-4 shrink-0 text-violet-light" />
              Update available — build apk-{update.build}
            </div>
            <Button onClick={startDownload}>Download update</Button>
          </div>
        )}

        {update && phase === 'downloading' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-light" />
              <p className="flex-1 text-sm text-text">Downloading… {percent}%</p>
              <button onClick={cancelDownload} className="text-xs font-medium text-muted hover:text-text">
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

        {update && phase === 'downloaded' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-text">
              <Download className="h-4 w-4 shrink-0 text-success" />
              Update downloaded — ready to install.
            </div>
            <Button onClick={attemptInstall}>Install</Button>
          </div>
        )}

        {update && phase === 'needs-permission' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text">
              Allow Glimpse to install apps, then come back and tap Install again.
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={openInstallPermissionSettings} className="flex-1">
                Open settings
              </Button>
              <Button variant="ghost" onClick={attemptInstall}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {update && phase === 'error' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-danger">{errorMessage}</p>
            <Button variant="ghost" onClick={startDownload}>
              Retry
            </Button>
          </div>
        )}

        {!update && (
          <div className="flex items-center gap-2 text-sm text-text">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            You're on the latest version.
          </div>
        )}

        <Button variant="ghost" onClick={checkForUpdate} disabled={checking} className="mt-3 w-full">
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Checking…' : 'Check for update'}
        </Button>
        {checkError && <p className="mt-2 text-xs text-danger">Couldn't check for updates. Try again later.</p>}
      </Card>

      <Card className="w-full p-5 text-center">
        <p className="text-sm text-muted">
          Built by <span className="text-text">Veer Verma</span>
        </p>
        <a
          href={`https://github.com/${REPO}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted hover:text-text"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          github.com/{REPO}
        </a>
      </Card>
    </div>
  )
}
