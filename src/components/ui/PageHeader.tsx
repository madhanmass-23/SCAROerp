import React from 'react';
import { cn } from './Button';

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  icon,
  actions,
  className,
}) => {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4', className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-content tracking-tight">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="text-xs sm:text-sm text-content-muted mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
