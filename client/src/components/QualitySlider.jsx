import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles, Zap } from 'lucide-react'

// value: 0 (max speed) .. 100 (max quality)
export default function QualitySlider({ value, onChange, onCommit }) {
  const trackRef = useRef(null)
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  const valueFromClientX = useCallback((clientX) => {
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    return Math.round(Math.min(1, Math.max(0, ratio)) * 100)
  }, [])

  const handlePointerMove = useCallback(
    (e) => {
      if (!draggingRef.current) return
      onChange(valueFromClientX(e.clientX))
    },
    [onChange, valueFromClientX]
  )

  const handlePointerUp = useCallback(
    (e) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setDragging(false)
      onCommit?.(valueFromClientX(e.clientX))
    },
    [onCommit, valueFromClientX]
  )

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  const startDrag = (clientX) => {
    draggingRef.current = true
    setDragging(true)
    onChange(valueFromClientX(clientX))
  }

  const nudge = (delta) => {
    const next = Math.min(100, Math.max(0, value + delta))
    onChange(next)
    onCommit?.(next)
  }

  const label = value >= 66 ? 'Quality' : value <= 33 ? 'Speed' : 'Balanced'

  return (
    <div className="w-full max-w-xs select-none">
      <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-muted">
        <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Speed</span>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text">
          {label}
        </span>
        <span className="flex items-center gap-1">Quality <Sparkles className="h-3 w-3" /></span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Quality vs speed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        onPointerDown={(e) => startDrag(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') nudge(-5)
          if (e.key === 'ArrowRight') nudge(5)
        }}
        className="relative h-8 w-full cursor-pointer touch-none rounded-full border border-border bg-surface-2 px-1"
      >
        <div
          className="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-gradient-to-r from-cyan to-violet"
          style={{ width: `calc(${value}% - 4px)` }}
        />
        <div
          className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border-2 border-void bg-text shadow-md transition-transform ${
            dragging ? 'scale-110' : ''
          }`}
          style={{ left: `calc(${value}% - 12px)` }}
        />
      </div>
    </div>
  )
}
