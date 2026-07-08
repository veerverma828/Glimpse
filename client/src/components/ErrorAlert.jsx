import { motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

export default function ErrorAlert({ message, onDismiss, onRetry, className = '' }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className={`flex items-start gap-3 bg-error/10 border border-error/30 rounded-xl p-4 ${className}`}
        >
            <AlertTriangle size={20} className="text-error shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-error">{message}</p>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="mt-2 text-xs font-semibold text-error/80 hover:text-error underline underline-offset-2 transition-colors"
                    >
                        Try again
                    </button>
                )}
            </div>
            {onDismiss && (
                <button
                    onClick={onDismiss}
                    className="shrink-0 text-error/60 hover:text-error transition-colors"
                >
                    <X size={16} />
                </button>
            )}
        </motion.div>
    );
}
