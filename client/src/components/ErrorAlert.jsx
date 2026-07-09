import { AlertTriangle } from 'lucide-react'

export default function ErrorAlert({ title = 'Something went wrong', message, className = '' }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/8 px-4 py-3 ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={2} />
      <div className="text-sm">
        <p className="font-medium text-danger">{title}</p>
        <p className="mt-0.5 text-muted">{message}</p>
      </div>
    </div>
  )
}
