import { motion } from 'framer-motion';

const statusConfig = {
    idle: { label: 'Idle', dot: 'bg-surface-500', bg: 'bg-surface-800 text-surface-300' },
    connecting: { label: 'Connecting...', dot: 'bg-warning', bg: 'bg-warning/10 text-warning' },
    sharing: { label: 'Live', dot: 'bg-success', bg: 'bg-success/10 text-success' },
    error: { label: 'Error', dot: 'bg-error', bg: 'bg-error/10 text-error' },
    disconnected: { label: 'Disconnected', dot: 'bg-surface-500', bg: 'bg-surface-800 text-surface-400' },
    connected: { label: 'Connected', dot: 'bg-success', bg: 'bg-success/10 text-success' },
};

export default function StatusBadge({ status = 'idle', className = '' }) {
    const config = statusConfig[status] || statusConfig.idle;

    return (
        <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${className}`}
        >
            <motion.span
                className={`w-1.5 h-1.5 rounded-full ${config.dot}`}
                animate={status === 'connecting' ? { opacity: [0.3, 1, 0.3] } : {}}
                transition={status === 'connecting' ? { duration: 1.5, repeat: Infinity } : {}}
            />
            {config.label}
        </motion.span>
    );
}
