import React from 'react';
import { cn } from './Button';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

export const Badge: React.FC<BadgeProps> = ({ className, variant = 'default', children, ...props }) => {
  const variants = {
    default: 'bg-surface-muted text-content border-border',
    primary: 'bg-primary-muted text-primary-hover border-primary',
    success: 'bg-emerald-50 text-status-success border-emerald-200',
    warning: 'bg-amber-50 text-status-warning border-amber-200',
    danger: 'bg-red-50 text-status-danger border-red-200',
    info: 'bg-blue-50 text-status-info border-blue-200',
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
