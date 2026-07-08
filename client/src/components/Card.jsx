import { motion } from 'framer-motion';

export default function Card({ children, className = '', glow = false, ...props }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={`
        bg-surface-900/80 backdrop-blur-xl rounded-2xl border border-surface-700/50 p-6
        ${glow ? 'shadow-[0_0_30px_-5px_rgba(108,74,255,0.15)]' : 'shadow-lg'}
        ${className}
      `}
            {...props}
        >
            {children}
        </motion.div>
    );
}
