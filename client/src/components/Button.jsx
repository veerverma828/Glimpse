import { motion } from 'framer-motion';

const variants = {
    primary: 'bg-glimpse-600 hover:bg-glimpse-500 text-white shadow-lg shadow-glimpse-600/25',
    secondary: 'bg-surface-800 hover:bg-surface-700 text-surface-100 border border-surface-700',
    danger: 'bg-error hover:bg-red-600 text-white shadow-lg shadow-red-600/25',
    ghost: 'bg-transparent hover:bg-surface-800 text-surface-300 hover:text-surface-100',
};

const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-5 py-2.5 text-sm gap-2',
    lg: 'px-7 py-3 text-base gap-2.5',
};

export default function Button({
    children,
    variant = 'primary',
    size = 'md',
    icon: Icon,
    iconPosition = 'left',
    disabled = false,
    className = '',
    ...props
}) {
    return (
        <motion.button
            className={`
        inline-flex items-center justify-center font-semibold rounded-xl
        transition-colors duration-200 cursor-pointer select-none
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
            whileHover={!disabled ? { scale: 1.02 } : {}}
            whileTap={!disabled ? { scale: 0.98 } : {}}
            disabled={disabled}
            {...props}
        >
            {Icon && iconPosition === 'left' && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
            {children}
            {Icon && iconPosition === 'right' && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
        </motion.button>
    );
}
