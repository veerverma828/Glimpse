import { motion } from 'framer-motion';

export default function Logo({ size = 'md', showText = true, className = '' }) {
    const sizes = {
        sm: { icon: 20, text: 'text-lg' },
        md: { icon: 28, text: 'text-2xl' },
        lg: { icon: 36, text: 'text-3xl' },
    };

    const { icon: iconSize, text: textSize } = sizes[size] || sizes.md;

    return (
        <motion.div
            className={`flex items-center gap-2 ${className}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
        >
            <svg
                width={iconSize}
                height={iconSize}
                viewBox="0 0 48 46"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="drop-shadow-[0_0_8px_rgba(108,74,255,0.5)]"
            >
                <path
                    d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
                    fill="url(#glimpse-gradient)"
                />
                <defs>
                    <linearGradient id="glimpse-gradient" x1="0" y1="0" x2="48" y2="46" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#6c4aff" />
                        <stop offset="1" stopColor="#9e9eff" />
                    </linearGradient>
                </defs>
            </svg>
            {showText && (
                <span className={`${textSize} font-bold tracking-tight bg-gradient-to-r from-glimpse-400 to-glimpse-200 bg-clip-text text-transparent`}>
                    Glimpse
                </span>
            )}
        </motion.div>
    );
}
