const CONFIG = {
  idle: { label: 'Idle', dot: 'bg-faint', text: 'text-muted' },
  waiting: { label: 'Waiting for connection', dot: 'bg-warning animate-pulse', text: 'text-warning' },
  connecting: { label: 'Connecting', dot: 'bg-cyan animate-pulse', text: 'text-cyan' },
  connected: { label: 'Connected', dot: 'bg-success', text: 'text-success' },
  sharing: { label: 'Broadcasting', dot: 'bg-violet-light animate-pulse', text: 'text-violet-light' },
  error: { label: 'Error', dot: 'bg-danger', text: 'text-danger' },
}

export default function StatusBadge({ status = 'idle', label }) {
  const cfg = CONFIG[status] ?? CONFIG.idle
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium">
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      <span className={cfg.text}>{label ?? cfg.label}</span>
    </span>
  )
}
