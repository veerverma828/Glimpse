import { forwardRef } from 'react'

const VARIANTS = {
  primary:
    'bg-gradient-to-r from-violet to-cyan text-void font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_-8px_rgba(124,92,255,0.6)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_10px_32px_-6px_rgba(124,92,255,0.75)] active:scale-[0.98]',
  ghost:
    'bg-surface-2 text-text border border-border hover:border-border-strong hover:bg-surface-3 active:scale-[0.98]',
  danger:
    'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/15 active:scale-[0.98]',
}

const SIZES = {
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-7 text-base gap-2.5',
  icon: 'h-11 w-11',
}

const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', className = '', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-xl transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})

export default Button
