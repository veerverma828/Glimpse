const RINGS = [0, 0.6, 1.2]

/**
 * Signature element: concentric rings broadcasting outward from a core dot.
 * Used for "waiting to connect" / "broadcasting" states across the app.
 *
 * Pure CSS @keyframes animation (see index.css's "signal-ring") rather than
 * Framer Motion -- this runs on the compositor thread, not gated behind the
 * JS main thread / rAF, so it stays smooth even under WebView jank.
 */
export default function SignalPulse({ active = true, size = 160, tone = 'violet' }) {
  const color = tone === 'cyan' ? 'var(--color-cyan)' : 'var(--color-violet)'

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {active &&
        RINGS.map((delay, i) => (
          <span
            key={i}
            className="absolute rounded-full border opacity-0"
            style={{
              borderColor: color,
              width: '30%',
              height: '30%',
              animation: `signal-ring 2.6s ${delay}s ease-out infinite`,
            }}
          />
        ))}
      <span
        className="relative h-[18%] w-[18%] rounded-full shadow-[0_0_24px_var(--tw-shadow-color)]"
        style={{
          background: `linear-gradient(135deg, var(--color-violet), var(--color-cyan))`,
          '--tw-shadow-color': color,
        }}
      />
    </div>
  )
}
