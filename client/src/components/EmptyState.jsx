import { motion } from 'framer-motion';

export default function EmptyState({ icon: Icon, title, description, action, className = '' }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className={`flex flex-col items-center justify-center gap-3 py-12 px-6 ${className}`}
        >
            {Icon && (
                <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center">
                    <Icon size={32} className="text-surface-400" />
                </div>
            )}
            <h3 className="text-lg font-semibold text-surface-200">{title}</h3>
            {description && <p className="text-sm text-surface-400 text-center max-w-xs">{description}</p>}
            {action && <div className="mt-2">{action}</div>}
        </motion.div>
    );
}
