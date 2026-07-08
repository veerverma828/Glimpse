import { motion } from 'framer-motion';

export default function LoadingSpinner({ text = 'Loading...', className = '' }) {
    return (
        <div className={`flex flex-col items-center justify-center gap-4 py-12 ${className}`}>
            <motion.div
                className="w-10 h-10 border-2 border-glimpse-500/30 border-t-glimpse-500 rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
            {text && (
                <motion.p
                    className="text-sm text-surface-400"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                >
                    {text}
                </motion.p>
            )}
        </div>
    );
}
