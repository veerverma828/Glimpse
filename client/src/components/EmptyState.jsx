export default function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-2 text-muted">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
      )}
      <div>
        <p className="font-display text-base font-medium text-text">{title}</p>
        {message && <p className="mt-1 max-w-xs text-sm text-muted">{message}</p>}
      </div>
      {action}
    </div>
  )
}
