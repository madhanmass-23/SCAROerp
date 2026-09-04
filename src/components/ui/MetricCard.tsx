import React from 'react';
import { Card, CardContent } from './Card';
import { cn } from './Button';

interface MetricCardProps {
  title: string;
  value: string | number | undefined | null;
  icon?: React.ReactNode;
  subtext?: string;
  trend?: string;
  onClick?: () => void;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon,
  subtext,
  onClick,
  className,
}) => {
  const displayValue = value !== undefined && value !== null ? value : 0;

  return (
    <Card 
      className={cn(
        'transition-shadow duration-150',
        onClick && 'cursor-pointer hover:border-primary/40 hover:shadow-sm',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-content-muted truncate uppercase tracking-wider">
              {title}
            </p>
            <p className="text-xl sm:text-2xl font-bold text-content mt-1">
              {displayValue}
            </p>
            {subtext && (
              <p className="text-xs text-content-muted mt-1 truncate">
                {subtext}
              </p>
            )}
          </div>
          {icon && (
            <div className="shrink-0 p-2.5 rounded-lg bg-surface-muted text-primary border border-border">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
