export default function Card({ className = '', children, glow = false }) {
  return (
    <div
      className={`relative rounded-2xl border border-border bg-surface/70 backdrop-blur-xl ${
        glow ? 'shadow-[0_0_60px_-15px_rgba(124,92,255,0.35)]' : 'shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)]'
      } ${className}`}
    >
      {children}
    </div>
  )
}
