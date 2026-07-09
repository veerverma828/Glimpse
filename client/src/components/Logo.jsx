import { Radio } from 'lucide-react'

export default function Logo({ size = 'md' }) {
  const textSize = size === 'lg' ? 'text-2xl' : 'text-lg'
  const iconBox = size === 'lg' ? 'h-9 w-9' : 'h-7 w-7'

  return (
    <div className="flex items-center gap-2.5 select-none">
      <span
        className={`relative flex ${iconBox} items-center justify-center rounded-lg bg-gradient-to-br from-violet to-cyan text-void`}
      >
        <Radio className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <span className={`font-display ${textSize} font-semibold tracking-tight text-text`}>
        Glimpse
      </span>
    </div>
  )
}
