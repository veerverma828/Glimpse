import { motion } from 'framer-motion'

const RINGS = [0, 0.6, 1.2]

/**
 * Signature element: concentric rings broadcasting outward from a core dot.
 * Used for "waiting to connect" / "broadcasting" states across the app.
 */
export default function SignalPulse({ active = true, size = 160, tone = 'violet' }) {
  const color = tone === 'cyan' ? 'var(--color-cyan)' : 'var(--color-violet)'

  return (
    <div
      className="relative isolate flex items-center justify-center"
      style={{ width: size, height: size, transform: 'translateZ(0)' }}
      aria-hidden="true"
    >
      {active &&
        RINGS.map((delay, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full border"
            // force this onto its own GPU layer so mobile Chromium (both
            // mobile browsers and the Android WebView) doesn't keep
            // re-compositing it against the blurred card/glow behind it
            // every frame -- that re-decision is what reads as flicker
            style={{
              borderColor: color,
              width: '30%',
              height: '30%',
              willChange: 'transform, opacity',
              transform: 'translateZ(0)',
            }}
            initial={{ opacity: 0.55, scale: 1 }}
            animate={{ opacity: 0, scale: 3.1 }}
            transition={{
              duration: 2.6,
              delay,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        ))}
      <span
        className="relative h-[18%] w-[18%] rounded-full shadow-[0_0_24px_var(--tw-shadow-color)]"
        style={{
          background: `linear-gradient(135deg, var(--color-violet), var(--color-cyan))`,
          '--tw-shadow-color': color,
          transform: 'translateZ(0)',
        }}
      />
    </div>
  )
}
